import ts from 'typescript';
import { GPU_TYPES, type GpuRecord, type GpuType } from '../dsl/types.js';
import { errorAt, type CompileError } from './errors.js';

export type ShaderFn = ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;

export interface ParsedShaderModule {
  sourceFile: ts.SourceFile;
  attributes: GpuRecord;
  instanceAttributes: GpuRecord;
  uniforms: GpuRecord;
  varyings: GpuRecord;
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
  return IDENT_PATTERN.test(name) && !GLSL_RESERVED.has(name) && !name.startsWith('gl_');
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

  return { sourceFile, attributes, instanceAttributes, uniforms, varyings, vertexFn, fragmentFn };
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
