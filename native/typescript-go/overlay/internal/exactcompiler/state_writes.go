package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var reactiveArrayMutators = map[string]struct{}{
	"copyWithin": {},
	"fill":       {},
	"pop":        {},
	"push":       {},
	"reverse":    {},
	"shift":      {},
	"sort":       {},
	"splice":     {},
	"unshift":    {},
}

var reactiveMapMutators = map[string]struct{}{
	"clear":  {},
	"delete": {},
	"set":    {},
}

var reactiveSetMutators = map[string]struct{}{
	"add":    {},
	"clear":  {},
	"delete": {},
}

type stateAliasBinding struct {
	fact      StateAlias
	invalidAt int
}

type componentStateAliases struct {
	bySymbol map[ast.SymbolId]stateAliasBinding
	facts    []StateAlias
}

// collectStateAnalysis finds statically addressable component-state aliases
// and mutations using checker symbols to preserve lexical shadowing.
func collectStateAnalysis(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) ([]StateAlias, []StateRead, []StateWrite) {
	var aliases []StateAlias
	var reads []StateRead
	var writes []StateWrite
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		componentAliases := collectComponentStateAliases(candidate, typeChecker)
		aliases = append(aliases, componentAliases.facts...)
		reads = append(
			reads,
			collectComponentStateReads(candidate, componentAliases.bySymbol, typeChecker)...,
		)
		walkNode(candidate.node, func(node *ast.Node) bool {
			target, operation := stateWriteTarget(node, typeChecker)
			path, ok := statePath(target, componentAliases.bySymbol, typeChecker, true)
			if !ok || len(path) == 0 {
				return true
			}
			rootAlias, rootDepth := "", 0
			if stateWriteHasNestedThis(node, candidate.node) {
				rootAlias, rootDepth = stateWriteAliasRoot(
					target,
					componentAliases.bySymbol,
					typeChecker,
					node.Pos(),
				)
			}
			writes = append(writes, StateWrite{
				Component: candidate.name,
				Path:      path,
				Operation: operation,
				Start:     node.Pos(),
				Length:    node.End() - node.Pos(),
				RootAlias: rootAlias,
				RootDepth: rootDepth,
				DynamicSegments: stateWriteDynamicSegments(
					target,
					path,
				),
			})
			return true
		})
	}
	sort.Slice(aliases, func(left int, right int) bool {
		return aliases[left].Start < aliases[right].Start
	})
	sort.Slice(writes, func(left int, right int) bool {
		return writes[left].Start < writes[right].Start
	})
	sort.Slice(reads, func(left int, right int) bool {
		return reads[left].Start < reads[right].Start
	})
	return aliases, reads, writes
}

// unsupportedStateWriteDiagnostics rejects mutation forms whose runtime
// effects cannot yet be represented by the compiler's precise write and
// continuation contracts.
func unsupportedStateWriteDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, component := range componentCandidates(sourceFile) {
		if len(componentSignals(component, sourceFile)) == 0 {
			continue
		}
		aliases := collectComponentStateAliases(component, typeChecker)
		walkNode(component.node, func(node *ast.Node) bool {
			if ast.IsForInStatement(node) || ast.IsForOfStatement(node) {
				initializer := node.AsForInOrOfStatement().Initializer
				if initializer != nil &&
					!ast.IsVariableDeclarationList(initializer) &&
					targetContainsStatePath(
						initializer,
						aliases.bySymbol,
						typeChecker,
					) {
					diagnostics = append(diagnostics, unsupportedStateWriteDiagnostic(
						initializer,
						"component state cannot be a for-in or for-of assignment target; assign the iteration value explicitly inside the loop body",
					))
				}
			}
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			if call.Arguments == nil || len(call.Arguments.Nodes) == 0 ||
				!unsupportedReflectiveStateMutation(
					call.Expression,
					sourceFile,
					typeChecker,
				) {
				return true
			}
			if _, ok := statePath(
				call.Arguments.Nodes[0],
				aliases.bySymbol,
				typeChecker,
				true,
			); ok {
				diagnostics = append(diagnostics, unsupportedStateWriteDiagnostic(
					node,
					"reflective component-state mutation cannot preserve the reactive write contract; use an ordinary assignment, delete, array mutator, or Object.assign()",
				))
			}
			return true
		})
	}
	return diagnostics
}

func targetContainsStatePath(
	target *ast.Node,
	aliases map[ast.SymbolId]stateAliasBinding,
	typeChecker *checker.Checker,
) bool {
	found := false
	walkNode(target, func(node *ast.Node) bool {
		if _, ok := statePath(node, aliases, typeChecker, true); ok {
			found = true
			return false
		}
		return true
	})
	return found
}

