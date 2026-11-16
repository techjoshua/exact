package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// sourceFieldMutationData is a detached conditional SOURCE output, separate
// from Effects and from its eventual installed Get consumer. The origin is
// disjoint: a selected native algorithm or an original external Get producer.
// Field describes the authentic finished field mapper which declared this
// required child. It does not grant property absence, output or invocation.
type sourceFieldMutationData struct {
	installation   *sourceNativeInstallationMutationSource // Disjoint selected installation output owner, not descriptor retrieval.
	getInterest    *sourceOriginalGetMutationInterest      // Immutable actual issuer header, never bound Get/current payload.
	getSource      *sourceOriginalGetMutationSource        // Disjoint actual Get SOURCE output, not Effects/currentness.
	request, field sourceStagedOperationRequest
	receiver       sourceRelativeEndpoint
	native         *sourceStagedNativeGetSource
	external       *sourceStagedMemberExternalGet
	externalSource sourceStagedOperationRequest
	generation     *projectGeneration
}

func mutationDataRequest(field sourceStagedOperationRequest, origin sourceStagedOperationRequest) sourceStagedOperationRequest {
	request := origin
	request.producer.kind = relativeDemandDirectExposure
	request.producer.selector = sourceStagedOperationSelector{occurrence: field.producer.operation, association: field.producer.selector.occurrence, field: "mutation-data:" + field.producer.selector.field}
	request.consumer = field.consumer
	request.edge = fmt.Sprintf("%s:mutation-data:%d:%d", field.edge, origin.producer.operation.Pos(), origin.producer.operation.End())
	if origin.producer.kind == relativeDemandDirectExposure && strings.HasPrefix(origin.producer.selector.field, "original-get-mutation:") {
		request.producer.selector.field += "|get-source:" + origin.producer.selector.field
		request.edge += "|get-source:" + origin.producer.selector.field
	}
	if origin.producer.kind == relativeDemandDirectExposure && strings.HasPrefix(origin.producer.selector.field, "original-get-mutation-interest:") {
		request.producer.selector.field += "|get-interest:" + origin.producer.selector.field
		request.edge += "|get-interest:" + origin.producer.selector.field
	}
	request.inputs = nil
	request.reading = field.producer
	return request
}

func cloneFieldMutationData(s *sourceFieldMutationData) *sourceFieldMutationData {
	if s == nil {
		return nil
	}
	out := *s
	out.installation = cloneNativeInstallationMutationSource(s.installation)
	out.getSource = cloneOriginalGetMutationSource(s.getSource)
	out.getInterest = cloneOriginalGetMutationInterest(s.getInterest)
	if out.getInterest != nil {
		out.getInterest.source = nil
	}
	out.native = cloneNativeGetForMutation(s.native)
	out.receiver = cloneSourceRelativeEndpoint(s.receiver)
	if s.external != nil {
		copy := *s.external
		out.external = &copy
	}
	return &out
}

func cloneNativeGetForMutation(s *sourceStagedNativeGetSource) *sourceStagedNativeGetSource {
	if s == nil {
		return nil
	}
	copy := *s
	copy.descriptorRead = cloneDescriptorRetrieval(s.descriptorRead)
	return &copy
}

func sameFieldMutationData(a, b *sourceFieldMutationData) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.generation != b.generation || !sameNativeInstallationMutationSource(a.installation, b.installation) || !sameOriginalGetMutationInterest(a.getInterest, b.getInterest) || !sameOriginalGetMutationIdentity(a.getSource, b.getSource) || !sameOperationRequest(a.request, b.request) || !sameOperationRequest(a.field, b.field) || !sameOperationEndpoint(a.receiver, b.receiver) || !sameNativeGetSource(a.native, b.native) || !sameOperationRequest(a.externalSource, b.externalSource) {
		return false
	}
	return a.external == nil && b.external == nil || a.external != nil && b.external != nil && *a.external == *b.external
}

func validFieldMutationDataRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.mutationData
	if s == nil || s.generation == nil || mutationDataOriginCount(s) != 1 || recipe.key != s.request.producer || recipe.key.kind != relativeDemandDirectExposure || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.installedMutationRHS != nil || recipe.callResult != nil || recipe.writer != nil || recipe.installedCall != nil || recipe.installedMember != nil || recipe.descriptorSource != nil || recipe.descriptorTarget != nil || recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.entryLaw != nil || recipe.assignment != nil || recipe.declarationCall != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup) != 0 || len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.effects) != 0 {
		return false
	}
	parent, field := fieldSourceParent(s.field)
	if !field || parent.producer.operation == nil || parent.producer.declaration == nil || !sourceStagedOccurrenceOwned(parent.producer.operation, parent.producer.declaration) || s.field.producer.kind != relativeDemandDirectExposure || s.receiver.kind != relativeEndpointExpression || s.receiver.expression != parent.producer.selector.occurrence || s.receiver.expression == nil || !ast.IsObjectLiteralExpression(s.receiver.expression) || parent.consumer != s.request.consumer {
		return false
	}
	origin := s.externalSource
	if s.installation != nil {
		if !validNativeInstallationMutationSource(s.installation) || s.installation.generation != s.generation || s.installation.request.consumer != s.field.consumer {
			return false
		}
		origin = s.installation.request
	} else if s.native != nil {
		if !validDescriptorRetrieval(s.native) || s.native.descriptorRead.generation != s.generation || s.native.request.consumer != s.field.consumer {
			return false
		}
		origin = s.native.request
	} else if s.getInterest != nil {
		if !validOriginalGetMutationInterestShape(s.getInterest) || s.getInterest.source != nil || s.getInterest.generation != s.generation {
			return false
		}
		origin = originalGetMutationInterestRequest(s.getInterest)
	} else if s.getSource != nil {
		if !validOriginalGetMutationSource(s.getSource) || s.getSource.generation != s.generation {
			return false
		}
		origin = originalGetMutationRequest(s.getSource)
	} else {
		g := s.external
		if g.generation != s.generation || g.operation == nil || !ast.IsPropertyAccessExpression(g.operation) || g.expression != g.operation.Expression() || s.externalSource.producer.operation != g.operation || s.externalSource.consumer != s.externalSource.producer.declaration || !validStagedMemberObservation(s.externalSource, g.cut) || g.standardSymbolData {
			return false
		}
	}
	if !sameOperationRequest(s.request, mutationDataRequest(s.field, origin)) || !operationContainsRequest(recipe.delta.required, origin) {
		return false
	}
	for index, link := range recipe.fieldMutationLinks {
		if !validOriginalGetMutationFieldLinkShape(recipe, link) {
			return false
		}
		for _, prior := range recipe.fieldMutationLinks[:index] {
			if sameOriginalGetMutationFieldLink(prior, link) {
				return false
			}
		}
	}
	for _, alternative := range recipe.delta.exposures {
		covered := false
		for _, forward := range recipe.fieldForwards {
			covered = covered || sameOperationAlternative(forward.alternative, alternative) && validMutationRHSForward(recipe, forward)
		}
		if !covered {
			return false
		}
	}
	for _, forward := range recipe.fieldForwards {
		if !validMutationRHSForward(recipe, forward) {
			return false
		}
	}
	for _, residual := range recipe.delta.residuals {
		if residual.mutation == nil || !validRelativeFieldMutationShape(residual.mutation) || !sameOperationRequest(residual.mutation.field, s.field) {
			return false
		}
	}
	return true
}

