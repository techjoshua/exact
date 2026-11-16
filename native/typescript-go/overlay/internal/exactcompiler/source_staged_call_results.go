package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedCallResultSource owns a declaration-relative return-data role.
// Original source consumers issue readings. Creating inputs are lent
// from current work facts, never recovered by this producer. Operand roles are
// explicit pending source work and are not runtime-unknown alternatives.
type sourceStagedCallResultSource struct {
	moduleConstruction     *sourceStagedModuleConstruction // Original immutable module construction operands.
	request                sourceStagedOperationRequest
	declaration            *ast.Node
	generation             *projectGeneration
	readings               []sourceStagedOperationRequest
	readCuts               []sourceRelativeCut // original reader cuts, separate from producing cuts
	projections            []sourceStagedFreezeProjection
	preparationData        []sourceStagedGetPreparationData
	freezeReturn           *sourceStagedFreezeReturnSource
	inputReadings          []sourceStagedInputCallResultReading
	binding                *ast.Node                        // Original lexical DATA declaration, never a creating association.
	nativeDescriptor       *sourceStagedDescriptorRetrieval // Conditional native descriptor/absence DATA, never raw output.
	frameworkView          *sourceFrameworkStorageView      // Conditional framework projection, never a native result.
	operand                *sourceRelativeEndpoint
	getResult              *sourceStagedGetResultSource // Original Get roles, never selected normal output.
	association            sourceStagedDeclarationCall
	nativeCall             bool                           // source selection is required, this flag never selects it
	constructedRoot        sourceStagedOperationRequest   // Original member producer, never a selected value.
	constructedPreparation []sourceStagedOperationRequest // Original constructor roots; producer demand only, no Get/read authority.
}

type sourceStagedCallResultBody struct {
	producer int
	edge     string
}

// validStagedDataResultCall preserves each issuer's original envelope. A
// source description uses its graph cut. A real B can have a physical nil-use
// cut, which cannot be normalized into an executed/graph Call observation.
func validStagedDataResultCall(call sourceStagedDeclarationCall) bool {
	operation := call.invocation.operation
	// SOURCE-only getter input descriptions carry no result DATA authority.
	if call.invocation.inputKind != relativeInputInvocation {
		return false
	}
	if originalStagedGetterCall(call) {
		return true
	}
	if operation == nil || !ast.IsCallExpression(operation) || call.inputs != nil && call.sourceInputs != nil {
		return false
	}
	if call.inputs == nil {
		return call.sourceInputs != nil && validStagedMemberActivationCall(call, call.invocation.declaration, operation)
	}
	edge := call.inputs
	invocation := call.invocation
	if call.kind != relativeDemandEffects || !edge.delivered || !sameSourceRelativeVector(edge.request, invocation) || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) || !sameSourceRelativeInputEnvelope(edge.request, edge.relative) || !invocation.actualsKnown || operation.AsCallExpression().QuestionDotToken != nil || invocation.cut.operation != operation || invocation.cut.use != invocation.use || !validStagedMemberActivationCall(call, invocation.declaration, operation) && !sameSourceRelativeInvocation(edge.request, invocation) {
		return false
	}
	actuals := restrictedInvocationArguments(operation.AsCallExpression())
	if len(actuals) != len(invocation.actuals) {
		return false
	}
	for index, actual := range invocation.actuals {
		if actual.expression != actuals[index] || actual.ordinal != index || actual.spread || ast.IsSpreadElement(actuals[index]) {
			return false
		}
	}
	return true
}

func stagedCallResultRequest(call, declaration *ast.Node) sourceStagedOperationRequest {
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: call, field: "call-return-source"}}, consumer: declaration, edge: fmt.Sprintf("call-return:%d", call.Pos()), use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
}

func sameStagedCallResultSource(a, b *sourceStagedCallResultSource) bool {
	return a == b || a != nil && b != nil && a.declaration == b.declaration && a.binding == b.binding && sameModuleConstruction(a.moduleConstruction, b.moduleConstruction) && sameDescriptorRetrieval(a.nativeDescriptor, b.nativeDescriptor) && sameFrameworkStorageView(a.frameworkView, b.frameworkView) && sameStagedGetResultSource(a.getResult, b.getResult) && a.nativeCall == b.nativeCall && sameOperationRequest(a.constructedRoot, b.constructedRoot) && operationPrefix(a.constructedPreparation, b.constructedPreparation, sameOperationRequest) && operationPrefix(b.constructedPreparation, a.constructedPreparation, sameOperationRequest) && a.generation == b.generation && sameOperationRequest(a.request, b.request) && (a.operand == nil && b.operand == nil || a.operand != nil && b.operand != nil && sameOperationEndpoint(*a.operand, *b.operand))
}

func validStagedCallResultRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source != nil && len(source.constructedPreparation) != 0 && (!validStagedConstructedResultSource(source) || !validConstructedResultPreparationPrefix(recipe)) {
		return false
	}
	if source != nil && source.moduleConstruction != nil && source.moduleConstruction.localOwner != nil {
		return validLocalConstructionDataRecipe(recipe)
	}
	if source != nil && source.moduleConstruction != nil && source.binding == nil {
		return false
	}
	if source != nil && source.nativeDescriptor != nil {
		return validNativeDescriptorResultRecipe(recipe)
	}
	if source != nil && source.frameworkView != nil {
		return validStagedFrameworkResultRecipe(recipe)
	}
	if source != nil && source.getResult != nil && source.getResult.role != "body" {
		return validStagedGetResultRecipe(recipe)
	}
	if source == nil || source.generation == nil || source.declaration == nil || source.request.producer != recipe.key || recipe.key.kind != relativeDemandDirectExposure || !ast.IsCallExpression(recipe.key.operation) && !stagedGetResultBody(source) && source.binding == nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if source.operand != nil {
		return validStagedReturnOperandRecipe(recipe)
	}
	if len(source.readings) != len(source.readCuts) {
		return false
	}
	for _, input := range source.inputReadings {
		if !validStagedInputCallResultReading(source, input) {
			return false
		}
	}
	for _, p := range source.projections {
		if !validFreezeProjection(source, p) {
			return false
		}
	}
	if source.freezeReturn != nil && !validFreezeReturnSource(source.freezeReturn, source) {
		return false
	}
	for _, data := range source.preparationData {
		if !validGetPreparationData(data.parent, data) || !sameOperationRequest(data.source, source.request) {
			return false
		}
		present := false
		for i, reading := range source.readings {
			present = present || sameOperationRequest(reading, data.reading) && source.readCuts[i] == data.physical
		}
		if !present {
			return false
		}
	}
	for index, reading := range source.readings {
		inputRead := false
		for _, input := range source.inputReadings {
			inputRead = inputRead || sameOperationRequest(input.request, reading) && input.call.invocation.cut == source.readCuts[index]
		}
		parent := sourceStagedOperationRequest{producer: reading.reading, consumer: reading.consumer}
		descriptorRead := validStagedDescriptorReceiverReading(source, reading, source.readCuts[index])
		bindingRead := validNativeInputBindingReading(source, reading, source.readCuts[index])
		if !inputRead && !descriptorRead && !bindingRead && !prepDataSourceReading(source, reading, source.readCuts[index]) && !validStagedMemberObservation(parent, source.readCuts[index]) || reading.producer != recipe.key || reading.inputs != nil {
			return false
		}
	}
	if source.binding != nil {
		return validStagedBindingResultRecipe(recipe)
	}
	if !sameOperationRequest(source.request, stagedResultSourceRequest(recipe.key.operation, recipe.key.declaration, source.declaration)) {
		return false
	}
	if source.constructedRoot.producer.operation != nil && !validStagedConstructedResultSource(source) {
		return false
	}
	for _, required := range recipe.delta.required {
		if original, supported := stagedDeclarationResultEffectsRequest(source); supported && sameOperationRequest(original, required) {
			continue
		}
		if validStagedConstructedResultRequirement(source, required) {
			continue
		}
		if input, supported := nativePrimitiveInputRequest(recipe.key.operation, recipe.key.declaration); source.nativeCall && supported && input.producer.operation != nil && sameOperationRequest(input, required) {
			continue // Actual dynamic operand DATA, not an ordinary-object result grant.
		}
		if source.nativeCall && required.producer == (sourceStagedOperationKey{declaration: recipe.key.declaration, operation: recipe.key.operation, kind: relativeDemandEffects}) && required.consumer == recipe.key.declaration && required.cut == source.request.cut {
			continue
		}
		if required.producer.operation != recipe.key.operation || required.producer.declaration != recipe.key.declaration || required.producer.kind != relativeDemandDirectExposure || required.producer.selector.field != "return-operand" || required.consumer != recipe.key.declaration || required.cut != source.request.cut || required.inputs != nil {
			return false
		}
	}
	for _, alternative := range recipe.delta.exposures {
		endpoint := alternative.endpoint
		if endpoint.kind == relativeEndpointNativePrimitive || endpoint.nativePrimitive != nil {
			if alternative.creating != nil || !source.nativeCall || !validNativePrimitiveEndpoint(endpoint) || !sameOperationRequest(endpoint.nativePrimitive.request, source.request) || !validNativePrimitiveRequired(recipe, endpoint.nativePrimitive) {
				return false
			}
			continue
		}
		if endpoint.kind == relativeEndpointDescriptorView {
			if alternative.creating != nil || !validDescriptorViewPayload(endpoint.descriptorView) || endpoint.descriptorView.source.generation != source.generation {
				return false
			}
			continue
		}
		if endpoint.kind != relativeEndpointExpression && endpoint.kind != relativeEndpointRole && endpoint.kind != relativeEndpointUndefined || endpoint.kind == relativeEndpointExpression && endpoint.expression == nil {
			return false
		}
	}
	return true
}

