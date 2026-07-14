import type { ExactSourceMap } from "./types.js";
import ts from "typescript";

/** Returns the source map file path for an emitted output file. */
export function sourceMapPathFor(outputFile: string): string {
  return `${outputFile}.map`;
}

/** Appends a sourceMappingURL comment to generated code. */
export function withSourceMappingUrl(code: string, mapFileName: string): string {
  const normalized = code.endsWith("\n") ? code : `${code}\n`;
  return `${normalized}//# sourceMappingURL=${mapFileName}\n`;
}

/** Adds or replaces the file field on a source map object. */
export function withSourceMapFile(map: ExactSourceMap, file: string): ExactSourceMap {
  return { ...map, file };
}

/** Creates token-level mappings; compiler-generated regions remain intentionally unmapped. */
export function createLineSourceMap(filename: string, source: string, generated: string): ExactSourceMap {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const generatedFile = ts.createSourceFile(`${filename}.generated`, generated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const originals = scanTokens(source);
  const generatedTokens = scanTokens(generated);
  const segments = new Map<number, Array<{ column: number; sourceLine: number; sourceColumn: number }>>();
  let sourceCursor = 0;
  for (const token of generatedTokens) {
    let match = -1;
    const limit = Math.min(originals.length, sourceCursor + 256);
    for (let index = sourceCursor; index < limit; index++) {
      if (originals[index]!.kind === token.kind && originals[index]!.text === token.text) { match = index; break; }
    }
    if (match < 0) continue;
    const original = originals[match]!;
    sourceCursor = match + 1;
    const generatedLocation = generatedFile.getLineAndCharacterOfPosition(token.start);
    const originalLocation = sourceFile.getLineAndCharacterOfPosition(original.start);
    let line = segments.get(generatedLocation.line);
    if (!line) segments.set(generatedLocation.line, line = []);
    line.push({ column: generatedLocation.character, sourceLine: originalLocation.line, sourceColumn: originalLocation.character });
  }
  return {
    version: 3,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings: encodeMappings(lineCount(generated), segments)
  };
}

function scanTokens(source: string): Array<{ kind: ts.SyntaxKind; text: string; start: number }> {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  const tokens: Array<{ kind: ts.SyntaxKind; text: string; start: number }> = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.WhitespaceTrivia || kind === ts.SyntaxKind.NewLineTrivia
      || kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    tokens.push({ kind, text: scanner.getTokenText(), start: scanner.getTokenPos() });
  }
  return tokens;
}

function encodeMappings(generatedLines: number, segments: ReadonlyMap<number, readonly { column: number; sourceLine: number; sourceColumn: number }[]>): string {
  let previousSourceLine = 0;
  let previousSourceColumn = 0;
  const lines: string[] = [];
  for (let line = 0; line < generatedLines; line++) {
    let previousGeneratedColumn = 0;
    const encoded = (segments.get(line) ?? []).map(segment => {
      const value = encodeVlq(segment.column - previousGeneratedColumn) + encodeVlq(0)
        + encodeVlq(segment.sourceLine - previousSourceLine) + encodeVlq(segment.sourceColumn - previousSourceColumn);
      previousGeneratedColumn = segment.column;
      previousSourceLine = segment.sourceLine;
      previousSourceColumn = segment.sourceColumn;
      return value;
    }).join(",");
    lines.push(encoded);
  }
  return lines.join(";");
}

function lineCount(value: string): number {
  return value.length ? value.split(/\r\n|\r|\n/).length : 1;
}

const base64Digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += base64Digits[digit];
  } while (vlq > 0);
  return encoded;
}
