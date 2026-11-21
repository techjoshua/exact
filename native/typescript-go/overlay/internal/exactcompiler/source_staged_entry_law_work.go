package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type sourceStagedEntryLawKind uint8

const (
	stagedEntryLawMapEnumeration sourceStagedEntryLawKind = iota + 1
	stagedEntryLawMapGet
	stagedEntryLawMapConversion
	stagedEntryLawFieldHas
	stagedEntryLawFieldGet
	stagedEntryLawNativeGet
	stagedEntryLawNativeAlgorithm
	stagedEntryLawConstruction
	stagedEntryLawFieldNoMutation
)

// This immutable plan names an original implicit protocol contribution. A plan
// has no positive disposition. Only its current graph's original-owner event
// can supply one, with every predecessor and source relationship retained.
type sourceStagedEntryLawSource struct {
	request, base sourceStagedOperationRequest
	kind          sourceStagedEntryLawKind
	receiver      sourceRelativeEndpoint
	entry         *sourceStagedMapEntry
}

// The existing graph observation map also hosts primitive input observations
// at their REAL eager-operation key. Such a slot has source==nil and no law,
// prefix or factory authority; module law slots retain their independent source.
type sourceStagedEntryLawReceipt struct {
	nativeEagerOwner sourceStagedOperationRequest
	nativeEager      *sourceStagedNativeEagerWitness // Graph-local original selected-input -> SAME complete admitted Get.
	exclusions       []sourceStagedEntryLawCandidateExclusion
	source           *sourceStagedEntryLawSource
	cut              sourceRelativeCut
	generation       *projectGeneration
	laws             uint8
	prefix           *sourceStagedModuleActivation
	issuer           *sourceStagedEntryLawIssuer
	imports          []sourceStagedActivationImport
}

type sourceStagedEntryLawIssuer struct {
	proof *sourceStagedEntryLawReceipt
	epoch *sourceStagedOperationEpoch
}

func stagedEntryLawRequest(base sourceStagedOperationRequest, kind sourceStagedEntryLawKind) (sourceStagedOperationRequest, bool) {
	if base.inputs != nil || base.producer.kind != relativeDemandEffects || base.producer.operation == nil || base.consumer != base.producer.declaration || base.use != base.producer.operation || base.cut != (sourceRelativeCut{operation: base.use, use: base.use, reading: base.use}) {
		return sourceStagedOperationRequest{}, false
	}
	role := ""
	switch kind {
	case stagedEntryLawMapEnumeration:
		if base.producer.selector.field != "descriptor-map" {
			return sourceStagedOperationRequest{}, false
		}
		role = "map-enumeration"
	case stagedEntryLawMapGet, stagedEntryLawMapConversion:
		if base.producer.selector.field != "descriptor-entry-get" {
			return sourceStagedOperationRequest{}, false
		}
		role = "entry-get"
		if kind == stagedEntryLawMapConversion {
			role = "entry-conversion"
		}
	case stagedEntryLawFieldHas, stagedEntryLawFieldGet:
		if _, valid := fieldSourceRequests(base); !valid {
			return sourceStagedOperationRequest{}, false
		}
		role = "has:" + base.producer.selector.field
		if kind == stagedEntryLawFieldGet {
			role = "get:" + base.producer.selector.field
		}
	case stagedEntryLawFieldNoMutation:
		if _, valid := fieldSourceRequests(base); !valid {
			return sourceStagedOperationRequest{}, false
		}
		request := base
		request.producer.selector.field = "descriptor-no-mutation:" + base.producer.selector.field
		request.edge += ":" + request.producer.selector.field
		return request, true
	case stagedEntryLawConstruction:
		if !ast.IsNewExpression(base.producer.operation) || base.producer.selector != (sourceStagedOperationSelector{}) {
			return sourceStagedOperationRequest{}, false
		}
		role = "construction"
	case stagedEntryLawNativeAlgorithm:
		if base.producer.selector.field != "algorithm" {
			return sourceStagedOperationRequest{}, false
		}
		role = "native-algorithm"
	case stagedEntryLawNativeGet:
		if base.producer.selector.field != "callee-get" {
			return sourceStagedOperationRequest{}, false
		}
		role = "native-get"
	default:
		return sourceStagedOperationRequest{}, false
	}
	request := base
	request.producer.selector.field = "no-user-entry:" + role
	request.edge += ":no-user-entry:" + role
	return request, true
}

func validStagedEntryLawRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.entryLaw
	if source == nil || recipe.nativeGet != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructed != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || recipe.delta.extracted || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects)+len(recipe.delta.residuals) != 0 {
		return false
	}
	expected, valid := stagedEntryLawRequest(source.base, source.kind)
	if !valid || !sameOperationRequest(expected, source.request) || recipe.key != expected.producer || source.receiver.kind != relativeEndpointExpression || source.receiver.expression == nil || !sourceStagedOccurrenceOwned(source.base.producer.operation, source.base.consumer) {
		return false
	}
	for _, required := range recipe.delta.required {
		if required.producer.kind != relativeDemandEffects || required.consumer != required.producer.declaration || required.inputs != nil || required.use != required.producer.operation || required.cut != (sourceRelativeCut{operation: required.use, use: required.use, reading: required.use}) {
			return false
		}
	}
	if (source.kind == stagedEntryLawNativeGet || source.kind == stagedEntryLawFieldNoMutation) && (len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], source.base)) {
		return false
	}
	mapEntry := source.kind == stagedEntryLawMapGet || source.kind == stagedEntryLawMapConversion
	if mapEntry {
		entry := source.entry
		if entry == nil || entry.member == nil || !sameOperationRequest(stagedMapEntrySourceRequest(*entry), source.base) || entry.group != source.receiver.expression || entry.member.Parent != entry.group {
			return false
		}
		if source.kind == stagedEntryLawMapConversion && len(recipe.delta.required) != 0 {
			get, valid := stagedEntryLawRequest(source.base, stagedEntryLawMapGet)
			if !valid || len(recipe.delta.required) != 1+len(reflectiveDescriptorKeys) || !sameOperationRequest(recipe.delta.required[0], get) {
				return false
			}
			for index, field := range reflectiveDescriptorKeys {
				base := stagedMapEntryFieldRequest(&sourceStagedMapEntryContribution{request: source.base, entry: *entry}, field)
				expected, valid := stagedEntryLawRequest(base, stagedEntryLawFieldGet)
				if !valid || !sameOperationRequest(recipe.delta.required[index+1], expected) {
					return false
				}
			}
		}
	} else if source.entry != nil {
		return false
	}
	return true
}

func sameStagedEntryLawSource(a, b *sourceStagedEntryLawSource) bool {
	return a == b || a != nil && b != nil && a.kind == b.kind && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.base, b.base) && sameOperationEndpoint(a.receiver, b.receiver) && (a.entry == nil && b.entry == nil || a.entry != nil && b.entry != nil && sameStagedMapEntry(*a.entry, *b.entry))
}

func cloneStagedEntryLawSource(source *sourceStagedEntryLawSource) *sourceStagedEntryLawSource {
	if source == nil {
		return nil
	}
	copy := *source
	copy.receiver = cloneSourceRelativeEndpoint(source.receiver)
	if source.entry != nil {
		entry := cloneStagedMapEntry(*source.entry)
		copy.entry = &entry
	}
	return &copy
}

func (work *callableEffectWork) registerEntryLawSource(facts []callableFacts, base sourceStagedOperationRequest, receiver sourceRelativeEndpoint, kind sourceStagedEntryLawKind, entry ...sourceStagedMapEntry) (sourceStagedOperationRequest, bool) {
	request, valid := stagedEntryLawRequest(base, kind)
	if !valid {
		return sourceStagedOperationRequest{}, false
	}
	plan := &sourceStagedEntryLawSource{request: request, base: base, kind: kind, receiver: cloneSourceRelativeEndpoint(receiver)}
	if len(entry) == 1 {
		copy := cloneStagedMapEntry(entry[0])
		plan.entry = &copy
	}
	recipe := sourceStagedOperationRecipe{key: request.producer, entryLaw: plan}
	if kind == stagedEntryLawNativeGet || kind == stagedEntryLawFieldNoMutation {
		recipe.delta.required = []sourceStagedOperationRequest{base}
	}
	return request, work.registerOperationSourcePrefix(facts, recipe)
}

// All blueprints precede observation and required membership. They are not
// ordinary uses, source dispositions or permission to evaluate any body.
func (work *callableEffectWork) registerFieldEntryLawSources(facts []callableFacts, source *sourceStagedNativeGetSource) bool {
	if source == nil {
		return false
	}
	if source.descriptorEntry != nil {
		for _, recipe := range work.operationRecipes {
			if entry := recipe.mapEntry; entry != nil && recipe.key == entry.request.producer && sameNativeGetSource(entry.source, source) {
				if !work.registerMapEntryLawSources(facts, entry) {
					return false
				}
			}
		}
		return true
	}
	for _, field := range reflectiveDescriptorKeys {
		base := nativeDescriptorFieldRequest(source, field)
		receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.descriptorGet, producer: source.request.producer.operation, get: source.descriptorGet, cut: base.cut}
		get, _ := stagedEntryLawRequest(base, stagedEntryLawFieldGet)
		if work.operationRecipes[get.producer].entryLaw == nil && nativeDescriptorGetterMutationEligible(source, field) {
			if _, registered := work.registerEntryLawSource(facts, base, receiver, stagedEntryLawFieldNoMutation); !registered {
				return false
			}
		}
		for _, kind := range []sourceStagedEntryLawKind{stagedEntryLawFieldHas, stagedEntryLawFieldGet} {
			if _, registered := work.registerEntryLawSource(facts, base, receiver, kind); !registered {
				return false
			}
		}
	}
	return true
}

