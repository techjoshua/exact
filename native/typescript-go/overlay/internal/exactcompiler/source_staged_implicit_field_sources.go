package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

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
	implicitFieldMappingForeignCalleeLookup
	implicitFieldMappingForeignCreate
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

// sourceStagedNativeFieldGet is a passive, purpose-specific SOURCE reading.
// Both declaration identities and cuts survive; no query or graph receipt does.
// Get and nominal Create purposes retain their original publishers and phase debts.
type sourceStagedNativeFieldGet struct {
	nominalCreate bool // Separate conditional action SOURCE purpose; no output identity.
	source, field sourceStagedOperationRequest
	get, method   *ast.Node
	cut           sourceRelativeCut
	generation    *projectGeneration
}

func nativeFieldGetRequest(h *sourceStagedNativeFieldGet) sourceStagedOperationRequest {
	r := h.field
	r.producer.selector = sourceStagedOperationSelector{occurrence: h.field.producer.selector.occurrence, association: h.get, field: "field-prototype-native-callee-get"}
	r.reading = h.field.producer
	if h.nominalCreate {
		r.producer.selector.field = "field-prototype-native-create"
		r.edge += ":native-create:" + h.source.edge
	} else {
		r.edge += ":native-callee-get:" + h.source.edge
	}
	// Both task and subscriber identities retain the canonical field role.
	role := fmt.Sprintf("%#v", h.field.producer)
	r.producer.selector.field += ":" + role
	r.edge += ":" + role
	return r
}

func nativeFieldGetReading(h *sourceStagedNativeFieldGet, source *sourceStagedNativeGetSource) sourceStagedOperationRequest {
	r := nativeRootDebtRequest(source, "callee-get")
	reader := nativeFieldGetRequest(h)
	r.consumer, r.reading, r.edge = reader.consumer, reader.producer, reader.edge+":source"
	return r
}

// nativeFieldCreateReading preserves the original phase's producer/cut. Only
// this exact SOURCE purpose may subscribe; it grants no invocation or DATA.
func nativeFieldCreateReading(h *sourceStagedNativeFieldGet, source *sourceStagedNativeGetSource, role string) sourceStagedOperationRequest {
	r := nativeRootDebtRequest(source, role)
	reader := nativeFieldGetRequest(h)
	r.consumer, r.reading, r.edge = reader.consumer, reader.producer, reader.edge+":"+role
	return r
}

func validNativeFieldGetRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	if s == nil || s.nativeFieldGet == nil {
		return false
	}
	h := s.nativeFieldGet
	parent, ok := fieldSourceParent(h.field)
	roles, _ := fieldSourceRequests(parent)
	if !ok || parent.producer.kind != relativeDemandEffects || !sameOperationRequest(h.field, roles.prototype) || h.field.inputs != nil || h.field.consumer != h.field.producer.declaration {
		return false
	}
	if h.generation == nil || s.generation != h.generation || h.source.consumer == h.field.consumer || h.source.consumer != h.source.producer.declaration || h.source.inputs != nil {
		return false
	}
	if h.get == nil || !ast.IsCallExpression(h.source.producer.operation) || h.source.producer.operation.Expression() != h.get || !sourceStagedOccurrenceOwned(h.get, h.source.producer.declaration) || h.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(h.method)) {
		return false
	}
	if h.cut.operation != parent.producer.operation || !sameOperationRequest(s.parent, h.field) || !sameOperationRequest(s.request, nativeFieldGetRequest(h)) || recipe.key != s.request.producer {
		return false
	}
	source := &sourceStagedNativeGetSource{request: h.source, get: h.get}
	required := recipe.delta.required
	matched := len(required) == 1 && sameOperationRequest(required[0], nativeFieldGetReading(h, source))
	if h.nominalCreate {
		get := *h
		get.nominalCreate = false
		matched = len(required) == 3 && sameOperationRequest(required[0], nativeFieldGetRequest(&get)) && sameOperationRequest(required[1], nativeFieldCreateReading(h, source, "eager-inputs")) && sameOperationRequest(required[2], nativeFieldCreateReading(h, source, "algorithm"))
	}
	return matched &&
		recipe.nativeGet == nil && s.call == nil && s.getPreparation == nil && s.getEffects == nil && s.coverage == nil &&
		len(recipe.delta.effects)+len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) == 0
}

