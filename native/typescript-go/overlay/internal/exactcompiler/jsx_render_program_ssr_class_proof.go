package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// proveSsrRootClass admits unescaped classes only after the compiler has constructed the
// root bag. The slot's complete value must be ASCII-safe; unknown sources remain generic.
func proveSsrRootClass(build *renderProgramBuild, attribute renderProgramSsrAttribute) renderProgramSsrAttribute {
	if attribute.kind != 1 || attribute.property != "className" {
		return attribute
	}
	var bag *ast.Node
	for _, slot := range build.slots {
		if slot.kind == "root-attributes" {
			bag = slot.reader
			break
		}
	}
	if bag == nil || !ast.IsObjectLiteralExpression(bag) {
		return attribute
	}

	var value *ast.Node
	for _, property := range bag.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) ||
			(!ast.IsIdentifier(property.Name()) && !ast.IsStringLiteral(property.Name())) {
			return attribute
		}
		if property.Name().Text() == attribute.property {
			value = property.AsPropertyAssignment().Initializer
		}
	}
	if safeSsrClassExpression(value) {
		attribute.kind = 7
	}
	return attribute
}

// safeSsrClassExpression proves output characters without evaluating conditions or changing
// their side effects. An identifier, call result, spread, or other unknown source fails closed.
func safeSsrClassExpression(value *ast.Node) bool {
	if value == nil {
		return false
	}
	value = unwrapRenderExpression(value)
	if ast.IsStringLiteral(value) || value.Kind == ast.KindNoSubstitutionTemplateLiteral {
		for _, character := range value.Text() {
			if !((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') ||
				(character >= '0' && character <= '9') || character == ' ' || character == '_' || character == '-') {
				return false
			}
		}
		return true
	}
	if ast.IsConditionalExpression(value) {
		condition := value.AsConditionalExpression()
		return safeSsrClassExpression(condition.WhenTrue) && safeSsrClassExpression(condition.WhenFalse)
	}
	if ast.IsBinaryExpression(value) {
		binary := value.AsBinaryExpression()
		return binary.OperatorToken.Kind == ast.KindPlusToken &&
			safeSsrClassExpression(binary.Left) && safeSsrClassExpression(binary.Right)
	}
	return false
}