func (work *callableEffectWork) registerMapEntryLawSources(facts []callableFacts, entry *sourceStagedMapEntryContribution) bool {
	if entry == nil || entry.source == nil {
		return false
	}
	for _, kind := range []sourceStagedEntryLawKind{stagedEntryLawMapGet, stagedEntryLawMapConversion} {
		if _, registered := work.registerEntryLawSource(facts, entry.request, entry.entry.receiver, kind, entry.entry); !registered {
			return false
		}
	}
	for _, field := range reflectiveDescriptorKeys {
		for _, kind := range []sourceStagedEntryLawKind{stagedEntryLawFieldHas, stagedEntryLawFieldGet} {
			receiver := entry.entry.descriptor
			if receiver.expression == nil {
				receiver = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: entry.entry.member, producer: entry.request.producer.operation, cut: entry.request.cut}
			}
			if _, registered := work.registerEntryLawSource(facts, stagedMapEntryFieldRequest(entry, field), receiver, kind); !registered {
				return false
			}
		}
	}
	return true
}

func appendEntryLawRequirement(required []sourceStagedOperationRequest, request sourceStagedOperationRequest) []sourceStagedOperationRequest {
	for _, prior := range required {
		if sameOperationRequest(prior, request) {
			return required
		}
	}
	return append(required, request)
}

// The fixed six-field order comes from the native conversion owner. Until an
// OwnKeys order producer supplies a smaller MAY predecessor set, other entries
// remain possible predecessors. This records source dependencies, not a key
// table, runtime ordering certificate or property identity.
func (work *callableEffectWork) fieldEntryLawPredecessors(source *sourceStagedNativeGetSource, field sourceStagedOperationRequest, phase sourceStagedFieldObservationPhase) ([]sourceStagedOperationRequest, bool) {
	var required []sourceStagedOperationRequest
	appendLaw := func(base sourceStagedOperationRequest, kind sourceStagedEntryLawKind) bool {
		request, valid := stagedEntryLawRequest(base, kind)
		if !valid || !validStagedEntryLawRecipe(work.operationRecipes[request.producer]) {
			return false
		}
		required = appendEntryLawRequirement(required, request)
		return true
	}
	if source.descriptorEntry != nil {
		entry := source.descriptorEntry
		if !appendLaw(source.descriptorMap.protocol, stagedEntryLawMapEnumeration) || !appendLaw(entry.request, stagedEntryLawMapGet) {
			return nil, false
		}
		for _, recipe := range work.operationRecipes {
			other := recipe.mapEntry
			if other == nil || recipe.key != other.request.producer || other.entry.member == entry.entry.member || !sameNativeGetSource(other.source, source) {
				continue
			}
			if !appendLaw(other.request, stagedEntryLawMapConversion) {
				return nil, false
			}
		}
	}
	if phase == stagedFieldObservationGet {
		if !appendLaw(field, stagedEntryLawFieldHas) {
			return nil, false
		}
	} else {
		index := stagedDescriptorFieldIndex(field.producer.selector.field)
		if index < 0 {
			return nil, false
		}
		if index != 0 {
			previous := nativeDescriptorFieldRequest(source, reflectiveDescriptorKeys[index-1])
			kind := stagedEntryLawFieldGet
			if work.descriptorFieldMutationLawDescribed(previous) {
				kind = stagedEntryLawFieldNoMutation
			}
			if !appendLaw(previous, kind) {
				return nil, false
			}
		}
	}
	return required, true
}

func (work *callableEffectWork) attachEntryLawRequirements(facts []callableFacts, request sourceStagedOperationRequest, required []sourceStagedOperationRequest, adopt ...bool) bool {
	recipe := work.operationRecipes[request.producer]
	if !validStagedEntryLawRecipe(recipe) || !sameOperationRequest(recipe.entryLaw.request, request) {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	for _, child := range required {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, child)
	}
	if !work.attachOperationSource(facts, recipe) {
		return false
	}
	if len(adopt) == 1 && !adopt[0] {
		return true
	}
	_, requiredOK := work.requireOperation(facts, request)
	return requiredOK
}

