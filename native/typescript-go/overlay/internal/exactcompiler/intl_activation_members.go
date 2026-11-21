package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// intlActivationObjectMember proves the final own value of an activation option.
// Later spreads and dynamic keys prevent extraction because they can replace the
// requested option. Earlier unknown definitions cannot override a proven final one.
func intlActivationObjectMember(expression *ast.Node, requested string) *ast.Node {
	value, _ := intlActivationObjectMemberProof(expression, requested)
	return value
}

// A proven absent option may use its default. An unknown option may not.
func intlActivationObjectMemberProof(expression *ast.Node, requested string) (*ast.Node, bool) {
	property, known := finalNamedObjectProperty(expression, requested)
	if property == nil {
		return nil, known
	}
	if ast.IsPropertyAssignment(property) {
		return unwrapRenderExpression(property.Initializer()), true
	}
	if ast.IsShorthandPropertyAssignment(property) {
		return property.Name(), true
	}
	return nil, false
}
