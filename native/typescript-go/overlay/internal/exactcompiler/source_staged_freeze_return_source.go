package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A Freeze return SOURCE keeps the original literal's lexical roles. It is not
// an acquired object, a creating binder, integrity evidence, or a Call token.
type sourceStagedFreezeReturnRole struct {
	property *ast.Node
	formal   *ast.Node
	role     sourceRelativeRole
}
type sourceStagedFreezeReturnSource struct {
	root, input                   sourceStagedOperationRequest
	endpoint                      sourceRelativeEndpoint
	declaration, method           *ast.Node
	generation                    *projectGeneration
	physical                      sourceRelativeCut
	roles                         []sourceStagedFreezeReturnRole
	inputUncertain, calleePending bool
}
type sourceStagedFreezeReturnObservation struct {
	self   *sourceStagedFreezeReturnObservation
	id     sourceStagedOperationID
	source *sourceStagedFreezeReturnSource
	proof  sourceStagedNativeCalleeEffects
}

type sourceStagedFreezeReturnRead struct {
	source     *sourceStagedFreezeReturnSource
	data       sourceStagedGetPreparationData
	projection *sourceStagedFreezeProjectionLoan
}

func sameFreezeReturnSource(a, b *sourceStagedFreezeReturnSource) bool {
	if a == nil || b == nil {
		return a == b
	}
	return sameOperationRequest(a.root, b.root) && sameOperationRequest(a.input, b.input) && sameOperationEndpoint(a.endpoint, b.endpoint) && a.declaration == b.declaration && a.method == b.method && a.generation == b.generation && a.physical == b.physical && slices.Equal(a.roles, b.roles) && a.inputUncertain == b.inputUncertain
}
func cloneFreezeReturnSource(s *sourceStagedFreezeReturnSource) *sourceStagedFreezeReturnSource {
	if s == nil {
		return nil
	}
	c := *s
	c.endpoint = cloneSourceRelativeEndpoint(s.endpoint)
	c.roles = append([]sourceStagedFreezeReturnRole(nil), s.roles...)
	return &c
}
func validFreezeReturnSource(s *sourceStagedFreezeReturnSource, source *sourceStagedCallResultSource) bool {
	if s == nil || source == nil || source.declaration == nil || !ast.IsFunctionDeclaration(source.declaration) || !source.nativeCall || s.generation != source.generation || s.declaration != source.declaration || s.method == nil || s.root.producer.operation != source.request.producer.operation || s.root.producer.kind != relativeDemandEffects || s.root.consumer != s.declaration || s.endpoint.kind != relativeEndpointExpression || s.endpoint.producer != s.root.producer.operation || s.endpoint.cut != s.root.cut || !ast.IsObjectLiteralExpression(s.endpoint.expression) || len(s.endpoint.projection) != 0 || s.input.producer.operation != s.root.producer.operation || s.physical.operation != s.root.producer.operation {
		return false
	}
	properties := s.endpoint.expression.AsObjectLiteralExpression().Properties.Nodes
	if len(properties) != 1 || len(properties) != len(s.roles) {
		return false
	}
	for i, p := range properties {
		r := s.roles[i]
		if p != r.property || !ast.IsShorthandPropertyAssignment(p) || p.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil || !validOperationRelativeRole(r.role, s.declaration) {
			return false
		}
		parameters := s.declaration.Parameters()
		if r.role.slot >= len(parameters) {
			return false
		}
		formal := parameters[r.role.slot]
		if formal != r.formal {
			return false
		}
		if !ast.IsIdentifier(formal.Name()) || formal.Initializer() != nil || formal.AsParameterDeclaration().DotDotDotToken != nil {
			return false
		}
	}
	return true
}

