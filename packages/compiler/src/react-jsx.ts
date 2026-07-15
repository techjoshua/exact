import ts from "typescript";

export type ReactJsxTransformOptions = {
  filename?: string;
  target: 18 | 19;
  sourceMap?: boolean;
};

export type ReactJsxTransformResult = {
  code: string;
  map: unknown;
  filename: string;
};

const reactRuntimeModules = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react/compiler-runtime",
  "react-dom",
  "react-dom/client",
  "react-dom/server",
  "react-dom/server.browser",
  "react-dom/server.node",
  "react-dom/static",
  "react-dom/static.browser",
  "react-dom/static.node"
]);

/** Detects referenced value bindings imported from public React modules. */
export function usesReactRuntimeImports(source: string, filename = "input.tsx"): boolean {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind(filename));
  const runtimeBindings = new Set<string>();
  const importNodes = new Set<ts.Node>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !reactRuntimeModules.has(statement.moduleSpecifier.text)) continue;
    importNodes.add(statement);
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) runtimeBindings.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) runtimeBindings.add(bindings.name.text);
    else if (bindings) {
      for (const element of bindings.elements) if (!element.isTypeOnly) runtimeBindings.add(element.name.text);
    }
  }

  if (!runtimeBindings.size) return false;
  let referenced = false;
  const visit = (node: ts.Node): void => {
    if (referenced || importNodes.has(node)) return;
    if (ts.isIdentifier(node) && runtimeBindings.has(node.text) && isRuntimeReference(node)) {
      referenced = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return referenced;
}

/** Lowers React-owned TSX and imports the selected eXact compatibility runtime directly. */
export function transformReactJsx(source: string, options: ReactJsxTransformOptions): ReactJsxTransformResult {
  const filename = options.filename ?? "input.tsx";
  const classic = /@jsxRuntime\s+classic(?:\s|$)/m.test(source);
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: classic ? ts.JsxEmit.React : ts.JsxEmit.ReactJSX,
      ...(classic ? {
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment"
      } : { jsxImportSource: "react" }),
      sourceMap: options.sourceMap ?? true,
      inlineSources: options.sourceMap ?? true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
  }
  const code = rewriteReactModuleSpecifiers(result.outputText, options.target);
  return {
    code,
    map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
    filename
  };
}

function isRuntimeReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isExportSpecifier(parent) && parent.isTypeOnly) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) return false;
  if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) {
    const heritage = parent.parent;
    return ts.isHeritageClause(heritage)
      && heritage.token === ts.SyntaxKind.ExtendsKeyword
      && (ts.isClassDeclaration(heritage.parent) || ts.isClassExpression(heritage.parent));
  }
  if (ts.isQualifiedName(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node && parent.initializer !== node) return false;
  return true;
}

function rewriteReactModuleSpecifiers(code: string, target: 18 | 19): string {
  const aliases: Record<string, string> = {
    "react/jsx-runtime": `@exact/react-compat/jsx-runtime${target}`,
    "react/jsx-dev-runtime": `@exact/react-compat/jsx-dev-runtime${target}`,
    "react/compiler-runtime": "@exact/react-compat/compiler-runtime",
    react: `@exact/react-compat/react${target}`,
    "react-dom/client": `@exact/react-dom-compat/client${target}`,
    "react-dom/server": `@exact/react-dom-compat/server${target}`,
    "react-dom/server.browser": `@exact/react-dom-compat/server-browser${target}`,
    "react-dom/server.node": `@exact/react-dom-compat/server${target}`,
    "react-dom": `@exact/react-dom-compat/react${target}`,
    ...(target === 19 ? {
      "react-dom/static": "@exact/react-dom-compat/static19",
      "react-dom/static.browser": "@exact/react-dom-compat/static-browser19",
      "react-dom/static.node": "@exact/react-dom-compat/static19"
    } : {})
  };
  let rewritten = code;
  for (const [request, replacement] of Object.entries(aliases).sort(([left], [right]) => right.length - left.length)) {
    const escaped = request.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s*)(["'])${escaped}\\2`, "g");
    rewritten = rewritten.replace(pattern, (_match, prefix: string, quote: string) => `${prefix}${quote}${replacement}${quote}`);
  }
  return rewritten;
}

function scriptKind(filename: string): ts.ScriptKind {
  if (/\.jsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.JSX;
  if (/\.tsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.TSX;
  if (/\.js(?:$|\?)/i.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
