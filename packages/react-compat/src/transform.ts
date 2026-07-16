import ts from "typescript";
import { rewriteModuleReferences, type ModuleExportReplacement } from "@exact/expressions";
import { reactCompatibilityAliases } from "./plugin.js";

export type ReactJsxTransformOptions = {
  filename?: string;
  target: 18 | 19;
  sourceMap?: boolean;
  replacements?: readonly ModuleExportReplacement[];
};

export type ReactJsxTransformResult = { code: string; map: unknown; filename: string };

const reactRuntimeModules = new Set([
  "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react/compiler-runtime",
  "react-dom", "react-dom/client", "react-dom/server", "react-dom/server.browser",
  "react-dom/server.node", "react-dom/static", "react-dom/static.browser", "react-dom/static.node"
]);

export function usesReactRuntimeImports(source: string, filename = "input.tsx"): boolean {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind(filename));
  const runtimeBindings = new Set<string>();
  const importNodes = new Set<ts.Node>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !reactRuntimeModules.has(statement.moduleSpecifier.text)) continue;
    importNodes.add(statement);
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) runtimeBindings.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) runtimeBindings.add(bindings.name.text);
    else if (bindings) for (const element of bindings.elements) if (!element.isTypeOnly) runtimeBindings.add(element.name.text);
  }
  if (!runtimeBindings.size) return false;
  let referenced = false;
  const visit = (node: ts.Node): void => {
    if (referenced || importNodes.has(node)) return;
    if (ts.isIdentifier(node) && runtimeBindings.has(node.text) && isRuntimeReference(node)) { referenced = true; return; }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return referenced;
}

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
      ...(classic ? { jsxFactory: "React.createElement", jsxFragmentFactory: "React.Fragment" } : { jsxImportSource: "react" }),
      sourceMap: options.sourceMap ?? true,
      inlineSources: options.sourceMap ?? true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
  const rewritten = rewriteModuleReferences(result.outputText, {
    filename,
    moduleAliases: reactCompatibilityAliases(options.target),
    replacements: options.replacements,
    sourceMap: false
  });
  return { code: rewritten.code, map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null, filename };
}

function isRuntimeReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isExportSpecifier(parent) && parent.isTypeOnly) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) return false;
  if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) {
    const heritage = parent.parent;
    return ts.isHeritageClause(heritage) && heritage.token === ts.SyntaxKind.ExtendsKeyword
      && (ts.isClassDeclaration(heritage.parent) || ts.isClassExpression(heritage.parent));
  }
  if (ts.isQualifiedName(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node && parent.initializer !== node) return false;
  return true;
}

function scriptKind(filename: string): ts.ScriptKind {
  if (/\.jsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.JSX;
  if (/\.tsx(?:$|\?)/i.test(filename)) return ts.ScriptKind.TSX;
  if (/\.js(?:$|\?)/i.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
