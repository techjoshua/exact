import type { ExactSourceMap } from "./types.js";

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

/** Creates a line-level source map that points each generated line at the nearest source line. */
export function createLineSourceMap(filename: string, source: string, generated: string): ExactSourceMap {
  return {
    version: 3,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings: lineMappings(lineCount(generated), lineCount(source))
  };
}

function lineMappings(generatedLines: number, sourceLines: number): string {
  let previousSourceLine = 0;
  const lines: string[] = [];
  for (let line = 0; line < generatedLines; line++) {
    const sourceLine = Math.min(line, Math.max(sourceLines - 1, 0));
    lines.push(encodeVlq(0) + encodeVlq(0) + encodeVlq(sourceLine - previousSourceLine) + encodeVlq(0));
    previousSourceLine = sourceLine;
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
