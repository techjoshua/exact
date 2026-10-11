package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// registryLazySelection proves the import and selected export together. Diagnostics and
// build facts must describe the same returned value, regardless of authored formatting.
func registryLazySelection(loader *ast.Node, typeChecker *checker.Checker) (string, string, bool) {
	module, exported, _, valid := registryLazySelectionExpression(loader, typeChecker)
	return module, exported, valid
}

// registryLazySelectionExpression also retains the checked selector value for canonical provenance.
func registryLazySelectionExpression(loader *ast.Node, typeChecker *checker.Checker) (string, string, *ast.Node, bool) {
	seen := make(map[*ast.Symbol]bool)
	loader = unwrapRegistryDefinitionBody(loader)
	for loader != nil && ast.IsIdentifier(loader) {
		symbol := typeChecker.GetSymbolAtLocation(loader)
		if symbol == nil || seen[symbol] {
			return "", "", nil, false
		}
		if source := ast.GetSourceFileOfNode(loader); source != nil && componentValueSymbolIsWrittenAfter(symbol, 0, source, typeChecker) {
			return "", "", nil, false
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
		return "", "", nil, false
	}
	body := registryCallbackResult(loader.Body())
	if body != nil && ast.IsAwaitExpression(body) {
		body = unwrapRegistryDefinitionBody(body.AsAwaitExpression().Expression)
	}
	if body == nil || !ast.IsCallExpression(body) {
		return "", "", nil, false
	}
	then := body.AsCallExpression()
	if then.Arguments == nil || len(then.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(then.Expression) {
		return "", "", nil, false
	}
	member := then.Expression.AsPropertyAccessExpression()
	if member.Name().Text() != "then" || !ast.IsCallExpression(member.Expression) {
		return "", "", nil, false
	}
	imported := member.Expression.AsCallExpression()
	if imported.Expression.Kind != ast.KindImportKeyword || imported.Arguments == nil || len(imported.Arguments.Nodes) != 1 || (!ast.IsStringLiteral(imported.Arguments.Nodes[0]) && !ast.IsNoSubstitutionTemplateLiteral(imported.Arguments.Nodes[0])) {
		return "", "", nil, false
	}
	selector := unwrapRegistryDefinitionBody(then.Arguments.Nodes[0])
	if !registryLoaderFunction(selector) || len(selector.Parameters()) != 1 {
		return "", "", nil, false
	}
	parameter := selector.Parameters()[0].AsParameterDeclaration()
	if parameter.Initializer != nil || parameter.DotDotDotToken != nil {
		return "", "", nil, false
	}
	result := registryCallbackResult(selector.Body())
	if result == nil {
		return "", "", nil, false
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
			if access.ArgumentExpression != nil && (ast.IsStringLiteral(access.ArgumentExpression) || ast.IsNoSubstitutionTemplateLiteral(access.ArgumentExpression)) {
				receiver = access.Expression
				exportName = access.ArgumentExpression.Text()
			}
		}
		receiver = unwrapRegistryDefinitionBody(receiver)
		if receiver == nil || !ast.IsIdentifier(receiver) || receiver.Text() != name.Text() {
			return "", "", nil, false
		}
	} else if ast.IsObjectBindingPattern(name) && ast.IsIdentifier(result) {
		elements := name.AsBindingPattern().Elements.Nodes
		if len(elements) != 1 {
			return "", "", nil, false
		}
		binding := elements[0].AsBindingElement()
		if binding.Initializer != nil || binding.DotDotDotToken != nil || !ast.IsIdentifier(binding.Name()) || binding.Name().Text() != result.Text() {
			return "", "", nil, false
		}
		property := binding.PropertyName
		if property == nil {
			property = binding.Name()
		}
		if !ast.IsIdentifier(property) && !ast.IsStringLiteral(property) {
			return "", "", nil, false
		}
		exportName = property.Text()
	}
	return imported.Arguments.Nodes[0].Text(), exportName, result, exportName != ""
}

func registryLoaderFunction(node *ast.Node) bool {
	return node != nil && (ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsFunctionDeclaration(node))
}

// Registry definitions, loaders and selectors share a single returned value proof.
// A block may return directly, but cannot hide statements before or after that return.
func registryCallbackResult(body *ast.Node) *ast.Node {
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
