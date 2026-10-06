package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Specialized roles may omit an option, but cannot replace an authored dynamic
// option with a guessed locale default. The proof follows final own-property order.
func intlSpecializedOptionsProven(attributes *ast.Node, activation *ast.Node, objectNames, attributeNames []string) bool {
	if activation != nil && activation.AsJsxAttribute().Initializer != nil {
		initializer := activation.AsJsxAttribute().Initializer
		if ast.IsJsxExpression(initializer) {
			value := unwrapRenderExpression(initializer.AsJsxExpression().Expression)
			if value == nil {
				return false
			}
			if ast.IsObjectLiteralExpression(value) {
				for _, name := range objectNames {
					member, proven := intlActivationObjectMemberProof(value, name)
					if !proven || (member != nil && !ast.IsStringLiteral(member) && !ast.IsNoSubstitutionTemplateLiteral(member)) {
						return false
					}
				}
			} else if value.Kind != ast.KindTrueKeyword && !ast.IsStringLiteral(value) && !ast.IsNoSubstitutionTemplateLiteral(value) {
				return false
			}
		}
	}
	for _, name := range attributeNames {
		attribute := intlJSXAttribute(attributes, name)
		if attribute == nil {
			attribute = jsxAttribute(attributes, "", name)
		}
		if attribute == nil {
			continue
		}
		initializer := attribute.AsJsxAttribute().Initializer
		if initializer == nil {
			return false
		}
		if ast.IsJsxExpression(initializer) {
			initializer = unwrapRenderExpression(initializer.AsJsxExpression().Expression)
		}
		if initializer == nil || (!ast.IsStringLiteral(initializer) && !ast.IsNoSubstitutionTemplateLiteral(initializer)) {
			return false
		}
	}
	return true
}
