import ts from 'typescript';
import type { GpuRecord, GpuType } from '../dsl/types.js';
import { errorAt } from './errors.js';
import type { IrBinaryOp, IrExpr, IrStmt, IrType, ShaderIr, StageIr } from './ir.js';
import { isValidGlslName, type ParsedShaderModule, type ShaderFn } from './parse.js';

type Stage = 'vertex' | 'fragment';

type RecordRole = 'attributes' | 'instanceAttributes' | 'uniforms' | 'varyings';

/** The role a function parameter plays; vertexInputs spans attributes + instanceAttributes. */
type ParamRole = 'vertexInputs' | 'uniforms' | 'varyings';

type Binding =
  | { kind: 'value'; role: RecordRole; glslName: string; type: IrType }
  | { kind: 'record'; role: ParamRole }
  | { kind: 'local'; type: IrType };

const PARAM_ROLE_LABELS: Record<ParamRole, string> = {
  vertexInputs: 'attributes',
  uniforms: 'uniforms',
  varyings: 'varyings',
};

const VEC_TYPES: readonly IrType[] = ['vec2', 'vec3', 'vec4'];

const VEC_ARITY: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

const SWIZZLE_INDEX: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };

interface IntrinsicRule {
  signature: string;
  check(args: IrExpr[]): IrType | null;
}

function isVec(type: IrType): boolean {
  return VEC_TYPES.includes(type);
}

function floatOrVec(type: IrType): boolean {
  return type === 'float' || isVec(type);
}

const INTRINSICS: Record<string, IntrinsicRule> = {
  normalize: {
    signature: 'normalize(v) expects one vec2/vec3/vec4',
    check: (args) => (args.length === 1 && isVec(args[0]!.type) ? args[0]!.type : null),
  },
  length: {
    signature: 'length(v) expects one vec2/vec3/vec4',
    check: (args) => (args.length === 1 && isVec(args[0]!.type) ? 'float' : null),
  },
  dot: {
    signature: 'dot(a, b) expects two vectors of the same type',
    check: (args) =>
      args.length === 2 && isVec(args[0]!.type) && args[0]!.type === args[1]!.type ? 'float' : null,
  },
  cross: {
    signature: 'cross(a, b) expects two vec3 arguments',
    check: (args) =>
      args.length === 2 && args[0]!.type === 'vec3' && args[1]!.type === 'vec3' ? 'vec3' : null,
  },
  mix: {
    signature: 'mix(a, b, t) expects matching float/vec a and b, and a float t',
    check: (args) =>
      args.length === 3 &&
      floatOrVec(args[0]!.type) &&
      args[0]!.type === args[1]!.type &&
      args[2]!.type === 'float'
        ? args[0]!.type
        : null,
  },
  clamp: {
    signature: 'clamp(x, min, max) expects a float/vec x and float bounds',
    check: (args) =>
      args.length === 3 &&
      floatOrVec(args[0]!.type) &&
      args[1]!.type === 'float' &&
      args[2]!.type === 'float'
        ? args[0]!.type
        : null,
  },
  sin: floatUnary('sin'),
  cos: floatUnary('cos'),
  abs: floatUnary('abs'),
  fract: floatUnary('fract'),
  floor: floatUnary('floor'),
  sqrt: floatUnary('sqrt'),
  pow: floatBinary('pow'),
  min: floatBinary('min'),
  max: floatBinary('max'),
};

function floatUnary(name: string): IntrinsicRule {
  return {
    signature: `${name}(x) expects one float`,
    check: (args) => (args.length === 1 && args[0]!.type === 'float' ? 'float' : null),
  };
}

function floatBinary(name: string): IntrinsicRule {
  return {
    signature: `${name}(a, b) expects two floats`,
    check: (args) => (args.length === 2 && args[0]!.type === 'float' && args[1]!.type === 'float' ? 'float' : null),
  };
}

class Scope {
  private readonly bindings = new Map<string, Binding>();

  constructor(private readonly parent?: Scope) {}

  lookup(name: string): Binding | undefined {
    return this.bindings.get(name) ?? this.parent?.lookup(name);
  }

  declare(name: string, binding: Binding): void {
    this.bindings.set(name, binding);
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }
}

