package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskHelperCaptures finds setup values referenced by reconstructed ordinary
// helpers and setup snapshots used directly by task work. Values cross as
// execution inputs without replaying initializers.
// Symbol identity preserves block shadowing and recursive helper graphs.
func taskHelperCaptures(work, component *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, bindings []ReactiveBinding, facts *sourceAnalysisFacts, classes []*ast.Node, contextWrites *taskContextBindingWrites) ([]invokedTaskCapture, map[*ast.Node]bool) {
	result := []invokedTaskCapture{}
	var contextAliases map[*ast.Node]bool
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
			symbol := taskLexicalReferenceSymbol(node, typeChecker)
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
			if (!ast.IsVariableDeclaration(declaration) && !ast.IsParameterDeclaration(declaration) && !ast.IsBindingElement(declaration)) || declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) {
				return true
			}
			bindingProvenance := provenance[declaration.Name().Pos()]
			setupSnapshot := bindingProvenance == "snapshot" && ast.IsVariableDeclaration(declaration) &&
				declaration.Parent.Flags&ast.NodeFlagsConst != 0
			contextBinding := bindingProvenance == "context"
			if !contextBinding && ast.IsVariableDeclaration(declaration) {
				contextBinding = continuationContextLookup(unwrapRenderExpression(declaration.Initializer())) != nil
			}
			replacedContext := contextBinding && contextWrites.replacedOutside(symbol, work)
			if contextBinding && !replacedContext {
				if contextAliases == nil {
					contextAliases = make(map[*ast.Node]bool)
				}
				contextAliases[declaration] = true
				return true
			}
			// Reconstructed executors lose setup scope. Capture an evaluated
			// replacement, setup snapshot or state receiver through the existing plan.
			if !helper && !setupSnapshot && !replacedContext {
				if aliases == nil {
					value := sourceStateAliases(componentCandidate{node: component}, typeChecker, facts)
					aliases = &value
				}
				if _, owned := statePath(node, aliases.bySymbol, typeChecker, false); !owned {
					return true
				}
			}
			reference := SourceSpan{Start: node.Pos(), Length: node.End() - node.Pos()}
			snapshot := setupSnapshot || snapshotContext || spanInsideTaskCapture(node.Pos(), node.End(), snapshots)
			if index, exists := captured[id]; exists {
				result[index].snapshot = result[index].snapshot && snapshot
				result[index].references = append(result[index].references, reference)
				return true
			}
			captured[id] = len(result)
			typeNode := authoredTaskCaptureType(node, typeChecker)
			if typeNode != nil && !portableTaskCaptureType(typeNode) {
				typeNode = nil
			}
			capture := invokedTaskCapture{snapshot: snapshot, references: []SourceSpan{reference}, expression: node, typeNode: typeNode, source: "derived", path: declaration.Name().Text(), bindingName: declaration.Name().Text()}
			capture.mutable = replacedContext
			if !replacedContext && !setupSnapshot && (!helper || bindingProvenance == "state" || bindingProvenance == "derived") {
				if aliases == nil {
					value := sourceStateAliases(componentCandidate{node: component}, typeChecker, facts)
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
	for _, class := range classes {
		visit(class, true, false)
	}
	return result, contextAliases
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

// invokedTaskReconstruction retains state aliases and the same current class plan for an invoked executor.
// Non-state captures already belong to the operation's activation inputs.
func invokedTaskReconstruction(tasks []Task, id string) ([]invokedTaskCapture, []*ast.Node, map[*ast.Node]bool) {
	for _, task := range tasks {
		if task.ID != id {
			continue
		}
		var result []invokedTaskCapture
		for _, capture := range task.helperCaptures {
			if capture.source == "state" {
				result = append(result, capture)
			}
		}
		return result, task.classDefinitions, task.contextAliases
	}
	return nil, nil, nil
}
