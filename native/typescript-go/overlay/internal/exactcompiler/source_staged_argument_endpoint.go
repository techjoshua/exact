package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedArgumentEndpoint is a source association, not an evaluated value.
// Unavailable Call/Get output names its producer rather than becoming unknown or
// covered empty. Invoked-role, member and prototype consumers retain their own
// authority. A written binding is not silently substituted by its entry formal.
func sourceStagedArgumentEndpoint(argument, call, consumer *ast.Node, owner *sourceValueOwner) sourceRelativeEndpoint {
	expression := unwrapSourceCallableReference(argument)
	endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: expression, producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: argument}}
	if ast.IsCallExpression(expression) || ast.IsPropertyAccessExpression(expression) || ast.IsElementAccessExpression(expression) {
		endpoint.kind, endpoint.producer = relativeEndpointResult, expression
		if ast.IsCallExpression(expression) {
			endpoint.get = expression.Expression()
		}
		return endpoint
	}
	if !ast.IsIdentifier(expression) {
		return endpoint
	}
	symbol := owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return endpoint
	}
	parameter := symbol.ValueDeclaration
	if ast.IsParameterDeclaration(parameter) && enclosingCallableNode(parameter) == consumer && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() != "this" && (parameter.Initializer() == nil || stagedLexicalDefaultFunction(parameter, consumer, owner) != nil) && parameter.AsParameterDeclaration().DotDotDotToken == nil && !owner.bindingWritten(symbol) {
		slot := 0
		for _, candidate := range consumer.Parameters() {
			if ast.IsIdentifier(candidate.Name()) && candidate.Name().Text() == "this" {
				continue
			}
			if candidate == parameter {
				endpoint.kind = relativeEndpointRole
				endpoint.role = sourceRelativeRole{kind: relativeRoleFormal, declaration: consumer, slot: slot}
				return endpoint
			}
			slot++
		}
	}
	if ast.IsFunctionDeclaration(parameter) && parameter.Body() != nil && !owner.bindingWritten(symbol) {
		endpoint.expression = parameter
	}
	return endpoint
}
