package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedInstalledFieldUse is the detached original Get which requested a
// conditional installation's callable projection. Its receiver/cut are source
// relationships, not a normal binder envelope. Initial consumption admits only
// zero-argument, capture/receiver-independent bodies, with no invented B frame.
type sourceStagedInstalledFieldUse struct {
	receiver sourceRelativeEndpoint
	cut      sourceRelativeCut
}

// sourceStagedInstalledGetter is graph-local guarded invocation work. A positive
// callable prefix identifies the possible body. Neither storage nor availability
// activates it. The original semantic Get owns the conditional invocation. Its
// predecessor/exposure debts remain on reader closure independently of known
// effect transfer. Those dispositions never become normal-completion receipts.
type sourceStagedInstalledGetter struct {
	source         sourceStagedOperationRequest // Optional authentic mutation-DATA reading; zero retains legacy installation source.
	root, exposure sourceStagedOperationID
	get            sourceStagedInstalledFieldUse
	creating       *sourceRelativeInputEdge // Sealed original association, never an invocation frame.
}

// requestInstalledFieldGet runs only at the original semantic Get, never Has.
// This first relationship domain is a preceding standalone installation in the
// same callable's straight-line block, a genuine standard prototype target and
// literal key. Other callers/cuts/targets stay pending in discovery. No property
// table, exact runtime identity or replacement outcome is reconstructed.
func (work *callableEffectWork) requestInstalledFieldGet(facts []callableFacts, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs, owner *executableBodyOwner) {
	if !query.liveStagedFieldGet(get) || get.hasOnly || get.stagedEffects.observation == nil || get.stagedEffects.observation.phase != stagedFieldObservationGet {
		return
	}
	current, issued := work.issueFieldEffectsDemand(facts, demand.producer, owner)
	if !issued || !query.stagedFieldWorkOwner(owner) || !sameOperationRequest(current.request, demand.request) || !sameOperationEndpoint(current.receiver, demand.receiver) {
		return
	}
	var sources []*sourceStagedNativeGetSource
	for _, source := range work.nativeInstallations[demand.request.producer.declaration][get.propertyKey] {
		if installationMayPrecedeFieldGet(source, demand, query) || work.installationMayBePriorSequenceActivation(facts, source, demand, query, get) {
			sources = append(sources, source)
		}
	}
	sort.Slice(sources, func(i, j int) bool {
		return sources[i].request.producer.operation.Pos() < sources[j].request.producer.operation.Pos()
	})
	for _, source := range sources {
		result := accessorCandidates{}
		if !query.liveStagedFieldGet(get) || !query.charge(&result, source.request.producer.operation) {
			return
		}
		for _, field := range []string{"get", "value"} {
			recipe, admitted := work.ensureFieldExposure(facts, source, field)
			if !admitted {
				continue
			}
			request := nativeFieldExposureRequest(source, field, demand.request)
			use := sourceStagedOperationUse{request: request, installed: &sourceStagedInstalledFieldUse{receiver: cloneSourceRelativeEndpoint(demand.receiver), cut: query.relativeInputCut(get.operation)}}
			if !work.registerOperationUse(facts, use) {
				continue
			}
			id := work.operationIDs[recipe.key]
			work.registerOperationDependencies(facts, id)
			work.attachInstalledFieldDependencies(demand.producer, source, request)
			// Known values may arrive later. The source subscriber retains only
			// original occurrence relationships, never the borrowing query.
			if operationDeltaSize(recipe.delta) != 0 {
				work.publishOperation(id, recipe.delta)
			}
		}
	}
}

func installationMayPrecedeFieldGet(source *sourceStagedNativeGetSource, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery) bool {
	installation := source.installation
	if _, definition := query.owner.components[demand.request.producer.declaration]; definition {
		return false // Component definitions do not have a linear setup execution.
	}
	writer, reader := source.request.producer.operation, demand.request.producer.operation
	if installation == nil || source.request.producer.declaration != demand.request.producer.declaration || writer == reader || writer.Parent == nil || reader.Parent == nil || !ast.IsExpressionStatement(writer.Parent) || writer.Parent.Expression() != writer || !ast.IsReturnStatement(reader.Parent) || reader.Parent.Expression() != reader || writer.Parent.Parent != reader.Parent.Parent || writer.Parent.Parent != demand.request.producer.declaration.Body() || writer.Pos() >= reader.Pos() {
		return false
	}
	key := installation.key.expression
	if key == nil || !ast.IsStringLiteralLike(key) || key.Text() != demand.request.producer.selector.field {
		return false
	}
	target := installation.target.expression
	if target == nil || !ast.IsPropertyAccessExpression(target) || callableNameText(target.Name()) != "prototype" || !ast.IsIdentifier(target.Expression()) {
		return false
	}
	root := query.owner.checker.GetSymbolAtLocation(target.Expression())
	if root == nil || root.ValueDeclaration != source.standard.root || source.standard.root == nil || !source.standard.ordinaryLink {
		return false
	}
	// This is a conditional source edge if the predecessor succeeds and the
	// current Get is reached. An earlier abrupt statement cannot create it.
	for _, statement := range writer.Parent.Parent.AsBlock().Statements.Nodes {
		if statement == writer.Parent {
			return true
		}
		if ast.IsReturnStatement(statement) || ast.IsThrowStatement(statement) {
			return false
		}
	}
	return false
}

