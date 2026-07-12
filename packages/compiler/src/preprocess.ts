export function preprocessPropPunning(source: string): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" || char === "'") {
      const end = scanQuoted(source, index, char);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "`") {
      const end = scanTemplate(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && next === "/") {
      const end = scanLineComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = scanBlockComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "<" && isTagStart(next) && next !== "/") {
      const end = scanOpeningTag(source, index);
      if (end > index) {
        output += rewritePunnedPropsInTag(source.slice(index, end));
        index = end;
        continue;
      }
    }

    output += char;
    index++;
  }

  return output;
}

function rewritePunnedPropsInTag(tag: string): string {
  let output = "";
  let index = 0;
  let braceDepth = 0;
  let quote: "\"" | "'" | undefined;

  while (index < tag.length) {
    const char = tag[index]!;

    if (quote) {
      output += char;
      if (char === "\\") {
        output += tag[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = undefined;
      index++;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      output += char;
      index++;
      continue;
    }

    if (char === "{") {
      if (braceDepth === 0 && isWhitespace(tag[index - 1] ?? "") && isIdentifierStart(tag[index + 1] ?? "")) {
        const identifierEnd = scanIdentifier(tag, index + 1);
        if (tag[identifierEnd] === "}") {
          const name = tag.slice(index + 1, identifierEnd);
          output += `${name}={${name}}`;
          index = identifierEnd + 1;
          continue;
        }
      }
      braceDepth++;
      output += char;
      index++;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    }

    output += char;
    index++;
  }

  return output;
}

function scanOpeningTag(source: string, start: number): number {
  let index = start + 1;
  let braceDepth = 0;
  let quote: "\"" | "'" | undefined;

  while (index < source.length) {
    const char = source[index]!;

    if (quote) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === quote) quote = undefined;
      index++;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      index++;
      continue;
    }

    if (char === "{") {
      braceDepth++;
      index++;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index++;
      continue;
    }

    if (char === ">" && braceDepth === 0) return index + 1;
    index++;
  }

  return -1;
}

function scanQuoted(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index++;
  }
  return source.length;
}

function scanTemplate(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") return index + 1;
    index++;
  }
  return source.length;
}

function scanLineComment(source: string, start: number): number {
  const end = source.indexOf("\n", start + 2);
  return end === -1 ? source.length : end;
}

function scanBlockComment(source: string, start: number): number {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}

function scanIdentifier(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && isIdentifierPart(source[index]!)) index++;
  return index;
}

function isTagStart(char: string | undefined): boolean {
  return !!char && (isIdentifierStart(char) || char === ">");
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[\w$]/.test(char);
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