// nativeFieldGetSource validates immutable provenance, independently of whether
// the genuine producer has run. This never acquires the producer's Get again.
func (work *callableEffectWork) nativeFieldGetSource(recipe sourceStagedOperationRecipe) *sourceStagedNativeGetSource {
	if !validNativeFieldGetRecipe(recipe) {
		return nil
	}
	h := recipe.memberSource.nativeFieldGet
	if prior, exists := work.operationRecipes[recipe.key]; exists && (prior.memberSource == nil || prior.memberSource.nativeFieldGet == nil || *prior.memberSource.nativeFieldGet != *h) {
		return nil
	}
	source := work.operationRecipes[h.source.producer].nativeGet
	reader := work.operationRecipes[h.field.producer]
	if h.generation != work.operationGeneration || !h.generation.active || h.generation.program == nil || h.generation.project == nil || h.generation.project.activeGeneration != h.generation {
		return nil
	}
	producerFile, readerFile := ast.GetSourceFileOfNode(h.get), ast.GetSourceFileOfNode(h.field.producer.operation)
	if h.generation.program.GetSourceFile(producerFile.FileName()) != producerFile || h.generation.program.GetSourceFile(readerFile.FileName()) != readerFile {
		return nil
	}
	if source == nil || (source.kind != sourceNativeObjectCreate && source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectDefineProperty) || !sameOperationRequest(source.request, h.source) || source.get != h.get || source.method != h.method || !validNativeGetRequest(reader, h.field) || h.nominalCreate && (source.kind != sourceNativeObjectCreate || reader.nativeGet == nil || !ast.IsObjectLiteralExpression(reader.nativeGet.descriptorGet)) {
		return nil
	}
	callee := work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer]
	if !validNativeGetRecipe(callee) || !sameNativeGetSource(callee.nativeGet, source) {
		return nil
	}
	if h.nominalCreate {
		for _, role := range []string{"eager-inputs", "algorithm"} {
			r := nativeRootDebtRequest(source, role)
			phase := work.operationRecipes[r.producer]
			if !validNativeGetRequest(phase, r) || !sameNativeGetSource(phase.nativeGet, source) {
				return nil // Unissued/foreign factories stay unmapped, never an invalid synthetic debt.
			}
		}
	}
	return source
}

func (work *callableEffectWork) validNativeFieldGetReading(producer sourceStagedOperationRecipe, reading sourceStagedOperationRequest) bool {
	reader := work.operationRecipes[reading.reading]
	source := work.nativeFieldGetSource(reader)
	return source != nil && !reader.memberSource.nativeFieldGet.nominalCreate && validNativeGetRecipe(producer) && sameNativeGetSource(producer.nativeGet, source) && producer.key == nativeRootDebtRequest(source, "callee-get").producer && sameOperationRequest(reading, nativeFieldGetReading(reader.memberSource.nativeFieldGet, source))
}

func (work *callableEffectWork) validNativeFieldCreateReading(producer sourceStagedOperationRecipe, reading sourceStagedOperationRequest) bool {
	reader := work.operationRecipes[reading.reading]
	source := work.nativeFieldGetSource(reader)
	if source == nil || !reader.memberSource.nativeFieldGet.nominalCreate || !validNativeGetRecipe(producer) || !sameNativeGetSource(producer.nativeGet, source) {
		return false
	}
	for _, role := range []string{"eager-inputs", "algorithm"} {
		if producer.key == nativeRootDebtRequest(source, role).producer && sameOperationRequest(reading, nativeFieldCreateReading(reader.memberSource.nativeFieldGet, source, role)) {
			return true
		}
	}
	return false
}

