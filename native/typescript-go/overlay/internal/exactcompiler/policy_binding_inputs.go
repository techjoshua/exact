package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// policyBindingInputs permits direct public-field selection from a type-qualified record.
// Explicit kept values, nested/unknown selections and indexed collections remain protected.
func policyBindingInputs(binding, pattern, initializer *ast.Node, inputs []PolicySubject, typeChecker *checker.Checker) []PolicySubject {
	if !ast.IsObjectBindingPattern(pattern) || binding.Parent == nil || !ast.IsBindingElement(binding.Parent) || binding.Parent.Parent != pattern {
		return inputs
	}
	element := binding.Parent.AsBindingElement()
	if element.DotDotDotToken != nil || element.Initializer != nil || !ast.IsIdentifier(initializer) {
		return inputs
	}
	key := element.PropertyName
	if key == nil {
		key = element.Name()
	}
	if !ast.IsIdentifier(key) && !ast.IsStringLiteral(key) {
		return inputs
	}
	if _, qualified := policyFromCheckerType(typeChecker.GetTypeAtLocation(binding), typeChecker); qualified {
		return inputs
	}
	root := typeChecker.GetTypeAtLocation(initializer)
	if checkerTypeIsSecret(root, typeChecker, make(map[checker.TypeId]bool)) || protectedPolicyContainer(root, typeChecker) {
		return inputs
	}
	result := make([]PolicySubject, 0, len(inputs))
	for _, input := range inputs {
		if !policySubjectAllowsPublicSelection(input) {
			result = append(result, input)
		}
	}
	return result
}

// Type-derived aggregate aliases retain public-member narrowing only when every input permits it.
func policyInputsAllowPublicSelection(inputs []PolicySubject) bool {
	if len(inputs) == 0 {
		return false
	}
	for _, input := range inputs {
		if !policySubjectAllowsPublicSelection(input) {
			return false
		}
	}
	return true
}

func policySubjectAllowsPublicSelection(subject PolicySubject) bool {
	return !subject.publicSelectionBlocked && (subject.Source == "import" || subject.typeDerivedAggregate)
}

// Index replacement writes once so alias-origin checks do not rescan the source for every binding.
func policyAliasWrites(source *ast.SourceFile, c *checker.Checker) map[ast.SymbolId][]*ast.Node {
	writes := make(map[ast.SymbolId][]*ast.Node)
	add := func(target, value *ast.Node) {
		if symbol := c.GetSymbolAtLocation(target); symbol != nil {
			id := ast.GetSymbolId(symbol)
			writes[id] = append(writes[id], value)
		}
	}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		var target, value *ast.Node
		if ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind) {
			target, value = node.AsBinaryExpression().Left, node.AsBinaryExpression().Right
		} else if ast.IsForOfStatement(node) || ast.IsForInStatement(node) {
			target = node.AsForInOrOfStatement().Initializer
		} else {
			return true
		}
		target = unwrapRenderExpression(target)
		if ast.IsIdentifier(target) {
			add(target, value)
		}
		// A destructuring replacement needs a separate per-destination projection.
		// Until that projection supplies an origin, retain aggregate protection.
		if ast.IsArrayLiteralExpression(target) || ast.IsObjectLiteralExpression(target) {
			policyAliasPatternWrites(target, func(destination *ast.Node) { add(destination, nil) })
		}
		return true
	})
	return writes
}

func policyAliasWritesAllowPublicSelection(writes []*ast.Node, c *checker.Checker, subjects policySubjects) bool {
	for _, value := range writes {
		if value == nil || !policyInputsAllowPublicSelection(policyInputsForNode(value, c, subjects)) {
			return false
		}
	}
	return true
}

// Assignment patterns own destinations, while defaults and computed keys are reads.
func policyAliasPatternWrites(node *ast.Node, add func(*ast.Node)) {
	node = unwrapRenderExpression(node)
	switch {
	case ast.IsIdentifier(node):
		add(node)
	case ast.IsBinaryExpression(node):
		policyAliasPatternWrites(node.AsBinaryExpression().Left, add)
	case ast.IsSpreadElement(node):
		policyAliasPatternWrites(node.AsSpreadElement().Expression, add)
	case ast.IsArrayLiteralExpression(node):
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			policyAliasPatternWrites(element, add)
		}
	case ast.IsObjectLiteralExpression(node):
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsPropertyAssignment(property) {
				policyAliasPatternWrites(property.AsPropertyAssignment().Initializer, add)
			}
			if ast.IsShorthandPropertyAssignment(property) {
				policyAliasPatternWrites(property.Name(), add)
			}
			if ast.IsSpreadAssignment(property) {
				policyAliasPatternWrites(property.AsSpreadAssignment().Expression, add)
			}
		}
	}
}
