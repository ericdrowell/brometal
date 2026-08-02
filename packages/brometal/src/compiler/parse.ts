import ts from "typescript";
import { GPU_TYPES, type GpuRecord, type GpuType } from "../dsl/types.js";
import { errorAt, type CompileError } from "./errors.js";

export type ShaderFn =
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.MethodDeclaration;

/** DSL value types usable in helper signatures ('float' maps from `number`). */
export type HelperType =
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat4"
  | "sampler2D"
  | "sampler3D";

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
  /** Storage buffer name -> element type. Names also appear in `uniforms`. */
  storageElements: GpuRecord;
  varyings: GpuRecord;
  helpers: ParsedHelper[];
  /** Function names imported from 'brometal/shader-functions'. */
  libraryImports: string[];
  vertexFn?: ShaderFn;
  fragmentFn?: ShaderFn;
  computeFn?: ShaderFn;
  workgroupSize: readonly [number, number, number];
}

// Every name a shader declares is emitted verbatim into WGSL, so anything WGSL
// treats specially has to be rejected here. These all parse as ordinary
// TypeScript, so without this list they reach the driver instead — and a WGSL
// parse error surfaces as a pipeline that never creates, which reads as a blank
// canvas rather than a build failure.
const WGSL_RESERVED = new Set([
  // Keywords (WGSL §2.3).
  "alias",
  "break",
  "case",
  "const",
  "const_assert",
  "continue",
  "continuing",
  "default",
  "diagnostic",
  "discard",
  "else",
  "enable",
  "false",
  "fn",
  "for",
  "if",
  "let",
  "loop",
  "override",
  "requires",
  "return",
  "struct",
  "switch",
  "true",
  "var",
  "while",
  // Predeclared types and their aliases. Shadowing these is technically legal,
  // but the emitter writes them into the same scope, so a collision breaks it.
  "bool",
  "f16",
  "f32",
  "i32",
  "u32",
  "array",
  "atomic",
  "ptr",
  "vec2",
  "vec3",
  "vec4",
  "vec2f",
  "vec3f",
  "vec4f",
  "vec2i",
  "vec3i",
  "vec4i",
  "vec2u",
  "vec3u",
  "vec4u",
  "vec2h",
  "vec3h",
  "vec4h",
  "mat2x2",
  "mat2x3",
  "mat2x4",
  "mat3x2",
  "mat3x3",
  "mat3x4",
  "mat4x2",
  "mat4x3",
  "mat4x4",
  "mat2x2f",
  "mat2x3f",
  "mat2x4f",
  "mat3x2f",
  "mat3x3f",
  "mat3x4f",
  "mat4x2f",
  "mat4x3f",
  "mat4x4f",
  "sampler",
  "sampler_comparison",
  "texture_1d",
  "texture_2d",
  "texture_2d_array",
  "texture_3d",
  "texture_cube",
  "texture_cube_array",
  "texture_multisampled_2d",
  "texture_depth_2d",
  "texture_depth_2d_array",
  "texture_depth_cube",
  "texture_depth_cube_array",
  "texture_depth_multisampled_2d",
  "texture_storage_1d",
  "texture_storage_2d",
  "texture_storage_2d_array",
  "texture_storage_3d",
  // Address spaces and access modes, which appear in the declarations the
  // emitter writes around user names.
  "function",
  "private",
  "workgroup",
  "uniform",
  "storage",
  "handle",
  "read",
  "write",
  "read_write",
  // Reserved for future use (WGSL §2.4). Only the ones that are also legal
  // TypeScript identifiers can reach us, which is most of them.
  "NULL",
  "Self",
  "abstract",
  "active",
  "alignas",
  "alignof",
  "as",
  "asm",
  "asm_fragment",
  "async",
  "attribute",
  "auto",
  "await",
  "become",
  "binding_array",
  "cast",
  "catch",
  "class",
  "co_await",
  "co_return",
  "co_yield",
  "coherent",
  "column_major",
  "common",
  "compile",
  "compile_fragment",
  "concept",
  "const_cast",
  "consteval",
  "constexpr",
  "constinit",
  "crate",
  "debugger",
  "decltype",
  "delete",
  "demote",
  "demote_to_helper",
  "do",
  "dynamic_cast",
  "enum",
  "explicit",
  "export",
  "extends",
  "extern",
  "external",
  "fallthrough",
  "filter",
  "final",
  "finally",
  "friend",
  "from",
  "fxgroup",
  "get",
  "goto",
  "groupshared",
  "highp",
  "impl",
  "implements",
  "import",
  "inline",
  "instanceof",
  "interface",
  "layout",
  "lowp",
  "macro",
  "macro_rules",
  "match",
  "mediump",
  "meta",
  "mod",
  "module",
  "move",
  "mut",
  "mutable",
  "namespace",
  "new",
  "nil",
  "noexcept",
  "noinline",
  "nointerpolation",
  "non_coherent",
  "noncoherent",
  "noperspective",
  "null",
  "nullptr",
  "of",
  "operator",
  "package",
  "packoffset",
  "partition",
  "pass",
  "patch",
  "pixelfragment",
  "precise",
  "precision",
  "premerge",
  "priv",
  "protected",
  "pub",
  "public",
  "readonly",
  "ref",
  "regardless",
  "register",
  "reinterpret_cast",
  "require",
  "resource",
  "restrict",
  "self",
  "set",
  "shared",
  "sizeof",
  "smooth",
  "snorm",
  "static",
  "static_assert",
  "static_cast",
  "std",
  "subroutine",
  "super",
  "target",
  "template",
  "this",
  "thread_local",
  "throw",
  "trait",
  "try",
  "type",
  "typedef",
  "typeid",
  "typename",
  "typeof",
  "union",
  "unless",
  "unorm",
  "unsafe",
  "unsized",
  "use",
  "using",
  "varying",
  "virtual",
  "volatile",
  "wgsl",
  "where",
  "with",
  "writeonly",
  "yield",
]);

