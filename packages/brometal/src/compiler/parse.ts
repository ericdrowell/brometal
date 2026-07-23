import ts from 'typescript';
import { GPU_TYPES, type GpuRecord, type GpuType } from '../dsl/types.js';
import { errorAt, type CompileError } from './errors.js';

export type ShaderFn = ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

/** DSL value types usable in helper signatures ('float' maps from `number`). */
export type HelperType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4';

export interface ParsedHelper {
  name: string;
  fn: ts.FunctionDeclaration;
  params: { name: string; type: HelperType }[];
  returnType: HelperType;
}

export interface ParsedShaderModule {
  sourceFile: ts.SourceFile;
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
  helpers: ParsedHelper[];
  /** Function names imported from 'brometal/shader-functions'. */
  libraryImports: string[];
  vertexFn: ShaderFn;
  fragmentFn: ShaderFn;
}

const GLSL_RESERVED = new Set([
  'main',
  'fragColor',
  'void',
  'float',
  'int',
  'uint',
  'bool',
  'true',
  'false',
  'vec2',
  'vec3',
  'vec4',
  'ivec2',
  'ivec3',
  'ivec4',
  'bvec2',
  'bvec3',
  'bvec4',
  'mat2',
  'mat3',
  'mat4',
  'uniform',
  'in',
  'out',
  'inout',
  'attribute',
  'varying',
  'const',
  'if',
  'else',
  'for',
  'while',
  'do',
  'return',
  'break',
  'continue',
  'discard',
  'struct',
  'precision',
  'highp',
  'mediump',
  'lowp',
  'sampler2D',
  'samplerCube',
  'texture',
]);

const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidGlslName(name: string): boolean {
  return (
    IDENT_PATTERN.test(name) &&
    !GLSL_RESERVED.has(name) &&
    !name.startsWith('gl_') &&
    !name.startsWith('bm_') // reserved for compiler-generated WGSL plumbing
  );
}

export function parseShaderModule(fileName: string, source: string): ParsedShaderModule {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);

  const shaderLocalName = findShaderImportName(sourceFile);
  if (shaderLocalName === undefined) {
    throw errorAt(
      sourceFile,
      sourceFile,
      `no \`shader\` import found — shader modules must \`import { shader } from 'brometal'\``,
    );
  }

  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === shaderLocalName
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (calls.length === 0) {
    throw errorAt(sourceFile, sourceFile, `no ${shaderLocalName}() call found in this module`);
  }
  if (calls.length > 1) {
    throw errorAt(
      sourceFile,
      calls[1]!,
      `only one ${shaderLocalName}() call per file is supported — split additional shaders into their own .shader.ts files`,
    );
  }

  const call = calls[0]!;
  if (call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0]!)) {
    throw errorAt(
      sourceFile,
      call,
      `${shaderLocalName}() takes a single object literal argument`,
    );
  }
  const config = call.arguments[0] as ts.ObjectLiteralExpression;

  let attributes: GpuRecord | undefined;
  let instanceAttributes: GpuRecord = {};
  let uniforms: GpuRecord = {};
  let varyings: GpuRecord = {};
  let vertexFn: ShaderFn | undefined;
  let fragmentFn: ShaderFn | undefined;

  for (const prop of config.properties) {
    const name = propertyName(sourceFile, prop);
    switch (name) {
      case 'attributes':
        attributes = parseGpuRecord(sourceFile, prop, name, { allowMat4: false });
        break;
      case 'instanceAttributes':
        instanceAttributes = parseGpuRecord(sourceFile, prop, name, { allowMat4: false });
        break;
      case 'uniforms':
        uniforms = parseGpuRecord(sourceFile, prop, name, { allowMat4: true });
        break;
      case 'varyings':
        varyings = parseGpuRecord(sourceFile, prop, name, { allowMat4: false });
        break;
      case 'vertex':
        vertexFn = parseFn(sourceFile, prop, name);
        break;
      case 'fragment':
        fragmentFn = parseFn(sourceFile, prop, name);
        break;
      default:
        throw errorAt(
          sourceFile,
          prop,
          `unknown shader() property '${name}' — expected attributes, instanceAttributes, uniforms, varyings, vertex, or fragment`,
        );
    }
  }

  if (attributes === undefined || Object.keys(attributes).length === 0) {
    throw errorAt(sourceFile, config, `shader() requires a non-empty 'attributes' record`);
  }
  if (vertexFn === undefined) {
    throw errorAt(sourceFile, config, `shader() requires a 'vertex' function`);
  }
  if (fragmentFn === undefined) {
    throw errorAt(sourceFile, config, `shader() requires a 'fragment' function`);
  }

  const seen = new Map<string, string>();
  for (const [recordName, record] of [
    ['attributes', attributes],
    ['instanceAttributes', instanceAttributes],
    ['uniforms', uniforms],
    ['varyings', varyings],
  ] as const) {
    for (const key of Object.keys(record)) {
      const existing = seen.get(key);
      if (existing !== undefined) {
        throw errorAt(
          sourceFile,
          config,
          `'${key}' is declared in both ${existing} and ${recordName} — names must be unique across the shader interface`,
        );
      }
      seen.set(key, recordName);
    }
  }

  const helpers = parseHelpers(sourceFile);
  const libraryImports = findLibraryImports(sourceFile);
  return {
    sourceFile,
    attributes,
    instanceAttributes,
    uniforms,
    varyings,
    helpers,
    libraryImports,
    vertexFn,
    fragmentFn,
  };
}

