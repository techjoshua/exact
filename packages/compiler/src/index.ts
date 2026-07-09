import ts from "typescript";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type TransformOptions = {
  filename?: string;
};

export type TransformResult = {
  code: string;
  map: null;
  filename: string;
};

export type CompileFileOptions = TransformOptions & {
  outDir?: string;
  rootDir?: string;
};

export type CompileFileResult = TransformResult & {
  inputFile: string;
  outputFile?: string;
};

export type CompileProjectOptions = {
  outDir?: string;
  rootDir?: string;
};

const helperModule = "@exact/core";
const elementHelper = "__exactVNode";
const fragmentHelper = "__exactFragment";
const expressionHelper = "__exactExpression";
const dynamicHelper = "__exactDynamic";

type HelperNames = {
  element: string;
  fragment: string;
  expression: string;
  dynamic: string;
};

export function transform(source: string, options: TransformOptions = {}): string {
  return transformSource(source, options).code;
}

export function transformSource(source: string, options: TransformOptions = {}): TransformResult {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const diagnostics = validateSource(normalized, filename);
  if (diagnostics.length) {
    throw new Error(formatDiagnostics(diagnostics));
  }
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const result = ts.transform(sourceFile, [exactJsxTransformer]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(transformed as ts.SourceFile);
  result.dispose();
  return {
    code: printed,
    map: null,
    filename
  };
}

export async function compileFile(inputFile: string, options: CompileFileOptions = {}): Promise<CompileFileResult> {
  const source = await readFile(inputFile, "utf8");
  const result = transformSource(source, { filename: options.filename ?? inputFile });
  const outputFile = options.outDir ? outputPathFor(inputFile, options.outDir, options.rootDir) : undefined;

  if (outputFile) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, result.code);
  }

  return {
    ...result,
    inputFile,
    outputFile
  };
}

export async function compileProject(inputs: readonly string[], options: CompileProjectOptions = {}): Promise<CompileFileResult[]> {
  const files = await collectInputFiles(inputs);
  const rootDir = options.rootDir ?? commonRoot(files);
  const results: CompileFileResult[] = [];

  for (const file of files) {
    results.push(await compileFile(file, { outDir: options.outDir, rootDir }));
  }

  return results;
}

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

function exactJsxTransformer(context: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
  const factory = context.factory;

  return sourceFile => {
    const helpers = allocateHelperNames(sourceFile);
    let sawJsx = false;

    const visitor: ts.Visitor = node => {
      if (ts.isJsxElement(node)) {
        sawJsx = true;
        return transformJsxElement(node, context, visitor, helpers);
      }
      if (ts.isJsxSelfClosingElement(node)) {
        sawJsx = true;
        return transformJsxSelfClosingElement(node, context, visitor, helpers);
      }
      if (ts.isJsxFragment(node)) {
        sawJsx = true;
        return transformJsxFragment(node, context, visitor, helpers);
      }
      if (ts.isCallExpression(node)) {
        return transformCapturedCall(node, context, visitor);
      }
      if (ts.isTaggedTemplateExpression(node)) {
        return transformReactiveTaggedTemplate(node, context, visitor);
      }
      return ts.visitEachChild(node, visitor, context);
    };

    const visited = ts.visitEachChild(sourceFile, visitor, context);
    if (!sawJsx) return visited;

    const importDeclaration = factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledVNode"), factory.createIdentifier(helpers.element)),
          factory.createImportSpecifier(false, factory.createIdentifier("createCompiledFragment"), factory.createIdentifier(helpers.fragment)),
          factory.createImportSpecifier(false, factory.createIdentifier("createExpression"), factory.createIdentifier(helpers.expression)),
          factory.createImportSpecifier(false, factory.createIdentifier("createDynamicChild"), factory.createIdentifier(helpers.dynamic))
        ])
      ),
      factory.createStringLiteral(helperModule)
    );

    return factory.updateSourceFile(visited, insertAfterDirectivePrologue(visited.statements, importDeclaration));
  };
}

function transformJsxElement(node: ts.JsxElement, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const opening = node.openingElement;
  const tagName = opening.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, opening.attributes, node.children, visitor, helpers);
  }

  return callElement(context, tagExpression(opening.tagName), opening.attributes, node.children, visitor, helpers);
}

function transformJsxSelfClosingElement(node: ts.JsxSelfClosingElement, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const tagName = node.tagName.getText();
  if (tagName === "_") {
    return callFragment(context, node.attributes, [], visitor, helpers);
  }

  return callElement(context, tagExpression(node.tagName), node.attributes, [], visitor, helpers);
}

