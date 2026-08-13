package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type finiteSpreadProperty struct {
	name      string
	value     *ast.Node
	condition *ast.Node
	whenTrue  *finiteSpreadProperty
	whenFalse *finiteSpreadProperty
}

// finiteIslandSpread proves that a spread has a closed, effect-safe property
// set and returns its final source-order values after overwrite semantics.
func finiteIslandSpread(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	typeChecker *checker.Checker,
	visiting map[ast.SymbolId]struct{},
) ([]finiteSpreadProperty, string) {
	if typeChecker != nil {
		valueType := typeChecker.GetTypeAtLocation(expression)
		if valueType == nil || valueType.Flags()&checker.TypeFlagsAnyOrUnknown != 0 ||
			len(typeChecker.GetIndexInfosOfType(valueType)) != 0 {
			return nil, "opaque-spread"
		}
	}
	expression = unwrapIslandSpreadExpression(expression)
	if ast.IsIdentifier(expression) && typeChecker != nil {
		symbol := typeChecker.GetSymbolAtLocation(expression)
		if symbol == nil || symbol.ValueDeclaration == nil ||
			!ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return nil, "opaque-spread"
		}
		declaration := symbol.ValueDeclaration
		if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
			declaration.AsVariableDeclaration().Initializer == nil ||
			islandSpreadBindingEscapes(sourceFile, symbol, declaration, expression, typeChecker) {
			return nil, "opaque-spread"
		}
		if visiting == nil {
			visiting = make(map[ast.SymbolId]struct{})
		}
		id := ast.GetSymbolId(symbol)
		if _, cycle := visiting[id]; cycle {
			return nil, "opaque-spread"
		}
		visiting[id] = struct{}{}
		result, reason := finiteIslandSpread(sourceFile, declaration.AsVariableDeclaration().Initializer, typeChecker, visiting)
		delete(visiting, id)
		return result, reason
	}
	if ast.IsConditionalExpression(expression) {
		conditional := expression.AsConditionalExpression()
		if !islandSpreadValueEffectFree(conditional.Condition) {
			return nil, "unresolved-effect"
		}
		whenTrue, trueReason := finiteIslandSpread(sourceFile, conditional.WhenTrue, typeChecker, visiting)
		if trueReason != "" {
			return nil, trueReason
		}
		whenFalse, falseReason := finiteIslandSpread(sourceFile, conditional.WhenFalse, typeChecker, visiting)
		if falseReason != "" {
			return nil, falseReason
		}
		return mergeConditionalSpreadProperties(conditional.Condition, whenTrue, whenFalse)
	}
	if !ast.IsObjectLiteralExpression(expression) {
		return nil, "opaque-spread"
	}
	result := []finiteSpreadProperty{}
	for _, property := range expression.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsSpreadAssignment(property) {
			members, reason := finiteIslandSpread(sourceFile, property.AsSpreadAssignment().Expression, typeChecker, visiting)
			if reason != "" {
				return nil, reason
			}
			result = mergeFiniteSpreadProperties(result, members)
			continue
		}
		name, value, ok := componentRegistryProperty(property)
		if !ok || strings.TrimSpace(name) == "" {
			return nil, "opaque-spread"
		}
		if typeChecker != nil {
			memberType := typeChecker.GetTypeAtLocation(value)
			if memberType == nil || memberType.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
				return nil, "opaque-spread"
			}
		}
		if !interactiveJSXAttribute(name) && !islandSpreadValueEffectFree(value) {
			return nil, "unresolved-effect"
		}
		result = mergeFiniteSpreadProperties(result, []finiteSpreadProperty{{name: name, value: value}})
	}
	return result, ""
}

func mergeConditionalSpreadProperties(
	condition *ast.Node,
	whenTrue []finiteSpreadProperty,
	whenFalse []finiteSpreadProperty,
) ([]finiteSpreadProperty, string) {
	if len(whenTrue) != len(whenFalse) {
		return nil, "opaque-spread"
	}
	falseByName := make(map[string]*finiteSpreadProperty, len(whenFalse))
	for index := range whenFalse {
		property := &whenFalse[index]
		falseByName[property.name] = property
	}
	result := make([]finiteSpreadProperty, 0, len(whenTrue))
	for index := range whenTrue {
		trueProperty := &whenTrue[index]
		falseProperty := falseByName[trueProperty.name]
		if falseProperty == nil {
			return nil, "opaque-spread"
		}
		result = append(result, finiteSpreadProperty{
			name:      trueProperty.name,
			condition: condition,
			whenTrue:  trueProperty,
			whenFalse: falseProperty,
		})
	}
	return result, ""
}

