import type { IrExpr, IrStmt, ShaderIr } from './ir.js';

export function foldConstants(ir: ShaderIr): ShaderIr {
  return {
    ...ir,
    vertex: { ...ir.vertex, statements: ir.vertex.statements.map(foldStmt) },
    fragment: { ...ir.fragment, statements: ir.fragment.statements.map(foldStmt) },
  };
}

function foldStmt(statement: IrStmt): IrStmt {
  switch (statement.kind) {
    case 'const':
      return { ...statement, expr: foldExpr(statement.expr) };
    case 'assign':
      return { ...statement, expr: foldExpr(statement.expr) };
    case 'return':
      return { ...statement, expr: foldExpr(statement.expr) };
    case 'if': {
      const folded: IrStmt = {
        kind: 'if',
        condition: foldExpr(statement.condition),
        then: statement.then.map(foldStmt),
      };
      return statement.else === undefined ? folded : { ...folded, else: statement.else.map(foldStmt) };
    }
  }
}

function foldExpr(expr: IrExpr): IrExpr {
  switch (expr.kind) {
    case 'literal':
    case 'ident':
      return expr;
    case 'swizzle':
      return { ...expr, obj: foldExpr(expr.obj) };
    case 'call':
      return { ...expr, args: expr.args.map(foldExpr) };
    case 'unary': {
      const operand = foldExpr(expr.operand);
      if (expr.op === '-' && operand.kind === 'literal') {
        return { kind: 'literal', value: -operand.value, type: 'float' };
      }
      return { ...expr, operand };
    }
    case 'binary': {
      const left = foldExpr(expr.left);
      const right = foldExpr(expr.right);
      if (
        expr.type === 'float' &&
        left.kind === 'literal' &&
        right.kind === 'literal' &&
        !(expr.op === '/' && right.value === 0)
      ) {
        const value = evaluate(expr.op, left.value, right.value);
        if (value !== undefined && Number.isFinite(value)) {
          return { kind: 'literal', value, type: 'float' };
        }
      }
      return { ...expr, left, right };
    }
  }
}

function evaluate(op: string, a: number, b: number): number | undefined {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
    default:
      return undefined;
  }
}

/**
 * Whitespace-level GLSL minification. Preprocessor directives keep their own
 * lines; spaces around `+`/`-` are preserved to avoid creating `--`/`++`.
 */
export function minifyGlsl(source: string): string {
  const lines = source.split('\n');
  const directives: string[] = [];
  const code: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) {
      directives.push(trimmed);
    } else {
      code.push(trimmed);
    }
  }
  const body = code
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/ ?([{}();,=*/<>!&|]) ?/g, '$1');
  return directives.join('\n') + '\n' + body + '\n';
}
