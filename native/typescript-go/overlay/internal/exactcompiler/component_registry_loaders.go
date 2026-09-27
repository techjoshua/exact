package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// registryLazySelection proves the import and selected export together. Diagnostics and
// build facts must describe the same returned value, regardless of authored formatting.
func registryLazySelection(loader *ast.Node, typeChecker *checker.Checker) (string, string, bool) {
	seen := make(map[*ast.Symbol]bool)
	loader = unwrapRegistryDefinitionBody(loader)
	for loader != nil && ast.IsIdentifier(loader) {
		symbol := typeChecker.GetSymbolAtLocation(loader)
		if symbol == nil || seen[symbol] {
			return "", "", false
		}
		if source := ast.GetSourceFileOfNode(loader); source != nil && componentValueSymbolIsWrittenAfter(symbol, 0, source, typeChecker) {
			return "", "", false
		}
		seen[symbol] = true
		var resolved *ast.Node
		for _, declaration := range symbol.Declarations {
			if ast.IsFunctionDeclaration(declaration) {
				resolved = declaration
			}
			if ast.IsVariableDeclaration(declaration) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
				resolved = declaration.AsVariableDeclaration().Initializer
			}
		}
		loader = unwrapRegistryDefinitionBody(resolved)
	}
	if !registryLoaderFunction(loader) || len(loader.Parameters()) != 0 {
		return "", "", false
	}
	body := registryLoaderResult(loader.Body())
	if body != nil && ast.IsAwaitExpression(body) {
		body = unwrapRegistryDefinitionBody(body.AsAwaitExpression().Expression)
	}
	if body == nil || !ast.IsCallExpression(body) {
		return "", "", false
	}
	then := body.AsCallExpression()
	if then.Arguments == nil || len(then.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(then.Expression) {
		return "", "", false
	}
	member := then.Expression.AsPropertyAccessExpression()
	if member.Name().Text() != "then" || !ast.IsCallExpression(member.Expression) {
		return "", "", false
	}
	imported := member.Expression.AsCallExpression()
	if imported.Expression.Kind != ast.KindImportKeyword || imported.Arguments == nil || len(imported.Arguments.Nodes) != 1 || !ast.IsStringLiteral(imported.Arguments.Nodes[0]) {
		return "", "", false
	}
	selector := unwrapRegistryDefinitionBody(then.Arguments.Nodes[0])
	if !registryLoaderFunction(selector) || len(selector.Parameters()) != 1 {
		return "", "", false
	}
	parameter := selector.Parameters()[0].AsParameterDeclaration()
	if parameter.Initializer != nil || parameter.DotDotDotToken != nil {
		return "", "", false
	}
	result := registryLoaderResult(selector.Body())
	if result == nil {
		return "", "", false
	}
	name := parameter.Name()
	exportName := ""
	if ast.IsIdentifier(name) {
		var receiver *ast.Node
		if ast.IsPropertyAccessExpression(result) {
			receiver = result.AsPropertyAccessExpression().Expression
			exportName = result.AsPropertyAccessExpression().Name().Text()
		} else if ast.IsElementAccessExpression(result) {
			access := result.AsElementAccessExpression()
			if access.ArgumentExpression != nil && ast.IsStringLiteral(access.ArgumentExpression) {
				receiver = access.Expression
				exportName = access.ArgumentExpression.Text()
			}
		}
		receiver = unwrapRegistryDefinitionBody(receiver)
		if receiver == nil || !ast.IsIdentifier(receiver) || receiver.Text() != name.Text() {
			return "", "", false
		}
	} else if ast.IsObjectBindingPattern(name) && ast.IsIdentifier(result) {
		elements := name.AsBindingPattern().Elements.Nodes
		if len(elements) != 1 {
			return "", "", false
		}
		binding := elements[0].AsBindingElement()
		if binding.Initializer != nil || binding.DotDotDotToken != nil || !ast.IsIdentifier(binding.Name()) || binding.Name().Text() != result.Text() {
			return "", "", false
		}
		property := binding.PropertyName
		if property == nil {
			property = binding.Name()
		}
		if !ast.IsIdentifier(property) && !ast.IsStringLiteral(property) {
			return "", "", false
		}
		exportName = property.Text()
	}
	return imported.Arguments.Nodes[0].Text(), exportName, exportName != ""
}

func registryLoaderFunction(node *ast.Node) bool {
	return node != nil && (ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsFunctionDeclaration(node))
}

// A block-bodied loader or selector may return directly, but cannot hide extra work.
func registryLoaderResult(body *ast.Node) *ast.Node {
	body = unwrapRegistryDefinitionBody(body)
	if body != nil && ast.IsBlock(body) {
		statements := body.AsBlock().Statements.Nodes
		if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
			return nil
		}
		return unwrapRegistryDefinitionBody(statements[0].AsReturnStatement().Expression)
	}
	return body
}