interface StageContext {
  stage: Stage;
  sourceFile: ts.SourceFile;
  records: Record<RecordRole, GpuRecord>;
  interfaceNames: Set<string>;
  usedAttributes: Set<string>;
  usedInstanceAttributes: Set<string>;
  usedUniforms: Set<string>;
  usedVaryings: Set<string>;
  assignedVaryings: Set<string>;
}

export function analyzeShader(parsed: ParsedShaderModule): ShaderIr {
  const records: Record<RecordRole, GpuRecord> = {
    attributes: parsed.attributes,
    instanceAttributes: parsed.instanceAttributes,
    uniforms: parsed.uniforms,
    varyings: parsed.varyings,
  };

  const vertex = analyzeStage('vertex', parsed.vertexFn, parsed.sourceFile, records);
  const fragment = analyzeStage('fragment', parsed.fragmentFn, parsed.sourceFile, records);

  return {
    attributes: parsed.attributes,
    instanceAttributes: parsed.instanceAttributes,
    uniforms: parsed.uniforms,
    varyings: parsed.varyings,
    vertex,
    fragment,
  };
}

function analyzeStage(
  stage: Stage,
  fn: ShaderFn,
  sourceFile: ts.SourceFile,
  records: Record<RecordRole, GpuRecord>,
): StageIr {
  const ctx: StageContext = {
    stage,
    sourceFile,
    records,
    interfaceNames: new Set([
      ...Object.keys(records.attributes),
      ...Object.keys(records.instanceAttributes),
      ...Object.keys(records.uniforms),
      ...Object.keys(records.varyings),
    ]),
    usedAttributes: new Set(),
    usedInstanceAttributes: new Set(),
    usedUniforms: new Set(),
    usedVaryings: new Set(),
    assignedVaryings: new Set(),
  };

  const roles: ParamRole[] = stage === 'vertex' ? ['vertexInputs', 'uniforms', 'varyings'] : ['uniforms', 'varyings'];
  if (fn.parameters.length > roles.length) {
    throw errorAt(
      sourceFile,
      fn.parameters[roles.length]!,
      `${stage}() takes at most ${roles.length} parameters (${roles.map((role) => PARAM_ROLE_LABELS[role]).join(', ')})`,
    );
  }

  const scope = new Scope();
  fn.parameters.forEach((param, index) => {
    bindParameter(ctx, scope, param, roles[index]!);
  });

  const statements = lowerBody(ctx, scope, fn);

  if (statements.length === 0 || statements[statements.length - 1]!.kind !== 'return') {
    throw errorAt(sourceFile, fn, `${stage}() must end with a return statement (a vec4)`);
  }

  if (stage === 'vertex') {
    for (const name of Object.keys(records.varyings)) {
      if (!ctx.assignedVaryings.has(name)) {
        throw errorAt(
          sourceFile,
          fn,
          `vertex() must assign every declared varying — missing top-level assignment to '${name}' (e.g. v.${name} = ...)`,
        );
      }
    }
  }

  return {
    statements,
    usedAttributes: ctx.usedAttributes,
    usedInstanceAttributes: ctx.usedInstanceAttributes,
    usedUniforms: ctx.usedUniforms,
    usedVaryings: ctx.usedVaryings,
  };
}

function bindParameter(ctx: StageContext, scope: Scope, param: ts.ParameterDeclaration, role: ParamRole): void {
  if (param.dotDotDotToken !== undefined || param.initializer !== undefined) {
    throw errorAt(ctx.sourceFile, param, `shader parameters cannot use rest elements or defaults`);
  }

  if (ts.isIdentifier(param.name)) {
    scope.declare(param.name.text, { kind: 'record', role });
    return;
  }

  if (ts.isObjectBindingPattern(param.name)) {
    if (role === 'varyings' && ctx.stage === 'vertex') {
      throw errorAt(
        ctx.sourceFile,
        param,
        `the varyings parameter of vertex() must be a plain identifier (e.g. \`v\`) so varyings can be assigned via v.name = ...`,
      );
    }
    for (const element of param.name.elements) {
      if (element.dotDotDotToken !== undefined || element.initializer !== undefined) {
        throw errorAt(ctx.sourceFile, element, `shader parameters cannot use rest elements or defaults`);
      }
      if (!ts.isIdentifier(element.name)) {
        throw errorAt(ctx.sourceFile, element, `nested destructuring is not supported in shader parameters`);
      }
      const sourceName = element.propertyName;
      const glslName =
        sourceName !== undefined && ts.isIdentifier(sourceName) ? sourceName.text : element.name.text;
      const member = lookupMember(ctx, role, glslName);
      if (member === undefined) {
        throw errorAt(ctx.sourceFile, element, unknownMemberMessage(ctx, role, glslName));
      }
      scope.declare(element.name.text, { kind: 'value', role: member.role, glslName, type: member.type });
    }
    return;
  }

  throw errorAt(ctx.sourceFile, param, `shader parameters must be identifiers or object destructuring patterns`);
}

