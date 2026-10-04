package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// componentSurfaceReceiver retains component identity across ordinary parameters without
// assigning component ownership to a helper's unrelated JavaScript this receiver.
type componentSurfaceReceiver struct {
	this    bool
	symbols map[ast.SymbolId]bool
}

// propagateComponentSurfacePlans selects capabilities used by resolved helpers receiving the
// component itself. Receiver sets grow monotonically, so recursive helper graphs terminate
// without enumerating every call path. Ordinary helper bodies remain unchanged.
func propagateComponentSurfacePlans(sourceFile *ast.SourceFile, components []Component, callables callableAnalysis, typeChecker *checker.Checker) {
	factsByID := make(map[string]int, len(callables.facts))
	for index := range callables.facts {
		factsByID[callables.facts[index].summary.ID] = index
	}
	// Index lexical ownership once rather than rescanning all callables at each graph step.
	factsByNode := make(map[*ast.Node]int, len(callables.facts))
	children := make(map[int][]int)
	for index := range callables.facts {
		factsByNode[callables.facts[index].node] = index
	}
	for index := range callables.facts {
		for parent := callables.facts[index].node.Parent; parent != nil; parent = parent.Parent {
			if owner, exists := factsByNode[parent]; exists {
				children[owner] = append(children[owner], index)
				break
			}
		}
	}
	for componentIndex := range components {
		component := &components[componentIndex]
		states := make(map[int]*componentSurfaceReceiver)
		pending := []int{}
		enqueue := func(index int, receiver componentSurfaceReceiver) {
			state := states[index]
			fresh := state == nil
			if fresh {
				state = &componentSurfaceReceiver{symbols: map[ast.SymbolId]bool{}}
				states[index] = state
			}
			changed := fresh
			if receiver.this && !state.this {
				state.this = true
				changed = true
			}
			for symbol := range receiver.symbols {
				if !state.symbols[symbol] {
					state.symbols[symbol] = true
					changed = true
				}
			}
			if changed {
				pending = append(pending, index)
			}
		}
		for index := range callables.facts {
			fact := &callables.facts[index]
			if fact.sourceFile == sourceFile && fact.node.Pos() == component.Start {
				enqueue(index, componentSurfaceReceiver{this: true})
			}
		}
		for len(pending) != 0 {
			index := pending[len(pending)-1]
			pending = pending[:len(pending)-1]
			fact, receiver := &callables.facts[index], states[index]
			mergeForwardedComponentSurface(component, sourceFile, fact, receiver, typeChecker)
			// Nested closures can capture ordinary owner parameters. A function's own this is
			// independent, while arrows preserve the lexical receiver.
			for _, child := range children[index] {
				nested := &callables.facts[child]
				enqueue(child, componentSurfaceReceiver{this: receiver.this && ast.IsArrowFunction(nested.node), symbols: receiver.symbols})
			}
			for _, edge := range fact.summary.Calls {
				target, exists := factsByID[edge.TargetID]
				if !edge.Resolved || !exists {
					continue
				}
				forwarded := forwardedComponentReceiver(fact, receiver, edge, callables.facts[target].node, typeChecker)
				if forwarded.this || len(forwarded.symbols) != 0 {
					enqueue(target, forwarded)
				}
			}
		}
	}
}