const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidShaderName(name: string): boolean {
  return (
    IDENT_PATTERN.test(name) &&
    !WGSL_RESERVED.has(name) &&
    !name.startsWith("__") && // reserved by WGSL itself
    !name.startsWith("bm_") // reserved for compiler-generated WGSL plumbing
  );
}

export function parseShaderModule(
  fileName: string,
  source: string,
): ParsedShaderModule {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
  );

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
    throw errorAt(
      sourceFile,
      sourceFile,
      `no ${shaderLocalName}() call found in this module`,
    );
  }
  if (calls.length > 1) {
    throw errorAt(
      sourceFile,
      calls[1]!,
      `only one ${shaderLocalName}() call per file is supported — split additional shaders into their own .shader.ts files`,
    );
  }

  const call = calls[0]!;
  if (
    call.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(call.arguments[0]!)
  ) {
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
  let storageElements: GpuRecord = {};
  let varyings: GpuRecord = {};
  let vertexFn: ShaderFn | undefined;
  let fragmentFn: ShaderFn | undefined;
  let computeFn: ShaderFn | undefined;
  let workgroupSize: readonly [number, number, number] = [64, 1, 1];

  for (const prop of config.properties) {
    const name = propertyName(sourceFile, prop);
    switch (name) {
      case "attributes":
        attributes = parseGpuRecord(sourceFile, prop, name, {
          allowMat4: false,
        });
        break;
      case "instanceAttributes":
        instanceAttributes = parseGpuRecord(sourceFile, prop, name, {
          allowMat4: false,
        });
        break;
      case "uniforms":
        uniforms = parseGpuRecord(sourceFile, prop, name, { allowMat4: true });
        break;
      case "storage":
        // Declared by element type, so the same float/vec2/vec3/vec4 rule as
        // attributes applies — a buffer of mat4 or of samplers is not a thing.
        storageElements = parseGpuRecord(sourceFile, prop, name, {
          allowMat4: false,
        });
        break;
      case "varyings":
        varyings = parseGpuRecord(sourceFile, prop, name, { allowMat4: false });
        break;
      case "vertex":
        vertexFn = parseFn(sourceFile, prop, name);
        break;
      case "fragment":
        fragmentFn = parseFn(sourceFile, prop, name);
        break;
      case "compute":
        computeFn = parseFn(sourceFile, prop, name);
        break;
      case "workgroupSize":
        workgroupSize = parseWorkgroupSize(sourceFile, prop);
        break;
      default:
        throw errorAt(
          sourceFile,
          prop,
          `unknown shader() property '${name}' — expected attributes, instanceAttributes, uniforms, storage, varyings, vertex, fragment, compute, or workgroupSize`,
        );
    }
  }

  // A compute-only shader draws nothing, so it has no attributes and no
  // vertex/fragment pair. The render path still requires all three.
  const computeOnly =
    computeFn !== undefined &&
    vertexFn === undefined &&
    fragmentFn === undefined;
  if (!computeOnly) {
    if (attributes === undefined || Object.keys(attributes).length === 0) {
      throw errorAt(
        sourceFile,
        config,
        `shader() requires a non-empty 'attributes' record`,
      );
    }
    if (vertexFn === undefined) {
      throw errorAt(
        sourceFile,
        config,
        `shader() requires a 'vertex' function`,
      );
    }
    if (fragmentFn === undefined) {
      throw errorAt(
        sourceFile,
        config,
        `shader() requires a 'fragment' function`,
      );
    }
  }

  const seen = new Map<string, string>();
  for (const [recordName, record] of [
    ["attributes", attributes ?? {}],
    ["instanceAttributes", instanceAttributes],
    ["uniforms", uniforms],
    ["storage", storageElements],
    ["varyings", varyings],
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

  // Storage buffers ride in the uniforms record with a marker type, so param
  // destructuring, use-tracking and binding assignment all work unchanged; the
  // element types are kept alongside for storageRead's return type.
  for (const name of Object.keys(storageElements)) {
    uniforms[name] = "storage";
  }

  const helpers = parseHelpers(sourceFile);
  const libraryImports = findLibraryImports(sourceFile);
  return {
    sourceFile,
    attributes: attributes ?? {},
    instanceAttributes,
    uniforms,
    storageElements,
    varyings,
    helpers,
    libraryImports,
    vertexFn,
    fragmentFn,
    computeFn,
    workgroupSize,
  };
}

/** `workgroupSize: [x, y, z]` — a literal tuple of positive integers. */
function parseWorkgroupSize(
  sourceFile: ts.SourceFile,
  prop: ts.ObjectLiteralElementLike,
): readonly [number, number, number] {
  if (
    !ts.isPropertyAssignment(prop) ||
    !ts.isArrayLiteralExpression(prop.initializer)
  ) {
    throw errorAt(
      sourceFile,
      prop,
      `workgroupSize must be an array literal like [64, 1, 1]`,
    );
  }
  const values = prop.initializer.elements.map((element) => {
    if (!ts.isNumericLiteral(element)) {
      throw errorAt(
        sourceFile,
        element,
        `workgroupSize entries must be number literals`,
      );
    }
    const value = Number(element.text);
    if (!Number.isInteger(value) || value < 1) {
      throw errorAt(
        sourceFile,
        element,
        `workgroupSize entries must be positive integers`,
      );
    }
    return value;
  });
  if (values.length !== 3) {
    throw errorAt(
      sourceFile,
      prop,
      `workgroupSize needs exactly three entries — [x, y, z]`,
    );
  }
  return [values[0]!, values[1]!, values[2]!] as const;
}

function helperTypeFromAnnotation(node: ts.TypeNode): HelperType | undefined {
  if (node.kind === ts.SyntaxKind.NumberKeyword) {
    return "float";
  }
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const byName: Record<string, HelperType> = {
      Vec2: "vec2",
      Vec3: "vec3",
      Vec4: "vec4",
      Mat4: "mat4",
      // A helper may take a sampler so that things like shadow lookups can be
      // packaged as a function instead of re-derived at every call site. WGSL
      // needs the texture and its sampler as two separate parameters, which the
      // emitter expands from this single DSL-level one.
      Sampler2D: "sampler2D",
      Sampler3D: "sampler3D",
    };
    return byName[node.typeName.text];
  }
  return undefined;
}

/** Module-level `function` declarations become WGSL helper functions. */
export function parseHelpers(sourceFile: ts.SourceFile): ParsedHelper[] {
  const helpers: ParsedHelper[] = [];
  const seen = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name === undefined) {
      throw errorAt(
        sourceFile,
        statement,
        `shader helper functions must be named`,
      );
    }
    const name = statement.name.text;
    if (!isValidShaderName(name)) {
      throw errorAt(
        sourceFile,
        statement,
        `helper '${name}' is not a usable shader identifier`,
      );
    }
    if (seen.has(name)) {
      throw errorAt(
        sourceFile,
        statement,
        `helper '${name}' is declared twice`,
      );
    }
    if (
      statement.asteriskToken !== undefined ||
      statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
      ) === true
    ) {
      throw errorAt(
        sourceFile,
        statement,
        `helper '${name}' cannot be async or a generator`,
      );
    }
    if (statement.typeParameters !== undefined) {
      throw errorAt(
        sourceFile,
        statement,
        `helper '${name}' cannot be generic`,
      );
    }
    if (statement.body === undefined) {
      throw errorAt(sourceFile, statement, `helper '${name}' must have a body`);
    }
    const params = statement.parameters.map((param) => {
      if (
        !ts.isIdentifier(param.name) ||
        param.dotDotDotToken !== undefined ||
        param.initializer !== undefined
      ) {
        throw errorAt(
          sourceFile,
          param,
          `helper '${name}' parameters must be plain identifiers without defaults`,
        );
      }
      if (param.type === undefined) {
        throw errorAt(
          sourceFile,
          param,
          `helper '${name}' parameters need type annotations (number, Vec2, Vec3, Vec4, Mat4, Sampler2D, or Sampler3D)`,
        );
      }
      const type = helperTypeFromAnnotation(param.type);
      if (type === undefined) {
        throw errorAt(
          sourceFile,
          param.type,
          `helper parameters must be number, Vec2, Vec3, Vec4, Mat4, Sampler2D, or Sampler3D`,
        );
      }
      if (!isValidShaderName(param.name.text)) {
        throw errorAt(
          sourceFile,
          param,
          `parameter '${param.name.text}' is not a usable shader identifier`,
        );
      }
      return { name: param.name.text, type };
    });
    if (statement.type === undefined) {
      throw errorAt(
        sourceFile,
        statement,
        `helper '${name}' needs a return type annotation (number, Vec2, Vec3, or Vec4)`,
      );
    }
    const returnType = helperTypeFromAnnotation(statement.type);
    if (returnType === undefined || returnType === "mat4") {
      throw errorAt(
        sourceFile,
        statement.type,
        `helper return types must be number, Vec2, Vec3, or Vec4`,
      );
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
    if (statement.moduleSpecifier.text !== "brometal/shader-functions")
      continue;
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
    if (statement.moduleSpecifier.text !== "brometal") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === "shader") {
        return element.name.text;
      }
    }
  }
  return undefined;
}