// captureFreezeReturnSource is called by the genuine selected algorithm owner.
// The existing relationship performs the input acquisition once. Publication is
// a prefix: selection cannot supply the later complete-callee observation.
func (work *callableEffectWork) captureFreezeReturnSource(facts []callableFacts, q *sourceValueQuery, native *sourceStagedNativeGetSource, selected sourceValue) {
	key := stagedResultSourceRequest(native.request.producer.operation, native.request.consumer, nil).producer
	recipe := work.operationRecipes[key]
	if recipe.callResult == nil || len(recipe.callResult.preparationData)+len(recipe.callResult.projections) == 0 || !recipe.callResult.nativeCall || q == nil || q.stagedNativeGet == nil || q.stagedNativeGet.inputSelection == nil || q.stagedNativeGet.issuer != q || q.stagedNativeGet.owner != q.owner || q.stagedNativeGet.sourceWork != work || q.stagedNativeGet.sourceEpoch != work.operationEpoch || q.stagedNativeGet.generation != work.operationGeneration || q.stagedNativeGet.observation != nil || !sameOperationRequest(q.stagedNativeGet.inputSelection.request, native.request) || q.stagedNativeGet.inputSelection.selected.node != selected.node || selected.native == nil || selected.native.kind != sourceNativeObjectFreeze || native.input == nil || !ast.IsObjectLiteralExpression(native.input.input.expression) || !q.stagedNativeGet.canonical || q.stagedNativeGet.contextual || q.normalBindingCall != nil {
		return
	}
	index := q.owner.index(ast.GetSourceFileOfNode(native.request.producer.operation))
	if index.incomplete || index.normalDynamicScope {
		return
	}
	var candidate *sourceStagedFreezeReturnSource
	inputResult := accessorCandidates{}
	q.sourceFreezeRelationshipObserved(native.request.producer.operation, selected, nil, false, func(sourceValue, sourceValueBindings) {}, &inputResult, func(value sourceValue, bound sourceValueBindings, acquired *accessorCandidates) {
		// Empty maps must be observed on this acquired alternative, not inferred
		// from a nil authored-binding argument supplied to the native task.
		if candidate != nil || value.node != native.input.input.expression || len(value.path) != 0 || value.capture == nil || len(value.capture.bindings) != 0 || len(value.capture.creators) != 0 || len(bound) != 0 || !calleeSyntaxCarrier(value) || value.rest != nil || value.copied != nil || value.undefined {
			return
		}
		c := &sourceStagedFreezeReturnSource{root: native.request, input: nativeInputInvocationRequest(native), endpoint: cloneSourceRelativeEndpoint(native.input.input), declaration: recipe.callResult.declaration, method: selected.node, generation: work.operationGeneration, physical: q.relativeInputCut(native.request.producer.operation), calleePending: true}
		c.inputUncertain = acquired.opaque || acquired.valueIncomplete || !nativeMemberGetChannelsRepresented(acquired) || len(acquired.environmentEffects) != 0 || len(acquired.nativeDescriptorEffects) != 0
		for _, property := range value.node.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsShorthandPropertyAssignment(property) || property.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil {
				return
			}
			symbol := q.owner.checker.GetShorthandAssignmentValueSymbol(property)
			if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != c.declaration || q.owner.bindingWritten(symbol) {
				return
			}
			formal := symbol.ValueDeclaration
			if !ast.IsIdentifier(formal.Name()) || formal.Initializer() != nil || formal.AsParameterDeclaration().DotDotDotToken != nil {
				return
			}
			found := false
			for slot, p := range c.declaration.Parameters() {
				if p == formal {
					c.roles = append(c.roles, sourceStagedFreezeReturnRole{property: property, formal: formal, role: sourceRelativeRole{kind: relativeRoleFormal, declaration: c.declaration, slot: slot}})
					found = true
					break
				}
			}
			if !found {
				return
			}
		}
		if validFreezeReturnSource(c, recipe.callResult) {
			candidate = c
		}
	})
	if candidate == nil {
		return
	}
	recipe = work.operationRecipes[key]
	if recipe.callResult.freezeReturn != nil && !sameFreezeReturnSource(recipe.callResult.freezeReturn, candidate) {
		return
	}
	s := cloneStagedCallResultSource(recipe.callResult)
	s.freezeReturn = candidate
	recipe.callResult = s
	work.attachOperationSource(facts, recipe)
}