// deferStagedCallResult runs only at an original source Call projection inside
// the exact native/member borrower. It transfers a data obligation, not the
// result or body. The native callee remains unextracted until its own source
// alternative/target producer can consume this returned data.
func (work *callableEffectWork) deferStagedCallResult(facts []callableFacts, q *sourceValueQuery, call *ast.Node, interest sourceCallResultInterest) bool {
	b := q.stagedMember
	native := q.stagedNativeGet
	if !validSourceCallResultInterest(interest) || b == nil || b.projectingReturn != call || b.publishing || !q.liveStagedMemberSource(b, b.get, b.read) || b.generation != work.operationGeneration || call == nil || !stagedDataSourceExpression(call) {
		return false
	}
	caller := enclosingCallableNode(call)
	if caller == nil {
		caller = sourceStagedModuleOwner(call)
	}
	callerIndex, owned := work.memberNodes[caller]
	if !owned {
		return false
	}
	source, eligible := work.describeStagedCallResultSource(facts, callerIndex, call, q.executable)
	if !eligible {
		return false
	}
	// Original source discovery can need DATA before its source-set origin/C
	// exists. Only this framework view may enroll a pending original Get task;
	// no source-set completeness or selected value follows from registration.
	if (source.frameworkView != nil || source.nativeDescriptor != nil) && native == nil && b.coverage == nil {
		return work.deferFrameworkGetResumption(facts, q, source)
	}
	parent, parentKnown := work.operationRecipes[b.request.producer]
	// The original live source-set owner can precede ordinary parent adoption.
	// It authenticates this DATA relation without supplying a normal value.
	if native == nil && (!parentKnown || !validOperationEnvelope(parent)) && b.coverage == nil && (b.getPreparation == nil || !b.getPreparation.acquisition.live(q, b.getPreparation)) {
		return false
	}
	root := parent.nativeGet
	beforeNativePublication := false
	if native != nil {
		if native.issuer != q || native.owner != q.owner || native.generation != work.operationGeneration || native.call != b.request.producer.operation || q.protectedMember != native.call.Expression() || native.publish == nil || native.finish == nil {
			return false
		}
		if !parentKnown {
			// The original callee Get precedes selected-parent publication. Its
			// exact live C can retain child DATA without claiming a native kind
			// or inventing the not-yet-issued native callee phase.
			if native.dataBranch || native.canonical || native.contextual || native.finishing || native.legacyPrepared || b.coverage == nil || q.relativeInputCut(b.get.operation) != b.observation {
				return false
			}
			beforeNativePublication = true
		} else if root == nil || !validNativeGetRecipe(parent) || !sameOperationRequest(root.request, b.request) || root.get != native.call.Expression() {
			return false // A malformed published parent cannot borrow preselection.
		}
	}
	request := source.request
	reading := request
	reading.consumer, reading.reading = b.request.consumer, b.request.producer
	observation := b.observation
	reading.edge = fmt.Sprintf("%s:call-return:%d:read:%d:%d", b.request.edge, call.Pos(), observation.operation.Pos(), observation.operation.End())
	memberReading := native == nil || beforeNativePublication
	if native != nil && !beforeNativePublication {
		selected := reading
		selected.reading = nativeRootDebtRequest(root, "callee-get").producer
		// Publication cannot rekey an existing preselection subscriber. That
		// exact C reading remains its authority after the native parent appears.
		if recipe, known := work.operationRecipes[request.producer]; known {
			prior := recipe.callResult
			if !validStagedCallResultRecipe(recipe) || !sameStagedCallResultSource(prior, source) {
				return false
			}
			for index, old := range prior.readings {
				if old.consumer != reading.consumer || old.edge != reading.edge {
					continue
				}
				if prior.readCuts[index] != observation || !sameOperationRequest(old, reading) && !sameOperationRequest(old, selected) {
					return false
				}
				memberReading = sameOperationRequest(old, reading)
			}
		}
		if !memberReading {
			reading = selected
		}
	}
	if memberReading {
		coverage, valid := work.memberCallResultCoverage(q)
		if !valid {
			if native == nil && b.getPreparation != nil && interest.purpose == resultSourceProjection {
				_, accepted := work.retainGetPreparationData(facts, q, source, interest)
				return accepted
			}
			return false
		}
		if coverage.delta.extracted {
			present := false
			for _, child := range coverage.delta.required {
				present = present || sameOperationRequest(child, reading)
			}
			if !present {
				if b.getPreparation != nil && interest.purpose == resultSourceProjection {
					_, accepted := work.retainGetPreparationData(facts, q, source, interest)
					return accepted
				}
				return false
			}
		}
	}
	if !work.registerStagedCallResultReading(facts, source, reading, observation, nil) {
		return false
	}
	if !memberReading {
		if !work.requireNativeCallResult(facts, root, reading) {
			return false
		}
		native.resultPending = true
		return true
	}
	if !work.requireMemberCallResult(facts, q, reading) {
		return false
	}
	// Other member borrowers retain their existing DATA wait. The ordinary
	// Get resumer owns only this original lexical PropertyGet domain.
	if native == nil && (source.frameworkView != nil || source.nativeDescriptor != nil) && q.inputs == nil && q.operation == nil && ast.IsPropertyAccessExpression(b.request.producer.operation) && b.get.operation == b.request.producer.operation && b.request.producer.selector == (sourceStagedOperationSelector{}) && b.observation == b.request.cut {
		// Retaining DATA on C cannot re-enumerate an initially unrepresented
		// source set. The existing original-Get owner waits for this exact
		// closed/APPLIED reading, then issues another genuine observation.
		return work.deferFrameworkGetResumption(facts, q, source)
	}
	return true
}

// transferStagedCallResult authenticates a synchronous result-reading loan.
// A noncallable law can use the current original native producer before the
// reader's final source stamp. The data debt keeps its full Effects root.
// A consumer that uses the law must retain transfer.required on its own Get.
// Merely accepting data debt does not consume that selection prerequisite.
func (work *callableEffectWork) transferStagedCallResult(facts []callableFacts, q *sourceValueQuery, call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
	if !validSourceCallResultInterest(interest) {
		return sourceStagedCallResultTransfer{}
	}
	if q.liveStagedMemberReceiverPreparation(call) && !q.liveStagedMemberSource(q.stagedMember, q.stagedMember.get, q.stagedMember.read) {
		return work.transferPreparedMemberReceiverData(facts, q, call)
	}
	if !work.deferStagedCallResult(facts, q, call, interest) {
		return sourceStagedCallResultTransfer{}
	}
	transfer := sourceStagedCallResultTransfer{accepted: true}
	if b := q.stagedMember; b != nil && b.getPreparation != nil && interest.purpose == resultSourceProjection {
		caller := enclosingCallableNode(call)
		if caller == nil {
			caller = sourceStagedModuleOwner(call)
		}
		s := work.operationRecipes[stagedResultSourceRequest(call, caller, nil).producer].callResult
		if s != nil {
			for _, data := range s.preparationData {
				if q.getPreparationDataContextMatches(data) {
					transfer.source = work.freezeReturnReading(data)
					break
				}
			}
		}
		matched := false
		if s != nil {
			for _, data := range s.preparationData {
				matched = matched || q.getPreparationDataContextMatches(data)
			}
		}
		if matched {
			if transfer.source == nil {
				b.getPreparation.dataPending = true
			}
			return transfer
		}
	}
	b := q.stagedMember
	caller := enclosingCallableNode(call)
	if caller == nil {
		caller = sourceStagedModuleOwner(call)
	}
	key := stagedResultSourceRequest(call, caller, nil).producer
	recipe := work.operationRecipes[key]
	if recipe.callResult != nil && recipe.callResult.nativeDescriptor != nil {
		transfer.descriptorViews, transfer.required = work.currentNativeDescriptorViews(facts, q, recipe)
		if len(transfer.descriptorViews) == 0 {
			b.represented = false // Unpaid native DATA cannot become runtime unknown.
		}
		return transfer
	}
	if recipe.callResult != nil && recipe.callResult.frameworkView != nil {
		transfer.views, transfer.required = work.currentFrameworkResultViews(facts, q, recipe)
		if len(transfer.views) == 0 {
			// Unavailable compiler DATA cannot seal a source set which may later
			// discover transformed/unknown view alternatives.
			b.represented = false
		}
		return transfer
	}
	if interest.purpose == resultSourceProjection && q.stagedMember.getPreparation == nil && recipe.callResult != nil && recipe.callResult.nativeCall {
		if work.retainFreezeProjection(facts, q, call) {
			transfer.source = work.freezeProjectionReading(q, call)
		}
		return transfer
	}
	if recipe.callResult != nil && recipe.callResult.constructedRoot.producer.operation != nil {
		// Install the existing result-role debt during the original observation,
		// before passive readiness or ordinary activation can inspect this reader.
		work.refineStagedConstructedCallResult(facts, recipe)
		return transfer
	}
	if interest.purpose != resultCallableExposure || recipe.callResult == nil || !recipe.callResult.nativeCall {
		if recipe.callResult != nil && descriptorDataPayloadPresent(recipe.delta) {
			transfer.descriptorViews, transfer.required = work.descriptorViewsForSourceGet(facts, q, recipe)
			if len(transfer.descriptorViews) == 0 {
				b.represented = false
			}
		}
		return transfer
	}
	work.refineStagedNativeResult(facts, recipe)
	recipe = work.operationRecipes[key]
	root := work.nativeResultSource(recipe)
	if root == nil || !work.nativeResultNoncallableRoot(root) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], root.request) || q.stagedMember != b || b.projectingReturn != call || !q.liveStagedMemberSource(b, b.get, b.read) {
		return transfer
	}
	transfer.required = root.request
	transfer.noncallable = true
	return transfer
}

