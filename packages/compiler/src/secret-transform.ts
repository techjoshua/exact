import ts from "typescript";
import type { ExactSecretQualificationPlan } from "./policy.js";

const secretModule = "@exact/secrets";
const preferredAlias = "__ExactSecret";

/**
 * Preserves compiler-proven secret qualification in emitted TypeScript without
 * changing runtime values. Assertions are generated only for expressions
 * already identified by policy analysis.
 */
export function exactSecretQualificationTransformer(
  plan: ExactSecretQualificationPlan
): ts.TransformerFactory<ts.SourceFile> {
  return context => sourceFile => {
    if (!plan.sites.length) return sourceFile;
    const factory = context.factory;
    const alias = uniqueAlias(sourceFile, preferredAlias);
    const sites = new Map(plan.sites.map(site => [`${site.start}:${site.end}`, site]));
    let used = false;

    const visitor: ts.Visitor = node => {
      const visited = ts.visitEachChild(node, visitor, context);
      if (!ts.isExpression(visited)) return visited;
      const site = sites.get(`${node.getStart(sourceFile, false)}:${node.end}`);
      if (!site) return visited;
      used = true;
      return factory.createAsExpression(
        parenthesizeForAssertion(visited, factory),
        factory.createTypeReferenceNode(alias, [
          parseTypeNode(site.underlyingType)
        ])
      );
    };

    const transformed = ts.visitEachChild(sourceFile, visitor, context);
    if (!used) return transformed;
    const importDeclaration = factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        true,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(
            false,
            factory.createIdentifier("Secret"),
            factory.createIdentifier(alias)
          )
        ])
      ),
      factory.createStringLiteral(secretModule),
      undefined
    );
    return factory.updateSourceFile(
      transformed,
      insertAfterDirectivePrologue(transformed.statements, importDeclaration)
    );
  };
}

function parseTypeNode(source: string): ts.TypeNode {
  const file = ts.createSourceFile(
    "__exact_secret_type.ts",
    `type __ExactSecretValue = ${source};`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const statement = file.statements[0];
  if (statement && ts.isTypeAliasDeclaration(statement)) return statement.type;
  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
}

function uniqueAlias(sourceFile: ts.SourceFile, preferred: string): string {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!names.has(preferred)) return preferred;
  let suffix = 2;
  while (names.has(`${preferred}${suffix}`)) suffix++;
  return `${preferred}${suffix}`;
}

function parenthesizeForAssertion(
  expression: ts.Expression,
  factory: ts.NodeFactory
): ts.Expression {
  return ts.isArrowFunction(expression)
    || ts.isBinaryExpression(expression)
    || ts.isConditionalExpression(expression)
    ? factory.createParenthesizedExpression(expression)
    : expression;
}

function insertAfterDirectivePrologue(
  statements: ts.NodeArray<ts.Statement>,
  statement: ts.Statement
): ts.Statement[] {
  let index = 0;
  while (index < statements.length) {
    const current = statements[index]!;
    if (!ts.isExpressionStatement(current) || !ts.isStringLiteral(current.expression)) break;
    index++;
  }
  return [...statements.slice(0, index), statement, ...statements.slice(index)];
}