// fieldMutationDataCurrent is local SOURCE validation only. Every native,
// coverage and installed BODY child remains independently required by closure.
func (work *callableEffectWork) fieldMutationDataCurrent(recipe sourceStagedOperationRecipe) bool {
	if !work.originalGetMutationFieldLinksCurrent(recipe) {
		return false
	}
	if !validFieldMutationDataRecipe(recipe) || recipe.mutationData.generation != work.operationGeneration {
		return false
	}
	s := recipe.mutationData
	parent, field := fieldSourceParent(s.field)
	fieldRecipe := work.operationRecipes[s.field.producer]
	if !field || !validNativeFieldValueSourceRecipe(fieldRecipe, parent) || !operationContainsRequest(fieldRecipe.delta.required, s.request) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	if s.installation != nil {
		root := work.operationRecipes[s.installation.request.producer].nativeGet
		return work.nativeInstallationMutationCurrent(s.installation) && root != nil && work.nativeEffectsGetCurrent(root) && work.mutationForwardsCurrent(recipe)
	}
	if s.native != nil {
		if !work.nativeEffectsGetCurrent(s.native) {
			return false
		}
		id := work.operationIDs[nativeRootDebtRequest(s.native, "algorithm").producer]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		enumeration := work.operations[id.index].descriptorMutations
		if enumeration == nil || !enumeration.sealed || !sameDescriptorRetrieval(&enumeration.native, s.native.descriptorRead) {
			return false
		}
		for position, input := range enumeration.inputs {
			if !work.descriptorInputSnapshotCurrent(s.native.descriptorRead, position, input) {
				return false
			}
		}
		return work.mutationForwardsCurrent(recipe)
	}
	if s.getInterest != nil {
		interest := work.operationRecipes[originalGetMutationInterestRequest(s.getInterest).producer]
		return work.originalGetMutationInterestCurrent(interest) && sameOriginalGetMutationInterest(interest.memberSource.originalGetMutationInterest, s.getInterest) && work.mutationForwardsCurrent(recipe)
	}
	if s.getSource != nil {
		source := work.operationRecipes[originalGetMutationRequest(s.getSource).producer]
		return work.originalGetMutationCurrent(source) && sameOriginalGetMutationIdentity(source.memberSource.originalGetMutation, s.getSource) && work.mutationForwardsCurrent(recipe)
	}
	source := work.operationRecipes[s.externalSource.producer]
	return validStagedMemberExternalGetRecipe(source) && source.memberSource.generation == work.operationGeneration && source.memberSource.protocolSource.get != nil && *source.memberSource.protocolSource.get == *s.external && sameOperationRequest(source.memberSource.request, s.externalSource) && work.memberCoverageObserved[source.key] == work.operationGeneration
}

