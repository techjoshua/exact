package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// registryLazyCall proves the scoped builder binding, independent of its authored local name.
func registryLazyCall(node *ast.Node, typeChecker *checker.Checker) bool {
	node = unwrapRegistryDefinitionBody(node)
	if node == nil || !ast.IsCallExpression(node) {
		return false
	}
	parameter := registryLazyCapabilityParameter(node.AsCallExpression().Expression, typeChecker)
	if parameter == nil {
		return false
	}
	define := parameter.Parent
	if define == nil || (!ast.IsArrowFunction(define) && !ast.IsFunctionExpression(define)) {
		return false
	}
	parent := define.Parent
	for parent != nil && unwrapSourceCallableReference(parent) == define {
		parent = parent.Parent
	}
	if parent == nil || !ast.IsCallExpression(parent) {
		return false
	}
	call := parent.AsCallExpression()
	return call.Arguments != nil && len(call.Arguments.Nodes) == 1 && unwrapRegistryDefinitionBody(call.Arguments.Nodes[0]) == define &&
		componentRegistryFactoryCall(call.Expression, ast.GetSourceFileOfNode(parent), typeChecker)
}

// A capability is either the lazy destructuring binding or a member of the callback's builder parameter.
func registryLazyCapabilityParameter(reference *ast.Node, typeChecker *checker.Checker) *ast.Node {
	reference = unwrapSourceCallableReference(reference)
	if reference == nil {
		return nil
	}
	var receiver *ast.Node
	switch {
	case ast.IsPropertyAccessExpression(reference):
		access := reference.AsPropertyAccessExpression()
		if access.Name().Text() == "lazy" {
			receiver = access.Expression
		}
	case ast.IsElementAccessExpression(reference):
		access := reference.AsElementAccessExpression()
		key := access.ArgumentExpression
		if key != nil && (ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key)) && key.Text() == "lazy" {
			receiver = access.Expression
		}
	case ast.IsIdentifier(reference):
	default:
		return nil
	}
	if !ast.IsIdentifier(reference) {
		reference = unwrapSourceCallableReference(receiver)
	}
	if reference == nil || !ast.IsIdentifier(reference) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(reference)
	if reference.Parent != nil && ast.IsShorthandPropertyAssignment(reference.Parent) {
		symbol = typeChecker.GetShorthandAssignmentValueSymbol(reference.Parent)
	}
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if receiver != nil && ast.IsParameterDeclaration(declaration) {
			return declaration
		}
		if receiver != nil || !ast.IsBindingElement(declaration) {
			continue
		}
		binding := declaration.AsBindingElement()
		property := binding.PropertyName
		if property == nil {
			property = binding.Name()
		}
		if property == nil || (!ast.IsIdentifier(property) && !ast.IsStringLiteral(property)) || property.Text() != "lazy" || binding.DotDotDotToken != nil || binding.Initializer != nil {
			continue
		}
		pattern := declaration.Parent
		if pattern != nil && ast.IsObjectBindingPattern(pattern) && pattern.Parent != nil && ast.IsParameterDeclaration(pattern.Parent) {
			return pattern.Parent
		}
	}
	return nil
}