// validStagedCallResultReading keeps the data producer at its creating Call.
// The parent and physical read authenticate a distinct source observation, not
// a retargeted invocation or permission to use the data as normal output.
func validStagedCallResultReading(request, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	call := request.producer.operation
	if call == nil || !stagedDataSourceExpression(call) || request.producer.kind != relativeDemandDirectExposure || request.consumer != parent.consumer || request.reading != parent.producer || request.inputs != nil || !validStagedMemberObservation(parent, cut) {
		return false
	}
	original := stagedResultSourceRequest(call, request.producer.declaration, nil)
	original.consumer, original.reading, original.edge = request.consumer, request.reading, request.edge
	return request.edge != "" && sameOperationRequest(request, original)
}

// stagedMemberResultReading requires the exact data reading issued during the
// current graph's original member loan, including its frozen physical cut.
func (work *callableEffectWork) stagedMemberResultReading(request, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if !validStagedCallResultReading(request, parent, cut) {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	source := recipe.callResult
	if source == nil || source.generation != work.operationGeneration || !validStagedCallResultRecipe(recipe) {
		return false
	}
	for i, reading := range source.readings {
		if sameOperationRequest(reading, request) && source.readCuts[i] == cut {
			return true
		}
	}
	return false
}

// memberCallResultCoverage validates the current original C before a result
// reader mutates either source description. Preparing an unfinished description
// supplies no observation stamp, local completion or parent native selection.
func (work *callableEffectWork) memberCallResultCoverage(q *sourceValueQuery) (sourceStagedOperationRecipe, bool) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || b.coverage.cut != b.observation || b.coverage.generation != work.operationGeneration {
		return sourceStagedOperationRecipe{}, false
	}
	prior, known := work.operationRecipes[b.coverage.request.producer]
	var prefix *sourceStagedOperationRecipe
	extracted := false
	if known {
		prefix = &prior
		extracted = prior.delta.extracted
	}
	return cumulativeStagedMemberCoverage(b.request, b.coverage, prefix, extracted)
}

// requireMemberCallResult attaches a dormant result role to the original source
// set before the member owner yields. Candidate Effects remain independent and
// the required data producer cannot certify selection, activation or output.
func (work *callableEffectWork) requireMemberCallResult(facts []callableFacts, q *sourceValueQuery, result sourceStagedOperationRequest) bool {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage == nil || !validStagedCallResultReading(result, b.request, b.observation) {
		return false
	}
	source := work.operationRecipes[result.producer].callResult
	if source == nil || source.generation != work.operationGeneration {
		return false
	}
	return work.requireStagedMemberChild(facts, q, result)
}

// requireStagedMemberChild attaches an authenticated child before the original
// member consumer yields. Registration does not settle the source observation.
func (work *callableEffectWork) requireStagedMemberChild(facts []callableFacts, q *sourceValueQuery, result sourceStagedOperationRequest) bool {
	b := q.stagedMember
	if b == nil {
		return false
	}
	liveCoverage := b.coverage
	prior, valid := work.memberCallResultCoverage(q)
	if !valid {
		return false
	}
	stored, known := work.operationRecipes[prior.key]
	present := false
	if known {
		for _, required := range stored.delta.required {
			present = present || sameOperationRequest(required, result)
		}
	}
	if known && stored.delta.extracted && !present {
		return false
	} // Completed C cannot grow a reader.
	coverage := *prior.memberSource.coverage
	coverage.required = appendEntryLawRequirement(append([]sourceStagedOperationRequest(nil), coverage.required...), result)
	source := *prior.memberSource
	source.coverage = &coverage
	prior.memberSource = &source
	prior.delta = cloneOperationDelta(prior.delta)
	prior.delta.required = coverage.required
	if !validStagedMemberCoverageRecipe(prior) || !work.stagedMemberCoverageChildren(q, &coverage) {
		return false
	}
	accepted := false
	if known {
		accepted = work.attachOperationSource(facts, prior)
	} else {
		accepted = work.registerOperationRecipe(facts, prior)
	}
	if !accepted || !q.liveStagedMemberSource(b, b.get, b.read) || b.coverage != liveCoverage || b.coverage.cut != coverage.cut {
		return false
	}
	// Commit only after the sealed prefix and the original borrower agree.
	b.required = appendEntryLawRequirement(b.required, result)
	b.coverage.required = append([]sourceStagedOperationRequest(nil), coverage.required...)
	b.coverage.fieldBodies = cloneStagedMemberFieldBodies(coverage.fieldBodies)
	return true
}

// acceptedStagedCallResultRequest shares exact consumer-envelope validation
// between adoption and queue registration. Merely matching a producer key does
// not authorize another read, cut, consumer or creating association.
func acceptedStagedCallResultRequest(source *sourceStagedCallResultSource, request sourceStagedOperationRequest) bool {
	if source == nil {
		return false
	}
	if sameOperationRequest(request, source.request) {
		return true
	}
	for _, reading := range source.readings {
		if sameOperationRequest(request, reading) {
			return true
		}
	}
	return false
}