function transformJsxFragment(node: ts.JsxFragment, context: ts.TransformationContext, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  return callFragment(context, undefined, node.children, visitor, helpers);
}

function callElement(
  context: ts.TransformationContext,
  tag: ts.Expression,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.element), undefined, [
    tag,
    propsObject(context, attributes, visitor, helpers),
    ...childrenExpressions(context, children, visitor, helpers)
  ]);
}

function callFragment(
  context: ts.TransformationContext,
  attributes: ts.JsxAttributes | undefined,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression {
  return context.factory.createCallExpression(context.factory.createIdentifier(helpers.fragment), undefined, [
    propsObject(context, attributes, visitor, helpers),
    ...childrenExpressions(context, children, visitor, helpers)
  ]);
}

function propsObject(context: ts.TransformationContext, attributes: ts.JsxAttributes | undefined, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const factory = context.factory;
  const properties: ts.ObjectLiteralElementLike[] = [];

  for (const property of attributes?.properties ?? []) {
    if (ts.isJsxSpreadAttribute(property)) {
      properties.push(factory.createSpreadAssignment(ts.visitNode(property.expression, visitor) as ts.Expression));
      continue;
    }

    const name = property.name.getText();
    if (!property.initializer) {
      properties.push(factory.createPropertyAssignment(propName(name), factory.createTrue()));
      continue;
    }

    if (ts.isStringLiteral(property.initializer)) {
      properties.push(factory.createPropertyAssignment(propName(name), property.initializer));
      continue;
    }

    if (ts.isJsxExpression(property.initializer)) {
      const expression = property.initializer.expression;
      if (!expression) continue;
      properties.push(factory.createPropertyAssignment(propName(name), shouldWrapAttribute(name, expression) ? wrapExpression(context, expression, visitor, helpers) : ts.visitNode(expression, visitor) as ts.Expression));
    }
  }

  return factory.createObjectLiteralExpression(properties, false);
}

function propName(name: string): ts.PropertyName {
  return /^[$A-Z_a-z][$\w]*$/.test(name)
    ? ts.factory.createIdentifier(name)
    : ts.factory.createStringLiteral(name);
}

function childrenExpressions(
  context: ts.TransformationContext,
  children: ts.NodeArray<ts.JsxChild> | readonly ts.JsxChild[],
  visitor: ts.Visitor,
  helpers: HelperNames
): ts.Expression[] {
  const output: ts.Expression[] = [];

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ");
      if (text.trim()) output.push(context.factory.createStringLiteral(text));
      continue;
    }

    if (ts.isJsxExpression(child)) {
      if (child.expression) output.push(wrapDynamicChild(context, child.expression, visitor, helpers));
      continue;
    }

    output.push(ts.visitNode(child, visitor) as ts.Expression);
  }

  return output;
}

function shouldWrapAttribute(name: string, expression: ts.Expression): boolean {
  if (name === "key") return false;
  if (name === "ref") return false;
  if (/^on[A-Z]/.test(name)) return false;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return false;
  return true;
}

function wrapDynamicChild(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.dynamic), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.visitNode(expression, visitor) as ts.Expression
    )
  ]);
}

function wrapExpression(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor, helpers: HelperNames): ts.Expression {
  const factory = context.factory;
  return factory.createCallExpression(factory.createIdentifier(helpers.expression), undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.visitNode(expression, visitor) as ts.Expression
    )
  ]);
}

function tagExpression(tagName: ts.JsxTagNameExpression): ts.Expression {
  if (ts.isIdentifier(tagName)) {
    const text = tagName.text;
    return /^[a-z]/.test(text) ? ts.factory.createStringLiteral(text) : ts.factory.createIdentifier(text);
  }

  if (ts.isPropertyAccessExpression(tagName)) {
    return ts.factory.createPropertyAccessExpression(tagExpression(tagName.expression as ts.JsxTagNameExpression), tagName.name);
  }

  return ts.factory.createStringLiteral(tagName.getText());
}

function transformCapturedCall(node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (isThisMethodCall(node, "reactive")) {
    return transformReactiveCall(node, context, visitor);
  }

  if (isThisMethodCall(node, "task")) {
    return transformTaskCall(node, context, visitor);
  }

  return ts.visitEachChild(node, visitor, context);
}

function transformReactiveTaggedTemplate(node: ts.TaggedTemplateExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (!isThisMethodAccess(node.tag, "reactive")) {
    return ts.visitEachChild(node, visitor, context);
  }

  return context.factory.createCallExpression(
    ts.visitNode(node.tag, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, templateToExpression(node.template), visitor)]
  );
}