// forwardedComponentReceiver maps authored argument positions, including explicit this
// parameters on call/apply invocation, onto the callee's symbol-owned parameter slots.
func forwardedComponentReceiver(fact *callableFacts, receiver *componentSurfaceReceiver, edge CallEdge, target *ast.Node, typeChecker *checker.Checker) componentSurfaceReceiver {
	result := componentSurfaceReceiver{symbols: map[ast.SymbolId]bool{}}
	parameters := target.Parameters()
	explicitThis := len(parameters) != 0 && ast.IsIdentifier(parameters[0].Name()) && parameters[0].Name().Text() == "this"
	invocation := ""
	if expression := fact.callExpressions[edge.ID]; expression != nil && ast.IsPropertyAccessExpression(expression) {
		invocation = expression.AsPropertyAccessExpression().Name().Text()
	}
	for _, binding := range edge.ReceiverBindings {
		if len(binding.Path) != 0 {
			continue
		}
		owned := binding.Source == "component" && receiver.this
		if binding.Source == "parameter" && binding.SourceParameterIndex < len(fact.node.Parameters()) {
			name := fact.node.Parameters()[binding.SourceParameterIndex].Name()
			if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
				owned = receiver.symbols[ast.GetSymbolId(symbol)]
			}
		}
		// A closure's captured owner is not one of its own formal parameters. Resolve
		// that argument against lexical identity already proven by its enclosing callable.
		if !owned && binding.Source == "unknown" {
			expression := fact.callExpressions[edge.ID]
			if expression != nil && expression.Parent != nil && ast.IsCallExpression(expression.Parent) {
				arguments := expression.Parent.AsCallExpression().Arguments
				if arguments != nil && binding.ParameterIndex < len(arguments.Nodes) {
					root, path := immutableEffectArgumentRoot(arguments.Nodes[binding.ParameterIndex], typeChecker, map[ast.SymbolId]bool{})
					if len(path) == 0 && ast.IsIdentifier(root) {
						if symbol := typeChecker.GetSymbolAtLocation(root); symbol != nil {
							owned = receiver.symbols[ast.GetSymbolId(symbol)]
						}
					}
				}
			}
		}
		if !owned {
			continue
		}
		slot := binding.ParameterIndex
		if invocation == "call" || invocation == "apply" {
			if slot == 0 {
				result.this = true
				continue
			}
			if invocation == "apply" {
				continue
			}
			if !explicitThis {
				slot--
			}
		} else if explicitThis {
			slot++
		}
		if slot < len(parameters) {
			if symbol := typeChecker.GetSymbolAtLocation(parameters[slot].Name()); symbol != nil {
				result.symbols[ast.GetSymbolId(symbol)] = true
			}
		}
	}
	return result
}

// mergeForwardedComponentSurface recognizes only accesses on the actual forwarded instance.
// Immutable aliases retain identity, while state fields and unrelated receivers do not.
func mergeForwardedComponentSurface(component *Component, sourceFile *ast.SourceFile, fact *callableFacts, receiver *componentSurfaceReceiver, typeChecker *checker.Checker) {
	surface := ComponentSurfacePlan{}
	lifecycle, lists := false, false
	walkCallable(fact.node, func(node *ast.Node) bool {
		var owner, key *ast.Node
		if ast.IsPropertyAccessExpression(node) {
			owner = node.AsPropertyAccessExpression().Expression
			key = node.AsPropertyAccessExpression().Name()
		}
		if ast.IsElementAccessExpression(node) {
			owner = node.AsElementAccessExpression().Expression
			key = node.AsElementAccessExpression().ArgumentExpression
		}
		if owner == nil || key == nil {
			return true
		}
		root, path := immutableEffectArgumentRoot(owner, typeChecker, map[ast.SymbolId]bool{})
		if len(path) != 0 {
			return true
		}
		owned := root.Kind == ast.KindThisKeyword && receiver.this
		if ast.IsIdentifier(root) {
			if symbol := typeChecker.GetSymbolAtLocation(root); symbol != nil {
				owned = receiver.symbols[ast.GetSymbolId(symbol)]
			}
		}
		if !owned {
			return true
		}
		dynamic := ast.IsElementAccessExpression(node) && !ast.IsStringLiteral(key)
		name := ""
		if !dynamic {
			name = key.Text()
		}
		matches := func(names ...string) bool {
			if dynamic {
				return true
			}
			for _, candidate := range names {
				if name == candidate {
					return true
				}
			}
			return false
		}
		surface.Logging = surface.Logging || matches("log")
		surface.Localization = surface.Localization || matches("intl")
		surface.Refs = surface.Refs || matches("ref", "readRef", "refs")
		surface.Contexts = surface.Contexts || matches("hasContext", "getContext", "setContext")
		surface.Reactivity = surface.Reactivity || matches("reactive")
		surface.ServerLifecycle = surface.ServerLifecycle || matches("onUnmount", "onRender", "own")
		lifecycle = lifecycle || matches("onMount", "onActivate", "onDeactivate", "onUnmount", "onRender", "own")
		lists = lists || matches("map")
		return true
	})
	mergeComponentSurface(&component.Surface, surface)
	if fact.sourceFile != sourceFile || fact.node.Pos() < component.Start || fact.node.End() > component.Start+component.Length {
		mergeComponentSurface(&component.ForwardedSurface, surface)
	}
	component.Lifecycle = component.Lifecycle || lifecycle
	component.Lists = component.Lists || lists || componentUsesAuthoredJSXKey(fact.node)
}