// prepareStagedCallResult consumes the retained current-facts creating packet.
// Its canonical summary is required before return data can publish. Empty
// inventories, unknown operands and unavailable packets do not imply completion.
func (work *callableEffectWork) prepareStagedCallResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	if source == nil || owner == nil || source.generation != owner.values.generation {
		return
	}
	if source.nativeDescriptor != nil {
		work.prepareNativeDescriptorResult(facts, id, owner)
		return
	}
	if source.frameworkView != nil {
		work.prepareStagedFrameworkResult(facts, id, owner)
		return
	}
	if source.moduleConstruction != nil && source.moduleConstruction.localOwner != nil {
		work.prepareLocalConstructionData(facts, id, owner)
		return
	}
	if source.binding != nil {
		work.prepareStagedBindingResult(facts, id, owner)
		return
	}
	if source.getResult != nil && source.getResult.role != "body" {
		work.prepareStagedGetResult(facts, id, owner)
		return
	}
	if source.operand != nil {
		work.prepareStagedReturnOperand(facts, id, owner)
		return
	}
	producer := work.memberNodes[recipe.key.declaration]
	if source.constructedRoot.producer.operation != nil {
		work.prepareConstructedResultProducer(facts, id, owner)
		work.prepareStagedConstructedCallResult(facts, id)
		return
	}
	if source.nativeCall {
		work.prepareStagedNativeResult(facts, id, owner)
		return
	}
	var association *sourceStagedDeclarationCall
	for i := range facts[producer].staged.calls {
		call := &facts[producer].staged.calls[i]
		if call.inputConsumerWait == nil && call.invocation.declaration == source.declaration && call.invocation.operation == recipe.key.operation && validStagedDataResultCall(*call) {
			association = call
			break
		}
	}
	if association == nil {
		return
	}
	plan, valid := describeStagedCallReturnSources(*association, owner)
	if !valid {
		return
	}
	// The pointers come from the actual installed fact entry, not a detached
	// structurally equal packet supplied by a result consumer.
	copy := *source
	copy.moduleConstruction = cloneModuleConstruction(source.moduleConstruction)
	copy.association = *association
	recipe.callResult = &copy
	target, known := work.memberNodes[source.declaration]
	if !known {
		return
	}
	edge := source.request.edge + ":body"
	bodyCut := source.request.cut
	if stagedGetResultBody(source) {
		edge = stagedDeclarationCallEdge(facts[producer].summary.ID, association.invocation)
		bodyCut = association.invocation.cut
	}
	if work.operations[id.index].resultBody == nil {
		work.requireStagedSummary(facts, producer, target, edge, recipe.key.operation, bodyCut)
		work.operations[id.index].resultBody = &sourceStagedCallResultBody{producer: target, edge: edge}
	}
	if facts[target].staged.ready {
		work.observeStagedSummary(facts, producer, target, edge)
	}
	state := &work.operations[id.index]
	if state.resultProjection == nil || state.resultInputs != association.inputs || state.resultSourceInputs != association.sourceInputs {
		projected := describeStagedReturnBindings(plan, owner)
		state.resultProjection = &projected
		state.resultInputs, state.resultSourceInputs = association.inputs, association.sourceInputs
	}
	projected := *state.resultProjection
	delta := sourceStagedOperationDelta{extracted: projected.locallyRepresented}
	if original, supported := stagedDeclarationResultEffectsRequest(source); supported {
		for _, required := range recipe.delta.required {
			if sameOperationRequest(original, required) {
				delta.required = appendEntryLawRequirement(delta.required, required)
			}
		}
	}
	for _, branch := range projected.branches {
		var pendingOperands []sourceRelativeEndpoint
		alternative := sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(branch.endpoint)}
		if branch.pending {
			if captured, available := stagedCapturedCallResult(branch, *association, owner); available {
				alternative, branch.pending = captured, false
			}
		}
		if alternative.endpoint.kind == relativeEndpointRole {
			// Data entry substitution selects one exact role. It never uses the
			// invoked-input helper or supplies capture/default/current-write rights.
			bound := association.sourceInputs
			bindings := sourceRelativeBoundInputs{}
			if bound != nil {
				bindings = bound.bindings
			} else if association.inputs != nil {
				bindings = association.inputs.relative
			}
			found := false
			for _, binding := range bindings.bindings {
				if binding.target != alternative.endpoint.role {
					continue
				}
				found = true
				for _, endpoint := range binding.sources {
					if endpoint.kind == relativeEndpointResult {
						pendingOperands = append(pendingOperands, cloneSourceRelativeEndpoint(endpoint))
						branch.pending = true
						continue
					}
					if endpoint.kind != relativeEndpointExpression || stagedSourceDataValue(endpoint.expression) {
						delta.exposures = append(delta.exposures, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(endpoint)})
					}
					// Already-owned callable references remain DATA. Raw operation
					// operands and unresolved roles retain their original result
					// producer obligation independently of expression creation.
					ownFormal := endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal && endpoint.role.declaration == recipe.key.declaration
					if endpoint.kind == relativeEndpointRole && !ownFormal || endpoint.kind == relativeEndpointExpression && !stagedSourceDataValue(endpoint.expression) {
						branch.pending = true
						pendingOperands = append(pendingOperands, cloneSourceRelativeEndpoint(endpoint))
					}
				}
				pendingOperands = append(pendingOperands, cloneSourceRelativeEndpoints(binding.pending)...)
				if binding.unknown || len(binding.pending) != 0 || len(binding.sources) == 0 {
					branch.pending = true
				}
			}
			branch.pending = branch.pending || !found
		} else if !branch.pending || sourceInertValueCreation(alternative.endpoint.expression) {
			// Pending operation syntax describes a result producer, not a DATA
			// alternative. Inert literals can retain their known creation prefix.
			delta.exposures = append(delta.exposures, alternative)
		}
		if branch.pending && len(pendingOperands) == 0 {
			pendingOperands = append(pendingOperands, branch.endpoint)
		}
		for _, pending := range pendingOperands {
			operand := stagedReturnOperandRequest(source.request, pending)
			endpoint := cloneSourceRelativeEndpoint(pending)
			child := sourceStagedOperationRecipe{key: operand.producer, callResult: &sourceStagedCallResultSource{request: operand, declaration: source.declaration, generation: source.generation, operand: &endpoint, association: *association, getResult: source.getResult}}
			if !work.registerOperationSourcePrefix(facts, child) {
				delta.extracted = false
				continue
			}
			delta.required = append(delta.required, operand)
			if delivery, available := work.stagedCallResultData(operand); available {
				delta.exposures = append(delta.exposures, delivery.delta.exposures...)
				delta.extracted = delta.extracted && delivery.delta.extracted
			} else {
				delta.extracted = false
			}
		}
	}
	recipe.delta = delta
	if !work.attachOperationSource(facts, recipe) {
		return
	}
	if operationDeltaSize(recipe.delta) == 0 && recipe.delta.extracted {
		work.publishSourceDisposition(id)
	} else {
		work.publishOperation(id, recipe.delta)
	}
}