// Only the actual finishing Get can settle the selected-callee uncertainty.
// The input uncertainty and every full native/input requirement remain intact.
func (work *callableEffectWork) finishFreezeReturnSource(facts []callableFacts, q *sourceValueQuery, native *sourceStagedNativeGetSource, proof sourceStagedNativeCalleeEffects) {
	key := stagedResultSourceRequest(native.request.producer.operation, native.request.consumer, nil).producer
	recipe := work.operationRecipes[key]
	s := recipe.callResult
	if s == nil || !validFreezeReturnSource(s.freezeReturn, s) || q == nil || q.stagedNativeGet == nil || !q.stagedNativeGet.finishing || q.stagedNativeGet.issuer != q || q.stagedNativeGet.sourceWork != work || q.stagedNativeGet.sourceEpoch != work.operationEpoch || q.stagedNativeGet.observation != nil || !q.stagedNativeGet.canonical || q.stagedNativeGet.contextual || q.stagedNativeGet.writerDependent || q.stagedNativeGet.legacyPrepared || !validStagedNativeCalleeEffects(proof, native) || s.freezeReturn.method != proof.method || s.freezeReturn.physical != proof.cut || proof.generation != work.operationGeneration || !sameOperationRequest(s.freezeReturn.root, native.request) {
		return
	}
	if !s.freezeReturn.calleePending {
		return
	}
	s = cloneStagedCallResultSource(s)
	s.freezeReturn.calleePending = false
	recipe.callResult = s
	if !work.attachOperationSource(facts, recipe) {
		return
	}
	id := work.operationIDs[key]
	if id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
		// A new actual source observation invalidates old subscriber currency.
		state := &work.operations[id.index]
		observation := &sourceStagedFreezeReturnObservation{id: id, source: s.freezeReturn, proof: proof}
		observation.self = observation
		state.freezeReturnObserved = observation
		state.revision++
		work.notifyOperationSubscribers(state)
	}
}

func (work *callableEffectWork) freezeReturnReading(data sourceStagedGetPreparationData) *sourceStagedFreezeReturnRead {
	if !work.getPreparationDataReadingObserved(data) {
		return nil
	}
	source := work.currentFreezeReturnSource(work.operationRecipes[data.source.producer], data.parent.consumer, data.reading)
	if source == nil {
		return nil
	}
	return &sourceStagedFreezeReturnRead{source: source, data: data}
}

// currentFreezeReturnSource keeps producer finishing/input currency separate
// from caller observation and exact current DATA subscriber APPLIED.
func (work *callableEffectWork) currentFreezeReturnSource(recipe sourceStagedOperationRecipe, consumer *ast.Node, reading sourceStagedOperationRequest) *sourceStagedFreezeReturnSource {
	s := recipe.callResult
	if s == nil || !validFreezeReturnSource(s.freezeReturn, s) || s.freezeReturn.calleePending || s.freezeReturn.inputUncertain || s.freezeReturn.declaration != consumer || !work.passiveStagedNativeResultReady(recipe) {
		return nil
	}
	input := work.operationRecipes[s.freezeReturn.input.producer]
	if !work.nativeInputInvocationCurrent(input) || !sameOperationRequest(input.nativeGet.request, s.freezeReturn.root) {
		return nil
	}
	id := work.operationIDs[recipe.key]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return nil
	}
	state := &work.operations[id.index]
	observed := state.freezeReturnObserved
	if state.invalid || observed == nil || observed.self != observed || observed.id != id || !sameFreezeReturnSource(observed.source, s.freezeReturn) || observed.source.calleePending || !validStagedNativeCalleeEffects(observed.proof, work.operationRecipes[s.freezeReturn.root.producer].nativeGet) || observed.proof.cut != s.freezeReturn.physical || observed.proof.method != s.freezeReturn.method {
		return nil
	}
	delivery, available := work.stagedCallResultData(reading)
	if !available || !delivery.delta.extracted {
		return nil
	}
	return s.freezeReturn
}

func (work *callableEffectWork) freezeReturnSourceRequested(native *sourceStagedNativeGetSource) bool {
	if native == nil || native.kind != sourceNativeObjectFreeze {
		return false
	}
	source := work.operationRecipes[stagedResultSourceRequest(native.request.producer.operation, native.request.consumer, nil).producer].callResult
	if source == nil || source.generation != work.operationGeneration || !source.nativeCall {
		return false
	}
	for _, projection := range source.projections {
		if validFreezeProjection(source, projection) {
			return true
		}
	}
	for _, data := range source.preparationData {
		if validGetPreparationData(data.parent, data) {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) freezeReturnReadMatches(read *sourceStagedFreezeReturnRead) bool {
	if read == nil || read.source == nil {
		return false
	}
	if read.projection != nil {
		l := read.projection
		return l.work == work && l.live(l.query) && work.currentFreezeReturnSource(work.operationRecipes[l.description.reading.producer], l.description.parent.consumer, l.description.reading) == read.source
	}
	current := work.freezeReturnReading(read.data)
	return current != nil && current.source == read.source
}