// applyInstalledFieldExposure consumes known alternatives only at their issued
// Get. It registers guarded canonical summary work, not execution of a stored
// callback or a successful descriptor receipt. Unknown/unsupported alternatives
// remain pending independently of every accepted body.
func (work *callableEffectWork) applyInstalledFieldExposure(facts []callableFacts, use sourceStagedOperationUse, delta sourceStagedOperationDelta, owner *executableBodyOwner) bool {
	readerID, reading := work.operationIDs[use.request.reading]
	if !reading || use.installed == nil || owner == nil || !work.validFieldExposureReading(work.operationRecipes[use.request.producer], use.request) {
		return false
	}
	demand, issued := work.installedFieldGetReaderDemand(facts, readerID, owner)
	if !issued || !sameOperationEndpoint(use.installed.receiver, demand.receiver) || use.installed.cut.operation != demand.request.producer.operation || use.installed.cut.reading != demand.request.producer.operation {
		return false
	}
	source := work.operationRecipes[use.request.producer].nativeGet
	rootID, rooted := work.operationIDs[source.request.producer]
	exposureID := work.operationIDs[use.request.producer]
	if !rooted {
		return false
	}
	work.attachInstalledFieldDependencies(readerID, source, use.request)
	if use.request.producer.selector.field == "value" {
		return work.forwardInstalledFieldValue(facts, use, delta, demand)
	}
	handled := true
	legacyResidual := false
	for _, residual := range delta.residuals {
		if residual.mutation != nil {
			// Mutation provenance is not a runtime getter alternative or an
			// invocation of its formal. Preserve its typed declaration demand.
			consumer := work.memberNodes[demand.request.consumer]
			handled = work.applyOperationMutation(facts, consumer, use, residual.mutation) && handled
		} else {
			legacyResidual = true
		}
	}
	if legacyResidual {
		consumer := work.memberNodes[demand.request.consumer]
		appendOperationEffect(&facts[consumer], environmentSource("unknown", "runtime-unknown installed getter alternative", facts[consumer].summary.Name))
	}
	for _, alternative := range delta.exposures {
		handled = work.applyInstalledGetterAlternative(facts, use, demand, readerID, rootID, exposureID, alternative, owner) && handled
	}
	return handled
}

// Membership precedes source delivery. Even a missing callable prefix keeps
// the actual reader dependent on its original installation and Value source.
func (work *callableEffectWork) attachInstalledFieldDependencies(reader sourceStagedOperationID, source *sourceStagedNativeGetSource, request sourceStagedOperationRequest) {
	root, rooted := work.operationIDs[source.request.producer]
	exposure, exposed := work.operationIDs[request.producer]
	if reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) || !rooted || !exposed {
		return
	}
	for _, dependency := range []sourceStagedOperationDependency{{producer: root, request: source.request}, {producer: exposure, request: request}} {
		present := false
		for _, prior := range work.operations[reader.index].dependencies {
			present = present || prior.producer == dependency.producer && sameOperationRequest(prior.request, dependency.request)
		}
		if !present {
			work.operations[reader.index].dependencies = append(work.operations[reader.index].dependencies, dependency)
		}
	}
}