func (work *callableEffectWork) applyStagedCallResultData(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	if use.call != nil || use.installed != nil || len(delta.invoked)+len(delta.effects)+len(delta.relative)+len(delta.residuals) != 0 {
		return false
	}
	id, known := work.operationIDs[use.request.producer]
	if !known {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
	if subscriber == nil {
		return false
	}
	for _, alternative := range delta.exposures {
		alternative.endpoint = cloneSourceRelativeEndpoint(alternative.endpoint)
		subscriber.returned = append(subscriber.returned, alternative)
	}
	if subscriber.applied != work.operations[id.index].revision && (len(delta.exposures) != 0 || delta.extracted) {
		work.notifyStagedDescriptorReceiver(work.operationFacts, use.request)
	}
	_, bindingInvocation := work.stagedBindingInvocation(use)
	if subscriber.applied != work.operations[id.index].revision && (use.request.reading.selector.field == "input-result-source" || bindingInvocation) && (len(delta.exposures) != 0 || delta.extracted) {
		// DATA can arrive while another operation owner drains the queue. Its
		// actual input or callee consumer must run even if a later refresh sees no change.
		work.inputDataChanged = true
	}
	return true
}

// stagedSourceDataValue classifies an already-owned DATA endpoint. Empty array
// construction transports its original source only: it does not establish native
// inertness, wrapper identity, prototype immutability or a normal allocation.
// A callable
// declaration denotes a body reference rather than expression creation. Actual
// invocation still requires its own receiver/capture inputs. Raw Call/Get and
// identifier operands need their result/read producer, never this predicate.
func stagedSourceDataValue(node *ast.Node) bool {
	return sourceInertValueCreation(node) || isWriterInputCallable(node) || stagedEmptyArrayDataConstruction(node)
}

// requireNativeCallResult seals only a new required data relationship. Existing
// completed callee receipts are not reset by a consumer. Pending data cannot
// manufacture another receipt, category or successful invocation.
func (work *callableEffectWork) requireNativeCallResult(facts []callableFacts, root *sourceStagedNativeGetSource, result sourceStagedOperationRequest) bool {
	request := nativeRootDebtRequest(root, "callee-get")
	recipe, known := work.operationRecipes[request.producer]
	if !known || recipe.nativeGet == nil || !sameNativeGetSource(recipe.nativeGet, root) {
		return false
	}
	for _, prior := range recipe.delta.required {
		if sameOperationRequest(prior, result) {
			return true
		}
	}
	if id, adopted := work.operationIDs[recipe.key]; adopted && work.operations[id.index].nativeCallee != nil {
		return false
	}
	copy := *recipe.nativeGet
	copy.callResults = append(append([]sourceStagedOperationRequest(nil), copy.callResults...), result)
	recipe.nativeGet = &copy
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.required = append(recipe.delta.required, result)
	return work.attachOperationSource(facts, recipe)
}

func cloneStagedCallResultSource(source *sourceStagedCallResultSource) *sourceStagedCallResultSource {
	if source == nil {
		return nil
	}
	copy := *source
	copy.constructedPreparation = append([]sourceStagedOperationRequest(nil), source.constructedPreparation...)
	copy.projections = append([]sourceStagedFreezeProjection(nil), source.projections...)
	copy.preparationData = append([]sourceStagedGetPreparationData(nil), source.preparationData...)
	for i := range copy.preparationData {
		copy.preparationData[i] = cloneGetPreparationData(copy.preparationData[i])
	}
	copy.freezeReturn = cloneFreezeReturnSource(source.freezeReturn)
	copy.moduleConstruction = cloneModuleConstruction(source.moduleConstruction)
	copy.nativeDescriptor = cloneDescriptorRetrieval(source.nativeDescriptor)
	if source.frameworkView != nil {
		view := projectFrameworkStorageView(*source.frameworkView, nil)
		copy.frameworkView = &view
	}
	copy.readings = append([]sourceStagedOperationRequest(nil), source.readings...)
	copy.readCuts = append([]sourceRelativeCut(nil), source.readCuts...)
	copy.inputReadings = append([]sourceStagedInputCallResultReading(nil), source.inputReadings...)
	for index := range copy.inputReadings {
		copy.inputReadings[index].call.invocation = cloneStagedWriterInvocation(copy.inputReadings[index].call.invocation)
		copy.inputReadings[index].endpoint = cloneSourceRelativeEndpoint(copy.inputReadings[index].endpoint)
	}
	copy.association.invocation = cloneStagedWriterInvocation(source.association.invocation)
	if source.getResult != nil {
		get := *source.getResult
		get.frameworkResume = cloneFrameworkGetResumption(source.getResult.frameworkResume)
		copy.getResult = &get
	}
	if source.operand != nil {
		endpoint := cloneSourceRelativeEndpoint(*source.operand)
		copy.operand = &endpoint
	}
	return &copy
}

// prepareStagedNativeResult asks the original native Get producer once on the
// existing queue. It never enters a Call or recovers its output. Even a selected
// branch keeps all callee/input/algorithm and result-alternative obligations.
func (work *callableEffectWork) prepareStagedNativeResult(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	key := sourceStagedOperationKey{declaration: recipe.key.declaration, operation: recipe.key.operation, kind: relativeDemandEffects}
	if !work.operations[id.index].resultSourceRequested {
		work.operations[id.index].resultSourceRequested = true
		// An already reached producer owns this original Call's selected Get.
		// Borrow its current graph receipt instead of reissuing the selection
		// while extracting a later reader's data requirement. Cached blueprints
		// and fresh clones have no such receipt and still need the source owner.
		current := false
		if source := work.operationRecipes[key].nativeGet; source != nil {
			callee := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
			if callee.epoch == work.operationEpoch && callee.index != 0 && int(callee.index) < len(work.operations) {
				proof := work.operations[callee.index].nativeCallee
				current = proof != nil && proof.generation == work.operationGeneration && validStagedNativeCalleeEffects(*proof, source)
			}
		}
		if !current || (len(recipe.callResult.preparationData) != 0 || len(recipe.callResult.projections) != 0) && recipe.callResult.freezeReturn == nil {
			work.describeNativeInputOccurrence(facts, work.memberNodes[recipe.key.declaration], recipe.key.operation, owner)
		}
		// Source publication may add another original reading to this recipe.
		recipe = work.operationRecipes[work.operations[id.index].key]
	}
	root := work.operationRecipes[key].nativeGet
	if root != nil && root.kind == sourceNativeSymbolFor {
		work.prepareNativePrimitiveInput(facts, recipe, owner)
	}
	work.refineStagedNativeResult(facts, recipe)
	// Attaching an unextracted prefix registers its children but deliberately
	// does not publish revision zero. This actual adopted producer must deliver
	// its known requirement even while result support remains pending.
	current := work.operationRecipes[work.operations[id.index].key]
	if operationDeltaSize(current.delta) != 0 {
		work.publishOperation(id, current.delta)
	} else if current.delta.extracted {
		work.publishSourceDisposition(id)
	}
}

// nativeResultSource uses the original producer's current strong Get and
// guarded algorithm. A finite Effects Get or cached blueprint cannot supply
// the result relation. Full producer Effects remain a required child.
func (work *callableEffectWork) nativeResultSource(recipe sourceStagedOperationRecipe) *sourceStagedNativeGetSource {
	if !validStagedCallResultRecipe(recipe) || recipe.callResult == nil || !recipe.callResult.nativeCall || recipe.callResult.generation != work.operationGeneration {
		return nil
	}
	key := sourceStagedOperationKey{declaration: recipe.key.declaration, operation: recipe.key.operation, kind: relativeDemandEffects}
	return work.currentNativeResultRoot(key)
}

// currentNativeResultRoot consumes actual producer receipts, not a result
// consumer's descriptive endpoint. The original algorithm guard remains shared.
func (work *callableEffectWork) currentNativeResultRoot(key sourceStagedOperationKey) *sourceStagedNativeGetSource {
	recipe, known := work.operationRecipes[key]
	root := recipe.nativeGet
	if !known || root == nil || !validOperationEnvelope(recipe) || root.request.producer != key {
		return nil
	}
	if work.currentNativeCalleeEffects(root) == nil {
		return nil
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
	if algorithm == nil || !sameNativeGetSource(algorithm, root) || !work.currentNativeOrdinaryInputResult(algorithm) {
		return nil
	}
	return root
}

// projectedStagedCallResultReading consumes an existing current binding or
// completion projection. Its original source branch and exact required child
// authorize DATA transport. Canonical bodies, inputs and full native Effects
// still have their independent publication requirements.
func (work *callableEffectWork) projectedStagedCallResultReading(child sourceStagedOperationRecipe) bool {
	for index := 1; index < len(work.operations); index++ {
		state := &work.operations[index]
		parent := work.operationRecipes[state.key]
		source := parent.callResult
		if state.invalid || source == nil || source.generation != work.operationGeneration || !validStagedCallResultRecipe(parent) {
			continue
		}
		matched := false
		if source.operand != nil {
			// The existing operand request retains the authentic outer Call packet
			// and original return site. Its DATA child is not a synthetic Get reader.
			matched = source.operand.expression == child.key.operation && work.currentStagedResultAssociation(work.operationFacts, source)
		} else if state.resultProjection != nil {
			if source.binding == nil && (state.resultBody == nil || !work.currentStagedResultAssociation(work.operationFacts, source) || state.resultInputs != source.association.inputs || state.resultSourceInputs != source.association.sourceInputs) {
				continue
			}
			for _, branch := range state.resultProjection.branches {
				matched = matched || branch.endpoint.expression == child.key.operation
			}
		}
		if !matched {
			continue
		}
		for _, request := range parent.delta.required {
			if sameOperationRequest(request, child.callResult.request) {
				return true
			}
		}
	}
	return false
}

// A passive reading is an original DATA demand, not ordinary adoption of its
// unfinished parent. Its exact current source observation lends local transport
// authority while the native producer independently owns the data relation.
func (work *callableEffectWork) freshStagedCallResultReading(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.generation != work.operationGeneration {
		return false
	}
	if work.getPreparationDataSourceObserved(source) {
		return true
	}
	if work.freshNativeInputBindingReading(recipe) {
		return true
	}
	for _, input := range source.inputReadings {
		if work.currentStagedInputCallResultReading(source, input) {
			return true
		}
	}
	if work.projectedStagedCallResultReading(recipe) {
		return true
	}
	for _, parent := range work.operationRecipes {
		member := parent.memberSource
		if member == nil || member.coverage == nil || !validStagedMemberCoverageRecipe(parent) || work.memberCoverageObserved[parent.key] != work.operationGeneration || member.generation != work.operationGeneration {
			continue
		}
		for index, reading := range source.readings {
			if member.coverage.cut != source.readCuts[index] || !work.stagedMemberResultReading(reading, member.parent, member.coverage.cut) {
				continue
			}
			for _, child := range parent.delta.required {
				if sameOperationRequest(child, reading) {
					return true
				}
			}
		}
	}
	return false
}

// refineStagedNativeResult attaches the original Effects requirement before
// examining result support. It performs no source query, binder or scheduling.
// Passive consumers can refine from already delivered producer receipts without
// inventing IDs merely to make their own unfinished parent adoptable.
func (work *callableEffectWork) refineStagedNativeResult(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	if !validStagedCallResultRecipe(recipe) || recipe.callResult == nil || !recipe.callResult.nativeCall || recipe.callResult.generation != work.operationGeneration {
		return false
	}
	key := sourceStagedOperationKey{declaration: recipe.key.declaration, operation: recipe.key.operation, kind: relativeDemandEffects}
	root := work.operationRecipes[key].nativeGet
	if root == nil {
		return false
	}
	if root.kind == sourceNativeSymbolFor {
		return work.refineStagedNativePrimitiveResult(facts, recipe, root)
	}
	changed := false
	if len(recipe.delta.required) == 0 {
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.required = []sourceStagedOperationRequest{root.request}
		if !work.attachOperationSource(facts, recipe) {
			return false
		}
		changed = true
	}
	if work.nativeResultSource(recipe) == nil || !work.freshStagedCallResultReading(recipe) {
		return changed
	}
	if recipe.delta.extracted {
		return changed
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	// This token is a conditional original result relationship, never an
	// acquired object, exact identity or invocable returned value.
	recipe.delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: key.operation, producer: key.operation, cut: root.request.cut}}}
	recipe.delta.extracted = true
	return work.attachOperationSource(facts, recipe) || changed
}