function lookupMember(
  ctx: StageContext,
  role: ParamRole,
  name: string,
): { role: RecordRole; type: GpuType } | undefined {
  if (role === 'vertexInputs') {
    const attributeType = ctx.records.attributes[name];
    if (attributeType !== undefined) {
      return { role: 'attributes', type: attributeType };
    }
    const instanceType = ctx.records.instanceAttributes[name];
    if (instanceType !== undefined) {
      return { role: 'instanceAttributes', type: instanceType };
    }
    return undefined;
  }
  const type = ctx.records[role][name];
  return type === undefined ? undefined : { role, type };
}

function unknownMemberMessage(ctx: StageContext, role: ParamRole, name: string): string {
  if (role === 'vertexInputs') {
    const declared = [
      ...Object.keys(ctx.records.attributes),
      ...Object.keys(ctx.records.instanceAttributes),
    ];
    return `'${name}' is not declared in attributes or instanceAttributes — declared names: ${declared.join(', ') || '(none)'}`;
  }
  return `'${name}' is not declared in ${role} — declared names: ${Object.keys(ctx.records[role]).join(', ') || '(none)'}`;
}

function lowerBody(ctx: StageContext, scope: Scope, fn: ShaderFn): IrStmt[] {
  const body = fn.body;
  if (body === undefined) {
    throw errorAt(ctx.sourceFile, fn, `${ctx.stage}() must have a body`);
  }
  if (!ts.isBlock(body)) {
    const expr = lowerExpr(ctx, scope, body);
    requireReturnType(ctx, body, expr);
    return [{ kind: 'return', expr }];
  }
  return lowerStatements(ctx, scope, body.statements, { topLevel: true });
}

function lowerStatements(
  ctx: StageContext,
  scope: Scope,
  statements: ts.NodeArray<ts.Statement>,
  options: { topLevel: boolean },
): IrStmt[] {
  const result: IrStmt[] = [];
  for (const statement of statements) {
    result.push(lowerStatement(ctx, scope, statement, options));
  }
  return result;
}

function lowerStatement(
  ctx: StageContext,
  scope: Scope,
  statement: ts.Statement,
  options: { topLevel: boolean },
): IrStmt {
  if (ts.isVariableStatement(statement)) {
    return lowerConst(ctx, scope, statement);
  }

  if (ts.isExpressionStatement(statement)) {
    return lowerAssignment(ctx, scope, statement, options);
  }

  if (ts.isReturnStatement(statement)) {
    if (!options.topLevel) {
      throw errorAt(
        ctx.sourceFile,
        statement,
        `return inside if/else is not supported in the MVP — return must be the final top-level statement`,
      );
    }
    if (statement.expression === undefined) {
      throw errorAt(ctx.sourceFile, statement, `${ctx.stage}() must return a vec4`);
    }
    const expr = lowerExpr(ctx, scope, statement.expression);
    requireReturnType(ctx, statement, expr);
    return { kind: 'return', expr };
  }

  if (ts.isIfStatement(statement)) {
    const condition = lowerExpr(ctx, scope, statement.expression);
    if (condition.type !== 'bool') {
      throw errorAt(
        ctx.sourceFile,
        statement.expression,
        `if conditions must be boolean expressions (comparisons like a < b), got ${condition.type}`,
      );
    }
    const thenStmts = lowerBranch(ctx, scope, statement.thenStatement);
    const elseStmts =
      statement.elseStatement !== undefined ? lowerBranch(ctx, scope, statement.elseStatement) : undefined;
    return elseStmts === undefined
      ? { kind: 'if', condition, then: thenStmts }
      : { kind: 'if', condition, then: thenStmts, else: elseStmts };
  }

  throw errorAt(
    ctx.sourceFile,
    statement,
    `${ts.SyntaxKind[statement.kind]} is not supported in shader code — supported statements: const, varying assignment, if/else, return`,
  );
}