func (work *callableEffectWork) recordFieldEntryLaw(facts []callableFacts, query *sourceValueQuery, get *sourceGetInputs, law sourceStagedFieldEntryLaw) bool {
	if !query.liveStagedFieldGet(get) {
		return false
	}
	borrow := get.stagedEffects
	event := borrow.noUserPublication
	if event == nil || event.get != get || event.law != law || borrow.observation == nil || borrow.generation != work.operationGeneration {
		return false
	}
	kind := stagedEntryLawFieldHas
	if borrow.observation.phase == stagedFieldObservationGet && !get.hasOnly && (law == stagedFieldOwnDataNoUserEntry || law == stagedFieldIntrinsicGetNoUserEntry) {
		kind = stagedEntryLawFieldGet
	} else if borrow.observation.phase != stagedFieldObservationHas || !get.hasOnly || law != stagedFieldOrdinaryHasNoUserEntry {
		return false
	}
	request, valid := stagedEntryLawRequest(borrow.request, kind)
	plan := work.operationRecipes[request.producer].entryLaw
	if !valid || plan == nil || !sameOperationRequest(plan.request, request) || plan.receiver.expression != get.receiver.node {
		return false
	}
	if work.entryLawReceipts == nil {
		work.entryLawReceipts = make(map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt)
	}
	proof := work.entryLawReceipts[request.producer]
	if proof == nil {
		proof = &sourceStagedEntryLawReceipt{source: cloneStagedEntryLawSource(plan), cut: borrow.cut, generation: borrow.generation}
		proof.issuer = &sourceStagedEntryLawIssuer{proof: proof, epoch: work.operationEpoch}
		work.entryLawReceipts[request.producer] = proof
	}
	if proof.generation != borrow.generation || proof.cut != borrow.cut || !sameStagedEntryLawSource(proof.source, plan) {
		return false
	}
	proof.laws |= 1 << law
	work.entryLawModuleSourceChanged(request)
	return true
}

func (work *callableEffectWork) admitStagedMapEntryMemberSources(facts []callableFacts, query *sourceValueQuery) bool {
	member := query.stagedMember
	if member == nil || !query.liveStagedMapEntryMemberSource(member.get) || !query.liveStagedMemberSource(member, member.get, member.read) || member.mode != accessorAcquire || member.disposition == nil || member.coverage == nil {
		return false
	}
	read, coverage := query.stagedMap.currentRead, member.coverage
	if !sameOperationRequest(coverage.request, stagedMemberCoverageRequest(read.request, read.entry.group, read.entry.cut)) || coverage.generation != work.operationGeneration || work.memberCoverageObserved[coverage.request.producer] != work.operationGeneration {
		return false
	}
	recipe := work.operationRecipes[read.request.producer]
	if !validStagedMapEntryRecipe(recipe) || !sameOperationRequest(recipe.mapEntry.request, read.request) {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, coverage.request)
	if !work.attachOperationSource(facts, recipe) || !query.liveStagedMapEntryMemberSource(member.get) {
		return false
	}
	work.attachMapEntryLawPrefix(facts, query, coverage.request)
	return true
}

func (work *callableEffectWork) rememberEntryLawPrefix(request sourceStagedOperationRequest, cut sourceRelativeCut, prefix *sourceStagedModuleActivation, imports []sourceStagedActivationImport) {
	plan := work.operationRecipes[request.producer].entryLaw
	if plan == nil || prefix == nil || prefix.source.cut != cut || prefix.source.generation != work.operationGeneration {
		return
	}
	if work.entryLawReceipts == nil {
		work.entryLawReceipts = make(map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt)
	}
	proof := work.entryLawReceipts[request.producer]
	if proof == nil {
		proof = &sourceStagedEntryLawReceipt{source: cloneStagedEntryLawSource(plan), cut: cut, generation: work.operationGeneration}
		proof.issuer = &sourceStagedEntryLawIssuer{proof: proof, epoch: work.operationEpoch}
		work.entryLawReceipts[request.producer] = proof
	}
	if proof.cut != cut || proof.generation != work.operationGeneration || !sameStagedEntryLawSource(proof.source, plan) {
		return
	}
	detached := *prefix
	detached.required = cloneOperationDelta(sourceStagedOperationDelta{required: prefix.required}).required
	proof.prefix = &detached
	proof.imports = append([]sourceStagedActivationImport(nil), imports...)
	work.entryLawModuleSourceChanged(request)
}