func (work *callableEffectWork) prepareFieldMutationData(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	if !work.fieldMutationDataCurrent(recipe) {
		return
	}
	source := recipe.mutationData
	var delta sourceStagedOperationDelta
	if source.installation != nil {
		output := work.nativeInstallationMutationOutputs(facts, source.field, source.installation)
		delta = output.delta
		// Only the actual field consumer can publish DATA, after both original
		// component populations have authenticated materialized outputs or explicit
		// same-field delivery links. Final installed readiness still owns every child.
		delta.extracted = output.knownRHSComplete && output.populationDescriptionComplete && output.priorFieldInterferenceComplete
		for _, link := range output.fieldLinks {
			probe := recipe
			probe.delta = delta
			if !work.validOriginalGetMutationFieldLink(probe, link) {
				delta.extracted = false
				continue
			}
			known := false
			for _, prior := range recipe.fieldMutationLinks {
				known = known || sameOriginalGetMutationFieldLink(prior, link)
			}
			if !known {
				recipe.fieldMutationLinks = append(recipe.fieldMutationLinks, cloneOriginalGetMutationFieldLinks([]sourceOriginalGetMutationFieldLink{link})[0])
			}
		}
		// A description may complete through exact existing same-field delivery.
		// It cannot become an atom or cover a canonical BODY operation.
		if !output.materializedOutputsComplete && len(output.fieldLinks) == 0 {
			delta.extracted = false
		}
		for _, forward := range output.forwards {
			probe := recipe
			probe.delta = delta
			if !validMutationRHSForward(probe, forward) || !work.nativeInstallationMutationForwardCurrent(source.installation, source.field, forward) {
				delta.extracted = false
				continue
			}
			known := false
			for _, prior := range recipe.fieldForwards {
				known = known || sameStagedFieldForward(prior, forward)
			}
			if !known {
				recipe.fieldForwards = append(recipe.fieldForwards, forward)
			}
		}
	} else if source.native != nil {
		parent, _ := fieldSourceParent(source.field)
		demand := sourceStagedFieldEffectsDemand{request: parent, receiver: source.receiver}
		var represented bool
		delta, represented = work.descriptorMutationFieldSource(demand, source.field, source.native)
		if !represented {
			return
		}
	} else if source.getSource != nil || source.getInterest != nil {
		output := work.originalGetFieldMutationOutputs(facts, source)
		delta = output.delta
		// This field owner alone chooses local DATA readiness. Provider discovery
		// cannot set extraction or claim materialized BODY outputs.
		delta.extracted = output.providerDescriptionComplete
		recipe.fieldMutationLinks = cloneOriginalGetMutationFieldLinks(recipe.fieldMutationLinks)
		for _, link := range output.fieldLinks {
			probe := recipe
			probe.delta = delta
			if !work.validOriginalGetMutationFieldLink(probe, link) {
				delta.extracted = false
				continue
			}
			known := false
			for _, prior := range recipe.fieldMutationLinks {
				known = known || sameOriginalGetMutationFieldLink(prior, link)
			}
			if !known {
				recipe.fieldMutationLinks = append(recipe.fieldMutationLinks, link)
			}
		}
		// A nonmaterialized result is valid only as explicit, field-owned
		// direct delivery. Default storage has no atom consumer; installed
		// delivery separately proves every child belongs to its reader family.
		if !output.materializedOutputsComplete && len(output.fieldLinks) == 0 {
			delta.extracted = false
		}
		for _, forward := range output.forwards {
			probe := recipe
			probe.delta = delta
			if !validMutationRHSForward(probe, forward) {
				delta.extracted = false
				continue
			}
			known := false
			for _, prior := range recipe.fieldForwards {
				known = known || sameStagedFieldForward(prior, forward)
			}
			if !known {
				recipe.fieldForwards = append(recipe.fieldForwards, forward)
			}
		}
	} else {
		original := work.operationRecipes[source.externalSource.producer]
		required := appendEntryLawRequirement([]sourceStagedOperationRequest{source.externalSource}, original.memberSource.protocolSource.required)
		parent, _ := fieldSourceParent(source.field)
		g := *source.external
		mutation := &sourceRelativeFieldMutation{external: &g, externalSource: source.externalSource, scope: source.externalSource.consumer, field: source.field, receiver: cloneSourceRelativeEndpoint(source.receiver), name: parent.producer.selector.field, required: required}
		if source.external.standardRead != standardPropertyReadUnmodeled {
			disposition := work.standardPropertyReadMutationDisposition(source.external, source.externalSource)
			if disposition == standardPropertyReadPending {
				return // Original source population must publish before classifying this branch.
			}
			mutation.standardReadEmpty = disposition == standardPropertyReadEmpty
		}
		if !validRelativeFieldMutationShape(mutation) {
			return
		}
		delta = sourceStagedOperationDelta{extracted: true, required: required, residuals: []sourceStagedOperationResidual{{operation: parent.producer.operation, mutation: mutation}}}
		if actor, known := work.memberNodes[mutation.scope]; known {
			work.recordCanonicalMutation(facts, actor, mutation)
		}
	}
	// Known RHS stays in the existing alternative/creating channel. Missing
	// DATA or unsupported target/capture associations keep the child pending.
	if source.native != nil {
		algorithm := work.operationIDs[nativeRootDebtRequest(source.native, "algorithm").producer]
		enumeration := work.operations[algorithm.index].descriptorMutations
		for _, request := range enumeration.rhs {
			rhs, applied := work.installedMutationRHSData(request)
			description := work.operationRecipes[request.producer].installedMutationRHS
			if !applied || description == nil {
				delta.extracted = false
				continue
			}
			possible, complete := mutationWriterMaySupplyField(description, source.field)
			delta.extracted = delta.extracted && complete && rhs.extracted
			if !possible {
				continue
			}
			for _, alternative := range rhs.exposures {
				forward := sourceStagedFieldForward{request: request, alternative: alternative, mutationRHS: cloneInstalledMutationRHS(description)}
				probe := recipe
				probe.delta = delta
				if !validMutationRHSForward(probe, forward) {
					delta.extracted = false
					continue
				}
				known := false
				for _, prior := range recipe.fieldForwards {
					known = known || sameStagedFieldForward(prior, forward)
				}
				if !known {
					recipe.fieldForwards = append(recipe.fieldForwards, forward)
				}
				present := false
				for _, prior := range delta.exposures {
					present = present || sameOperationAlternative(prior, alternative)
				}
				if !present {
					delta.exposures = append(delta.exposures, alternative)
				}
			}
		}
	}
	// Provider/RHS delivery can reveal an earlier source after a later one
	// already published a known prefix. Preserve every authenticated old atom
	// and append only new debt/outputs; readiness still comes from this pass.
	merged := cloneOperationDelta(recipe.delta)
	merged.extracted = delta.extracted
	for _, request := range delta.required {
		merged.required = appendEntryLawRequirement(merged.required, request)
	}
	for _, alternative := range delta.exposures {
		present := false
		for _, prior := range merged.exposures {
			present = present || sameOperationAlternative(prior, alternative)
		}
		if !present {
			merged.exposures = append(merged.exposures, alternative)
		}
	}
	for _, residual := range delta.residuals {
		present := false
		for _, prior := range merged.residuals {
			present = present || sameOperationResidual(prior, residual)
		}
		if !present {
			merged.residuals = append(merged.residuals, residual)
		}
	}
	delta = merged
	recipe.delta = delta
	if !validFieldMutationDataRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
		return
	}
	if operationDeltaSize(delta) != 0 {
		work.publishOperation(id, delta)
	}
	// Scheduling coalescing only: this is not an observation refresh or receipt.
	// The native original completion callback independently publishes its newly
	// sealed SOURCE event even if its Effects revision has not changed.
	work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
}