function lowerBranch(ctx: StageContext, scope: Scope, statement: ts.Statement): IrStmt[] {
  const branchScope = new Scope(scope);
  if (ts.isBlock(statement)) {
    return lowerStatements(ctx, branchScope, statement.statements, { topLevel: false });
  }
  return [lowerStatement(ctx, branchScope, statement, { topLevel: false })];
}

function lowerConst(ctx: StageContext, scope: Scope, statement: ts.VariableStatement): IrStmt {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) {
    throw errorAt(ctx.sourceFile, statement, `only \`const\` declarations are supported in shader code`);
  }
  if (statement.declarationList.declarations.length !== 1) {
    throw errorAt(ctx.sourceFile, statement, `declare one const per statement`);
  }
  const declaration = statement.declarationList.declarations[0]!;
  if (!ts.isIdentifier(declaration.name)) {
    throw errorAt(ctx.sourceFile, declaration, `destructuring const declarations are not supported in shader code`);
  }
  if (declaration.initializer === undefined) {
    throw errorAt(ctx.sourceFile, declaration, `const declarations must have an initializer`);
  }
  const name = declaration.name.text;
  if (!isValidGlslName(name)) {
    throw errorAt(ctx.sourceFile, declaration, `'${name}' is not a usable GLSL identifier`);
  }
  if (ctx.interfaceNames.has(name)) {
    throw errorAt(
      ctx.sourceFile,
      declaration,
      `'${name}' shadows a declared attribute/uniform/varying — pick a different name`,
    );
  }
  if (scope.has(name)) {
    throw errorAt(ctx.sourceFile, declaration, `'${name}' is already declared in this scope`);
  }
  const expr = lowerExpr(ctx, scope, declaration.initializer);
  if (expr.type === 'bool') {
    throw errorAt(ctx.sourceFile, declaration, `bool consts are not supported — inline the condition`);
  }
  scope.declare(name, { kind: 'local', type: expr.type });
  return { kind: 'const', name, type: expr.type, expr };
}

function lowerAssignment(
  ctx: StageContext,
  scope: Scope,
  statement: ts.ExpressionStatement,
  options: { topLevel: boolean },
): IrStmt {
  const expr = statement.expression;
  if (
    !ts.isBinaryExpression(expr) ||
    expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    !ts.isPropertyAccessExpression(expr.left)
  ) {
    throw errorAt(
      ctx.sourceFile,
      statement,
      `expression statements must be varying assignments (v.name = ...) — other side effects are not supported`,
    );
  }

  const target = expr.left;
  if (!ts.isIdentifier(target.expression)) {
    throw errorAt(ctx.sourceFile, target, `varying assignments must be of the form v.name = ...`);
  }
  const binding = scope.lookup(target.expression.text);
  if (binding === undefined || binding.kind !== 'record' || binding.role !== 'varyings') {
    throw errorAt(
      ctx.sourceFile,
      target,
      `assignments may only target varyings via the varyings parameter (v.name = ...)`,
    );
  }
  if (ctx.stage === 'fragment') {
    throw errorAt(ctx.sourceFile, statement, `varyings are read-only in fragment()`);
  }

  const varyingName = target.name.text;
  const declaredType = ctx.records.varyings[varyingName];
  if (declaredType === undefined) {
    throw errorAt(
      ctx.sourceFile,
      target,
      `'${varyingName}' is not declared in varyings — declared names: ${Object.keys(ctx.records.varyings).join(', ') || '(none)'}`,
    );
  }

  const value = lowerExpr(ctx, scope, expr.right);
  if (value.type !== declaredType) {
    throw errorAt(
      ctx.sourceFile,
      expr.right,
      `cannot assign ${value.type} to varying '${varyingName}' (declared ${declaredType})`,
    );
  }

  if (options.topLevel) {
    ctx.assignedVaryings.add(varyingName);
  }
  return { kind: 'assign', target: varyingName, expr: value };
}

