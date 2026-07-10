import ts from "typescript";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type TransformOptions = {
  filename?: string;
  target?: TransformTarget;
};

export type TransformTarget = "default" | "client" | "server";

export type TransformResult = {
  code: string;
  map: null;
  filename: string;
  manifest: ExactCompilerManifest;
};

export type ExactPlacement = "server" | "client" | "isomorphic" | "unknown";

export type ExactStateEffect = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
};

export type ExactTaskIR = {
  id: string;
  placement: ExactPlacement;
  async: boolean;
  browserEffects: boolean;
  reads: ExactStateEffect[];
  writes: ExactStateEffect[];
  diagnostics: string[];
};

export type ExactComponentIR = {
  id: string;
  name: string;
  placement: ExactPlacement;
  tasks: ExactTaskIR[];
  splitBoundaries: string[];
  diagnostics: string[];
};

export type ExactCompilerManifest = {
  version: 1;
  filename: string;
  components: ExactComponentIR[];
  serverActions: Record<string, {
    id: string;
    componentId: string;
    taskId: string;
    placement: ExactPlacement;
  }>;
  diagnostics: string[];
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
  const target = options.target ?? "default";
  const diagnostics = validateSource(normalized, filename);
  if (diagnostics.length) {
    throw new Error(formatDiagnostics(diagnostics));
  }
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const result = ts.transform(sourceFile, [exactJsxTransformer(target)]);
  const transformed = result.transformed[0]!;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printFile(transformed as ts.SourceFile);
  result.dispose();
  return {
    code: printed,
    map: null,
    filename,
    manifest: analyzeSource(normalized, { filename })
  };
}

export function analyzeSource(source: string, options: TransformOptions = {}): ExactCompilerManifest {
  const normalized = preprocessPropPunning(source);
  const filename = options.filename ?? "input.tsx";
  const sourceFile = ts.createSourceFile(filename, normalized, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const components: ExactComponentIR[] = [];
  const manifestDiagnostics: string[] = [];
  const serverActions: ExactCompilerManifest["serverActions"] = {};
  const serverOnlyImports = collectServerOnlyImports(sourceFile);

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && isComponentLikeFunction(node)) {
      components.push(analyzeComponent(node.name.text, node, sourceFile, serverOnlyImports));
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  for (const component of components) {
    for (const task of component.tasks) {
      if (task.placement === "server" || task.placement === "isomorphic") {
        serverActions[task.id] = {
          id: task.id,
          componentId: component.id,
          taskId: task.id,
          placement: task.placement
        };
      }
    }
    manifestDiagnostics.push(...component.diagnostics);
  }

  return {
    version: 1,
    filename,
    components,
    serverActions,
    diagnostics: manifestDiagnostics
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

function exactJsxTransformer(target: TransformTarget): ts.TransformerFactory<ts.SourceFile> {
  return context => sourceFile => {
    const factory = context.factory;
    const helpers = allocateHelperNames(sourceFile);
    const serverOnlyImports = collectServerOnlyImports(sourceFile);
    let sawJsx = false;

    const visitor: ts.Visitor = node => {
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && isThisMethodCall(node.expression, "task")) {
        const task = analyzeTask("target-task", node.expression, sourceFile, serverOnlyImports);
        if (shouldOmitPlacement(task.placement, target)) {
          return factory.createEmptyStatement();
        }
      }
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
        if (isThisMethodCall(node, "task")) {
          const task = analyzeTask("target-task", node, sourceFile, serverOnlyImports);
          if (shouldOmitPlacement(task.placement, target)) {
            return factory.createVoidExpression(factory.createNumericLiteral(0));
          }
        }
        return transformCapturedCall(node, context, visitor);
      }
      if (ts.isTaggedTemplateExpression(node)) {
        return transformReactiveTaggedTemplate(node, context, visitor);
      }
      return ts.visitEachChild(node, visitor, context);
    };

    const transformInput = target === "client"
      ? factory.updateSourceFile(sourceFile, sourceFile.statements.filter(statement => !isServerOnlyImportDeclaration(statement)))
      : sourceFile;
    const visited = ts.visitEachChild(transformInput, visitor, context);
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

function analyzeComponent(
  name: string,
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>
): ExactComponentIR {
  const tasks: ExactTaskIR[] = [];
  const splitBoundaries = new Set<string>();
  const diagnostics: string[] = [];
  let hasClientEffect = false;
  let hasServerEffect = false;
  let taskIndex = 0;

  function visit(current: ts.Node): void {
    if (ts.isCallExpression(current) && isThisMethodCall(current, "task")) {
      const task = analyzeTask(`${name}:task:${taskIndex++}`, current, sourceFile, serverOnlyImports);
      tasks.push(task);
      if (task.placement === "client") hasClientEffect = true;
      if (task.placement === "server") hasServerEffect = true;
      if (task.placement === "isomorphic") {
        hasClientEffect = true;
        hasServerEffect = true;
      }
      diagnostics.push(...task.diagnostics);
    }

    if (ts.isJsxAttribute(current)) {
      const propName = current.name.getText(sourceFile);
      if (/^on[A-Z]/.test(propName) || propName === "ref") {
        hasClientEffect = true;
        splitBoundaries.add(propName === "ref" ? "ref" : "event-handler");
      }
    }

    if (ts.isIdentifier(current)) {
      if (browserGlobals.has(current.text)) {
        hasClientEffect = true;
        splitBoundaries.add(`browser:${current.text}`);
      }
      if (serverOnlyImports.has(current.text)) {
        hasServerEffect = true;
        splitBoundaries.add(`server-import:${current.text}`);
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);

  const placement: ExactPlacement = hasClientEffect && hasServerEffect
    ? "isomorphic"
    : hasServerEffect
      ? "server"
      : hasClientEffect
        ? "client"
        : "server";

  return {
    id: stableId(sourceFile.fileName, name),
    name,
    placement,
    tasks,
    splitBoundaries: [...splitBoundaries].sort(),
    diagnostics
  };
}

function analyzeTask(
  seed: string,
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  serverOnlyImports: Set<string>
): ExactTaskIR {
  const work = node.arguments[node.arguments.length - 1];
  const reads: ExactStateEffect[] = [];
  const writes: ExactStateEffect[] = [];
  const diagnostics: string[] = [];
  let browserEffects = false;
  let serverEffects = false;
  let isAsync = false;

  if (!work || !isFunctionLikeExpression(work)) {
    return {
      id: stableId(sourceFile.fileName, seed),
      placement: "unknown",
      async: false,
      browserEffects: false,
      reads,
      writes,
      diagnostics: ["task work callback could not be analyzed"]
    };
  }

  isAsync = ts.canHaveModifiers(work)
    ? Boolean(ts.getModifiers(work)?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
    : false;

  function visit(current: ts.Node): void {
    if (ts.isIdentifier(current)) {
      if (browserGlobals.has(current.text)) browserEffects = true;
      if (serverOnlyImports.has(current.text)) serverEffects = true;
    }

    if (ts.isPropertyAccessExpression(current) && isThisStateAccess(current.expression)) {
      reads.push({
        path: current.name.text,
        kind: "read",
        confidence: "exact"
      });
    }

    if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind)) {
      const target = current.left;
      if (isStatePathExpression(target)) {
        writes.push({
          path: statePath(target),
          kind: "write",
          confidence: statePath(target).includes("*") ? "broad" : "exact"
        });
      }
    }

    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      if (ts.isPropertyAccessExpression(expression)) {
        if (isThisStateAccess(expression.expression) || isStatePathExpression(expression.expression)) {
          const method = expression.name.text;
          if (mutatingStateMethods.has(method)) {
            writes.push({
              path: statePath(expression.expression),
              kind: "write",
              confidence: "broad"
            });
          }
        }
        if (expression.name.text === "assign" && expression.expression.getText(sourceFile) === "Object") {
          const target = current.arguments[0];
          if (target && isStatePathExpression(target)) {
            writes.push({
              path: statePath(target),
              kind: "write",
              confidence: "broad"
            });
          }
        }
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(work);

  if (browserEffects && writes.length) {
    diagnostics.push("task writes component state and references browser-only globals; classify as client and split at this boundary");
  }
  if (!browserEffects && !serverEffects && !writes.length) {
    diagnostics.push("task has no detected state writes or environment-specific effects; classify as client lifecycle work");
  }

  const placement: ExactPlacement = browserEffects
    ? "client"
    : serverEffects
      ? "server"
      : writes.length
        ? "isomorphic"
        : "client";

  return {
    id: stableId(sourceFile.fileName, seed),
    placement,
    async: isAsync,
    browserEffects,
    reads: uniqueEffects(reads),
    writes: uniqueEffects(writes),
    diagnostics
  };
}

function isComponentLikeFunction(node: ts.FunctionDeclaration): boolean {
  const first = node.name?.text[0];
  return !!first && first === first.toUpperCase();
}

const browserGlobals = new Set(["window", "document", "localStorage", "sessionStorage", "navigator", "HTMLElement", "Node"]);
const mutatingStateMethods = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "set", "delete", "clear"]);

function collectServerOnlyImports(sourceFile: ts.SourceFile): Set<string> {
  const imports = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isServerOnlyModule(statement.moduleSpecifier.text)) continue;

    const clause = statement.importClause;
    if (clause?.name) imports.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.add(element.name.text);
      }
    }
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.add(clause.namedBindings.name.text);
    }
  }

  return imports;
}

