package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskPlacementEffects projects the effects executed by a task. Resolved task
// invocations own their work separately, including when a mapper reaches them.
type taskPlacementEffects struct {
	analysis     callableAnalysis
	source       *ast.SourceFile
	checker      *checker.Checker
	policies     externalImportBindings
	availability *moduleValueAvailability
}

// project follows reached standard map callbacks nested lexically in this
// callable. That strict descent bounds the walk even when a callback calls back
// into the parent. Other edges keep their complete canonical effects.
func (p taskPlacementEffects) project(caller *callableFacts, sources []EnvironmentEffectSource) ([]EnvironmentEffectSource, []EnvironmentEffectSource, bool) {
	if len(caller.targets) == 0 {
		return sources, nil, false
	}
	targets := make(map[string]*callableFacts, len(caller.targets))
	for _, index := range caller.targets {
		target := &p.analysis.facts[index]
		targets[target.summary.ID] = target
	}
	var bindings []EnvironmentEffectSource
	var boundaries map[string]bool
	var projectedCallbacks map[string][]EnvironmentEffectSource
	seenBindings := make(map[*ast.Node]bool)
	var callbacks map[*callableFacts][]EnvironmentEffectSource
	for _, edge := range caller.summary.Calls {
		target := targets[edge.TargetID]
		if !edge.Resolved || target == nil || target.node == nil || target.sourceFile != p.source || target.progressReceiver {
			continue
		}
		operation := caller.fieldEdgeOperations[edge.ID]
		direct := operation != nil && ast.IsCallExpression(operation) && enclosingCallableNode(operation) == caller.node
		callback := enclosingCallableNode(target.node) == caller.node && p.mapCallback(caller, target, edge)
		if !direct && !callback {
			continue
		}
		_, explicit := functionTaskPolicy(target.node, p.source, p.policies)
		if direct {
			if explicit {
				if summary, resolved := p.analysis.expressionSummary(operation.Expression(), p.checker); resolved && summary.ID == edge.TargetID {
					if boundaries == nil {
						boundaries = make(map[string]bool)
					}
					boundaries[edge.ID] = true
				}
			} else if !seenBindings[operation] {
				seenBindings[operation] = true
				if effect, retained := p.availability.taskCallBindingRequirement(caller.node, operation, caller.summary.Name); retained {
					bindings = append(bindings, effect)
				}
			}
		}
		if !callback || explicit {
			continue
		}
		projected, seen := callbacks[target]
		if !seen {
			filtered, localBindings, changed := p.project(target, target.summary.EffectSources)
			bindings = append(bindings, localBindings...)
			if changed {
				projected = filtered
			}
			if callbacks == nil {
				callbacks = make(map[*callableFacts][]EnvironmentEffectSource)
			}
			callbacks[target] = projected
		}
		if projected != nil {
			if projectedCallbacks == nil {
				projectedCallbacks = make(map[string][]EnvironmentEffectSource)
			}
			projectedCallbacks[edge.ID] = projected
		}
	}
	if len(boundaries) == 0 && len(projectedCallbacks) == 0 {
		return sources, bindings, false
	}
	// Keep a shared donor whenever any original local evaluation or any
	// uncut edge contributes it. Display paths may omit an intermediate call.
	key := func(source EnvironmentEffectSource) string {
		return source.Environment + ":" + source.Description + fieldSourceIdentity(source)
	}
	owned := make(map[string]bool)
	for _, source := range caller.summary.DirectEffectSources {
		owned[key(source)] = true
	}
	for _, edge := range caller.summary.Calls {
		target := targets[edge.TargetID]
		if !edge.Resolved || target == nil || target.progressReceiver {
			continue
		}
		projected := projectedCallbacks[edge.ID]
		boundary := boundaries[edge.ID]
		for _, source := range appendCallableEdgeEffectSources(nil, caller, target, edge, p.analysis.owner) {
			id := key(source)
			owned[id] = owned[id] || !boundary && projected == nil
		}
		if len(projected) != 0 {
			for _, source := range appendProjectedCallableEdgeEffects(nil, projected, caller, target, edge, p.analysis.owner) {
				owned[key(source)] = true
			}
		}
	}
	filtered := make([]EnvironmentEffectSource, 0, len(sources))
	for _, source := range sources {
		if keep, recognized := owned[key(source)]; !recognized || keep {
			filtered = append(filtered, source)
		}
	}
	return filtered, bindings, len(filtered) != len(sources)
}

// mapCallback uses native callback provenance when available. The generic
// invocation edge for an inline mapper also covers arbitrary checked Arrays.
func (p taskPlacementEffects) mapCallback(caller, target *callableFacts, edge CallEdge) bool {
	if edge.arrayMapBody == target.node && edge.arrayMapCall != nil && enclosingCallableNode(edge.arrayMapCall) == caller.node {
		return true
	}
	if caller.callExpressions[edge.ID] != target.node {
		return false
	}
	argument := target.node
	for argument.Parent != nil && ast.IsParenthesizedExpression(argument.Parent) {
		argument = argument.Parent
	}
	call := argument.Parent
	if call == nil || !ast.IsCallExpression(call) || enclosingCallableNode(call) != caller.node {
		return false
	}
	args := call.AsCallExpression().Arguments
	if args == nil || len(args.Nodes) == 0 || args.Nodes[0] != argument {
		return false
	}
	receiver, name := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression()), p.checker)
	if name != "map" {
		return false
	}
	owner := standardLibraryCallOwner(call.AsCallExpression(), p.checker)
	if owner == "Array" || owner == "ReadonlyArray" {
		return nativeReceiverMemberDeclarations(call.Expression(), p.checker)
	}
	if owner != "" || p.analysis.owner == nil || p.analysis.owner.values == nil {
		return false
	}

	// The checker sees an untyped receiver inside a bound function task. Recover
	// the component's declared field type before checking the actual member.
	query := sourceValueQuery{owner: p.analysis.owner.values, executable: p.analysis.owner, remaining: 4096}
	value := query.componentOperandType(receiver)
	if value == nil {
		return false
	}
	member := p.checker.GetPropertyOfType(p.checker.GetNonNullableType(value), name)
	if member == nil || len(member.Declarations) == 0 {
		return false
	}
	for _, declaration := range member.Declarations {
		parent := declaration.Parent
		if !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) || parent == nil || !ast.IsInterfaceDeclaration(parent) || parent.Name() == nil {
			return false
		}
		if name := parent.Name().Text(); name != "Array" && name != "ReadonlyArray" {
			return false
		}
	}
	return true
}