function transformReactiveCall(node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (node.arguments.length !== 1) return ts.visitEachChild(node, visitor, context);
  const [argument] = node.arguments;
  if (!argument || isFunctionLikeExpression(argument)) return ts.visitEachChild(node, visitor, context);

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    [captureArgument(context, argument, visitor)]
  );
}

function transformTaskCall(node: ts.CallExpression, context: ts.TransformationContext, visitor: ts.Visitor): ts.Expression {
  if (node.arguments.length < 2) return ts.visitEachChild(node, visitor, context);
  const work = node.arguments[node.arguments.length - 1]!;
  if (!isFunctionLikeExpression(work)) return ts.visitEachChild(node, visitor, context);

  const nextArguments = node.arguments.map((argument, index) => {
    if (index === node.arguments.length - 1 || isFunctionLikeExpression(argument)) {
      return ts.visitNode(argument, visitor) as ts.Expression;
    }
    return context.factory.createCallExpression(
      context.factory.createPropertyAccessExpression(context.factory.createThis(), "reactive"),
      undefined,
      [captureArgument(context, argument, visitor)]
    );
  });

  return context.factory.updateCallExpression(
    node,
    ts.visitNode(node.expression, visitor) as ts.Expression,
    node.typeArguments,
    nextArguments
  );
}

function captureArgument(context: ts.TransformationContext, expression: ts.Expression, visitor: ts.Visitor): ts.ArrowFunction {
  return context.factory.createArrowFunction(
    undefined,
    undefined,
    [],
    undefined,
    context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    ts.visitNode(expression, visitor) as ts.Expression
  );
}

function isThisMethodCall(node: ts.CallExpression, methodName: string): boolean {
  return isThisMethodAccess(node.expression, methodName);
}

function isThisMethodAccess(expression: ts.Expression, methodName: string): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === methodName
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function isFunctionLikeExpression(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function templateToExpression(template: ts.TemplateLiteral): ts.Expression {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return ts.factory.createStringLiteral(template.text);
  }

  return ts.factory.createTemplateExpression(
    template.head,
    template.templateSpans.map(span => ts.factory.createTemplateSpan(span.expression, span.literal))
  );
}

function allocateHelperNames(sourceFile: ts.SourceFile): HelperNames {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    element: allocateName(elementHelper, used),
    fragment: allocateName(fragmentHelper, used),
    expression: allocateName(expressionHelper, used),
    dynamic: allocateName(dynamicHelper, used)
  };
}

function allocateName(base: string, used: Set<string>): string {
  let name = base;
  let index = 1;
  while (used.has(name)) {
    name = `${base}_${index}`;
    index++;
  }
  used.add(name);
  return name;
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

function insertAfterDirectivePrologue(statements: ts.NodeArray<ts.Statement>, statement: ts.Statement): ts.Statement[] {
  const nextStatements = [...statements];
  let index = 0;
  while (index < nextStatements.length && isDirectivePrologueStatement(nextStatements[index]!)) {
    index++;
  }
  nextStatements.splice(index, 0, statement);
  return nextStatements;
}

function isDirectivePrologueStatement(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}

function validateSource(source: string, filename: string): readonly ts.Diagnostic[] {
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

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
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

async function collectInputFiles(inputs: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    files.push(...await collectInput(input));
  }
  return files.sort();
}

async function collectInput(input: string): Promise<string[]> {
  const stat = await import("node:fs/promises").then(fs => fs.stat(input));
  if (!stat.isDirectory()) return isTransformablePath(input) ? [input] : [];

  const files: string[] = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectInput(fullPath));
    } else if (isTransformablePath(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isTransformablePath(file: string): boolean {
  return /\.[jt]sx$/i.test(file);
}

function outputPathFor(inputFile: string, outDir: string, rootDir?: string): string {
  const root = rootDir ?? path.dirname(inputFile);
  const relative = path.relative(root, inputFile);
  return path.join(outDir, relative).replace(/\.(tsx|jsx)$/i, (_match, ext: string) => ext.toLowerCase() === "tsx" ? ".ts" : ".js");
}

function commonRoot(files: readonly string[]): string {
  if (!files.length) return process.cwd();
  const split = files.map(file => path.dirname(path.resolve(file)).split(path.sep));
  const first = split[0]!;
  let index = 0;
  while (index < first.length && split.every(parts => parts[index] === first[index])) {
    index++;
  }
  return first.slice(0, index).join(path.sep) || path.parse(first[0] ?? process.cwd()).root;
}
