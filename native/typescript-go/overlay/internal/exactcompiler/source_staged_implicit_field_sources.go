package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Kinds identify the semantic branch that actually produced the existing
// source delta. They are not NoWrites certificates. In particular, the native
// definition kind excludes only its nominal target write; its complete implicit
// map/entry/field/input set remains independently required.
type sourceStagedImplicitFieldMappingKind uint8

const (
	implicitFieldMappingUnclassified sourceStagedImplicitFieldMappingKind = iota
	implicitFieldMappingCalleeLookup
	implicitFieldMappingOriginalDefinition
	implicitFieldMappingOrdinaryNativeAlgorithm
	implicitFieldMappingDeclaredBody
)

type sourceStagedImplicitFieldMapping struct {
	operation, region *ast.Node
	kind              sourceStagedImplicitFieldMappingKind
	original          sourceStagedOperationRequest
	mapped            bool
	required          []sourceStagedOperationRequest
}

// Accounted denotes complete source mapping, not empty effects/implicit writers,
// selected presence or child closure. Unclassified/body entries stay explicit.
type sourceStagedImplicitFieldSources struct {
	request    sourceStagedOperationRequest
	generation *projectGeneration
	epoch      *sourceStagedOperationEpoch
	accounted  bool
	required   []sourceStagedOperationRequest
	mappings   []sourceStagedImplicitFieldMapping
}

func sameImplicitFieldSources(a, b *sourceStagedImplicitFieldSources) bool {
	if a == nil || b == nil {
		return a == b
	}
	if !sameOperationRequest(a.request, b.request) || a.generation != b.generation || a.epoch != b.epoch || a.accounted != b.accounted || len(a.mappings) != len(b.mappings) || !operationPrefix(a.required, b.required, sameOperationRequest) || !operationPrefix(b.required, a.required, sameOperationRequest) {
		return false
	}
	for i, x := range a.mappings {
		y := b.mappings[i]
		if x.operation != y.operation || x.region != y.region || x.kind != y.kind || x.mapped != y.mapped || !sameOperationRequest(x.original, y.original) || !operationPrefix(x.required, y.required, sameOperationRequest) || !operationPrefix(y.required, x.required, sameOperationRequest) {
			return false
		}
	}
	return true
}

// recordImplicitFieldSources accepts only the live work publisher's actual
// mapped population. It records on the existing observation and uses the exact
// role's existing notification path. No source query or source-index lease lives
// in this snapshot, and no actual field/primitive observation is manufactured.
func (work *callableEffectWork) recordImplicitFieldSources(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, request sourceStagedOperationRequest, delta sourceStagedOperationDelta, mappings []sourceStagedImplicitFieldMapping) {
	state, owned := work.implicitFieldObservationState(facts, q, get)
	if !owned || get.stagedEffects.argumentEpoch != work.operationEpoch {
		return
	}
	roles, valid := fieldSourceRequests(get.stagedEffects.request)
	if !valid {
		return
	}
	var slot **sourceStagedImplicitFieldSources
	if sameOperationRequest(request, roles.ownWriters) {
		slot = &state.implicitField.ownSources
	} else if sameOperationRequest(request, roles.prototype) {
		slot = &state.implicitField.prototypeSources
	} else {
		return
	}
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	producer := &work.operations[id.index]
	recipe := work.operationRecipes[producer.key]
	if producer.invalid || !producer.dependenciesRegistered || !validNativeGetRequest(recipe, request) || !operationPrefix(delta.required, recipe.delta.required, sameOperationRequest) {
		return
	}
	observed := &sourceStagedImplicitFieldSources{request: request, generation: work.operationGeneration, epoch: work.operationEpoch, accounted: delta.extracted, required: cloneOperationDelta(sourceStagedOperationDelta{required: delta.required}).required}
	for _, mapping := range mappings {
		copy := mapping
		copy.required = append([]sourceStagedOperationRequest(nil), mapping.required...)
		observed.mappings = append(observed.mappings, copy)
	}
	if sameImplicitFieldSources(*slot, observed) {
		return
	}
	*slot = observed
	// A real mapping event can add semantic information with unchanged Effects.
	// Repeated identical observations do not create revisions or delivery loops.
	producer.revision++
	work.notifyOperationSubscribers(producer)
}