function helperTypeFromAnnotation(node: ts.TypeNode): HelperType | undefined {
  if (node.kind === ts.SyntaxKind.NumberKeyword) {
    return 'float';
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const byName: Record<string, HelperType> = { Vec2: 'vec2', Vec3: 'vec3', Vec4: 'vec4', Mat4: 'mat4' };
    return byName[node.typeName.text];
  }
  return undefined;
}

/** Module-level `function` declarations become GLSL helper functions. */
export function parseHelpers(sourceFile: ts.SourceFile): ParsedHelper[] {
  const helpers: ParsedHelper[] = [];
  const seen = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name === undefined) {
      throw errorAt(sourceFile, statement, `shader helper functions must be named`);
    }
    const name = statement.name.text;
    if (!isValidGlslName(name)) {
      throw errorAt(sourceFile, statement, `helper '${name}' is not a usable GLSL identifier`);
    }
    if (seen.has(name)) {
      throw errorAt(sourceFile, statement, `helper '${name}' is declared twice`);
    }
    if (statement.asteriskToken !== undefined || statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true) {
      throw errorAt(sourceFile, statement, `helper '${name}' cannot be async or a generator`);
    }
    if (statement.typeParameters !== undefined) {
      throw errorAt(sourceFile, statement, `helper '${name}' cannot be generic`);
    }
    if (statement.body === undefined) {
      throw errorAt(sourceFile, statement, `helper '${name}' must have a body`);
    }
    const params = statement.parameters.map((param) => {
      if (!ts.isIdentifier(param.name) || param.dotDotDotToken !== undefined || param.initializer !== undefined) {
        throw errorAt(sourceFile, param, `helper '${name}' parameters must be plain identifiers without defaults`);
      }
      if (param.type === undefined) {
        throw errorAt(sourceFile, param, `helper '${name}' parameters need type annotations (number, Vec2, Vec3, Vec4, or Mat4)`);
      }
      const type = helperTypeFromAnnotation(param.type);
      if (type === undefined) {
        throw errorAt(sourceFile, param.type, `helper parameters must be number, Vec2, Vec3, Vec4, or Mat4`);
      }
      if (!isValidGlslName(param.name.text)) {
        throw errorAt(sourceFile, param, `parameter '${param.name.text}' is not a usable GLSL identifier`);
      }
      return { name: param.name.text, type };
    });
    if (statement.type === undefined) {
      throw errorAt(sourceFile, statement, `helper '${name}' needs a return type annotation (number, Vec2, Vec3, or Vec4)`);
    }
    const returnType = helperTypeFromAnnotation(statement.type);
    if (returnType === undefined || returnType === 'mat4') {
      throw errorAt(sourceFile, statement.type, `helper return types must be number, Vec2, Vec3, or Vec4`);
    }
    seen.add(name);
    helpers.push({ name, fn: statement, params, returnType });
  }
  return helpers;
}

