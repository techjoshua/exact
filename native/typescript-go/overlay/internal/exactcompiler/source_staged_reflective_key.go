package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedReflectiveKey associates an original immutable module key read
// with its already issued Symbol producer. It describes a candidate's STRING
// demand, never a symbol identity, target result, or selected invocation.
type sourceStagedReflectiveKey struct {
	expression, binding *ast.Node
	producer            sourceStagedOperationRequest
	demand              string
}

func sameReflectiveKey(a, b *sourceStagedReflectiveKey) bool {
	return a == b || a != nil && b != nil && a.expression == b.expression && a.binding == b.binding && a.demand == b.demand && sameOperationRequest(a.producer, b.producer)
}
func cloneReflectiveKey(p *sourceStagedReflectiveKey) *sourceStagedReflectiveKey {
	if p == nil {
		return nil
	}
	c := *p
	return &c
}
func reflectiveKeyReading(s *sourceStagedReflectiveTargetSource) sourceStagedOperationRequest {
	r := s.keySource.producer
	r.consumer, r.reading = s.request.consumer, s.request.producer
	r.reading.selector.field = "key-source"
	r.edge = fmt.Sprintf("%s:symbol-key:%d", s.request.edge, s.keySource.expression.Pos())
	return r
}
func validReflectiveKey(s *sourceStagedReflectiveTargetSource) bool {
	p := s.keySource
	if p == nil || p.expression == nil || !ast.IsIdentifier(p.expression) || p.binding == nil || !ast.IsVariableDeclaration(p.binding) || enclosingCallableNode(p.binding) != nil || p.binding.Parent == nil || !ast.IsVariableDeclarationList(p.binding.Parent) || p.binding.Parent.Flags&ast.NodeFlagsConst == 0 || p.binding.Initializer() != p.producer.use || p.demand == "" || reflectiveTargetKeyGet(s) == nil || p.producer.consumer != p.producer.producer.declaration || !runtimeModuleEvaluation(p.producer.consumer) || !validStagedMemberParent(p.producer) {
		return false
	}
	args := restrictedInvocationArguments(s.operation.AsCallExpression())
	_, name := accessorReceiver(reflectiveTargetKeyGet(s))
	return len(args) >= 2 && args[1] == p.expression && name == p.demand && p.binding.Pos() < p.expression.Pos() && ast.GetSourceFileOfNode(p.binding) == ast.GetSourceFileOfNode(p.expression)
}

// describeReflectiveKey performs no query or adoption. Syntax authenticates the
// lexical relation only; the registered semantic producer and its fresh Get
// independently own the category. The original reader alone issues this link.
func (work *callableEffectWork) describeReflectiveKey(q *sourceValueQuery, s *sourceStagedReflectiveTargetSource) *sourceStagedReflectiveKey {
	if q == nil || q.stagedMember == nil || reflectiveTargetKeyGet(s) == nil || q.stagedMember.get == nil || q.stagedMember.get.symbol != nil || q.stagedMember.stringKey == "" {
		return nil
	}
	args := restrictedInvocationArguments(s.operation.AsCallExpression())
	if len(args) < 2 || !ast.IsIdentifier(args[1]) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(args[1])
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || q.owner.bindingWritten(symbol) {
		return nil
	}
	binding := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(binding) || enclosingCallableNode(binding) != nil || binding.Initializer() == nil || !ast.IsCallExpression(binding.Initializer()) {
		return nil
	}
	call := binding.Initializer()
	declaration := sourceStagedModuleOwner(call)
	r := work.operationRecipes[sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}]
	if !validNativeGetRecipe(r) || r.nativeGet == nil || r.nativeGet.kind != sourceNativeSymbolFor || r.key != r.nativeGet.request.producer {
		return nil
	}
	p := &sourceStagedReflectiveKey{expression: args[1], binding: binding, producer: r.nativeGet.request, demand: q.stagedMember.stringKey}
	copy := *s
	copy.keySource = p
	if !validReflectiveKey(&copy) {
		return nil
	}
	return p
}

