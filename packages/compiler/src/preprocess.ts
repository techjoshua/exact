/** Rewrites JSX prop punning syntax such as <View {value} /> before TypeScript parsing. */
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
      // This is a narrow pre-parser: scan enough JSX opening-tag structure to
      // avoid rewriting inside strings, templates, comments, or nested expressions.
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
      if (isWhitespace(tag[index - 1] ?? "") && isIdentifierStart(tag[index + 1] ?? "")) {
        const identifierEnd = scanIdentifier(tag, index + 1);
        if (tag[identifierEnd] === "}") {
          const name = tag.slice(index + 1, identifierEnd);
          output += `${name}={${name}}`;
          index = identifierEnd + 1;
          continue;
        }
      }
      const end = scanJsExpression(tag, index);
      output += tag.slice(index, end);
      index = end;
      continue;
    }

    output += char;
    index++;
  }

  return output;
}

function scanOpeningTag(source: string, start: number): number {
  let index = start + 1;
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
      const end = scanJsExpression(source, index);
      if (end <= index) return -1;
      index = end;
      continue;
    }

    if (char === ">") return index + 1;
    index++;
  }

  return -1;
}

function scanJsExpression(source: string, start: number): number {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "\"" || char === "'") { index = scanQuoted(source, index, char); continue; }
    if (char === "`") { index = scanTemplate(source, index); continue; }
    if (char === "/" && next === "/") { index = scanLineComment(source, index); continue; }
    if (char === "/" && next === "*") { index = scanBlockComment(source, index); continue; }
    if (char === "/" && isRegexStart(source, index)) { index = scanRegex(source, index); continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return index + 1;
    index++;
  }
  return -1;
}

function isRegexStart(source: string, slash: number): boolean {
  let index = slash - 1;
  while (index >= 0 && /\s/.test(source[index]!)) index--;
  if (index < 0 || /[([{,:;=!?&|+\-*%^~<>]/.test(source[index]!)) return true;
  if (!/[\w$]/.test(source[index]!)) return false;
  let start = index;
  while (start > 0 && /[\w$]/.test(source[start - 1]!)) start--;
  return /^(?:return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|new)$/.test(source.slice(start, index + 1));
}

function scanRegex(source: string, start: number): number {
  let index = start + 1;
  let characterClass = false;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") { index += 2; continue; }
    if (char === "[") characterClass = true;
    else if (char === "]") characterClass = false;
    else if (char === "/" && !characterClass) {
      index++;
      while (/[A-Za-z]/.test(source[index] ?? "")) index++;
      return index;
    }
    index++;
  }
  return source.length;
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
    if (char === "$" && source[index + 1] === "{") {
      const end = scanJsExpression(source, index + 1);
      if (end < 0) return source.length;
      index = end;
      continue;
    }
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
