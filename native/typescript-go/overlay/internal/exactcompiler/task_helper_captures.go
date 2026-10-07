package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskHelperCaptures finds setup values referenced by reconstructed ordinary
// helpers. Values cross as activation inputs, never by replaying initializers.
// Symbol identity preserves block shadowing and recursive helper graphs.
func taskHelperCaptures(work, component *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, bindings []ReactiveBinding) []invokedTaskCapture {
	result := []invokedTaskCapture{}
	var aliases *componentStateAliases
	seen := map[ast.SymbolId]uint8{}
	captured := map[ast.SymbolId]int{}
	provenance := map[int]string{}
	for _, binding := range bindings {
		provenance[binding.Start] = binding.Provenance
	}
	var visit func(*ast.Node, bool, bool)
	visit = func(root *ast.Node, helper bool, snapshotContext bool) {
		snapshots := taskSnapshotReadRanges(root, source, typeChecker)
		walkNode(root, func(node *ast.Node) bool {
			if ast.IsPartOfTypeNode(node) {
				return false
			}
			if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(node)
			if symbol == nil || symbol.ValueDeclaration == nil {
				return true
			}
			declaration := symbol.ValueDeclaration
			if (helper && declaration.Pos() >= root.Pos() && declaration.End() <= root.End()) || declaration.Pos() < component.Pos() || declaration.End() > component.End() || (declaration.Pos() >= work.Pos() && declaration.End() <= work.End()) {
				return true
			}
			callable := taskHelperCallable(declaration, typeChecker, map[*ast.Node]bool{})
			id := ast.GetSymbolId(symbol)
			if callable != nil && ast.IsFunctionLike(callable) && callable.Body() != nil {
				snapshot := snapshotContext || spanInsideTaskCapture(node.Pos(), node.End(), snapshots)
				context := uint8(1)
				if snapshot {
					context = 2
				}
				if seen[id]&context == 0 {
					seen[id] |= context
					visit(callable, true, snapshot)
				}
				return true
			}
			if !helper || (!ast.IsVariableDeclaration(declaration) && !ast.IsParameterDeclaration(declaration) && !ast.IsBindingElement(declaration)) || declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) {
				return true
			}
			reference := SourceSpan{Start: node.Pos(), Length: node.End() - node.Pos()}
			snapshot := snapshotContext || spanInsideTaskCapture(node.Pos(), node.End(), snapshots)
			if index, exists := captured[id]; exists {
				result[index].snapshot = result[index].snapshot && snapshot
				result[index].references = append(result[index].references, reference)
				return true
			}
			var initializer *ast.Node
			if ast.IsVariableDeclaration(declaration) {
				initializer = unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
			}
			if continuationContextLookup(initializer) != nil || provenance[declaration.Name().Pos()] == "context" {
				return true
			}
			captured[id] = len(result)
			typeNode := authoredTaskCaptureType(node, typeChecker)
			if typeNode != nil && !portableTaskCaptureType(typeNode) {
				typeNode = nil
			}
			capture := invokedTaskCapture{snapshot: snapshot, references: []SourceSpan{reference}, expression: node, typeNode: typeNode, source: "derived", path: declaration.Name().Text(), bindingName: declaration.Name().Text()}
			if provenance[declaration.Name().Pos()] == "state" || provenance[declaration.Name().Pos()] == "derived" {
				if aliases == nil {
					value := collectComponentStateAliases(componentCandidate{node: component}, typeChecker)
					aliases = &value
				}
				if path, ok := statePath(node, aliases.bySymbol, typeChecker, false); ok {
					capture.source = "state"
					capture.statePath = path
				}
			}
			result = append(result, capture)
			return true
		})
	}
	visit(work.Body(), false, false)
	return result
}

// taskHelperDependencies keeps preparation and executor argument ordering in one
// plan. Generated names cannot collide with the authored task or helper names.
func (lowering *jsxLowering) taskHelperDependencies(task Task, offset int) []nativeTaskDependency {
	result := []nativeTaskDependency{}
	index := 0
	for _, capture := range task.helperCaptures {
		if capture.source == "state" {
			continue
		}
		name := fmt.Sprintf("__exactHelperCapture%d", offset+index)
		for containsIdentifier(lowering.sourceFile.AsNode(), name) {
			name += "_"
		}
		result = append(result, nativeTaskDependency{snapshot: capture.snapshot, parameter: name, expression: capture.expression, typeNode: lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword), readSpans: map[string]struct{}{}})
		index++
	}
	return result
}

// stateHelperCaptures keeps every state alias used by an invoked executor.
// Non-state captures already belong to the operation's activation inputs.
func stateHelperCaptures(tasks []Task, id string) []invokedTaskCapture {
	result := []invokedTaskCapture{}
	for _, task := range tasks {
		if task.ID == id {
			for _, capture := range task.helperCaptures {
				if capture.source == "state" {
					result = append(result, capture)
				}
			}
		}
	}
	return result
}
