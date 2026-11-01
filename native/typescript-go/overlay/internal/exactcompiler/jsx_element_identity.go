package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// reservedElementIdentityName follows HTML tokenization, including foreign content serialized
// into HTML. Only ASCII uppercase letters fold, never Unicode lookalikes or other data attributes.
func reservedElementIdentityName(name string) bool {
	const reserved = "data-exact-id"
	if len(name) != len(reserved) {
		return false
	}
	for index := range reserved {
		value := name[index]
		if value >= 'A' && value <= 'Z' {
			value += 'a' - 'A'
		}
		if value != reserved[index] {
			return false
		}
	}
	return true
}

// reservedElementIdentitySpreadName uses authored finite members even when a type assertion
// erases apparent properties. This source diagnostic is never queried during executable emission.
func reservedElementIdentitySpreadName(source *ast.SourceFile, expression *ast.Node, typeChecker *checker.Checker) string {
	members, _ := finiteIslandSpread(source, expression, typeChecker, nil)
	for _, member := range members {
		if reservedElementIdentityName(member.name) {
			return member.name
		}
	}
	return ""
}

// elementIdentityProperty installs physical address metadata after authored values, never on contributions.
// Compact hosts without a planned address explicitly overwrite copied metadata with undefined.
func (lowering *jsxLowering) elementIdentityProperty(id string) *ast.Node {
	value := lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone))
	if id != "" {
		value = lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone)
	}
	return lowering.property(lowering.factory.NewComputedPropertyName(lowering.factory.NewIdentifier(lowering.names.elementIdentity)), value)
}

// isElementIdentityProperty recognizes only the physical metadata this lowering constructs.
// The hygienic key and literal address or exact void-zero initializer have no authored effects.
// Other computed properties and void expressions retain ordinary proof requirements.
func (lowering *jsxLowering) isElementIdentityProperty(property *ast.Node) bool {
	if !ast.IsPropertyAssignment(property) || !ast.IsComputedPropertyName(property.Name()) {
		return false
	}
	key := property.Name().AsComputedPropertyName().Expression
	if !ast.IsIdentifier(key) || key.Text() != lowering.names.elementIdentity {
		return false
	}
	value := property.AsPropertyAssignment().Initializer
	if ast.IsStringLiteral(value) {
		return true
	}
	if !ast.IsVoidExpression(value) {
		return false
	}
	operand := value.AsVoidExpression().Expression
	return ast.IsNumericLiteral(operand) && operand.Text() == "0"
}

// hostContributionTag recognizes syntax and resolved core structural exports, never authored names.
func hostContributionTag(tag *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	name := sourceText(source, tag)
	if name == "_" || name == "_target" {
		return true
	}
	reference, exists := resolvedCoreImportReference(tag, source, typeChecker)
	return exists && !reference.namespace && reference.moduleSpecifier == "@exactjs/core" && (reference.exportName == "Fragment" || reference.exportName == "Target")
}
