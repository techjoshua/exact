package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// intlActivationObjectMember proves the final own value of an activation option.
// Later spreads and dynamic keys prevent extraction because they can replace the
// requested option. Earlier unknown definitions cannot override a proven final one.
func intlActivationObjectMember(expression *ast.Node, requested string) *ast.Node {
	properties := expression.AsObjectLiteralExpression().Properties.Nodes
	for index := len(properties) - 1; index >= 0; index-- {
		property := properties[index]
		if ast.IsSpreadAssignment(property) {
			return nil
		}
		name := property.Name()
		if ast.IsComputedPropertyName(name) {
			name = unwrapRenderExpression(name.AsComputedPropertyName().Expression)
			if !ast.IsStringLiteral(name) && !ast.IsNoSubstitutionTemplateLiteral(name) && !ast.IsNumericLiteral(name) {
				return nil
			}
		}
		// The activation's named options cannot be numeric keys. Avoid applying
		// text access to syntax nodes that do not carry a literal name.
		if ast.IsNumericLiteral(name) {
			continue
		}
		if name == nil || (!ast.IsIdentifier(name) && !ast.IsStringLiteral(name) && !ast.IsNoSubstitutionTemplateLiteral(name)) {
			return nil
		}
		if name.Text() != requested {
			continue
		}
		if ast.IsPropertyAssignment(property) {
			return unwrapRenderExpression(property.AsPropertyAssignment().Initializer)
		}
		if ast.IsShorthandPropertyAssignment(property) {
			return name
		}
		return nil
	}
	return nil
}
