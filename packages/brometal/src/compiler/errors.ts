import ts from 'typescript';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} — ${diagnostic.message}`;
}

export class CompileError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(formatDiagnostic(diagnostic));
    this.name = 'CompileError';
    this.diagnostic = diagnostic;
  }
}

export function errorAt(sourceFile: ts.SourceFile, node: ts.Node, message: string): CompileError {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return new CompileError({
    file: sourceFile.fileName,
    line: line + 1,
    column: character + 1,
    message,
  });
}
