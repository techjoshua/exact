package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectSelectedFreezeSource retains a lexical input description from the
// original eager Call. It leaves callee and input acquisition on that Call.
func (q *sourceValueQuery) projectSelectedFreezeSource(site *ast.Node, callee sourceValue, bindings sourceValueBindings, complete, exclusive bool, project func(sourceValue, sourceValueBindings), result *accessorCandidates) {
	literal := q.frozenModuleArrayInput(site, callee, bindings, exclusive, result)
	if literal == nil {
		q.sourceFreezeRelationship(site, callee, bindings, complete, project, result)
		return
	}
	inputs, matched := 0, false
	q.sourceFreezeRelationshipObserved(site, callee, bindings, complete, project, result, func(input sourceValue, _ sourceValueBindings, acquired *accessorCandidates) {
		inputs++
		matched = input.node == literal && len(input.path) == 0 && calleeSyntaxCarrier(input) && cleanFreezeSource(acquired)
	})
	if inputs != 1 || !matched || !cleanFreezeSource(result) {
		return
	}
	owner := q.executable.values
	if owner.frozenModuleArrays == nil {
		owner.frozenModuleArrays = make(map[*ast.Node]*ast.Node)
	}
	owner.frozenModuleArrays[site] = literal
}

// cleanFreezeSource permits the standard entry and method classifications on
// the original Get. Those classifications stay with their original readers.
func cleanFreezeSource(result *accessorCandidates) bool {
	if result.opaque || result.valueIncomplete || !nativeMemberGetChannelsRepresented(result) ||
		len(result.environmentEffects)+len(result.callOutcomes)+len(result.producers) != 0 {
		return false
	}
	for _, descriptor := range result.nativeDescriptorEffects {
		if descriptor.kind != sourceStandardObjectEntry && descriptor.kind != sourceStandardObjectFreeze {
			return false
		}
	}
	return true
}

// frozenModuleArrayInput bounds the reusable input to a confined primitive
// literal from this initialized module binding. Each import keeps its own
// availability, evaluation effects and eager execution order.
func (q *sourceValueQuery) frozenModuleArrayInput(site *ast.Node, callee sourceValue, bindings sourceValueBindings, exclusive bool, result *accessorCandidates) *ast.Node {
	if !exclusive || callee.native.referencesIncomplete || q.normalBindingCall != site ||
		q.inputs != nil || len(bindings) != 0 || len(q.creators) != 0 || site.Parent == nil ||
		!ast.IsVariableDeclaration(site.Parent) || !q.currentFrozenModuleGeneration() || !cleanFreezeSource(result) {
		return nil
	}
	binding := site.Parent
	if binding.Initializer() != site || binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 ||
		q.effectOwner != sourceStagedModuleOwner(site) || !ast.IsIdentifier(binding.Name()) {
		return nil
	}
	file := ast.GetSourceFileOfNode(site)
	if file == nil || !ast.IsExternalModule(file) || file.CommonJSModuleIndicator != nil {
		return nil
	}
	literal := q.frozenMapKeyLiteral(site)
	if literal == nil || literal.End() >= site.End() {
		return nil
	}
	return literal
}

// frozenModuleArray projects a source endpoint through an existing lexical
// reader. It carries no receiver identity, completion, or descriptor proof.
func (q *sourceValueQuery) frozenModuleArray(site *ast.Node) *ast.Node {
	if site == nil || !q.currentFrozenModuleGeneration() || q.active[site] {
		return nil
	}
	owner := q.executable.values
	literal := owner.frozenModuleArrays[site]
	if literal == nil || ast.GetSourceFileOfNode(site) == ast.GetSourceFileOfNode(q.effectOwner) {
		return nil
	}
	return literal
}

func (q *sourceValueQuery) currentFrozenModuleGeneration() bool {
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || q.effectOwner == nil ||
		q.executable == nil || q.executable.project == nil || q.executable.values == nil {
		return false
	}
	owner := q.executable.values
	return owner.program == q.owner.program && owner.checker == q.owner.checker && owner.generation == q.owner.generation &&
		owner.generation != nil && owner.generation.active && owner.generation == q.executable.project.activeGeneration
}