func (work *callableEffectWork) attachFieldEntryLawPrefix(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, coverage sourceStagedOperationRequest) {
	borrow, member := get.stagedEffects, query.stagedMember
	if !query.liveStagedFieldMemberSource(get) || member == nil || member.disposition == nil {
		return
	}
	source := work.operationRecipes[demand.request.producer].nativeGet
	phase := borrow.observation.phase
	kind := stagedEntryLawFieldHas
	if phase == stagedFieldObservationGet {
		kind = stagedEntryLawFieldGet
	}
	request, valid := stagedEntryLawRequest(demand.request, kind)
	previous, supported := work.fieldEntryLawPredecessors(source, demand.request, phase)
	if !valid || !supported {
		return
	}
	previous = appendEntryLawRequirement(previous, coverage)
	// An authored Get can have an ordered mutation prerequisite without
	// making NoUserEntry a required result of that Get.
	adopt := phase != stagedFieldObservationGet || !work.descriptorFieldMutationLawDescribed(demand.request)
	if !work.attachEntryLawRequirements(facts, request, previous, adopt) {
		return
	}
	work.consumeStagedModuleActivation(facts, query, get, member.read)
	if member.moduleReceipt != nil {
		work.attachEntryLawRequirements(facts, request, member.moduleReceipt.required, adopt)
	}
	work.rememberEntryLawPrefix(request, borrow.cut, member.moduleReceipt, member.moduleImports)
}

func (work *callableEffectWork) mapEntryLawPredecessors(source *sourceStagedNativeGetSource, current sourceStagedOperationRequest) ([]sourceStagedOperationRequest, bool) {
	if source == nil || source.descriptorMap == nil {
		return nil, false
	}
	enumeration, valid := stagedEntryLawRequest(source.descriptorMap.protocol, stagedEntryLawMapEnumeration)
	if !valid || !validStagedEntryLawRecipe(work.operationRecipes[enumeration.producer]) {
		return nil, false
	}
	required := []sourceStagedOperationRequest{enumeration}
	for _, recipe := range work.operationRecipes {
		other := recipe.mapEntry
		if other == nil || recipe.key != other.request.producer || sameOperationRequest(other.request, current) || !sameNativeGetSource(other.source, source) {
			continue
		}
		request, valid := stagedEntryLawRequest(other.request, stagedEntryLawMapConversion)
		if !valid || !validStagedEntryLawRecipe(work.operationRecipes[request.producer]) {
			return nil, false
		}
		required = appendEntryLawRequirement(required, request)
	}
	return required, true
}

func (work *callableEffectWork) attachMapEntryLawPrefix(facts []callableFacts, query *sourceValueQuery, coverage sourceStagedOperationRequest) {
	borrow, member := query.stagedMap, query.stagedMember
	if borrow == nil || member == nil || borrow.currentRead == nil {
		return
	}
	read := borrow.currentRead
	request, valid := stagedEntryLawRequest(read.request, stagedEntryLawMapGet)
	previous, supported := work.mapEntryLawPredecessors(borrow.source, read.request)
	if !valid || !supported {
		return
	}
	previous = appendEntryLawRequirement(previous, coverage)
	if !work.attachEntryLawRequirements(facts, request, previous) {
		return
	}
	work.consumeStagedModuleActivation(facts, query, member.get, member.read)
	if member.moduleReceipt != nil {
		work.attachEntryLawRequirements(facts, request, member.moduleReceipt.required)
	}
	work.rememberEntryLawPrefix(request, borrow.cut, member.moduleReceipt, member.moduleImports)
}

func (work *callableEffectWork) recordMapEntryLaw(facts []callableFacts, query *sourceValueQuery, get *sourceGetInputs, group *ast.Node) bool {
	if query == nil || query.stagedMap == nil || !query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
		return false
	}
	borrow := query.stagedMap
	event := borrow.noUserPublication
	if event == nil || event.get != get || event.group != group || group != borrow.receiver.expression || borrow.generation != work.operationGeneration {
		return false
	}
	kind, base := stagedEntryLawMapEnumeration, borrow.request
	if event.law == stagedMapOwnDataGetNoUserEntry {
		if borrow.currentRead == nil || !borrow.reading || query.traceModeKnown {
			return false
		}
		kind, base = stagedEntryLawMapGet, borrow.currentRead.request

	} else if event.law != stagedMapOrdinaryOwnKeysNoUserEntry || borrow.reading || !query.traceModeKnown || query.traceMode != accessorEnumerate|accessorNoGet {
		return false
	}
	request, valid := stagedEntryLawRequest(base, kind)
	plan := work.operationRecipes[request.producer].entryLaw
	if !valid || plan == nil || plan.receiver.expression != group {
		return false
	}
	if work.entryLawReceipts == nil {
		work.entryLawReceipts = make(map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt)
	}
	proof := work.entryLawReceipts[request.producer]
	if proof == nil {
		proof = &sourceStagedEntryLawReceipt{source: cloneStagedEntryLawSource(plan), cut: borrow.cut, generation: work.operationGeneration}
		proof.issuer = &sourceStagedEntryLawIssuer{proof: proof, epoch: work.operationEpoch}
		work.entryLawReceipts[request.producer] = proof
	}
	proof.laws |= 1
	work.entryLawModuleSourceChanged(request)
	if kind == stagedEntryLawMapEnumeration {
		_, required := work.requireOperation(facts, request)
		return required
	}
	conversion, valid := stagedEntryLawRequest(base, stagedEntryLawMapConversion)
	entry := work.operationRecipes[base.producer].mapEntry
	if !valid || entry == nil {
		return false
	}
	required := []sourceStagedOperationRequest{request}
	for _, field := range reflectiveDescriptorKeys {
		child, valid := stagedEntryLawRequest(stagedMapEntryFieldRequest(entry, field), stagedEntryLawFieldGet)
		if !valid {
			return false
		}
		required = append(required, child)
	}
	if !work.attachEntryLawRequirements(facts, conversion, required) {
		return false
	}
	conversionPlan := work.operationRecipes[conversion.producer].entryLaw
	composition := &sourceStagedEntryLawReceipt{source: cloneStagedEntryLawSource(conversionPlan), cut: borrow.cut, generation: work.operationGeneration, laws: 1}
	composition.issuer = &sourceStagedEntryLawIssuer{proof: composition, epoch: work.operationEpoch}
	work.entryLawReceipts[conversion.producer] = composition
	return true
}

