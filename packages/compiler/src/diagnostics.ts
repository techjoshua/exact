import ts from "typescript";

/** Returns TypeScript parse/transpile diagnostics for source before eXact transforms run. */
export function validateSource(source: string, filename: string): readonly ts.Diagnostic[] {
  return ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  }).diagnostics ?? [];
}

/** Formats TypeScript diagnostics into readable file:line:column messages. */
export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics.map(diagnostic => {
    const file = diagnostic.file;
    const location = file && diagnostic.start !== undefined
      ? file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    return file && location
      ? `${file.fileName}:${location.line + 1}:${location.character + 1} - ${message}`
      : message;
  }).join("\n");
}
