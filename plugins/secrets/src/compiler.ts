import ts from "typescript";
import type {
  ExactCompilerDiagnostic,
  ExactCompilerModuleView,
  ExactCompilerPluginExtension
} from "@exact/plugin-api";

export function createSecretCompilerExtension(): ExactCompilerPluginExtension {
  return Object.freeze({
    namespace: "secrets",
    directives: Object.freeze(["source", "sink"]),
    include: /\.[cm]?[jt]sx?$/i,
    analyzeModule: analyzeSecretsModule
  });
}

export default createSecretCompilerExtension;

function analyzeSecretsModule(view: ExactCompilerModuleView) {
  const sourceFile = ts.createSourceFile(
    view.id,
    view.source,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind(view.id)
  );
  const sources = view.directives.filter(value => value.name === "source");
  const sinks = view.directives.filter(value => value.name === "sink");
  const secretNames = new Set<string>();
  const sinkNodes = new Set<number>();
  const diagnostics: ExactCompilerDiagnostic[] = [];

  for (const directive of sources) {
    const node = nextAnnotatableNode(sourceFile, directive.start + directive.length, "source");
    if (!node) {
      diagnostics.push(error("orphan-source", "@exact secrets.source must precede a declaration", directive.start));
      continue;
    }
    for (const name of declaredNames(node)) secretNames.add(name);
    if (!declaredNames(node).length) {
      diagnostics.push(error("invalid-source", "@exact secrets.source must annotate a named value", directive.start));
    }
  }
  for (const directive of sinks) {
    const node = nextAnnotatableNode(sourceFile, directive.start + directive.length, "sink");
    if (!node) {
      diagnostics.push(error("orphan-sink", "@exact secrets.sink must precede a call or declaration", directive.start));
      continue;
    }
    sinkNodes.add(node.getStart(sourceFile));
  }

  const secretReturningFunctions = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    walk(sourceFile, node => {
      if (ts.isVariableDeclaration(node) && node.initializer && expressionIsSecret(node.initializer, secretNames, secretReturningFunctions, sinkNodes, sourceFile)) {
        for (const name of bindingNames(node.name)) {
          if (!secretNames.has(name)) {
            secretNames.add(name);
            changed = true;
          }
        }
      }
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && node.body
        && !sinkNodes.has(node.getStart(sourceFile))) {
        const returnsSecret = node.body.statements.some(statement =>
          ts.isReturnStatement(statement) && !!statement.expression
          && expressionIsSecret(statement.expression, secretNames, secretReturningFunctions, sinkNodes, sourceFile)
        );
        const name = node.name.getText(sourceFile);
        if (returnsSecret && !secretReturningFunctions.has(name)) {
          secretReturningFunctions.add(name);
          changed = true;
        }
      }
    });
  }

  walk(sourceFile, node => {
    if (ts.isJsxExpression(node) && node.expression
      && expressionIsSecret(node.expression, secretNames, secretReturningFunctions, sinkNodes, sourceFile)) {
      diagnostics.push(error("vnode-secret", "Secret-derived values cannot be emitted in a VNode", node.getStart(sourceFile)));
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node))
      && !sinkNodes.has(node.getStart(sourceFile))
      && isSerializationSink(node.expression, sourceFile)
      && (node.arguments ?? []).some(argument =>
        expressionIsSecret(argument, secretNames, secretReturningFunctions, sinkNodes, sourceFile)
      )) {
      diagnostics.push(error("serialization-secret", "Secret-derived values cannot enter a serialization or client-boundary sink", node.getStart(sourceFile)));
    }
    if (view.target === "client" && ts.isIdentifier(node) && secretNames.has(node.text)
      && !isDeclarationName(node) && !isInsideSourceDeclaration(node, sources, sourceFile)) {
      diagnostics.push(error("client-secret", "Secret-derived values cannot be used in client code", node.getStart(sourceFile)));
    }
  });

  return Object.freeze({
    diagnostics: Object.freeze(deduplicateDiagnostics(diagnostics)),
    manifestData: Object.freeze({
      policyVersion: 1,
      sourceCount: sources.length,
      sinkCount: sinks.length,
      derivedCount: Math.max(0, secretNames.size - sources.length)
    })
  });
}

function expressionIsSecret(
  expression: ts.Expression,
  names: ReadonlySet<string>,
  secretReturningFunctions: ReadonlySet<string>,
  sinkNodes: ReadonlySet<number>,
  sourceFile: ts.SourceFile
): boolean {
  if ((ts.isCallExpression(expression) || ts.isNewExpression(expression))
    && sinkNodes.has(expression.getStart(sourceFile))) return false;
  if (ts.isCallExpression(expression) && secretReturningFunctions.has(expression.expression.getText(sourceFile))) return true;
  let found = false;
  walk(expression, node => {
    if (node !== expression && (ts.isCallExpression(node) || ts.isNewExpression(node))
      && sinkNodes.has(node.getStart(sourceFile))) return false;
    if (ts.isIdentifier(node) && names.has(node.text) && !isDeclarationName(node)) found = true;
  });
  return found;
}

function nextAnnotatableNode(
  sourceFile: ts.SourceFile,
  after: number,
  kind: "source" | "sink"
): ts.Node | undefined {
  const candidates: ts.Node[] = [];
  walk(sourceFile, node => {
    if (node.getStart(sourceFile) < after) return;
    const accepted = kind === "source"
      ? ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node)
      : ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isFunctionDeclaration(node)
        || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
    if (accepted) candidates.push(node);
  });
  return candidates.sort((left, right) =>
    left.getStart(sourceFile) - right.getStart(sourceFile)
    || left.getWidth(sourceFile) - right.getWidth(sourceFile)
  )[0];
}

function declaredNames(node: ts.Node): string[] {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) return bindingNames(node.name);
  if (ts.isPropertyDeclaration(node) && node.name) return [node.name.getText()];
  return [];
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function isSerializationSink(expression: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const name = expression.getText(sourceFile);
  return name === "JSON.stringify"
    || /(?:serialize|hydrate|boundary|createVNode|jsx|jsxs)$/i.test(name);
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
    || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node;
}

function isInsideSourceDeclaration(
  node: ts.Node,
  directives: ExactCompilerModuleView["directives"],
  sourceFile: ts.SourceFile
): boolean {
  return directives.some(directive => {
    const declaration = nextAnnotatableNode(sourceFile, directive.start + directive.length, "source");
    return declaration && node.getStart(sourceFile) >= declaration.getStart(sourceFile)
      && node.getEnd() <= declaration.getEnd();
  });
}

function deduplicateDiagnostics(values: readonly ExactCompilerDiagnostic[]): ExactCompilerDiagnostic[] {
  return [...new Map(values.map(value => [`${value.code}:${value.start}`, value])).values()];
}

function error(code: string, message: string, start: number): ExactCompilerDiagnostic {
  return Object.freeze({ severity: "error", code, message, start });
}

function walk(node: ts.Node, visit: (node: ts.Node) => void | boolean): void {
  if (visit(node) === false) return;
  node.forEachChild(child => walk(child, visit));
}

function scriptKind(filename: string): ts.ScriptKind {
  if (/\.tsx$/i.test(filename)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filename)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