func (work *callableEffectWork) passiveStagedNativeResultReady(recipe sourceStagedOperationRecipe) bool {
	root := work.nativeResultSource(recipe)
	if root == nil || !recipe.delta.extracted || !work.freshStagedCallResultReading(recipe) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], root.request) || len(recipe.delta.exposures) != 1 {
		return false
	}
	alternative := recipe.delta.exposures[0]
	expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: recipe.key.operation, producer: recipe.key.operation, cut: root.request.cut}
	return alternative.creating == nil && sameOperationEndpoint(alternative.endpoint, expected)
}

// stagedNativeResultNoncallable answers only an exposed-callables demand.
// These original native algorithms conditionally return noncallable allocations
// or their noncallable target/input. Full Effects roots remain required. This
// neither supplies a value nor permits the result to be used as a constructor.
func (work *callableEffectWork) stagedNativeResultNoncallable(recipe sourceStagedOperationRecipe) bool {
	if !work.passiveStagedNativeResultReady(recipe) {
		return false
	}
	return work.nativeResultNoncallableRoot(work.nativeResultSource(recipe))
}

// The synchronous original reader may consume this source law before its final
// C stamp. Only that live callback can attach the exact used Effects root.
func (work *callableEffectWork) nativeResultNoncallableRoot(root *sourceStagedNativeGetSource) bool {
	seen := make(map[sourceStagedOperationKey]bool)
	var noncallable func(*sourceStagedNativeGetSource) bool
	noncallable = func(root *sourceStagedNativeGetSource) bool {
		if root == nil || seen[root.request.producer] {
			return false
		}
		seen[root.request.producer] = true
		source := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
		if !work.currentNativeOrdinaryInputResult(source) {
			return false
		}
		var child sourceStagedOperationRequest
		switch source.kind {
		case sourceNativeObjectCreate:
			return true // The original allocation algorithm never creates a callable.
		case sourceNativeObjectDefineProperties:
			return ast.IsObjectLiteralExpression(source.descriptorMap.target.expression)
		case sourceNativeObjectDefineProperty:
			if ast.IsObjectLiteralExpression(source.installation.target.expression) {
				return true
			}
			if !validNativeTargetSource(source) {
				return false
			}
			child = source.targetSource
		case sourceNativeObjectFreeze:
			if ast.IsObjectLiteralExpression(source.input.input.expression) {
				return true
			}
			if !validStagedNativeInputSource(source) {
				return false
			}
			child = source.inputSource
		default:
			return false
		}
		producer := work.currentNativeResultRoot(child.producer)
		return producer != nil && sameOperationRequest(producer.request, child) && noncallable(producer)
	}
	return noncallable(root)
}