func unsupportedReflectiveStateMutation(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	if member.Name() == nil || !ast.IsIdentifier(member.Expression) {
		return false
	}
	root := member.Expression.Text()
	name := member.Name().Text()
	if root == "Reflect" && name != "set" && name != "deleteProperty" &&
		name != "defineProperty" {
		return false
	}
	if root == "Object" && name != "defineProperty" &&
		name != "defineProperties" {
		return false
	}
	if root != "Reflect" && root != "Object" {
		return false
	}
	return symbolIsOutsideSource(
		typeChecker.GetSymbolAtLocation(member.Expression),
		sourceFile,
	)
}

func unsupportedStateWriteDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_STATE_WRITE",
		Message:  "error: " + message,
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}

// stateWriteDynamicSegments retains authored computed keys while the public
// analysis path uses "*" to describe their conservative state contract.
func stateWriteDynamicSegments(
	target *ast.Node,
	path []string,
) map[int]*ast.Node {
	segments := []*ast.Node{}
	var collect func(*ast.Node)
	collect = func(node *ast.Node) {
		switch {
		case ast.IsParenthesizedExpression(node):
			collect(node.AsParenthesizedExpression().Expression)
		case ast.IsPropertyAccessExpression(node):
			member := node.AsPropertyAccessExpression()
			if member.Expression.Kind == ast.KindThisKeyword &&
				member.Name() != nil &&
				member.Name().Text() == "state" {
				return
			}
			collect(member.Expression)
			segments = append(segments, nil)
		case ast.IsElementAccessExpression(node):
			member := node.AsElementAccessExpression()
			collect(member.Expression)
			argument := member.ArgumentExpression
			if argument != nil &&
				!ast.IsStringLiteral(argument) &&
				!ast.IsNumericLiteral(argument) {
				segments = append(segments, argument)
			} else {
				segments = append(segments, nil)
			}
		}
	}
	collect(target)
	offset := len(path) - len(segments)
	result := map[int]*ast.Node{}
	for index, segment := range segments {
		if segment != nil {
			result[offset+index] = segment
		}
	}
	return result
}

func stateWriteHasNestedThis(node *ast.Node, component *ast.Node) bool {
	for current := node.Parent; current != nil && current != component; current = current.Parent {
		if ast.IsMethodDeclaration(current) ||
			ast.IsFunctionDeclaration(current) ||
			ast.IsFunctionExpression(current) {
			return true
		}
	}
	return false
}

func stateWriteAliasRoot(
	target *ast.Node,
	aliases map[ast.SymbolId]stateAliasBinding,
	typeChecker *checker.Checker,
	position int,
) (string, int) {
	root := target
	for root != nil {
		switch {
		case ast.IsPropertyAccessExpression(root):
			root = root.AsPropertyAccessExpression().Expression
		case ast.IsElementAccessExpression(root):
			root = root.AsElementAccessExpression().Expression
		default:
			goto resolved
		}
	}
resolved:
	if root == nil || !ast.IsIdentifier(root) {
		return "", 0
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return "", 0
	}
	binding, exists := aliases[ast.GetSymbolId(symbol)]
	if !exists || position >= binding.invalidAt {
		return "", 0
	}
	return root.Text(), len(binding.fact.Path)
}

func collectComponentStateReads(
	candidate componentCandidate,
	aliases map[ast.SymbolId]stateAliasBinding,
	typeChecker *checker.Checker,
) []StateRead {
	var reads []StateRead
	walkNode(candidate.node, func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) &&
			!ast.IsElementAccessExpression(node) &&
			!ast.IsIdentifier(node) {
			return true
		}
		if ast.IsIdentifier(node) &&
			(ast.IsDeclarationName(node) || isStaticPropertyName(node)) {
			return true
		}
		target, eligible := stateReadTarget(node)
		if !eligible || insideStateWriteTarget(node) {
			return true
		}
		path, ok := statePath(target, aliases, typeChecker, true)
		if !ok || len(path) == 0 {
			return true
		}
		confidence := "exact"
		for _, segment := range path {
			if segment == "*" {
				confidence = "broad"
				break
			}
		}
		reads = append(reads, StateRead{
			Component:  candidate.name,
			Path:       path,
			Confidence: confidence,
			Start:      target.Pos(),
			Length:     target.End() - target.Pos(),
		})
		return true
	})
	return reads
}