// deliverInstalledFieldGetters transfers known input-independent contributions
// at their actual requested Get. Unsettled installation/value dependencies stay
// on the reader, independently blocking ACK. No declaration-only activation,
// recursive preparation, normal receipt or original-query replay occurs here.
// deliverInstalledFieldGetters transfers ready canonical bodies once. Late
// installed exposures use the same drain during fixed-point propagation; only
// a new transfer reports progress, and every existing installation guard stays.
func (work *callableEffectWork) deliverInstalledFieldGetters(facts []callableFacts, owner *executableBodyOwner) bool {
	transferred := false
	for index := 1; index < len(work.operations); index++ {
		for slot := range work.operations[index].getters {
			// DATA arrival can follow the original once-only field Effects query.
			// Existing fixed-point drain retries this SOURCE-only input preparation;
			// only the first actual description contributes progress.
			id := sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}
			if work.prepareInstalledGetterMutationInputs(facts, id, slot, owner) {
				transferred = true
				if work.operations[index].getters[slot].bodyTransferred {
					work.publishGetterMutationWriters(facts, id, slot, owner)
				}
			}
			if work.forwardInstalledMutationData(facts, work.operations[index].getters[slot]) {
				transferred = true
			}
			requirement := &work.operations[index].getters[slot]
			guard := requirement.installed
			if guard == nil || requirement.bodyTransferred || owner == nil {
				continue
			}
			target, found := work.memberNodes[requirement.declaration]
			if !found {
				continue
			}
			requirement.bodyReady = facts[target].staged.ready
			if !requirement.bodyReady || guard.root.epoch != work.operationEpoch || guard.exposure.epoch != work.operationEpoch || guard.root.index == 0 || guard.exposure.index == 0 || int(guard.root.index) >= len(work.operations) || int(guard.exposure.index) >= len(work.operations) {
				continue
			}
			if guard.creating != nil {
				prefix := work.operationRecipes[work.operations[guard.exposure.index].key]
				matched := false
				for _, alternative := range prefix.delta.exposures {
					matched = matched || alternative.creating == guard.creating && alternative.endpoint.expression == requirement.declaration && validInstalledGetterCreatingAlternative(prefix, alternative)
				}
				if !matched {
					continue
				}
			}
			consumer := work.memberNodes[requirement.demand.request.consumer]
			work.operationInvocationOnEdge(facts, consumer, target, guard.get.cut.operation, requirement.demand.request.cut, requirement.edge)
			requirement.bodyTransferred = true
			work.publishGetterMutationWriters(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}, slot, owner)
			transferred = true
		}
	}
	return transferred
}

// indexNativeInstallation indexes only immutable, selected source relationships
// by their declared literal key and containing declaration. Unknown keys remain
// pending in discovery, never excluded by this index. Per-Get selection still
// checks its original source cut and receiver. Maps are rebuilt for each graph.
func (work *callableEffectWork) indexNativeInstallation(recipe sourceStagedOperationRecipe) {
	source := recipe.nativeGet
	if source == nil || source.installation == nil || recipe.key.selector.occurrence != source.get || recipe.key.selector.field != "algorithm" {
		return
	}
	key := source.installation.key.expression
	if key == nil || !ast.IsStringLiteralLike(key) {
		return
	}
	if work.nativeInstallations == nil {
		work.nativeInstallations = make(map[*ast.Node]map[string]map[*ast.Node]*sourceStagedNativeGetSource)
	}
	byField := work.nativeInstallations[recipe.key.declaration]
	if byField == nil {
		byField = make(map[string]map[*ast.Node]*sourceStagedNativeGetSource)
		work.nativeInstallations[recipe.key.declaration] = byField
	}
	byOperation := byField[key.Text()]
	if byOperation == nil {
		byOperation = make(map[*ast.Node]*sourceStagedNativeGetSource)
		byField[key.Text()] = byOperation
	}
	byOperation[recipe.key.operation] = source
}

// A declaration-relative summary includes a possible prior activation's
// installation. This domain has no supplied/captured/receiver inputs. Its B
// association describes source, never the identity or state of that prior value.
func (work *callableEffectWork) installationMayBePriorSequenceActivation(facts []callableFacts, source *sourceStagedNativeGetSource, demand sourceStagedFieldEffectsDemand, query *sourceValueQuery, get *sourceGetInputs) bool {
	if source == nil || source.installation == nil || source.request.producer.operation != demand.request.producer.operation || !query.liveStagedFieldGet(get) {
		return false
	}
	calls, eligible := stagedNativeSequence(&facts[work.memberNodes[demand.request.consumer]], query.executable)
	return eligible && source.request.producer.operation == calls[0] && source.installation.key.expression != nil && ast.IsStringLiteralLike(source.installation.key.expression) && source.installation.key.expression.Text() == demand.request.producer.selector.field
}

