package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInertValueCreation proves only creation without reads, calls, coercion,
// spreads or abrupt binding effects. Deferred bodies are not executed by creation.
func sourceInertValueCreation(node *ast.Node) bool {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return false
	}
	if ast.IsFunctionExpression(node) || ast.IsArrowFunction(node) || ast.IsStringLiteral(node) || ast.IsNumericLiteral(node) || ast.IsNoSubstitutionTemplateLiteral(node) || node.Kind == ast.KindTrueKeyword || node.Kind == ast.KindFalseKeyword || node.Kind == ast.KindNullKeyword {
		return true
	}
	if ast.IsClassExpression(node) {
		return sourceInertClassCreation(node)
	}
	if ast.IsObjectLiteralExpression(node) {
		return sourceInertObjectFields(node, nil)
	}
	return false
}

// sourceInertObjectFields leaves computed-name evaluation to the caller's
// narrower proof. Field initializers and deferred bodies use the same bound.
func sourceInertObjectFields(node *ast.Node, computedNameAllowed func(*ast.Node) bool) bool {
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		name := property.Name()
		if name == nil || ast.IsComputedPropertyName(name) && (computedNameAllowed == nil || !computedNameAllowed(name)) {
			return false
		}
		if ast.IsPropertyAssignment(property) {
			if !sourceInertValueCreation(property.AsPropertyAssignment().Initializer) {
				return false
			}
		} else if !ast.IsMethodDeclaration(property) && !ast.IsGetAccessorDeclaration(property) && !ast.IsSetAccessorDeclaration(property) {
			return false
		}
	}
	return true
}

// sourceInertClassCreation excludes eager heritage, decorators, static work and
// computed names. Instance initialization and callable bodies stay deferred.
func sourceInertClassCreation(node *ast.Node) bool {
	if ast.HasDecorators(node) {
		return false
	}
	var class *ast.ClassLikeBase
	if ast.IsClassDeclaration(node) {
		class = &node.AsClassDeclaration().ClassLikeBase
	} else {
		class = &node.AsClassExpression().ClassLikeBase
	}
	if class.HeritageClauses != nil {
		return false
	}
	for _, member := range class.Members.Nodes {
		if ast.HasDecorators(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || member.Name() != nil && ast.IsComputedPropertyName(member.Name()) || ast.IsClassStaticBlockDeclaration(member) {
			return false
		}
	}
	return true
}

// sourceInertDataLiteral bounds source creation, never field selection or output.
func sourceInertDataLiteral(node *ast.Node, field string) bool {
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return false
	}
	found := field == ""
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" || !sourceInertValueCreation(property.AsPropertyAssignment().Initializer) {
			return false
		}
		found = found || callableNameText(property.Name()) == field
	}
	return found
}