func stateReadTarget(node *ast.Node) (*ast.Node, bool) {
	parent := node.Parent
	if parent == nil {
		return node, true
	}
	if ast.IsPropertyAccessExpression(parent) &&
		parent.AsPropertyAccessExpression().Expression == node {
		if parent.Parent != nil && ast.IsCallExpression(parent.Parent) &&
			parent.Parent.AsCallExpression().Expression == parent {
			return node, true
		}
		return nil, false
	}
	if ast.IsElementAccessExpression(parent) &&
		parent.AsElementAccessExpression().Expression == node {
		return nil, false
	}
	if ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == node {
		return nil, false
	}
	return node, true
}

func insideStateWriteTarget(node *ast.Node) bool {
	for current := node; current.Parent != nil; current = current.Parent {
		parent := current.Parent
		switch {
		case ast.IsBinaryExpression(parent):
			expression := parent.AsBinaryExpression()
			return expression.OperatorToken.Kind == ast.KindEqualsToken &&
				expression.Left == current
		case ast.IsPrefixUnaryExpression(parent):
			return false
		case ast.IsPostfixUnaryExpression(parent):
			return false
		case ast.IsDeleteExpression(parent):
			return parent.AsDeleteExpression().Expression == current
		}
		if ast.IsStatement(parent) || ast.IsFunctionLike(parent) {
			return false
		}
	}
	return false
}

func collectComponentStateAliases(
	candidate componentCandidate,
	typeChecker *checker.Checker,
) componentStateAliases {
	result := componentStateAliases{
		bySymbol: make(map[ast.SymbolId]stateAliasBinding),
	}
	var declarations []*ast.Node
	walkNode(candidate.node, func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) {
			declarations = append(declarations, node)
		}
		return true
	})
	sort.Slice(declarations, func(left int, right int) bool {
		return declarations[left].Pos() < declarations[right].Pos()
	})
	for _, declarationNode := range declarations {
		declaration := declarationNode.AsVariableDeclaration()
		path, ok := statePath(declaration.Initializer, result.bySymbol, typeChecker, false)
		if !ok {
			continue
		}
		bindStateAlias(
			candidate.name,
			declaration.Name(),
			path,
			result.bySymbol,
			&result.facts,
			typeChecker,
		)
	}
	walkNode(candidate.node, func(node *ast.Node) bool {
		if !ast.IsBinaryExpression(node) {
			return true
		}
		expression := node.AsBinaryExpression()
		if expression.OperatorToken.Kind != ast.KindEqualsToken ||
			!ast.IsIdentifier(expression.Left) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(expression.Left)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		binding, exists := result.bySymbol[id]
		if !exists || binding.invalidAt <= node.Pos() {
			return true
		}
		binding.invalidAt = node.Pos()
		result.bySymbol[id] = binding
		for index := range result.facts {
			if result.facts[index].Start == binding.fact.Start {
				result.facts[index].InvalidAt = node.Pos()
				break
			}
		}
		return true
	})
	return result
}

func bindStateAlias(
	component string,
	name *ast.Node,
	path []string,
	aliases map[ast.SymbolId]stateAliasBinding,
	facts *[]StateAlias,
	typeChecker *checker.Checker,
) {
	switch {
	case ast.IsIdentifier(name):
		symbol := typeChecker.GetSymbolAtLocation(name)
		if symbol == nil {
			return
		}
		fact := StateAlias{
			Component: component,
			Name:      name.Text(),
			Path:      append([]string(nil), path...),
			Start:     name.Pos(),
			Length:    name.End() - name.Pos(),
		}
		aliases[ast.GetSymbolId(symbol)] = stateAliasBinding{
			fact:      fact,
			invalidAt: int(^uint(0) >> 1),
		}
		*facts = append(*facts, fact)
	case ast.IsObjectBindingPattern(name), ast.IsArrayBindingPattern(name):
		pattern := name.AsBindingPattern()
		for index, elementNode := range pattern.Elements.Nodes {
			if !ast.IsBindingElement(elementNode) {
				continue
			}
			element := elementNode.AsBindingElement()
			segment, ok := bindingSegment(name, elementNode, index)
			if !ok {
				continue
			}
			bindStateAlias(
				component,
				element.Name(),
				append(append([]string(nil), path...), segment),
				aliases,
				facts,
				typeChecker,
			)
		}
	}
}

func bindingSegment(pattern *ast.Node, elementNode *ast.Node, index int) (string, bool) {
	element := elementNode.AsBindingElement()
	if ast.IsArrayBindingPattern(pattern) {
		return numericSegment(index), true
	}
	property := element.PropertyName
	if property == nil {
		property = element.Name()
	}
	if ast.IsIdentifier(property) || ast.IsStringLiteral(property) ||
		ast.IsNumericLiteral(property) {
		return property.Text(), true
	}
	return "", false
}

