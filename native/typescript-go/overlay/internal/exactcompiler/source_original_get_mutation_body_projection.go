package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sort"
)

// originalGetterMutationOutputs consumes an existing actual getter's BODY and
// input edge. It describes conditional mutation SOURCE outputs only. It neither
// runs that BODY nor settles the Get, and leaves unmatched operations pending.
// The requested installation field and the later reader have distinct cuts.
func (work *callableEffectWork) originalGetterMutationOutputs(facts []callableFacts, field sourceStagedOperationRequest, reader sourceStagedOperationID, slot int) (sourceStagedOperationDelta, []sourceStagedFieldForward, bool) {
	var delta sourceStagedOperationDelta
	if reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) || slot < 0 || slot >= len(work.operations[reader.index].getters) {
		return delta, nil, false
	}
	getter := work.operations[reader.index].getters[slot]
	parent, valid := fieldSourceParent(field)
	if !valid || getter.demand.producer != reader || getter.demand.request.producer != work.operations[reader.index].key || getter.installed == nil || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyReady || !getter.bodyTransferred || getter.inputs.request.declaration != getter.declaration || !sameSourceRelativeInputEnvelope(getter.inputs.request, getter.inputs.bound) || !sameSourceRelativeInputEnvelope(getter.inputs.request, getter.inputs.relative) || getter.inputs.relative.unsupported != relativeInputsSupported {
		return delta, nil, false
	}
	exposure := getter.installed.exposure
	if exposure.epoch != work.operationEpoch || exposure.index == 0 || int(exposure.index) >= len(work.operations) || work.operations[exposure.index].key != parent.producer || !operationContainsRequest(work.operationRecipes[parent.producer].delta.required, field) {
		return delta, nil, false
	}
	consumer, known := work.memberNodes[getter.demand.request.consumer]
	actor, body := work.memberNodes[getter.declaration]
	if !known || !body || consumer < 0 || consumer >= len(facts) || actor < 0 || actor >= len(facts) || actor >= len(work.stagedRevisions) {
		return delta, nil, false
	}
	dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
	if dependency == nil || dependency.producer != actor || dependency.cut != getter.demand.request.cut || dependency.operation != getter.installed.get.cut.operation || dependency.invalid || dependency.projectionPending || !facts[actor].staged.ready || dependency.consumed != work.stagedRevisions[actor] {
		return delta, nil, false
	}
	population := facts[actor].staged.mutationBody
	if population.declaration != getter.declaration || population.generation != work.operationGeneration {
		return delta, nil, false
	}
	complete := population.complete
	delta.required = appendEntryLawRequirement(delta.required, getter.demand.request)
	covered := make(map[*ast.Node]bool)
	var forwards []sourceStagedFieldForward
	for _, template := range facts[actor].staged.mutationWriters {
		if template.generation != work.operationGeneration || template.region != getter.declaration {
			complete = false
			continue
		}
		request := installedMutationRHSRequest(getter.demand.request, template, getter.inputs)
		rhs, applied := work.installedMutationRHSData(request)
		description := work.operationRecipes[request.producer].installedMutationRHS
		if description == nil || !validInstalledMutationRHSRecipe(work.operationRecipes[request.producer]) || description.template.write != template.write || description.binding != getter.inputs || !sameOperationRequest(description.parent, getter.demand.request) {
			complete = false
			continue
		}
		delta.required = appendEntryLawRequirement(delta.required, request)
		if !applied {
			complete = false
			continue
		}
		possible, represented := mutationWriterMaySupplyField(description, field)
		complete = complete && represented && rhs.extracted
		covered[template.write] = represented && rhs.extracted
		if !possible {
			continue
		}
		for _, alternative := range rhs.exposures {
			delta.exposures = append(delta.exposures, alternative)
			forwards = append(forwards, sourceStagedFieldForward{request: request, alternative: alternative, mutationRHS: cloneInstalledMutationRHS(description)})
		}
	}
	// The canonical transfer table belongs to this exact real Get/BODY edge.
	// Its pending and known arms coexist. A pending arm is never a terminal.
	transfers := facts[consumer].staged.mutationTransfers[getter.edge]
	keys := make([]string, 0, len(transfers))
	for key := range transfers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		transfer := transfers[key]
		matching, classified := work.relativeMutationTransferProjection(transfer, field)
		if !classified {
			complete = false
			continue
		}
		if !matching {
			continue // Another field specialization supplies neither debt nor BODY coverage here.
		}
		complete = complete && transfer.represented && transfer.pending == nil
		if transfer.pending != nil {
			for _, required := range transfer.pending.required {
				delta.required = appendEntryLawRequirement(delta.required, required)
			}
		}
		for _, effect := range transfer.sources {
			m := effect.relativeMutation
			if m == nil || !work.relativeFieldMutationSourceCurrent(m) {
				complete = false
				continue
			}
			for _, required := range m.required {
				delta.required = appendEntryLawRequirement(delta.required, required)
			}
			if !sameOperationRequest(m.field, field) {
				complete = false
				continue
			}
			delta.residuals = append(delta.residuals, sourceStagedOperationResidual{operation: getter.demand.request.producer.operation, mutation: cloneRelativeFieldMutation(m)})
			if m.external != nil {
				covered[m.external.operation] = transfer.represented
			} else {
				covered[m.native.request.producer.operation] = transfer.represented
			}
		}
	}
	for _, operation := range population.operations {
		// A Call's mutation output needs its own complete projection contract. One
		// transferred atom cannot prove that all of a called BODY is represented.
		if operation.kind == originalMutationBodyCall || operation.kind == originalMutationBodyUnsupported || !covered[operation.node] {
			complete = false
		}
	}
	delta.extracted = complete
	return delta, forwards, complete
}