func (work *callableEffectWork) validReflectiveKeyReading(producer sourceStagedOperationRecipe, r sourceStagedOperationRequest) bool {
	// Ordinary key readers replace the whole selector and have no association.
	// Both reflective target families retain their nonnil origin association;
	// only those readers can match this graph search. This rejects no current
	// proof and caches nothing: real reflective reads keep every check below.
	if r.reading.selector.field != "key-source" || r.reading.selector.association == nil {
		return false
	}
	if producer.nativeGet == nil || producer.nativeGet.kind != sourceNativeSymbolFor || !validNativeGetRecipe(producer) || producer.key != producer.nativeGet.request.producer {
		return false
	}
	for _, recipe := range work.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.targetSource == nil {
			continue
		}
		s := recipe.memberSource.targetSource
		if s.keySource != nil && validReflectiveKey(s) && validStagedReflectiveTargetRecipe(recipe) && s.generation == work.operationGeneration && sameOperationRequest(s.keySource.producer, producer.nativeGet.request) && sameOperationRequest(r, reflectiveKeyReading(s)) {
			return true
		}
	}
	return false
}

// reflectiveKeyCurrent consumes the independent producer's exclusive Get and
// this exact APPLIED reader. Conditional Symbol semantics retain ToString and
// full source Effects; neither a blueprint nor local X pays these premises.
func (work *callableEffectWork) reflectiveKeyInputCurrent(recipe sourceStagedOperationRecipe) bool {
	g := work.operationGeneration
	if g == nil || !g.active || g.project == nil || g.project.activeGeneration != g {
		return false
	}
	if !validStagedReflectiveTargetRecipe(recipe) || recipe.memberSource.targetSource.keySource == nil || recipe.memberSource.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	s := recipe.memberSource.targetSource
	r := reflectiveKeyReading(s)
	producer := work.operationRecipes[r.producer]
	if !work.validReflectiveKeyReading(producer, r) || work.currentNativeCalleeEffects(producer.nativeGet) == nil {
		return false
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(producer.nativeGet, "algorithm").producer]
	if !validNativeGetRecipe(algorithm) || algorithm.nativeGet.input == nil || !validStagedNativeInputPlan(*algorithm.nativeGet.input, algorithm.nativeGet) || algorithm.nativeGet.kind != sourceNativeSymbolFor {
		return false
	}
	id := work.operationIDs[r.producer]
	get := work.operationIDs[nativeRootDebtRequest(producer.nativeGet, "callee-get").producer]
	if id.epoch != work.operationEpoch || id.index == 0 || get.epoch != work.operationEpoch || get.index == 0 {
		return false
	}
	state, getter := &work.operations[id.index], &work.operations[get.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	if state.invalid || getter.invalid || !getter.delta.extracted || getter.revision == 0 || !getter.dependenciesRegistered || sub == nil || sub.blocked || state.revision == 0 || !sameOperationRequest(sub.request, r) || sub.applied != state.revision {
		return false
	}
	return true
}

func (work *callableEffectWork) reflectiveKeyCurrent(recipe sourceStagedOperationRecipe) bool {
	if !work.reflectiveKeyInputCurrent(recipe) {
		return false
	}
	s := recipe.memberSource.targetSource
	r := reflectiveKeyReading(s)
	consumer, cok := work.memberNodes[r.consumer]
	module, mok := work.memberNodes[r.producer.declaration]
	edge := r.edge + ":module"
	d := work.stagedRequired[sourceStagedDependencyKey{consumer: consumer, edge: edge}]
	return cok && mok && module < len(work.operationFacts) && module < len(work.stagedRevisions) && work.operationFacts[module].staged.ready && d != nil && d.producer == module && d.operation == s.operation && d.cut == s.cut && !d.invalid && !d.projectionPending && d.consumed == work.stagedRevisions[module]
}

func (work *callableEffectWork) prepareReflectiveKey(facts []callableFacts, id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 {
		return
	}
	r := work.operationRecipes[work.operations[id.index].key]
	if !work.reflectiveKeyCurrent(r) {
		return
	}
	r.delta = cloneOperationDelta(r.delta)
	r.delta.extracted = true
	if work.attachOperationSource(facts, r) {
		work.publishOperation(id, r.delta)
	}
}

// Only an actual applied key revision wakes the already adopted candidate.
// Its ordinary target delivery owns the existing exact native observer refresh.
func (work *callableEffectWork) afterReflectiveKeyDelivery(id sourceStagedOperationID, reading sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || !work.validReflectiveKeyReading(work.operationRecipes[reading.producer], reading) {
		return
	}
	for _, recipe := range work.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.targetSource == nil {
			continue
		}
		s := recipe.memberSource.targetSource
		if s.keySource == nil || !sameOperationRequest(reflectiveKeyReading(s), reading) {
			continue
		}
		target := work.operationIDs[recipe.key]
		if target.epoch != work.operationEpoch || target.index == 0 || work.operations[target.index].invalid {
			continue
		}
		queued := false
		for _, t := range work.extractionQueue[work.extractionHead:] {
			queued = queued || t.operation == target && !t.operationDone && !t.delivery
		}
		if !queued {
			work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[recipe.key.declaration], operation: target})
		}
	}
}