// enrollNativeFieldGet runs only in the original field service, before its
// source membership is sealed. An absent producer remains unmapped; this does
// not create a native factory or promise a replay when one appears later.
func (work *callableEffectWork) enrollNativeFieldGet(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, field sourceStagedOperationRequest, source *sourceStagedNativeGetSource, nominalCreate bool) (sourceStagedOperationRequest, bool) {
	if !q.liveStagedFieldGet(get) || source == nil || (source.kind != sourceNativeObjectCreate && source.kind != sourceNativeObjectFreeze && source.kind != sourceNativeObjectDefineProperty) || get.operation != demand.request.producer.operation || get.receiver.node != demand.receiver.expression {
		return sourceStagedOperationRequest{}, false
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, q.executable)
	if !issued || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return sourceStagedOperationRequest{}, false
	}
	parent, valid := fieldSourceParent(field)
	if !valid || !sameOperationRequest(parent, current.request) || get.propertyKey != parent.producer.selector.field {
		return sourceStagedOperationRequest{}, false
	}
	h := &sourceStagedNativeFieldGet{nominalCreate: nominalCreate, source: source.request, field: field, get: source.get, method: source.method, cut: get.stagedEffects.cut, generation: work.operationGeneration}
	request := nativeFieldGetRequest(h)
	if prior, exists := work.operationRecipes[request.producer]; exists {
		return request, work.nativeFieldGetSource(prior) != nil && *prior.memberSource.nativeFieldGet == *h
	}
	var required []sourceStagedOperationRequest
	if nominalCreate {
		getRequest, issued := work.enrollNativeFieldGet(facts, demand, q, get, field, source, false)
		if !issued {
			return sourceStagedOperationRequest{}, false
		}
		required = []sourceStagedOperationRequest{getRequest, nativeFieldCreateReading(h, source, "eager-inputs"), nativeFieldCreateReading(h, source, "algorithm")}
	} else {
		required = []sourceStagedOperationRequest{nativeFieldGetReading(h, source)}
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, memberSource: &sourceStagedMemberSource{nativeFieldGet: h, request: request, parent: field, generation: h.generation}, delta: sourceStagedOperationDelta{required: required}}
	if work.nativeFieldGetSource(recipe) == nil || !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationRequest{}, false
	}
	return request, true
}

// nativeFieldGetCurrent accounts only for this Get's implicit work. Unknown
// alternatives, user entry or unobserved/source-stale reads stay pending even
// when an empty prefix has already been delivered. It grants no Call Effects.
func (work *callableEffectWork) nativeFieldGetCurrent(recipe sourceStagedOperationRecipe) bool {
	registered, exists := work.operationRecipes[recipe.key]
	source := work.nativeFieldGetSource(recipe)
	if !exists || registered.memberSource == nil || source == nil || recipe.memberSource.nativeFieldGet.nominalCreate || !work.nativeEffectsGetCurrent(source) {
		return false
	}
	proof := work.currentNativeCalleeEffects(source)
	if proof == nil || !proof.noUserEntry {
		return false
	}
	r := recipe.delta.required[0]
	id := work.operationIDs[r.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	return !state.invalid && state.dependenciesRegistered && state.revision != 0 && sub != nil && !sub.blocked && sameOperationRequest(sub.request, r) && sub.consumed == state.revision && sub.applied == state.revision
}

// nativeFieldSourceCurrent keeps the two purposes distinct. A Create view
// consumes original phase publications, never a cached shape or normal result.
func (work *callableEffectWork) nativeFieldSourceCurrent(recipe sourceStagedOperationRecipe) bool {
	if recipe.memberSource == nil || recipe.memberSource.nativeFieldGet == nil {
		return false
	}
	if !recipe.memberSource.nativeFieldGet.nominalCreate {
		return work.nativeFieldGetCurrent(recipe)
	}
	if work.nativeFieldGetSource(recipe) == nil || !work.nativeFieldGetCurrent(work.operationRecipes[recipe.delta.required[0].producer]) {
		return false
	}
	for _, r := range recipe.delta.required {
		if !work.nativeWriterCapabilityApplied(r) {
			return false
		}
	}
	for _, r := range recipe.delta.required[1:] {
		phase := work.operationRecipes[r.producer]
		n := phase.nativeGet
		state := &work.operations[work.operationIDs[r.producer].index]
		if !work.validNativeFieldCreateReading(phase, r) || !operationDeltaPrefix(state.delta, phase.delta) || !operationDeltaPrefix(phase.delta, state.delta) || n.input == nil || n.prototype == nil || !n.inputEffects || !sameOperationEndpoint(n.prototype.input, n.input.input) || !work.currentNativeOrdinaryInputResult(n) {
			return false
		}
	}
	return true
}

// prepareNativeFieldGet consumes only delivered SOURCE provenance. Existing
// dependency notifications resume this child, never the field/query/mapper.
func (work *callableEffectWork) prepareNativeFieldGet(facts []callableFacts, id sourceStagedOperationID) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	work.attachSourceObservationDependencies(facts, id)
	work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
	if !work.nativeFieldSourceCurrent(recipe) {
		return
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.extracted = true
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}