// applyInstalledGetterAlternative is the original guarded Get/BODY subscriber.
// A mutation-DATA origin changes provenance validation, never execution owner.
func (work *callableEffectWork) applyInstalledGetterAlternative(facts []callableFacts, use sourceStagedOperationUse, demand sourceStagedFieldEffectsDemand, readerID, rootID, exposureID sourceStagedOperationID, alternative sourceStagedOperationAlternative, owner *executableBodyOwner) bool {
	if owner == nil || owner.values == nil || use.installed == nil {
		return false
	}
	body := alternative.endpoint.expression
	target, found := work.memberNodes[body]
	prefix := work.operationRecipes[use.request.producer]
	prefix.delta = cloneOperationDelta(prefix.delta)
	prefix.delta.exposures = []sourceStagedOperationAlternative{alternative}
	if !found || !validInstalledGetterAlternative(prefix, alternative) {
		return false
	}
	index := owner.values.index(ast.GetSourceFileOfNode(body))
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	values, supported := stagedMemberSourceValues(body, nil, owner)
	if (!supported || len(values) != 1) && !work.descriptorRecordGetterEffectsBody(demand, body, owner) {
		return false
	}
	state := &work.operations[readerID.index]
	duplicate := false
	for _, prior := range state.getters {
		duplicate = duplicate || prior.declaration == body && prior.installed != nil && prior.installed.exposure == exposureID
	}
	if duplicate {
		return true
	}
	edge := fmt.Sprintf("%s:installed-get:%s", use.request.edge, facts[target].summary.ID)
	work.requireStagedSummary(facts, work.memberNodes[demand.request.consumer], target, edge, demand.request.producer.operation, demand.request.cut)
	work.operations[readerID.index].getters = append(work.operations[readerID.index].getters, sourceStagedGetterRequirement{demand: demand, declaration: body, edge: edge, bodyReady: facts[target].staged.ready, installed: &sourceStagedInstalledGetter{root: rootID, exposure: exposureID, get: *use.installed, creating: alternative.creating, source: mutationSourceReading(use, work.operationRecipes[use.request.producer])}})
	if !validDescriptorRecordGetRecipe(work.operationRecipes[demand.request.producer]) {
		work.deliverSequenceGetterValue(facts, readerID, body, owner)
	} // Returned-record role publishes BODY Effects only, never getter result DATA.
	return true
}

func mutationSourceReading(use sourceStagedOperationUse, recipe sourceStagedOperationRecipe) sourceStagedOperationRequest {
	if recipe.mutationData != nil {
		return use.request
	}
	return sourceStagedOperationRequest{}
}

func validInstalledGetterAlternative(recipe sourceStagedOperationRecipe, alternative sourceStagedOperationAlternative) bool {
	if recipe.mutationData == nil {
		return validNativeFieldExposureRecipe(recipe)
	}
	for _, forward := range recipe.fieldForwards {
		if sameOperationAlternative(forward.alternative, alternative) && validMutationRHSForward(recipe, forward) {
			return true
		}
	}
	return false
}

func validInstalledGetterCreatingAlternative(recipe sourceStagedOperationRecipe, alternative sourceStagedOperationAlternative) bool {
	if recipe.mutationData == nil {
		return validNativeOwnFieldAlternative(recipe, alternative)
	}
	return validInstalledGetterAlternative(recipe, alternative)
}

// installedGetterExposure preserves the original installed-getter DATA source
// across the legacy installation and explicit mutation-RHS variants. Neither
// source description is a Get/BODY invocation; the retained real Get owns that.
func (work *callableEffectWork) installedGetterExposure(getter sourceStagedGetterRequirement) (sourceStagedOperationRecipe, *sourceStagedNativeGetSource, sourceStagedOperationRequest, bool) {
	guard := getter.installed
	if guard == nil || guard.exposure.epoch != work.operationEpoch || guard.exposure.index == 0 || int(guard.exposure.index) >= len(work.operations) {
		return sourceStagedOperationRecipe{}, nil, sourceStagedOperationRequest{}, false
	}
	recipe := work.operationRecipes[work.operations[guard.exposure.index].key]
	if guard.source.producer.operation != nil {
		if recipe.mutationData == nil || !work.validFieldMutationDataReading(recipe, guard.source) || !work.fieldMutationDataCurrent(recipe) {
			return sourceStagedOperationRecipe{}, nil, sourceStagedOperationRequest{}, false
		}
		parent, field := fieldSourceParent(recipe.mutationData.field)
		source := work.operationRecipes[parent.producer].nativeGet
		if !field || source == nil || source.installation == nil {
			return sourceStagedOperationRecipe{}, nil, sourceStagedOperationRequest{}, false
		}
		return recipe, source, guard.source, true
	}
	if recipe.nativeGet == nil || !validNativeFieldExposureRecipe(recipe) {
		return sourceStagedOperationRecipe{}, nil, sourceStagedOperationRequest{}, false
	}
	return recipe, recipe.nativeGet, nativeFieldExposureRequest(recipe.nativeGet, "get", getter.demand.request), true
}
