package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// enumerateDescriptorTargetSource is an original [[GetOwnProperty]] source
// traversal. It has no sourceGetInputs and cannot execute a stored target getter
// or enter a prototype. Other creation/capture domains remain explicitly pending.
func (work *callableEffectWork) enumerateDescriptorTargetSource(facts []callableFacts, q *sourceValueQuery, event *sourceDescriptorTargetEvent, bindings sourceValueBindings) (sourceDescriptorTargetSource, bool) {
	plan := sourceDescriptorTargetSource{}
	if !event.owned(q) || event.work != work {
		return plan, false
	}
	plan = sourceDescriptorTargetSource{algorithm: event.algorithm, source: event.source, generation: event.generation, cut: event.cut, inputs: event.inputs, represented: true, enumerated: true}
	plan.required = appendEntryLawRequirement(plan.required, nativeRootDebtRequest(event.source, "callee-get"))
	for _, input := range event.inputs {
		if input.request.producer.operation != nil {
			plan.required = appendEntryLawRequirement(plan.required, input.request)
		}
	}
	var registeredSources []*ast.SourceFile
	registryReady := false
	key, keyKnown := descriptorInputLiteralKey(event.inputs[1])
	if !keyKnown {
		plan.represented = false
		return plan, true
	}
	for _, alternative := range event.inputs[0].alternatives {
		endpoint := alternative.endpoint
		if alternative.creating != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 || endpoint.kind != relativeEndpointModuleConstruction || endpoint.moduleConstruction == nil || endpoint.moduleConstruction.source == nil {
			plan.represented = false
			continue
		}
		construction := endpoint.moduleConstruction.source
		origin := construction.initializer
		if origin == nil || !ast.IsObjectLiteralExpression(origin) || enclosingCallableNode(origin) != nil || construction.generation != event.generation || construction.module == nil {
			plan.represented = false
			continue
		}
		plan.required = appendEntryLawRequirement(plan.required, construction.request)
		part := accessorCandidates{}
		if !registryReady {
			var complete bool
			registeredSources, complete = work.descriptorTargetRegisteredSources(facts, q, &part)
			plan.represented = plan.represented && complete
			registryReady = true
		}
		sources, unavailable := q.nativeSelectionSources(origin, &part)
		sources = append(sources, registeredSources...)
		var storage [4]sourceValueIndex
		indexes := q.occurrenceSourceViewIn(origin, &part, sources, storage[:0])
		if unavailable || len(indexes) == 0 || frameworkEffectsCompilerPending(part) {
			plan.represented = false
		}
		for _, index := range indexes {
			if index.incomplete || !index.importsPrepared {
				plan.represented = false
			}
			cursor := index.memberAssignments(origin)
			for {
				assignment, found := cursor.next()
				if !found {
					break
				}
				if !q.charge(&part, assignment.left) {
					plan.represented = false
					break
				}
				if q.afterRead(assignment.left) {
					continue
				}
				work.descriptorTargetAssignment(facts, q, event, origin, key, assignment, bindings, &plan, &part)
			}
			for _, call := range index.calls {
				if !q.charge(&part, call) {
					plan.represented = false
					break
				}
				if q.afterRead(call) {
					continue
				}
				// The authenticated current intrinsic does not invoke a stored
				// target value. Its coercion/Proxy/Throw owners remain separate.
				if call == event.source.request.producer.operation {
					continue
				}
				// A different Call can write this target. Its existing source
				// mapping must contribute descriptor fields, not just Effects.
				// Descriptor conversion and arbitrary source-body mapping require
				// their own stored-field source producer; this bounded domain
				// retains the candidate as pending rather than replaying a Get.
				plan.represented = false
			}
		}
		if frameworkEffectsCompilerPending(part) {
			plan.represented = false
		}
	}
	return plan, event.owned(q)
}