function requireReturnType(ctx: StageContext, node: ts.Node, expr: IrExpr): void {
  if (expr.type !== 'vec4') {
    throw errorAt(
      ctx.sourceFile,
      node,
      `${ctx.stage}() must return a vec4 (${ctx.stage === 'vertex' ? 'clip-space position' : 'output color'}), got ${expr.type}`,
    );
  }
}

function lowerExpr(ctx: StageContext, scope: Scope, node: ts.Expression): IrExpr {
  if (ts.isParenthesizedExpression(node)) {
    return lowerExpr(ctx, scope, node.expression);
  }

  if (ts.isNumericLiteral(node)) {
    return { kind: 'literal', value: Number(node.text), type: 'float' };
  }

  if (ts.isPrefixUnaryExpression(node)) {
    return lowerUnary(ctx, scope, node);
  }

  if (ts.isIdentifier(node)) {
    return lowerIdentifier(ctx, scope, node);
  }

  if (ts.isPropertyAccessExpression(node)) {
    return lowerPropertyAccess(ctx, scope, node);
  }

  if (ts.isCallExpression(node)) {
    return lowerCall(ctx, scope, node);
  }

  if (ts.isBinaryExpression(node)) {
    return lowerBinary(ctx, scope, node);
  }

  throw errorAt(
    ctx.sourceFile,
    node,
    `${ts.SyntaxKind[node.kind]} is not supported in shader code`,
  );
}

function lowerUnary(ctx: StageContext, scope: Scope, node: ts.PrefixUnaryExpression): IrExpr {
  const operand = lowerExpr(ctx, scope, node.operand);
  if (node.operator === ts.SyntaxKind.MinusToken) {
    if (!floatOrVec(operand.type)) {
      throw errorAt(ctx.sourceFile, node, `unary minus expects a float or vector, got ${operand.type}`);
    }
    return { kind: 'unary', op: '-', operand, type: operand.type };
  }
  if (node.operator === ts.SyntaxKind.ExclamationToken) {
    if (operand.type !== 'bool') {
      throw errorAt(ctx.sourceFile, node, `! expects a boolean expression, got ${operand.type}`);
    }
    return { kind: 'unary', op: '!', operand, type: 'bool' };
  }
  throw errorAt(ctx.sourceFile, node, `this unary operator is not supported in shader code`);
}

function lowerIdentifier(ctx: StageContext, scope: Scope, node: ts.Identifier): IrExpr {
  const binding = scope.lookup(node.text);
  if (binding === undefined) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `unknown identifier '${node.text}' — only shader parameters and local consts are in scope (module-level values are not supported in the MVP)`,
    );
  }
  if (binding.kind === 'record') {
    throw errorAt(
      ctx.sourceFile,
      node,
      `'${node.text}' is the ${PARAM_ROLE_LABELS[binding.role]} object — access a member like ${node.text}.name`,
    );
  }
  if (binding.kind === 'value') {
    markUse(ctx, binding.role, binding.glslName, node);
    return { kind: 'ident', name: binding.glslName, type: binding.type };
  }
  return { kind: 'ident', name: node.text, type: binding.type };
}

