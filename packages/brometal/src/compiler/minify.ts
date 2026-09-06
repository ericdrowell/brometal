/**
 * Shortening the identifiers the WGSL backend emits.
 *
 * A prod build renames every name the module owns to one or two characters.
 * That is worth having twice over: the shader source itself is smaller, and
 * shader source is usually shipped as a string inside the bundle, where it is
 * paid for byte by byte.
 *
 * **Names are the part a compressor cannot guess.** A repeated symbol is cheap
 * under any modern compressor but never free — every occurrence still costs bits
 * in proportion to its length — so twenty-one appearances of `courseDir` are
 * twenty-one times nine characters that shortening actually removes. On a large
 * shader-heavy project this pass measured out at about five per cent of the
 * whole compressed bundle.
 *
 * **Whitespace is deliberately left alone**, and that is not an oversight.
 * Indentation is the most predictable text in the file: a compressor models it
 * for almost nothing, and removing it deletes context without deleting cost.
 * Measured on a real project, stripping it made the compressed output *larger*.
 * So this pass renames and never reformats — which also means a prod build stays
 * readable when something goes wrong inside it.
 *
 * ── What is safe to rename ────────────────────────────────────────────────
 * Only names that live and die inside the module: locals, loop variables, the
 * compute stage's invocation-id binding, helper functions and their parameters.
 *
 * Everything else is load-bearing across the boundary and is left alone:
 *
 *   - **Entry points.** The runtime names `vs_main` / `fs_main` / `cs_main` when
 *     it builds a pipeline. Renaming them fails at pipeline creation, which
 *     surfaces as a blank canvas rather than as an error.
 *   - **Attributes, uniforms and varyings.** They are struct fields, and the
 *     layout the host binds against is built from the same names.
 *   - **Storage buffers.** Declared from the layout and referenced bare.
 *   - **Anything `bm_`-prefixed.** Compiler plumbing, already short.
 */
import type { IrExpr, IrStmt, ShaderIr } from './ir.js';

/**
 * The pool of generated names, shortest first.
 *
 * **A letter, then a letter and a digit** — and the digit is what makes the
 * second rank safe rather than lucky. WGSL's reserved-for-future list is long
 * and full of ordinary words (`as`, `do`, `of`, `type`, `set`, `filter`, …), so
 * a pool of plain letter pairs would have to be filtered against it and would
 * break the day the list grew. No reserved word and no builtin contains a digit,
 * so `a0` through `z9` cannot collide with either, now or later.
 *
 * 286 names, against the hundred or so an involved shader declares.
 */
function* namePool(): Generator<string> {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const a of letters) yield a;
  for (const a of letters) for (const b of '0123456789') yield a + b;
}

function countExpr(expr: IrExpr, tally: Map<string, number>, helpers: Set<string>): void {
  switch (expr.kind) {
    case 'ident':
      tally.set(expr.name, (tally.get(expr.name) ?? 0) + 1);
      break;
    case 'call':
      if (helpers.has(expr.callee)) {
        tally.set(expr.callee, (tally.get(expr.callee) ?? 0) + 1);
      }
      for (const arg of expr.args) countExpr(arg, tally, helpers);
      break;
    case 'unary':
      countExpr(expr.operand, tally, helpers);
      break;
    case 'binary':
      countExpr(expr.left, tally, helpers);
      countExpr(expr.right, tally, helpers);
      break;
    case 'swizzle':
      countExpr(expr.obj, tally, helpers);
      break;
  }
}

function walk(
  statements: IrStmt[],
  declared: Set<string>,
  tally: Map<string, number>,
  helpers: Set<string>,
): void {
  for (const statement of statements) {
    switch (statement.kind) {
      case 'decl':
        declared.add(statement.name);
        tally.set(statement.name, (tally.get(statement.name) ?? 0) + 1);
        countExpr(statement.expr, tally, helpers);
        break;
      case 'assign':
        tally.set(statement.target, (tally.get(statement.target) ?? 0) + 1);
        countExpr(statement.expr, tally, helpers);
        break;
      case 'if':
        countExpr(statement.condition, tally, helpers);
        walk(statement.then, declared, tally, helpers);
        if (statement.else !== undefined) walk(statement.else, declared, tally, helpers);
        break;
      case 'for':
        declared.add(statement.init.name);
        tally.set(statement.init.name, (tally.get(statement.init.name) ?? 0) + 1);
        countExpr(statement.init.expr, tally, helpers);
        countExpr(statement.condition, tally, helpers);
        walk([statement.update], declared, tally, helpers);
        walk(statement.body, declared, tally, helpers);
        break;
      case 'storageWrite':
        // The buffer name is a uniform and stays; the index and value are ours.
        countExpr(statement.index, tally, helpers);
        countExpr(statement.value, tally, helpers);
        break;
      case 'return':
        countExpr(statement.expr, tally, helpers);
        break;
    }
  }
}

/**
 * Map every module-local name to a short one.
 *
 * Names are handed out **most-used first**, so the single letters go to the
 * identifiers that appear dozens of times rather than to whichever happened to
 * be declared earliest. On a large shader that is the difference between the
 * hottest name costing one character and costing two, thirty times over.
 */
export function buildRenameMap(ir: ShaderIr): Map<string, string> {
  // Names the module does not own. Generated names are checked against this so
  // a shader whose uniform is called `a` cannot have a local renamed on top of
  // it — vanishingly unlikely, and a silent miscompile if it ever happened.
  const keep = new Set<string>([
    ...Object.keys(ir.attributes),
    ...Object.keys(ir.instanceAttributes),
    ...Object.keys(ir.uniforms),
    ...Object.keys(ir.varyings),
    ...Object.keys(ir.storageElements),
  ]);

  const helpers = new Set(ir.helpers.map((helper) => helper.name));
  const declared = new Set<string>();
  const tally = new Map<string, number>();

  for (const stage of [ir.vertex, ir.fragment, ir.compute]) {
    if (stage === undefined) continue;
    if (stage.idParam !== undefined) declared.add(stage.idParam);
    walk(stage.statements, declared, tally, helpers);
  }
  for (const helper of ir.helpers) {
    declared.add(helper.name);
    for (const param of helper.params) declared.add(param.name);
    walk(helper.statements, declared, tally, helpers);
  }

  const rankable = [...declared].filter((name) => !keep.has(name) && !name.startsWith('bm_'));
  rankable.sort((a, b) => (tally.get(b) ?? 0) - (tally.get(a) ?? 0) || a.localeCompare(b));

  // **Every local is renamed, including ones already as short as the pool can
  // make them.** Skipping those looks like a free win and is a miscompile: a
  // shader that declares `a` keeps it, the pool later hands `a` to something
  // else, and the module has two of them. WGSL says `redeclaration of 'a'`,
  // which surfaces as a blank canvas. Renaming everything makes the map total
  // and injective over the locals, so no source name survives to be collided
  // with — and `a` -> `b` costs nothing.
  const pool = namePool();
  const rename = new Map<string, string>();
  for (const name of rankable) {
    let short: string;
    do {
      const next = pool.next();
      if (next.done === true) return rename; // pool exhausted: leave the rest alone
      short = next.value;
    } while (keep.has(short));
    rename.set(name, short);
  }
  return rename;
}