function propertyName(
  sourceFile: ts.SourceFile,
  prop: ts.ObjectLiteralElementLike,
): string {
  const name = prop.name;
  if (name !== undefined && ts.isIdentifier(name)) {
    return name.text;
  }
  throw errorAt(
    sourceFile,
    prop,
    `shader() properties must use plain identifier names`,
  );
}

function parseGpuRecord(
  sourceFile: ts.SourceFile,
  prop: ts.ObjectLiteralElementLike,
  recordName: string,
  options: { allowMat4: boolean },
): GpuRecord {
  if (
    !ts.isPropertyAssignment(prop) ||
    !ts.isObjectLiteralExpression(prop.initializer)
  ) {
    throw errorAt(
      sourceFile,
      prop,
      `'${recordName}' must be an inline object literal`,
    );
  }
  const record: GpuRecord = {};
  for (const entry of prop.initializer.properties) {
    if (!ts.isPropertyAssignment(entry)) {
      throw errorAt(
        sourceFile,
        entry,
        `'${recordName}' entries must be \`name: 'type'\` pairs`,
      );
    }
    const key = propertyName(sourceFile, entry);
    if (!isValidShaderName(key)) {
      throw errorAt(
        sourceFile,
        entry,
        `'${key}' is not a usable shader identifier (WGSL reserved word, bm_ prefix, or invalid characters)`,
      );
    }
    if (!ts.isStringLiteral(entry.initializer)) {
      throw errorAt(
        sourceFile,
        entry,
        `'${recordName}.${key}' must be a string literal GPU type (one of ${GPU_TYPES.join(", ")})`,
      );
    }
    const typeName = entry.initializer.text;
    if (!(GPU_TYPES as readonly string[]).includes(typeName)) {
      throw errorAt(
        sourceFile,
        entry.initializer,
        `'${typeName}' is not a valid GPU type — expected one of ${GPU_TYPES.join(", ")}`,
      );
    }
    if (
      (typeName === "mat4" ||
        typeName === "sampler2D" ||
        typeName === "sampler3D") &&
      !options.allowMat4
    ) {
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
    (ts.isArrowFunction(prop.initializer) ||
      ts.isFunctionExpression(prop.initializer))
  ) {
    return prop.initializer;
  }
  throw errorAt(
    sourceFile,
    prop,
    `'${fnName}' must be a method or arrow function`,
  );
}

export type { CompileError };