// declareFieldMutationData runs in the original finished field mapper. Local
// field extraction describes the population; this child's data/currentness and
// every native/coverage/body dependency remain unpaid independently.
func (work *callableEffectWork) declareFieldMutationData(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, field, origin sourceStagedOperationRequest, native *sourceStagedNativeGetSource, external *sourceStagedMemberExternalGet, getSources ...*sourceOriginalGetMutationSource) (sourceStagedOperationDelta, bool) {
	s := &sourceFieldMutationData{request: mutationDataRequest(field, origin), field: field, receiver: cloneSourceRelativeEndpoint(demand.receiver), native: cloneNativeGetForMutation(native), externalSource: origin, generation: work.operationGeneration}
	if len(getSources) != 0 {
		s.getSource = cloneOriginalGetMutationSource(getSources[0])
	}
	if external != nil {
		copy := *external
		s.external = &copy
	} else {
		s.externalSource = sourceStagedOperationRequest{}
	}
	return work.declareFieldMutationDataSource(facts, demand, q, get, s, origin)
}

// declareFieldMutationInterest retains an actual issued future-Get requirement
// before the original field prefix seals. It issues no Get or SOURCE stamp.
func (work *callableEffectWork) declareFieldMutationInterest(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, field sourceStagedOperationRequest, interest *sourceOriginalGetMutationInterest) (sourceStagedOperationDelta, bool) {
	if !validOriginalGetMutationInterestShape(interest) {
		return sourceStagedOperationDelta{}, false
	}
	header := cloneOriginalGetMutationInterest(interest)
	header.source = nil
	origin := originalGetMutationInterestRequest(header)
	source := &sourceFieldMutationData{getInterest: header, request: mutationDataRequest(field, origin), field: field, receiver: cloneSourceRelativeEndpoint(demand.receiver), generation: work.operationGeneration}
	return work.declareFieldMutationDataSource(facts, demand, q, get, source, origin)
}

