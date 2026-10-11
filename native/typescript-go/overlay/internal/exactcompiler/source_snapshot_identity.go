package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Before TypeScript binding, snapshot scheduling follows only lexical imports and const aliases.
// The checked reactive pass independently proves the same operation with checker symbols.
func normalizationPeekCall(node *ast.Node) bool {
	node = unwrapSourceCallableReference(node)
	if !ast.IsCallExpression(node) {
		return false
	}
	name, namespace := normalizationSnapshotReference(node.AsCallExpression().Expression, make(map[*ast.Node]bool))
	return name == "peek" && !namespace
}

func normalizationSnapshotReference(node *ast.Node, seen map[*ast.Node]bool) (string, bool) {
	node = unwrapSourceCallableReference(node)
	if node == nil || seen[node] {
		return "", false
	}
	seen[node] = true
	var receiver *ast.Node
	var member string
	if ast.IsPropertyAccessExpression(node) {
		access := node.AsPropertyAccessExpression()
		receiver, member = access.Expression, access.Name().Text()
	} else if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		key := unwrapSourceCallableReference(access.ArgumentExpression)
		if ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key) {
			receiver, member = access.Expression, key.Text()
		}
	}
	if receiver != nil {
		if _, namespace := normalizationSnapshotReference(receiver, seen); namespace {
			return member, false
		}
		return "", false
	}
	if !ast.IsIdentifier(node) {
		return "", false
	}
	declaration := normalizationLexicalDeclaration(node, node.Text())
	if declaration == nil {
		return "", false
	}
	if ast.IsVariableDeclaration(declaration) {
		if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			return "", false
		}
		return normalizationSnapshotReference(declaration.AsVariableDeclaration().Initializer, seen)
	}
	if !ast.IsImportSpecifier(declaration) && !ast.IsNamespaceImport(declaration) {
		return "", false
	}
	imported := enclosingImportDeclaration(declaration)
	if imported == nil || imported.AsImportDeclaration().ImportClause.AsImportClause().IsTypeOnly() {
		return "", false
	}
	module := imported.AsImportDeclaration().ModuleSpecifier
	if !ast.IsStringLiteral(module) || module.Text() != "@exactjs/core" {
		return "", false
	}
	if ast.IsNamespaceImport(declaration) {
		return "", true
	}
	specifier := declaration.AsImportSpecifier()
	if specifier.IsTypeOnly {
		return "", false
	}
	name := specifier.Name()
	if specifier.PropertyName != nil {
		name = specifier.PropertyName
	}
	return name.Text(), false
}
