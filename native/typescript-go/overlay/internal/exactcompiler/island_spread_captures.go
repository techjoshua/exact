package exactcompiler

import (
	"sort"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// finiteSpreadCaptureInputs replaces a captured finite object with the
// independently bridged values used by its compiler-expanded properties.
func finiteSpreadCaptureInputs(
	component *ast.Node,
	opening *ast.Node,
	spreads map[int][]finiteSpreadProperty,
	values []islandValueCapture,
	functions []islandFunctionCapture,
	typeChecker *checker.Checker,
) ([]islandValueCapture, []islandFunctionCapture, []*ast.Node) {
	if typeChecker == nil || len(spreads) == 0 {
		return values, functions, nil
	}
	spreadSymbols := make(map[ast.SymbolId]struct{})
	attributes := opening.Attributes()
	if attributes != nil {
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if !ast.IsJsxSpreadAttribute(property) {
				continue
			}
			if _, finite := spreads[property.Pos()]; !finite {
				continue
			}
			expression := unwrapIslandSpreadExpression(property.AsJsxSpreadAttribute().Expression)
			if ast.IsIdentifier(expression) {
				if symbol := typeChecker.GetSymbolAtLocation(expression); symbol != nil {
					spreadSymbols[ast.GetSymbolId(symbol)] = struct{}{}
				}
			}
		}
	}
	filtered := values[:0]
	for _, capture := range values {
		if _, replaced := spreadSymbols[capture.symbol]; !replaced {
			filtered = append(filtered, capture)
		}
	}
	values = filtered
	valueIDs := make(map[ast.SymbolId]struct{}, len(values))
	functionIDs := make(map[ast.SymbolId]struct{}, len(functions))
	for _, capture := range values {
		valueIDs[capture.symbol] = struct{}{}
	}
	for _, capture := range functions {
		functionIDs[capture.symbol] = struct{}{}
	}
	nodes := make([]*ast.Node, 0)
	seenNodes := make(map[*ast.Node]struct{})
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		members, finite := spreads[property.Pos()]
		if !finite {
			continue
		}
		for _, member := range members {
			if !interactiveJSXAttribute(member.name) {
				continue
			}
			memberNodes := []*ast.Node{}
			finiteSpreadPropertyNodes(&member, &memberNodes)
			for _, memberNode := range memberNodes {
				if _, seen := seenNodes[memberNode]; seen {
					continue
				}
				seenNodes[memberNode] = struct{}{}
				nodes = append(nodes, memberNode)
				memberValues, memberFunctions := islandCaptures(component, memberNode, typeChecker)
				for _, capture := range memberValues {
					if _, replaced := spreadSymbols[capture.symbol]; replaced {
						continue
					}
					if _, exists := valueIDs[capture.symbol]; !exists {
						valueIDs[capture.symbol] = struct{}{}
						values = append(values, capture)
					}
				}
				for _, capture := range memberFunctions {
					if _, exists := functionIDs[capture.symbol]; !exists {
						functionIDs[capture.symbol] = struct{}{}
						functions = append(functions, capture)
					}
				}
			}
		}
	}
	sort.Slice(values, func(left, right int) bool { return values[left].start < values[right].start })
	sort.Slice(functions, func(left, right int) bool { return functions[left].start < functions[right].start })
	return values, functions, nodes
}

func positionInIslandInputs(position int, root *ast.Node, inputs []*ast.Node) bool {
	if position >= root.Pos() && position < root.End() {
		return true
	}
	for _, input := range inputs {
		if position >= input.Pos() && position < input.End() {
			return true
		}
	}
	return false
}