func (work *callableEffectWork) publishEntryLawSource(id sourceStagedOperationID) bool {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	proof := work.entryLawReceipts[state.key]
	if !validStagedEntryLawRecipe(recipe) || !work.entryLawLocallyAccounted(recipe, proof) {
		return false
	}
	delta := cloneOperationDelta(recipe.delta)
	delta.extracted = true
	if operationDeltaCursor(state.delta) == operationDeltaCursor(delta) && state.delta.extracted {
		return true
	}
	state.delta = delta
	state.revision++
	work.notifyOperationSubscribers(state)
	return true
}

func (work *callableEffectWork) refreshEntryLawSources(facts []callableFacts) {
	// A passive consumer can depend on entry laws before it may adopt IDs.
	// Refine their detached prerequisites after original producer delivery too.
	var plans []sourceStagedOperationKey
	for key, recipe := range work.operationRecipes {
		if recipe.entryLaw != nil && recipe.entryLaw.kind == stagedEntryLawNativeAlgorithm {
			plans = append(plans, key)
		}
	}
	for _, key := range plans {
		work.refineNativeAlgorithmEntryLaw(facts, key)
	}
	for index := 1; index < len(work.operations); index++ {
		if work.operationRecipes[work.operations[index].key].entryLaw != nil {
			id := sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}
			work.registerNativeModuleInputs(facts, id)
			work.prepareNativeAlgorithmEntryLaw(facts, id)
			work.publishEntryLawSource(id)
		}
	}
}

func (work *callableEffectWork) nativeGetEntryLaw(facts []callableFacts, source *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	base := nativeRootDebtRequest(source, "callee-get")
	if !validNativeGetRequest(work.operationRecipes[base.producer], base) {
		return sourceStagedOperationRequest{}, false
	}
	receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: source.get, producer: source.request.producer.operation, cut: source.request.cut}
	request, registered := work.registerEntryLawSource(facts, base, receiver, stagedEntryLawNativeGet)
	return request, registered && work.attachEntryLawRequirements(facts, request, []sourceStagedOperationRequest{base}, false)
}

func (work *callableEffectWork) passiveEntryLawReady(recipe sourceStagedOperationRecipe) bool {
	return recipe.entryLaw != nil && work.entryLawLocallyAccounted(recipe, work.entryLawReceipts[recipe.key])
}

