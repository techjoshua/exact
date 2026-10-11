package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// immutableBindingMemberSymbol retains the selected source declaration of a const
// object binding. Defaults and rest create different value ownership and remain opaque.
func immutableBindingMemberSymbol(node *ast.Node, typeChecker *checker.Checker) *ast.Symbol {
	if !ast.IsBindingElement(node) || node.Parent == nil || !ast.IsObjectBindingPattern(node.Parent) {
		return nil
	}
	element := node.AsBindingElement()
	if element.Initializer != nil || element.DotDotDotToken != nil {
		return nil
	}
	if !immutableBindingElement(node) {
		return nil
	}
	key := element.PropertyName
	if key == nil {
		key = element.Name()
	}
	name := ""
	if ast.IsIdentifier(key) || ast.IsStringLiteral(key) {
		name = key.Text()
	} else if ast.IsComputedPropertyName(key) {
		value := typeChecker.GetTypeAtLocation(key.AsComputedPropertyName().Expression)
		if value != nil && value.Flags()&checker.TypeFlagsStringLiteral != 0 {
			name, _ = value.AsLiteralType().Value().(string)
		}
	}
	if name == "" {
		return nil
	}
	return typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(node.Parent), name)
}

// immutableBindingElement limits source selection proofs to const-owned binding patterns.
func immutableBindingElement(node *ast.Node) bool {
	if !ast.IsBindingElement(node) {
		return false
	}
	owner := node.Parent
	for ast.IsObjectBindingPattern(owner) || ast.IsArrayBindingPattern(owner) || ast.IsBindingElement(owner) {
		owner = owner.Parent
		if owner == nil {
			return false
		}
	}
	if !ast.IsVariableDeclaration(owner) || owner.Parent == nil || owner.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	return true
}