/** Value imports from 'brometal/shader-functions' — each names a library helper to inline. */
function findLibraryImports(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== 'brometal/shader-functions') continue;
    if (statement.importClause?.isTypeOnly === true) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      throw errorAt(
        sourceFile,
        statement,
        `brometal/shader-functions must be imported with named imports: import { fbm2 } from 'brometal/shader-functions'`,
      );
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      if (element.propertyName !== undefined) {
        throw errorAt(
          sourceFile,
          element,
          `brometal/shader-functions imports cannot be aliased — the function name is compiled into the shader`,
        );
      }
      names.push(element.name.text);
    }
  }
  return names;
}

function findShaderImportName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== 'brometal') continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'shader') {
        return element.name.text;
      }
    }
  }
  return undefined;
}

function propertyName(sourceFile: ts.SourceFile, prop: ts.ObjectLiteralElementLike): string {
  const name = prop.name;
  if (name !== undefined && ts.isIdentifier(name)) {
    return name.text;
  }
  throw errorAt(sourceFile, prop, `shader() properties must use plain identifier names`);
}

function parseGpuRecord(
  sourceFile: ts.SourceFile,
  prop: ts.ObjectLiteralElementLike,
  recordName: string,
  options: { allowMat4: boolean },
): GpuRecord {
  if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
    throw errorAt(sourceFile, prop, `'${recordName}' must be an inline object literal`);
  }
  const record: GpuRecord = {};
  for (const entry of prop.initializer.properties) {
    if (!ts.isPropertyAssignment(entry)) {
      throw errorAt(sourceFile, entry, `'${recordName}' entries must be \`name: 'type'\` pairs`);
    }
    const key = propertyName(sourceFile, entry);
    if (!isValidGlslName(key)) {
      throw errorAt(
        sourceFile,
        entry,
        `'${key}' is not a usable GLSL identifier (reserved word, gl_ prefix, or invalid characters)`,
      );
    }
    if (!ts.isStringLiteral(entry.initializer)) {
      throw errorAt(
        sourceFile,
        entry,
        `'${recordName}.${key}' must be a string literal GPU type (one of ${GPU_TYPES.join(', ')})`,
      );
    }
    const typeName = entry.initializer.text;
    if (!(GPU_TYPES as readonly string[]).includes(typeName)) {
      throw errorAt(
        sourceFile,
        entry.initializer,
        `'${typeName}' is not a valid GPU type — expected one of ${GPU_TYPES.join(', ')}`,
      );
    }
    if ((typeName === 'mat4' || typeName === 'sampler2D') && !options.allowMat4) {
      throw errorAt(
        sourceFile,
        entry.initializer,
        `'${typeName}' is only supported for uniforms in the MVP — ${recordName} must use float/vec2/vec3/vec4`,
      );
    }
    record[key] = typeName as GpuType;
  }
  return record;
}

function parseFn(
  sourceFile: ts.SourceFile,
  prop: ts.ObjectLiteralElementLike,
  fnName: string,
): ShaderFn {
  if (ts.isMethodDeclaration(prop)) {
    return prop;
  }
  if (
    ts.isPropertyAssignment(prop) &&
    (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
  ) {
    return prop.initializer;
  }
  throw errorAt(sourceFile, prop, `'${fnName}' must be a method or arrow function`);
}

export type { CompileError };