func finiteSpreadPropertyNodes(property *finiteSpreadProperty, result *[]*ast.Node) {
	if property.condition == nil {
		*result = append(*result, property.value)
		return
	}
	*result = append(*result, property.condition)
	finiteSpreadPropertyNodes(property.whenTrue, result)
	finiteSpreadPropertyNodes(property.whenFalse, result)
}

func finiteSpreadPropertyLeafValues(property *finiteSpreadProperty, result *[]*ast.Node) {
	if property.condition == nil {
		*result = append(*result, property.value)
		return
	}
	finiteSpreadPropertyLeafValues(property.whenTrue, result)
	finiteSpreadPropertyLeafValues(property.whenFalse, result)
}

func islandSpreadValueEffectFree(value *ast.Node) bool {
	safe := true
	walkNode(value, func(node *ast.Node) bool {
		if !safe {
			return false
		}
		switch {
		case ast.IsCallExpression(node), ast.IsNewExpression(node), ast.IsAwaitExpression(node),
			ast.IsYieldExpression(node), ast.IsDeleteExpression(node),
			ast.IsPostfixUnaryExpression(node):
			safe = false
		case ast.IsBinaryExpression(node):
			operator := node.AsBinaryExpression().OperatorToken.Kind
			if ast.IsAssignmentOperator(operator) {
				safe = false
			}
		}
		return safe
	})
	return safe
}

func unwrapIslandSpreadExpression(expression *ast.Node) *ast.Node {
	for expression != nil {
		switch {
		case ast.IsParenthesizedExpression(expression):
			expression = expression.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(expression):
			expression = expression.AsAsExpression().Expression
		case ast.IsSatisfiesExpression(expression):
			expression = expression.AsSatisfiesExpression().Expression
		default:
			return expression
		}
	}
	return expression
}

func mergeFiniteSpreadProperties(current, next []finiteSpreadProperty) []finiteSpreadProperty {
	for _, property := range next {
		for index := len(current) - 1; index >= 0; index-- {
			if current[index].name == property.name {
				current = append(current[:index], current[index+1:]...)
				break
			}
		}
		current = append(current, property)
	}
	return current
}

func islandSpreadBindingEscapes(
	sourceFile *ast.SourceFile,
	symbol *ast.Symbol,
	declaration *ast.Node,
	use *ast.Node,
	typeChecker *checker.Checker,
) bool {
	escapes := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if escapes || !ast.IsIdentifier(node) || node == declaration.Name() || node == use ||
			typeChecker.GetSymbolAtLocation(node) != symbol {
			return !escapes
		}
		parent := node.Parent
		if parent == nil || (!ast.IsJsxSpreadAttribute(parent) && !ast.IsSpreadAssignment(parent)) {
			escapes = true
		}
		return !escapes
	})
	return escapes
}

func elementHasInteractiveWork(sourceFile *ast.SourceFile, node *ast.Node, typeChecker *checker.Checker) bool {
	for _, name := range jsxAttributeNames(node) {
		if interactiveJSXAttribute(name) {
			return true
		}
	}
	attributes := node.Attributes()
	if attributes == nil {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxSpreadAttribute(property) {
			continue
		}
		members, reason := finiteIslandSpread(sourceFile, property.AsJsxSpreadAttribute().Expression, typeChecker, nil)
		if reason != "" {
			// An opaque spread may conceal an event handler. It therefore owns a
			// conservative eager client region even when no explicit handler is
			// present beside it.
			return true
		}
		for _, member := range members {
			if interactiveJSXAttribute(member.name) {
				return true
			}
		}
	}
	return false
}

func islandFiniteSpreads(
	sourceFile *ast.SourceFile,
	opening *ast.Node,
	typeChecker *checker.Checker,
) map[int][]finiteSpreadProperty {
	result := make(map[int][]finiteSpreadProperty)
	attributes := opening.Attributes()
	if attributes == nil {
		return result
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxSpreadAttribute(property) {
			continue
		}
		members, reason := finiteIslandSpread(
			sourceFile,
			property.AsJsxSpreadAttribute().Expression,
			typeChecker,
			nil,
		)
		if reason == "" {
			result[property.Pos()] = members
		}
	}
	return result
}

func islandHasOpaqueSpread(
	opening *ast.Node,
	finiteSpreads map[int][]finiteSpreadProperty,
) bool {
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			if _, finite := finiteSpreads[property.Pos()]; !finite {
				return true
			}
		}
	}
	return false
}