function lowerPropertyAccess(ctx: StageContext, scope: Scope, node: ts.PropertyAccessExpression): IrExpr {
  if (ts.isIdentifier(node.expression)) {
    const binding = scope.lookup(node.expression.text);
    if (binding !== undefined && binding.kind === 'record') {
      const memberName = node.name.text;
      const member = lookupMember(ctx, binding.role, memberName);
      if (member === undefined) {
        throw errorAt(ctx.sourceFile, node, unknownMemberMessage(ctx, binding.role, memberName));
      }
      if (member.role === 'varyings' && ctx.stage === 'vertex' && !ctx.assignedVaryings.has(memberName)) {
        throw errorAt(
          ctx.sourceFile,
          node,
          `varying '${memberName}' is read before it is assigned in vertex()`,
        );
      }
      markUse(ctx, member.role, memberName, node);
      return { kind: 'ident', name: memberName, type: member.type };
    }
  }

  const obj = lowerExpr(ctx, scope, node.expression);
  const components = node.name.text;
  if (!isVec(obj.type)) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `property '.${components}' is not supported on ${obj.type} — swizzles apply to vectors only`,
    );
  }
  if (!/^[xyzw]{1,4}$/.test(components)) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `'.${components}' is not a valid swizzle — use combinations of x, y, z, w`,
    );
  }
  const arity = VEC_ARITY[obj.type]!;
  for (const component of components) {
    if (SWIZZLE_INDEX[component]! >= arity) {
      throw errorAt(ctx.sourceFile, node, `component '${component}' is out of range for ${obj.type}`);
    }
  }
  const type: IrType = components.length === 1 ? 'float' : (`vec${components.length}` as IrType);
  return { kind: 'swizzle', obj, components, type };
}

const VEC_METHOD_OPS: Record<string, IrBinaryOp> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  scale: '*',
};

function lowerCall(ctx: StageContext, scope: Scope, node: ts.CallExpression): IrExpr {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return lowerMethodCall(ctx, scope, node, node.expression);
  }

  if (!ts.isIdentifier(node.expression)) {
    throw errorAt(ctx.sourceFile, node, `only vec constructors, intrinsics, and .add/.sub/.mul/.div/.scale method calls are supported`);
  }
  const callee = node.expression.text;
  if (scope.lookup(callee) !== undefined) {
    throw errorAt(ctx.sourceFile, node, `'${callee}' is not callable in shader code`);
  }

  const args = node.arguments.map((arg) => lowerExpr(ctx, scope, arg));

  if (callee === 'vec2' || callee === 'vec3' || callee === 'vec4') {
    return lowerVecConstructor(ctx, node, callee, args);
  }

  const intrinsic = INTRINSICS[callee];
  if (intrinsic === undefined) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `unknown function '${callee}' — supported: vec2/vec3/vec4 constructors and ${Object.keys(INTRINSICS).join(', ')} (module-level helper functions are not supported in the MVP)`,
    );
  }
  const result = intrinsic.check(args);
  if (result === null) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `${intrinsic.signature} — got (${args.map((a) => a.type).join(', ')})`,
    );
  }
  return { kind: 'call', callee, args, type: result };
}

function lowerVecConstructor(
  ctx: StageContext,
  node: ts.CallExpression,
  callee: 'vec2' | 'vec3' | 'vec4',
  args: IrExpr[],
): IrExpr {
  const target = VEC_ARITY[callee]!;
  if (args.length === 0) {
    throw errorAt(ctx.sourceFile, node, `${callee}() requires arguments`);
  }
  let componentSum = 0;
  for (const arg of args) {
    if (!floatOrVec(arg.type)) {
      throw errorAt(ctx.sourceFile, node, `${callee}() arguments must be floats or vectors, got ${arg.type}`);
    }
    componentSum += VEC_ARITY[arg.type]!;
  }
  const isSplat = args.length === 1 && args[0]!.type === 'float';
  if (!isSplat && componentSum !== target) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `${callee}() needs exactly ${target} components, got ${componentSum} from (${args.map((a) => a.type).join(', ')})`,
    );
  }
  return { kind: 'call', callee, args, type: callee };
}