func (work *callableEffectWork) refreshStagedCallResults(facts []callableFacts, owner *executableBodyOwner) bool {
	work.prepareConstructedMemberResults(facts, owner)
	changed := false
	for index := 1; index < len(work.operations); index++ {
		if work.operationRecipes[work.operations[index].key].callResult == nil {
			continue
		}
		before := work.operations[index].revision
		work.prepareStagedCallResult(facts, sourceStagedOperationID{epoch: work.operationEpoch, index: uint32(index)}, owner)
		changed = changed || work.operations[index].revision != before
	}
	var passive []sourceStagedOperationKey
	for key, recipe := range work.operationRecipes {
		if _, adopted := work.operationIDs[key]; !adopted && recipe.callResult != nil && (recipe.callResult.nativeCall || recipe.callResult.constructedRoot.producer.operation != nil) {
			passive = append(passive, key)
		}
	}
	for _, key := range passive {
		if work.operationRecipes[key].callResult.constructedRoot.producer.operation != nil {
			changed = work.refineStagedConstructedCallResult(facts, work.operationRecipes[key]) || changed
			continue
		}
		changed = work.refineStagedNativeResult(facts, work.operationRecipes[key]) || changed
	}
	work.drainOperationExtractions(facts, owner)
	changed = work.refreshStagedHasInstanceInputs(facts, owner) || changed
	return changed
}

// deferStagedCallReturn is the shared pre-acquisition source boundary. Consumers
// with a temporary result-reading cut call it before installing that cut.
func (q *sourceValueQuery) deferStagedCallReturn(call *ast.Node, interest sourceCallResultInterest) bool {
	return q.transferStagedCallReturn(call, interest).accepted
}

// transferStagedCallReturn keeps the original observation live across the
// typed callback. Reentry, copied issuers and expired source loans have neither
// accepted data membership nor a noncallable result law.
func (q *sourceValueQuery) transferStagedCallReturn(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
	if !validSourceCallResultInterest(interest) || q == nil || q.stagedMember == nil || call == nil || !stagedDataSourceExpression(call) {
		return sourceStagedCallResultTransfer{}
	}
	b := q.stagedMember
	if q.liveStagedMemberReceiverPreparation(call) && !q.liveStagedMemberSource(b, b.get, b.read) {
		if b.returnResult == nil || b.projectingReturn != nil || b.publishing {
			return sourceStagedCallResultTransfer{}
		}
		preparation := q.memberReceiverPreparation
		b.projectingReturn = call
		defer func() {
			if b.projectingReturn == call {
				b.projectingReturn = nil
			}
		}()
		transfer := b.returnResult(call, interest)
		if !transfer.accepted || q.memberReceiverPreparation != preparation || !q.liveStagedMemberReceiverPreparation(call) || b.projectingReturn != call {
			return sourceStagedCallResultTransfer{}
		}
		return transfer
	}
	if b.returnResult == nil || b.projectingReturn != nil || b.publishing || !q.liveStagedMemberSource(b, b.get, b.read) {
		return sourceStagedCallResultTransfer{}
	}
	get, read, observation := b.get, b.read, b.observation
	physical := q.relativeInputCut(get.operation)
	b.projectingReturn = call
	defer func() {
		if b.projectingReturn == call {
			b.projectingReturn = nil
		}
	}()
	transfer := b.returnResult(call, interest)
	if !transfer.accepted || b.projectingReturn != call || b.get != get || b.read != read || b.observation != observation || !q.liveStagedMemberSource(b, get, read) || q.relativeInputCut(get.operation) != physical {
		return sourceStagedCallResultTransfer{}
	}
	return transfer
}