function isServerOnlyImportDeclaration(statement: ts.Statement): boolean {
  return ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && isServerOnlyModule(statement.moduleSpecifier.text);
}

function isServerOnlyModule(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  return ["fs", "path", "crypto", "http", "https", "net", "tls", "child_process"].includes(specifier);
}

function shouldOmitPlacement(placement: ExactPlacement, target: TransformTarget): boolean {
  if (target === "default") return false;
  if (target === "client") return placement === "server";
  return placement === "client";
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isThisStateAccess(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === "state"
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function isStatePathExpression(expression: ts.Expression): boolean {
  if (isThisStateAccess(expression)) return true;
  if (ts.isPropertyAccessExpression(expression)) return isStatePathExpression(expression.expression);
  if (ts.isElementAccessExpression(expression)) return isStatePathExpression(expression.expression);
  return false;
}

function statePath(expression: ts.Expression): string {
  if (isThisStateAccess(expression)) return "*";
  if (ts.isPropertyAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    return parent === "*" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  if (ts.isElementAccessExpression(expression) && isStatePathExpression(expression.expression)) {
    const parent = statePath(expression.expression);
    const argument = expression.argumentExpression;
    const segment = argument && ts.isStringLiteralLike(argument) ? argument.text : "*";
    return parent === "*" ? segment : `${parent}.${segment}`;
  }
  return "*";
}

function uniqueEffects(effects: ExactStateEffect[]): ExactStateEffect[] {
  const seen = new Set<string>();
  const output: ExactStateEffect[] = [];
  for (const effect of effects) {
    const key = `${effect.kind}:${effect.path}:${effect.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(effect);
  }
  return output.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function stableId(...parts: string[]): string {
  const input = parts.join(":");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `x${(hash >>> 0).toString(36)}`;
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
