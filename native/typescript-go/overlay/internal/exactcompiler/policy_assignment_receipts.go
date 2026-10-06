package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectSecretAssignmentReceipts rejects erasure through writes to unqualified storage.
// This audits authored assignments without changing helper bodies or runtime values.
func collectSecretAssignmentReceipts(source *ast.SourceFile, c *checker.Checker, analysis *policyAnalysis) {
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		var target, sourceValue *ast.Node
		switch {
		case ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind):
			target, sourceValue = node.AsBinaryExpression().Left, node.AsBinaryExpression().Right
		case ast.IsPrefixUnaryExpression(node) && (node.AsPrefixUnaryExpression().Operator == ast.KindPlusPlusToken || node.AsPrefixUnaryExpression().Operator == ast.KindMinusMinusToken):
			target, sourceValue = node.AsPrefixUnaryExpression().Operand, node.AsPrefixUnaryExpression().Operand
		case ast.IsPostfixUnaryExpression(node):
			target, sourceValue = node.AsPostfixUnaryExpression().Operand, node.AsPostfixUnaryExpression().Operand
		case ast.IsVariableDeclaration(node) && (ast.IsObjectBindingPattern(node.Name()) || ast.IsArrayBindingPattern(node.Name())):
			target, sourceValue = node.Name(), node.AsVariableDeclaration().Initializer
		case ast.IsParameterDeclaration(node):
			target, sourceValue = node.Name(), node.AsParameterDeclaration().Initializer
		case ast.IsForOfStatement(node):
			target, sourceValue = node.AsForInOrOfStatement().Initializer, node.AsForInOrOfStatement().Expression
		case ast.IsForInStatement(node):
			target, sourceValue = node.AsForInOrOfStatement().Initializer, node.AsForInOrOfStatement().Expression
		default:
			return true
		}
		if target == nil {
			return true
		}
		if ast.IsVariableDeclarationList(target) {
			declarations := target.AsVariableDeclarationList().Declarations.Nodes
			if len(declarations) != 1 {
				return true
			}
			target = declarations[0].Name()
		}
		inputs := secretPolicyInputs(sourceValue, c, analysis.subjects)
		inputs = append(inputs, secretControlInputs(node, c, analysis.subjects)...)
		if len(inputs) == 0 && !policyPatternHasSecretSelection(target, c, analysis.subjects) {
			return true
		}
		var inspect func(*ast.Node, []PolicySubject, *checker.Type)
		inspect = func(target *ast.Node, inputs []PolicySubject, value *checker.Type) {
			target = unwrapRenderExpression(target)
			if ast.IsObjectBindingPattern(target) || ast.IsArrayBindingPattern(target) {
				for _, binding := range policyBindingNames(target) {
					selected := policyBindingInputs(binding, target, sourceValue, inputs, c)
					selected = append(selected, policyBindingSelectionInputs(binding, c, analysis.subjects)...)
					inspect(binding, selected, nil)
				}
				return
			}
			if ast.IsObjectLiteralExpression(target) {
				for _, property := range target.AsObjectLiteralExpression().Properties.Nodes {
					var destination, key *ast.Node
					switch {
					case ast.IsPropertyAssignment(property):
						destination = property.AsPropertyAssignment().Initializer
						key = property.Name()
					case ast.IsShorthandPropertyAssignment(property):
						destination = property.Name()
						key = destination
					case ast.IsSpreadAssignment(property):
						destination = property.AsSpreadAssignment().Expression
					}
					if destination == nil {
						continue
					}
					selected := inputs
					var selectedType *checker.Type
					name, known := policyStaticPropertyName(key, c)
					if sourceValue != nil && ast.IsIdentifier(sourceValue) && value != nil && known && !checkerTypeIsSecret(value, c, make(map[checker.TypeId]bool)) && !protectedPolicyContainer(value, c) {
						selectedType = c.GetTypeOfPropertyOfType(value, name)
						if _, qualified := policyFromCheckerType(selectedType, c); selectedType != nil && !qualified {
							selected = nil
							for _, input := range inputs {
								if input.Source != "import" {
									selected = append(selected, input)
								}
							}
						}
					}
					if key != nil && ast.IsComputedPropertyName(key) {
						selected = append(selected, secretPolicyInputs(key.AsComputedPropertyName().Expression, c, analysis.subjects)...)
					}
					if ast.IsShorthandPropertyAssignment(property) && property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil {
						selected = append(selected, secretPolicyInputs(property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer, c, analysis.subjects)...)
					}
					inspect(destination, selected, selectedType)
				}
				return
			}
			if ast.IsArrayLiteralExpression(target) {
				for _, element := range target.AsArrayLiteralExpression().Elements.Nodes {
					if !ast.IsOmittedExpression(element) {
						inspect(element, inputs, nil)
					}
				}
				return
			}
			if ast.IsSpreadElement(target) {
				inspect(target.AsSpreadElement().Expression, inputs, nil)
				return
			}
			if ast.IsBinaryExpression(target) && target.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				inputs = append(inputs, secretPolicyInputs(target.AsBinaryExpression().Right, c, analysis.subjects)...)
				target = target.AsBinaryExpression().Left
			}
			if len(inputs) == 0 {
				return
			}
			symbol := c.GetSymbolAtLocation(target)
			if target.Parent != nil && ast.IsShorthandPropertyAssignment(target.Parent) {
				symbol = c.GetShorthandAssignmentValueSymbol(target.Parent)
			}
			storageType := c.GetTypeAtLocation(target)
			if symbol != nil {
				storageType = c.GetTypeOfSymbol(symbol)
			}
			if policy, qualified := policyFromCheckerType(storageType, c); qualified && policy.Secret {
				return
			}
			if ast.IsIdentifier(target) && symbol != nil {
				if subject, exists := analysis.subjects.symbols[ast.GetSymbolId(symbol)]; exists && subject.Policy.Secret && (subject.Source == "annotation" || !policyBindingHasExplicitType(target)) {
					return
				}
			}
			analysis.diagnostics = append(analysis.diagnostics, Diagnostic{Severity: "error", Code: "EXACT3003", Message: "error: secret assignment requires an explicitly qualified destination or consume() inside server-owned work", Start: target.Pos(), Length: target.End() - target.Pos()})
		}
		var valueType *checker.Type
		if sourceValue != nil {
			valueType = c.GetTypeAtLocation(sourceValue)
		}
		inspect(target, inputs, valueType)
		return true
	})
}