// This reuses the indexed assignment/binder/receiver/RHS owners used by ordinary
// member recovery, but the consumer emits stored descriptor data. It does not
// run the ordinary property's [[Get]], merge replacements or claim performed Set.
func (work *callableEffectWork) descriptorTargetAssignment(facts []callableFacts, q *sourceValueQuery, event *sourceDescriptorTargetEvent, origin *ast.Node, key string, assignment sourceValueAssignment, bindings sourceValueBindings, plan *sourceDescriptorTargetSource, result *accessorCandidates) {
	left, right := assignment.left, assignment.right
	if left == nil || right == nil || left.Parent == nil || !plainStagedAssignment(left.Parent) || left.Parent.AsBinaryExpression().Right != right {
		plan.represented = false
		return
	}

	root, assignedKey := accessorReceiver(left)
	if assignedKey != "" && assignedKey != key {
		return
	}
	if assignedKey == "" || root == nil || !ast.IsIdentifier(root) {
		plan.represented = false
		return
	}
	// Do not acquire a construction marker as a raw object and forgive its
	// deliberate opacity. Original receiver DATA owns the conditional match.
	if enclosingCallableNode(left) != nil {
		plan.represented = false
		return
	}
	region := sourceStagedModuleOwner(left)
	caller, known := work.memberNodes[region]
	if !known {
		plan.represented = false
		return
	}
	cut := &sourceMemberWriterReadCut{operation: event.source.request.producer.operation, use: event.cut.use, scope: q.acquireCallableScope(bindings, result)}
	rows := q.memberWriterInputs(left, bindings, result, cut)
	if len(rows) != 1 || rows[0].incomplete || rows[0].call != nil {
		plan.represented = false
		return
	}
	receiver, registered := work.descriptorTargetFieldRequest(facts, q, left.Parent, root)
	if !registered {
		plan.represented = false
		return
	}
	plan.required = appendEntryLawRequirement(plan.required, receiver)
	set, registered := work.registerStagedAssignmentEffects(facts, caller, left.Parent, q.executable)
	if !registered {
		plan.represented = false
		return
	}
	plan.required = appendEntryLawRequirement(plan.required, set)
	data, registered := work.descriptorTargetFieldRequest(facts, q, left.Parent, right)
	if !registered {
		plan.represented = false
		return
	}
	plan.required = appendEntryLawRequirement(plan.required, data)
	for _, alternative := range event.inputs[0].alternatives {
		endpoint := alternative.endpoint
		if endpoint.moduleConstruction != nil && endpoint.moduleConstruction.source != nil && endpoint.moduleConstruction.source.initializer == origin {
			plan.fields = append(plan.fields, sourceDescriptorTargetFieldSource{field: descriptorTargetValue, writer: left.Parent, data: data, receiver: receiver, target: cloneSourceRelativeEndpoint(endpoint)})
			return
		}
	}
	plan.represented = false

}

// Both sides are delivered SOURCE descriptions. Matching the same immutable
// module binding/initializer gives a possible writer route, not alias identity,
// a performed replacement or permission to expose the input object as a value.
func descriptorTargetReceiverMatch(alternatives []sourceStagedOperationAlternative, target sourceRelativeEndpoint) (matches, represented bool) {
	represented = len(alternatives) != 0
	expected := target.moduleConstruction
	if expected == nil || expected.source == nil {
		return false, false
	}
	for _, alternative := range alternatives {
		endpoint := alternative.endpoint
		actual := endpoint.moduleConstruction
		if alternative.creating != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 || endpoint.kind != relativeEndpointModuleConstruction || actual == nil || actual.source == nil || actual.pending || actual.source.localOwner != nil || actual.source.generation != expected.source.generation || actual.source.module == nil {
			represented = false
			continue
		}
		matches = matches || actual.source.binding == expected.source.binding && actual.source.initializer == expected.source.initializer && actual.source.module == expected.source.module
	}
	return matches, represented
}

// The existing current registry owns this finite modeled population. This is
// neither a scan of arbitrary Program files nor a proof about external callers.
// Distinct source contexts retain their own AST/index and writer DATA owners.
func (work *callableEffectWork) descriptorTargetRegisteredSources(facts []callableFacts, q *sourceValueQuery, result *accessorCandidates) ([]*ast.SourceFile, bool) {
	if q == nil || q.owner == nil || q.executable == nil || work.operationGeneration != q.owner.generation || len(facts) == 0 || len(work.operationFacts) != len(facts) || &work.operationFacts[0] != &facts[0] {
		return nil, false
	}
	var sources []*ast.SourceFile
	seen := make(map[*ast.SourceFile]bool)
	complete := true
	for i := range facts {
		fact := &facts[i]
		// Metadata/non-body facts enumerate their already-owned source file;
		// no callable publisher or execution is required for membership.
		if fact.sourceFile == nil || fact.sourceFile.IsDeclarationFile {
			continue
		}
		if !q.charge(result, fact.node) {
			complete = false
			break
		}
		if q.owner.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
			complete = false
			continue
		}
		if !seen[fact.sourceFile] {
			seen[fact.sourceFile] = true
			sources = append(sources, fact.sourceFile)
		}
	}
	return sources, complete && len(sources) != 0
}
