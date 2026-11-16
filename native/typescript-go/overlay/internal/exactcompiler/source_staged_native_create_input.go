package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedCreatePrototype is an original input association, not native
// selection, prototype identity, Effects, output or readiness authority. A formal
// describes its source slot only and issues no invoked-role substitution.
type sourceStagedCreatePrototype struct {
	input  sourceRelativeEndpoint
	formal sourceRelativeRole
}

// describeStagedCreatePrototypeInput retains a canonical one-argument source
// input as null, inert immediate object construction or an unwritten formal.
// This does not imply Object.create reads properties of its prototype. Callable
// and other unsupported prototypes keep their existing semantic owners.
func describeStagedCreatePrototypeInput(input sourceRelativeEndpoint, declaration *ast.Node, owner *sourceValueOwner) (sourceStagedCreatePrototype, bool) {
	var association sourceStagedCreatePrototype
	call := input.producer
	if owner == nil || owner.checker == nil || owner.program == nil || declaration == nil || !ast.IsFunctionLike(declaration) || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || enclosingCallableNode(call) != declaration {
		return association, false
	}
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if len(arguments) != 1 || ast.IsSpreadElement(arguments[0]) || !sameOperationEndpoint(input, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arguments[0], producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}) {
		return association, false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil || source.IsDeclarationFile || ast.GetSourceFileOfNode(call) != source || owner.program.GetSourceFile(source.FileName()) != source {
		return association, false
	}
	expression := input.expression
	association.input = cloneSourceRelativeEndpoint(input)
	if expression.Kind == ast.KindNullKeyword || ast.IsObjectLiteralExpression(expression) && sourceInertValueCreation(expression) {
		return association, true
	}
	if !ast.IsIdentifier(expression) {
		return sourceStagedCreatePrototype{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != declaration {
		return sourceStagedCreatePrototype{}, false
	}
	parameter := symbol.ValueDeclaration
	if !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
		return sourceStagedCreatePrototype{}, false
	}
	index := owner.index(source)
	if index.incomplete || index.normalDynamicScope || owner.bindingWritten(symbol) {
		return sourceStagedCreatePrototype{}, false
	}
	slot := 0
	for _, candidate := range declaration.Parameters() {
		if candidate.Name() != nil && ast.IsIdentifier(candidate.Name()) && candidate.Name().Text() == "this" {
			continue
		}
		if candidate == parameter {
			association.formal = sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: slot}
			return association, true
		}
		slot++
	}
	return sourceStagedCreatePrototype{}, false
}