func (work *callableEffectWork) entryLawLocallyAccounted(recipe sourceStagedOperationRecipe, proof *sourceStagedEntryLawReceipt) bool {
	if !validStagedEntryLawRecipe(recipe) {
		return false
	}
	plan := recipe.entryLaw
	if plan.kind == stagedEntryLawFieldNoMutation {
		return work.currentEagerDescriptorGetterNoMutation(plan.base, plan.receiver)
	}
	if plan.kind == stagedEntryLawConstruction {
		root := work.operationRecipes[plan.base.producer]
		observation := work.constructionEffectsObserved[plan.base.producer]
		return work.passiveConstructionEffectsReady(root) && observation != nil && observation.noUserEntry && len(recipe.delta.required) == 1 && sameOperationRequest(recipe.delta.required[0], plan.base)
	}
	if plan.kind == stagedEntryLawNativeAlgorithm {
		return work.nativeAlgorithmEntryLocallyAccounted(recipe)
	}
	if plan.kind == stagedEntryLawNativeGet {
		id, adopted := work.operationIDs[plan.base.producer]
		source := work.operationRecipes[plan.base.producer].nativeGet
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || source == nil {
			return false
		}
		get := work.operations[id.index].nativeCallee
		return get != nil && get.noUserEntry && get.generation == work.operationGeneration && validStagedNativeCalleeEffects(*get, source)
	}
	if proof == nil || proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != work.operationGeneration || !sameStagedEntryLawSource(proof.source, plan) || proof.cut.operation != plan.base.producer.operation || proof.cut.reading != proof.cut.operation || proof.cut.initializing != nil || proof.cut.returning != nil || proof.cut.invoking != nil {
		return false
	}
	var use *ast.Node
	if runtimeModuleEvaluation(plan.base.consumer) {
		use = plan.base.producer.operation
	}
	if proof.cut.use != use || proof.laws == 0 {
		return false
	}
	if plan.kind == stagedEntryLawMapEnumeration {
		return proof.laws&1 != 0
	}
	if plan.kind == stagedEntryLawMapConversion {
		return proof.laws&1 != 0 && len(recipe.delta.required) == 1+len(reflectiveDescriptorKeys)
	}
	if proof.prefix == nil || !proof.prefix.supported || !proof.prefix.accounted || proof.prefix.source.generation != work.operationGeneration || proof.prefix.source.cut != proof.cut || proof.prefix.source.read != plan.base.producer.operation {
		return false
	}
	if plan.kind == stagedEntryLawFieldHas || plan.kind == stagedEntryLawFieldGet {
		phase := stagedFieldObservationHas
		if plan.kind == stagedEntryLawFieldGet {
			phase = stagedFieldObservationGet
		}
		context, valid := stagedFieldMemberRequest(plan.base, phase)
		if !valid || !sameOperationRequest(proof.prefix.source.request, context) {
			return false
		}
		id, known := work.operationIDs[plan.base.producer]
		if !known || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		field := work.operations[id.index].fieldDisposition
		if field == nil || field.operation != plan.base.producer.operation || field.receiver != plan.receiver.expression || field.field != plan.base.producer.selector.field || field.cut != proof.cut || field.has != sourceEffectsAccounted {
			return false
		}
		if plan.kind == stagedEntryLawFieldHas {
			if proof.laws&(1<<stagedFieldOrdinaryHasNoUserEntry) == 0 {
				return false
			}
		} else if field.get != sourceEffectsAccounted && field.get != sourceEffectsBypassed || len(field.invoked) != 0 || proof.laws&((1<<stagedFieldOwnDataNoUserEntry)|(1<<stagedFieldIntrinsicGetNoUserEntry)) == 0 {
			return false
		}
		if proof.laws&(1<<stagedFieldIntrinsicGetNoUserEntry) != 0 && !stagedLiteralStandardPrototype(work.operationRecipes[plan.base.producer].nativeGet, field.receiver) {
			return false
		}
	}
	if plan.kind == stagedEntryLawMapGet && !sameOperationRequest(proof.prefix.source.request, plan.base) {
		return false
	}
	return work.entryLawSourcesAccounted(recipe)
}

