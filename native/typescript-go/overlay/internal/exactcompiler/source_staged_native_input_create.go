package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validNativeInputCreatePrototype checks the detached association's shape only.
// The existing prototype owner authenticates its actual binding at admission;
// this validator cannot issue a current input law from a cached formal slot.
func validNativeInputCreatePrototype(prototype *sourceStagedCreatePrototype, input sourceRelativeEndpoint, declaration *ast.Node) bool {
	if prototype == nil || !sameOperationEndpoint(prototype.input, input) || input.expression == nil {
		return false
	}
	if input.expression.Kind == ast.KindNullKeyword || ast.IsObjectLiteralExpression(input.expression) && sourceInertValueCreation(input.expression) {
		return prototype.formal == (sourceRelativeRole{})
	}
	formal := prototype.formal
	if !ast.IsIdentifier(input.expression) || declaration == nil || !ast.IsFunctionLike(declaration) || formal.kind != relativeRoleFormal || formal.declaration != declaration || formal.slot < 0 {
		return false
	}
	slot := 0
	for _, parameter := range declaration.Parameters() {
		if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		if slot == formal.slot {
			return ast.IsIdentifier(parameter.Name()) && parameter.Initializer() == nil && parameter.AsParameterDeclaration().DotDotDotToken == nil
		}
		slot++
	}
	return false
}