func numericSegment(value int) string {
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	index := len(digits)
	for value > 0 {
		index--
		digits[index] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[index:])
}

func stateWriteTarget(node *ast.Node, typeChecker *checker.Checker) (*ast.Node, string) {
	switch {
	case ast.IsBinaryExpression(node):
		expression := node.AsBinaryExpression()
		if ast.IsAssignmentOperator(expression.OperatorToken.Kind) {
			operation := "update"
			if expression.OperatorToken.Kind == ast.KindEqualsToken {
				operation = "assignment"
			}
			return expression.Left, operation
		}
	case ast.IsPrefixUnaryExpression(node):
		expression := node.AsPrefixUnaryExpression()
		if expression.Operator == ast.KindPlusPlusToken ||
			expression.Operator == ast.KindMinusMinusToken {
			return expression.Operand, "update"
		}
	case ast.IsPostfixUnaryExpression(node):
		expression := node.AsPostfixUnaryExpression()
		if expression.Operator == ast.KindPlusPlusToken ||
			expression.Operator == ast.KindMinusMinusToken {
			return expression.Operand, "update"
		}
	case ast.IsDeleteExpression(node):
		return node.AsDeleteExpression().Expression, "delete"
	case ast.IsCallExpression(node):
		call := node.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) {
			return nil, ""
		}
		member := call.Expression.AsPropertyAccessExpression()
		if member.Name() != nil {
			method := member.Name().Text()
			if _, mutator := reactiveArrayMutators[method]; mutator {
				return member.Expression, "array-mutation"
			}
			receiver := typeChecker.GetTypeAtLocation(member.Expression)
			receiverDisplay := typeChecker.TypeToString(receiver)
			mapLike := isCollectionType(receiverDisplay, "Map") ||
				(typeChecker.GetPropertyOfType(receiver, "get") != nil &&
					typeChecker.GetPropertyOfType(receiver, "set") != nil &&
					typeChecker.GetPropertyOfType(receiver, "size") != nil)
			setLike := isCollectionType(receiverDisplay, "Set") ||
				(typeChecker.GetPropertyOfType(receiver, "add") != nil &&
					typeChecker.GetPropertyOfType(receiver, "has") != nil &&
					typeChecker.GetPropertyOfType(receiver, "size") != nil)
			if _, mutator := reactiveMapMutators[method]; mutator &&
				mapLike {
				return member.Expression, "map-mutation"
			}
			if _, mutator := reactiveSetMutators[method]; mutator &&
				setLike {
				return member.Expression, "set-mutation"
			}
		}
	}
	return nil, ""
}

func isCollectionType(display string, name string) bool {
	return display == name ||
		strings.HasPrefix(display, name+"<") ||
		strings.HasPrefix(display, "Readonly"+name+"<")
}

func statePath(
	node *ast.Node,
	aliases map[ast.SymbolId]stateAliasBinding,
	typeChecker *checker.Checker,
	allowBroad bool,
) ([]string, bool) {
	if node == nil {
		return nil, false
	}
	switch {
	case ast.IsPropertyAccessExpression(node):
		member := node.AsPropertyAccessExpression()
		if member.Expression.Kind == ast.KindThisKeyword &&
			member.Name() != nil && member.Name().Text() == "state" {
			return []string{}, true
		}
		path, ok := statePath(member.Expression, aliases, typeChecker, allowBroad)
		if !ok || member.Name() == nil {
			return nil, false
		}
		return append(path, member.Name().Text()), true
	case ast.IsElementAccessExpression(node):
		member := node.AsElementAccessExpression()
		path, ok := statePath(member.Expression, aliases, typeChecker, allowBroad)
		if !ok || member.ArgumentExpression == nil {
			return nil, false
		}
		argument := member.ArgumentExpression
		if !ast.IsStringLiteral(argument) && !ast.IsNumericLiteral(argument) {
			if allowBroad {
				return append(path, "*"), true
			}
			return nil, false
		}
		return append(path, argument.Text()), true
	case ast.IsIdentifier(node):
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return nil, false
		}
		alias, exists := aliases[ast.GetSymbolId(symbol)]
		if !exists || node.Pos() >= alias.invalidAt {
			return nil, false
		}
		return append([]string(nil), alias.fact.Path...), true
	case ast.IsParenthesizedExpression(node):
		return statePath(
			node.AsParenthesizedExpression().Expression,
			aliases,
			typeChecker,
			allowBroad,
		)
	default:
		return nil, false
	}
}