// Each source contribution needs its own positive entry law. Runtime-unknown
// terminals and unfinished semantic producers are not neutralized by complete
// Effects, purity, an empty summary or a selected native prefix.
func (work *callableEffectWork) entryLawSourcesAccounted(recipe sourceStagedOperationRecipe) bool {
	found := false
	plan := recipe.entryLaw
	context := plan.base
	if plan.kind == stagedEntryLawFieldHas || plan.kind == stagedEntryLawFieldGet {
		phase := stagedFieldObservationHas
		if plan.kind == stagedEntryLawFieldGet {
			phase = stagedFieldObservationGet
		}
		var valid bool
		context, valid = stagedFieldMemberRequest(plan.base, phase)
		if !valid {
			return false
		}
	}
	proof := work.entryLawReceipts[recipe.key]
	if proof == nil {
		return false
	}
	expected := stagedMemberCoverageRequest(context, plan.receiver.expression, proof.cut)
	for _, required := range recipe.delta.required {
		coverage := work.operationRecipes[required.producer].memberSource
		if coverage == nil || coverage.coverage == nil {
			continue
		}
		if !sameOperationRequest(required, expected) || !sameOperationRequest(coverage.parent, context) || work.memberCoverageObserved[required.producer] != work.operationGeneration || !coverage.coverage.extracted {
			return false
		}
		found = true
		for _, request := range coverage.coverage.required {
			child := work.operationRecipes[request.producer]
			if child.nativeGet != nil && stagedDescriptorFieldIndex(child.key.selector.field) >= 0 {
				// The field owner explicitly mapped this stored-body relationship.
				// Membership does not invoke that declaration during the lookup.
				continue
			}
			source := child.memberSource
			if source == nil {
				return false
			}
			if source.moduleExcluded != nil {
				if !work.passiveModuleWriterExclusionReady(child) {
					return false
				}
				continue
			}
			if work.entryLawCandidateExcluded(recipe, child, proof) {
				continue
			}
			if source.protocolSource == nil || source.protocolSource.external != nil || source.protocolSource.get != nil || source.protocolSource.evaluation != nil {
				return false
			}
			base := source.protocolSource.required
			native := work.operationRecipes[base.producer].nativeGet
			if native != nil && sameOperationRequest(base, native.request) {
				base, kind := nativeRootDebtRequest(native, "algorithm"), stagedEntryLawNativeAlgorithm
				if stagedNativeCallNoUserEntry(native, native.request.use) {
					// The original scalar/inert-input algorithm already owns its
					// local no-entry law. Consume the same actual Get prerequisite
					// as the module prefix, retaining the full Effects root on C.
					base, kind = nativeRootDebtRequest(native, "callee-get"), stagedEntryLawNativeGet
				}
				law, valid := stagedEntryLawRequest(base, kind)
				linked := false
				for _, required := range recipe.delta.required {
					linked = linked || sameOperationRequest(required, law)
				}
				if !valid || !linked || !work.passiveEntryLawReady(work.operationRecipes[law.producer]) {
					return false
				}
				continue
			}
			id, issued := work.operationIDs[base.producer]
			if !issued || id.index == 0 || int(id.index) >= len(work.operations) || native == nil || base.producer != nativeRootDebtRequest(native, "callee-get").producer {
				return false
			}
			proof := work.operations[id.index].nativeCallee
			if proof == nil || !proof.noUserEntry || proof.generation != work.operationGeneration || !validStagedNativeCalleeEffects(*proof, native) {
				return false
			}
		}
	}
	return found
}

// The module event owner supplies the explicit AST prefix. These are only the
// missing implicit conversion predecessors, issued from actual entry/field
// memberships. Their local laws remain independently unpublished until their
// original semantic owners deliver them.
func (work *callableEffectWork) implicitEntryLawRequirements(query *sourceValueQuery, get *sourceGetInputs) ([]sourceStagedOperationRequest, bool) {
	if query.stagedFieldGet != nil {
		if !query.liveStagedFieldMemberSource(get) || !query.traceModeKnown || query.traceMode != accessorNoGet && query.traceMode != accessorAcquire {
			return nil, false
		}
		field := get.stagedEffects.request
		source := work.operationRecipes[field.producer].nativeGet
		if source == nil {
			return nil, false
		}
		return work.fieldEntryLawPredecessors(source, field, get.stagedEffects.observation.phase)
	}
	if query.stagedMap != nil && query.stagedMap.reading {
		if !query.liveStagedMapEntryMemberSource(get) {
			return nil, false
		}
		return work.mapEntryLawPredecessors(query.stagedMap.source, query.stagedMap.currentRead.request)
	}
	return nil, true
}

// moduleOperationNotEntered uses the canonical original execution event, not
// an AST offset or an Enter/Select marker. It applies only to once/module work.
// Function prior invocations and an earlier callee Get cannot borrow it.
func (query *sourceValueQuery) moduleOperationNotEntered(operation *ast.Node, prefix *sourceStagedModuleActivation) bool {
	if query == nil || query.owner == nil || operation == nil || prefix == nil || !prefix.supported || !prefix.accounted || prefix.source.generation != query.owner.generation || prefix.source.read == nil || !runtimeModuleEvaluation(prefix.source.request.consumer) {
		return false
	}
	file := ast.GetSourceFileOfNode(operation)
	if file == nil || ast.GetSourceFileOfNode(prefix.source.read) != file || query.owner.program.GetSourceFile(file.FileName()) != file || !sourceStagedOccurrenceOwned(operation, prefix.source.request.consumer) {
		return false
	}
	occurrence := query.owner.index(file).normalOccurrences[operation]
	if occurrence == nil || !occurrence.once || occurrence.region != nil {
		return false
	}
	readIndex, operationIndex, count := -1, -1, 0
	for index, event := range query.owner.summary(prefix.source.root).normal {
		if event.fold != nil || event.phase != nil || event.operand != nil {
			continue
		}
		if event.node == prefix.source.read {
			readIndex = index
		}
		if event.node == operation {
			operationIndex, count = index, count+1
		}
	}
	return readIndex >= 0 && count == 1 && operationIndex > readIndex
}
