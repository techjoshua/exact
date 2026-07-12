import ts from "typescript";

/** Removes import bindings that are no longer referenced after compiler transforms. */
export function pruneUnusedImports(sourceFile: ts.SourceFile, factory: ts.NodeFactory): ts.SourceFile {
  const used = collectUsedIdentifiers(sourceFile);
  const statements: ts.Statement[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      statements.push(statement);
      continue;
    }

    const clause = statement.importClause;
    const defaultName = clause.name && used.has(clause.name.text) ? clause.name : undefined;
    let namedBindings: ts.NamedImportBindings | undefined;
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      namedBindings = used.has(clause.namedBindings.name.text) ? clause.namedBindings : undefined;
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      const elements = clause.namedBindings.elements.filter(element => used.has(element.name.text));
      if (elements.length) {
        namedBindings = factory.updateNamedImports(clause.namedBindings, elements);
      }
    }

    if (!defaultName && !namedBindings) continue;
    statements.push(factory.updateImportDeclaration(
      statement,
      statement.modifiers,
      factory.updateImportClause(clause, clause.isTypeOnly, defaultName, namedBindings),
      statement.moduleSpecifier,
      statement.attributes
    ));
  }

  return factory.updateSourceFile(sourceFile, statements);
}

function collectUsedIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) visit(statement);
  return used;
}
