package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

const enhancementAnalyzerOnlyAnnotation = "@exact analyzer-only"

// enhancementAnalyzerOnlyProperty recognizes package-declared metadata that is available to
// trusted analyzers but must never become renderer enhancement input.
func enhancementAnalyzerOnlyProperty(property *ast.Symbol) bool {
	for _, declaration := range property.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		for _, jsdoc := range declaration.JSDoc(sourceFile) {
			if strings.Contains(sourceText(sourceFile, jsdoc), enhancementAnalyzerOnlyAnnotation) {
				return true
			}
		}
	}
	return false
}

func appendUniqueEnhancementAnalysisField(
	fields []enhancementAnalysisField,
	field enhancementAnalysisField,
) []enhancementAnalysisField {
	for _, existing := range fields {
		if existing.identity == field.identity && existing.source == field.source {
			return fields
		}
	}
	return append(fields, field)
}

// collectEnhancementAnalysisFieldDiagnostics enforces the declared finite value type without
// turning analysis-only fields into runtime component applications.
func collectEnhancementAnalysisFieldDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	imports *enhancementImports,
) {
	for node, fields := range imports.analysisFields {
		for _, field := range fields {
			value := enhancementAnalysisFieldValue(node, field.source, typeChecker)
			if value.valueType == nil || enhancementValueAssignable(value, field.member.valueType, typeChecker) {
				continue
			}
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				node,
				"EXACT6011",
				fmt.Sprintf("analysis-only enhancement field %s for %s has an incompatible value", field.source, field.identity),
			))
		}
	}
}

func enhancementAnalysisFieldValue(
	node *ast.Node,
	source string,
	typeChecker *checker.Checker,
) enhancementProvidedValue {
	if ast.IsJsxAttribute(node) {
		return enhancementAttributeValue(node.AsJsxAttribute(), typeChecker)
	}
	if !ast.IsJsxSpreadAttribute(node) {
		return enhancementProvidedValue{}
	}
	expression := node.AsJsxSpreadAttribute().Expression
	for _, memberType := range typeChecker.GetTypeAtLocation(expression).Distributed() {
		for _, property := range typeChecker.GetPropertiesOfType(memberType) {
			if ast.SymbolName(property) == source {
				return enhancementProvidedValue{valueType: typeChecker.GetTypeOfSymbolAtLocation(property, expression)}
			}
		}
	}
	return enhancementProvidedValue{}
}