// Enrollment is a same-graph summary description. Initialization and clone
// rebuild its ordinary revision subscription; it grants no key category.
func (work *callableEffectWork) enrollReflectiveKey(facts []callableFacts, recipe sourceStagedOperationRecipe) {
	if !validStagedReflectiveTargetRecipe(recipe) || recipe.memberSource.targetSource.keySource == nil {
		return
	}
	s := recipe.memberSource.targetSource
	r := reflectiveKeyReading(s)
	consumer, cok := work.memberNodes[r.consumer]
	producer, pok := work.memberNodes[r.producer.declaration]
	if !cok || !pok || producer < 0 || producer >= len(facts) || consumer < 0 || consumer >= len(facts) || facts[producer].node != r.producer.declaration || facts[producer].sourceFile != ast.GetSourceFileOfNode(r.use) {
		return
	}
	work.requireSourceModuleAvailability(facts, consumer, producer, r.edge+":module", s.operation, s.cut)
}

// An incomplete category waits on its exact adopted key delivery/Get, or on
// an independently current key whose issued module-availability prerequisite
// has its existing propagation continuation. No source task is synthesized.
func (work *callableEffectWork) reflectiveKeyPending(s *sourceStagedReflectiveTargetSource) bool {
	r := reflectiveKeyReading(s)
	producer := work.operationRecipes[r.producer]
	if !work.validReflectiveKeyReading(producer, r) {
		return false
	}
	id := work.operationIDs[r.producer]
	if id.epoch != work.operationEpoch || id.index == 0 {
		return false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	if state.invalid || sub == nil || sub.blocked || !sameOperationRequest(sub.request, r) {
		return false
	}
	get := work.operationIDs[nativeRootDebtRequest(producer.nativeGet, "callee-get").producer]
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operationDone {
			continue
		}
		if task.operation == id && task.delivery && state.deliveryQueued {
			return true
		}
		if get.epoch == work.operationEpoch && get.index != 0 && task.operation == get && !task.delivery {
			return true
		}
	}
	return work.reflectiveKeyModulePending(s)
}

// Availability and key delivery are independent arrival orders. Only a normally
// consumed module revision wakes an existing exact candidate; no polling or
// source query is performed by summary observation.
func (work *callableEffectWork) afterReflectiveKeyModule(consumer, producer int, edge string) {
	if consumer < 0 || consumer >= len(work.operationFacts) || producer < 0 || producer >= len(work.operationFacts) {
		return
	}
	for key, recipe := range work.operationRecipes {
		if recipe.memberSource == nil || recipe.memberSource.targetSource == nil {
			continue
		}
		s := recipe.memberSource.targetSource
		if s.keySource == nil || !validStagedReflectiveTargetRecipe(recipe) || s.generation != work.operationGeneration {
			continue
		}
		r := reflectiveKeyReading(s)
		if r.consumer != work.operationFacts[consumer].node || r.producer.declaration != work.operationFacts[producer].node || edge != r.edge+":module" {
			continue
		}
		id := work.operationIDs[key]
		if id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].invalid {
			continue
		}
		queued := false
		for _, task := range work.extractionQueue[work.extractionHead:] {
			queued = queued || task.operation == id && !task.operationDone && !task.delivery
		}
		if !queued {
			work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: consumer, operation: id})
		}
	}
}