function lowerMethodCall(
  ctx: StageContext,
  scope: Scope,
  node: ts.CallExpression,
  access: ts.PropertyAccessExpression,
): IrExpr {
  const method = access.name.text;
  const op = VEC_METHOD_OPS[method];
  if (op === undefined) {
    throw errorAt(
      ctx.sourceFile,
      node,
      `unknown method '.${method}()' — supported methods: ${Object.keys(VEC_METHOD_OPS).join(', ')}`,
    );
  }
  const obj = lowerExpr(ctx, scope, access.expression);
  if (node.arguments.length !== 1) {
    throw errorAt(ctx.sourceFile, node, `.${method}() takes exactly one argument`);
  }
  const arg = lowerExpr(ctx, scope, node.arguments[0]!);

  if (obj.type === 'mat4') {
    if (method !== 'mul' || (arg.type !== 'mat4' && arg.type !== 'vec4')) {
      throw errorAt(ctx.sourceFile, node, `mat4 supports only .mul(mat4) and .mul(vec4)`);
    }
    return { kind: 'binary', op: '*', left: obj, right: arg, type: arg.type };
  }

  if (!isVec(obj.type)) {
    throw errorAt(ctx.sourceFile, node, `.${method}() is not supported on ${obj.type}`);
  }

  if (method === 'scale') {
    if (arg.type !== 'float') {
      throw errorAt(ctx.sourceFile, node, `.scale() expects a float factor, got ${arg.type}`);
    }
  } else if (arg.type !== obj.type && arg.type !== 'float') {
    throw errorAt(
      ctx.sourceFile,
      node,
      `.${method}() on ${obj.type} expects a ${obj.type} or float argument, got ${arg.type}`,
    );
  }
  if ((method === 'add' || method === 'sub') && arg.type !== obj.type) {
    throw errorAt(ctx.sourceFile, node, `.${method}() on ${obj.type} expects a ${obj.type} argument, got ${arg.type}`);
  }

  return { kind: 'binary', op, left: obj, right: arg, type: obj.type };
}

const TS_BINARY_OPS: Partial<Record<ts.SyntaxKind, IrBinaryOp>> = {
  [ts.SyntaxKind.PlusToken]: '+',
  [ts.SyntaxKind.MinusToken]: '-',
  [ts.SyntaxKind.AsteriskToken]: '*',
  [ts.SyntaxKind.SlashToken]: '/',
  [ts.SyntaxKind.LessThanToken]: '<',
  [ts.SyntaxKind.GreaterThanToken]: '>',
  [ts.SyntaxKind.LessThanEqualsToken]: '<=',
  [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: '==',
  [ts.SyntaxKind.EqualsEqualsToken]: '==',
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '!=',
  [ts.SyntaxKind.ExclamationEqualsToken]: '!=',
  [ts.SyntaxKind.AmpersandAmpersandToken]: '&&',
  [ts.SyntaxKind.BarBarToken]: '||',
};

function lowerBinary(ctx: StageContext, scope: Scope, node: ts.BinaryExpression): IrExpr {
  const op = TS_BINARY_OPS[node.operatorToken.kind];
  if (op === undefined) {
    throw errorAt(
      ctx.sourceFile,
      node.operatorToken,
      `operator '${node.operatorToken.getText(ctx.sourceFile)}' is not supported in shader code`,
    );
  }
  const left = lowerExpr(ctx, scope, node.left);
  const right = lowerExpr(ctx, scope, node.right);

  if (op === '&&' || op === '||') {
    if (left.type !== 'bool' || right.type !== 'bool') {
      throw errorAt(ctx.sourceFile, node, `'${op}' expects boolean operands`);
    }
    return { kind: 'binary', op, left, right, type: 'bool' };
  }

  if (op === '+' || op === '-' || op === '*' || op === '/') {
    if (left.type !== 'float' || right.type !== 'float') {
      throw errorAt(
        ctx.sourceFile,
        node,
        `operator '${op}' works on floats only — use vector methods (.add/.sub/.mul/.scale) for ${left.type}/${right.type}`,
      );
    }
    return { kind: 'binary', op, left, right, type: 'float' };
  }

  if (left.type !== 'float' || right.type !== 'float') {
    throw errorAt(ctx.sourceFile, node, `comparison '${op}' works on floats only, got ${left.type}/${right.type}`);
  }
  return { kind: 'binary', op, left, right, type: 'bool' };
}

function markUse(ctx: StageContext, role: RecordRole, name: string, node: ts.Node): void {
  if (role === 'uniforms') {
    ctx.usedUniforms.add(name);
    return;
  }
  if (role === 'varyings') {
    ctx.usedVaryings.add(name);
    return;
  }
  if (ctx.stage === 'fragment') {
    throw errorAt(ctx.sourceFile, node, `attributes are not accessible in fragment() — pass values through varyings`);
  }
  if (role === 'attributes') {
    ctx.usedAttributes.add(name);
  } else {
    ctx.usedInstanceAttributes.add(name);
  }
}