func (work *callableEffectWork) declareFieldMutationDataSource(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, s *sourceFieldMutationData, origin sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
	if q == nil || !q.liveStagedFieldGet(get) || q.owner.generation != work.operationGeneration || get.stagedEffects == nil || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationFinished {
		return sourceStagedOperationDelta{}, false
	}
	recipe := sourceStagedOperationRecipe{key: s.request.producer, mutationData: s, delta: sourceStagedOperationDelta{required: []sourceStagedOperationRequest{origin}}}
	if s.installation != nil {
		for _, required := range nativeInstallationMutationRequirements(s.installation) {
			recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, required)
		}
	}
	if s.native != nil {
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, nativeRootDebtRequest(s.native, "algorithm"))
		recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, nativeRootDebtRequest(s.native, "callee-get"))
	}
	if !validFieldMutationDataRecipe(recipe) {
		return sourceStagedOperationDelta{}, false
	}
	if prior, exists := work.operationRecipes[recipe.key]; exists {
		if !sameFieldMutationData(prior.mutationData, s) {
			return sourceStagedOperationDelta{}, false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return sourceStagedOperationDelta{}, false
	}
	if work.memberCoverageObserved == nil {
		work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
	}
	work.memberCoverageObserved[recipe.key] = work.operationGeneration
	id, adopted := work.requireOperation(facts, s.request)
	if !adopted {
		return sourceStagedOperationDelta{}, false
	}
	work.attachSourceObservationDependencies(facts, id)
	work.prepareFieldMutationData(facts, id)
	return sourceStagedOperationDelta{extracted: true, required: []sourceStagedOperationRequest{s.request}}, true
}

// publishDeclaredNativeMutationData consumes the actual original SOURCE
// completion event, independently of whether the Effects algorithm can publish
// yet. Only already registered exact dependent children are visited. An ACK or
// unchanged algorithm revision never manufactures or recertifies this event.
func (work *callableEffectWork) publishDeclaredNativeMutationData(facts []callableFacts, algorithm sourceStagedOperationID) {
	if algorithm.epoch != work.operationEpoch || algorithm.index == 0 || int(algorithm.index) >= len(work.operations) {
		return
	}
	state := &work.operations[algorithm.index]
	for _, key := range append([]sourceStagedOperationConsumer(nil), state.subscriberOrder...) {
		sub := state.subscribers[key]
		if sub == nil {
			continue
		}
		for _, parent := range append([]sourceStagedOperationID(nil), sub.writerSourceParents...) {
			if parent.epoch != work.operationEpoch || parent.index == 0 || int(parent.index) >= len(work.operations) {
				continue
			}
			recipe := work.operationRecipes[work.operations[parent.index].key]
			if recipe.mutationData == nil || !operationContainsRequest(recipe.delta.required, sub.request) {
				continue
			}
			source := recipe.mutationData
			if source.installation != nil {
				if source.installation.algorithm.producer != state.key {
					continue
				}
			} else if source.native == nil || nativeRootDebtRequest(source.native, "algorithm").producer != state.key {
				continue
			}
			work.prepareFieldMutationData(facts, parent)
		}
	}
}

// validFieldMutationRequirement is the pure envelope half of the handoff.
// Registered-work validation separately checks the actual child descriptor,
// original mapper stamp, origin and full parent membership. This admits only
// the declared DATA child, leaving every ordinary ownership/input guard intact.
func validFieldMutationRequirement(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	if recipe.nativeGet == nil || recipe.key.kind != relativeDemandDirectExposure || request.producer.kind != relativeDemandDirectExposure || request.inputs != nil || request.producer.operation == nil || request.producer.declaration == nil {
		return false
	}
	field := recipe.nativeGet.request
	field.producer = recipe.key
	if _, role := fieldSourceParent(field); !role {
		return false
	}
	operation := request.producer.operation
	component := ""
	selectorField := "mutation-data:" + field.producer.selector.field
	edge := fmt.Sprintf("%s:mutation-data:%d:%d", field.edge, operation.Pos(), operation.End())
	if suffix, ok := strings.CutPrefix(request.producer.selector.field, selectorField+"|get-source:original-get-mutation:"); ok {
		if suffix == "" {
			return false
		}
		component = "original-get-mutation:" + suffix
		selectorField += "|get-source:original-get-mutation:" + suffix
		edge += "|get-source:original-get-mutation:" + suffix
	}
	if suffix, ok := strings.CutPrefix(request.producer.selector.field, selectorField+"|get-interest:original-get-mutation-interest:"); ok {
		if suffix == "" {
			return false
		}
		component = "original-get-mutation-interest:" + suffix
		selectorField += "|get-interest:original-get-mutation-interest:" + suffix
		edge += "|get-interest:original-get-mutation-interest:" + suffix
	}
	sourceCut := request.use == operation && request.cut == (sourceRelativeCut{operation: operation, use: operation, reading: operation})
	if component == fmt.Sprintf("original-get-mutation:eager-target:prototype:%d", accessorAcquire) || component == "original-get-mutation-interest:eager-target" {
		call := request.cut.operation
		if call != nil && ast.IsCallExpression(call) {
			actuals := restrictedInvocationArguments(call.AsCallExpression())
			sourceCut = sourceCut || len(actuals) == 3 && actuals[0] == operation && request.use == call && request.cut == (sourceRelativeCut{operation: call, use: call, reading: call})
		}
	}
	if component == "original-get-mutation-interest:callee-get" {
		call := request.cut.operation
		sourceCut = call != nil && ast.IsCallExpression(call) && call.Expression() == operation && request.use == call && request.cut == (sourceRelativeCut{operation: call, use: call, reading: call})
	}
	return request.reading == recipe.key && request.consumer == field.consumer && sourceCut && request.producer.selector == (sourceStagedOperationSelector{occurrence: field.producer.operation, association: field.producer.selector.occurrence, field: selectorField}) && request.edge == edge && sourceStagedOccurrenceOwned(operation, request.producer.declaration)
}

func mutationDataOriginCount(s *sourceFieldMutationData) int {
	if s == nil {
		return 0
	}
	n := 0
	if s.installation != nil {
		n++
	}
	if s.native != nil {
		n++
	}
	if s.external != nil {
		n++
	}
	if s.getInterest != nil {
		n++
	}
	if s.getSource != nil {
		n++
	}
	return n
}

// declareFieldInstallationMutation retains only an actually selected issuer's
// detached header during the original finished field mapper. Later component
// observations refine this child; neither parent nor field prefix grows late.
func (work *callableEffectWork) declareFieldInstallationMutation(facts []callableFacts, demand sourceStagedFieldEffectsDemand, q *sourceValueQuery, get *sourceGetInputs, field sourceStagedOperationRequest, installation *sourceNativeInstallationMutationSource) (sourceStagedOperationDelta, bool) {
	if !validNativeInstallationMutationSource(installation) {
		return sourceStagedOperationDelta{}, false
	}
	origin := installation.request
	source := &sourceFieldMutationData{installation: cloneNativeInstallationMutationSource(installation), request: mutationDataRequest(field, origin), field: field, receiver: cloneSourceRelativeEndpoint(demand.receiver), generation: work.operationGeneration}
	return work.declareFieldMutationDataSource(facts, demand, q, get, source, origin)
}
