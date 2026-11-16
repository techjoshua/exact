package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceInstalledMemberBody names the canonical summary subscriber issued for
// a real phase contribution. Captured inputs remain on their existing original
// source-body outcome/receiver mappings, not in this receipt.
type sourceInstalledMemberBody struct {
	producer  int
	edge      string
	operation *ast.Node
	revision  uint64
}

// observeInstalledMemberResult starts at the original population entry. Offsets
// select this actual phase's contributions, never an earlier accumulated result.
// The result pointer is borrowed only until the original population leaves.
func (event *sourceInstalledMemberEvent) observeInstalledMemberResult(result *accessorCandidates) bool {
	if event == nil || !event.live || result == nil || event.result != nil {
		return false
	}
	event.result = result
	event.inputStart = len(result.inputs)
	event.pendingStart = len(result.installedMemberPending)
	event.effectStart, event.environmentStart, event.contextStart = len(result.effects), len(result.environmentEffects), len(result.contextEffects)
	event.fieldCallStart, event.callOutcomeStart = len(result.fieldCalls), len(result.callOutcomes)
	event.fieldFallbackStart, event.callFallbackStart = len(result.fieldFallbacks), len(result.callFallbacks)
	return true
}

// publishInstalledMemberDonors keeps late known MAY contributions on their
// original canonical edges. It does not rerun the enclosing Call's appender.
// Environment effects use the existing delta; bodies use summary subscribers
// retaining actual operation and receiver relationships. Unsupported channels
// stay with the original phase result and prevent its accounting disposition.
func (work *callableEffectWork) publishInstalledMemberDonors(facts []callableFacts, q *sourceValueQuery, event *sourceInstalledMemberEvent, recipe *sourceStagedOperationRecipe, result *accessorCandidates) ([]sourceInstalledMemberBody, bool) {
	if event == nil || event.result != result || !q.liveInstalledMemberPhase(event, event.get, event.read) || recipe == nil || !sameInstalledMemberApplication(recipe.installedMember, &event.application) || event.effectStart > len(result.effects) || event.environmentStart > len(result.environmentEffects) || event.contextStart > len(result.contextEffects) || event.fieldCallStart > len(result.fieldCalls) || event.callOutcomeStart > len(result.callOutcomes) || event.fieldFallbackStart > len(result.fieldFallbacks) || event.callFallbackStart > len(result.callFallbacks) {
		return nil, false
	}
	consumer := work.memberNodes[event.application.request.consumer]
	fact := &facts[consumer]
	before := installedMemberDonorCounts(fact)
	represented := true
	for _, effect := range result.environmentEffects[event.environmentStart:] {
		if !validOperationEnvironmentEffect(effect) {
			// Keep original field/call provenance. It cannot be relabeled as a
			// plain environment atom to make an operation delta admissible.
			represented = false
			continue
		}
		seen := false
		for _, prior := range recipe.delta.effects {
			seen = seen || sameOperationEffect(prior, effect)
		}
		if !seen {
			recipe.delta.effects = append(recipe.delta.effects, effect)
		}
	}
	for _, context := range result.contextEffects[event.contextStart:] {
		if !slices.Contains(fact.directContext, context) {
			fact.directContext = append(fact.directContext, context)
		}
	}
	var bodies []sourceInstalledMemberBody
	for _, effect := range result.effects[event.effectStart:] {
		producer, known := work.memberNodes[effect.declaration]
		if !known || producer >= len(facts) || effect.operation == nil || !q.installedMemberSourceOwned(effect.operation, effect.declaration) {
			represented = false
			continue
		}
		// This is the same publisher used by original accessor effects. It
		// preserves source operation and bound receiver alternatives.
		appendAccessorTargets(fact, event.get.operation, accessorCandidates{effects: []sourceCallableEffect{effect}}, work.memberNodes, fact.sourceFile)
		source := ast.GetSourceFileOfNode(effect.operation)
		edge := sourceAccessorEffectEdgeID(fact.summary.ID, source.FileName(), effect.operation.Pos(), facts[producer].summary.ID, effect.use)
		work.requireStagedSummary(facts, consumer, producer, edge, effect.operation, event.application.memberCut)
		if producer < len(work.callers) && !slices.Contains(work.callers[producer], consumer) {
			work.callers[producer] = append(work.callers[producer], consumer)
		}
		body := sourceInstalledMemberBody{producer: producer, edge: edge, operation: effect.operation}
		for _, observed := range event.bodyRevisions {
			if observed.operation == effect.operation && observed.declaration == effect.declaration {
				body.revision = observed.revision
				break
			}
		}
		if !slices.Contains(bodies, body) {
			bodies = append(bodies, body)
		}
	}
	// Only dependency-only body records are detachable. Normal descriptor or
	// storage carriers cannot enter the source fact through this producer.
	for _, call := range result.fieldCalls[event.fieldCallStart:] {
		if !call.dependencies || call.descriptorOccurrence != nil || len(call.descriptorEffects) != 0 {
			return bodies, false
		}
		seen := false
		for _, prior := range fact.fieldCalls {
			seen = seen || sameInstalledMemberFieldCall(prior, call)
		}
		if !seen {
			fact.fieldCalls = append(fact.fieldCalls, cloneSourceFieldCall(call))
		}
	}
	for _, outcome := range result.callOutcomes[event.callOutcomeStart:] {
		if !slices.Contains(fact.callOutcomes, outcome) {
			fact.callOutcomes = append(fact.callOutcomes, outcome)
		}
	}
	if installedMemberDonorCounts(fact) != before && consumer < len(work.dirty) {
		work.dirty[consumer] = true
		work.stagedContributionChanged(consumer)
	}
	return bodies, represented
}

func (work *callableEffectWork) installedMemberBodiesCurrent(application *sourceInstalledMemberApplication, bodies []sourceInstalledMemberBody) bool {
	consumer, known := work.memberNodes[application.request.consumer]
	if !known {
		return false
	}
	for _, body := range bodies {
		dependency := work.stagedRequired[sourceStagedDependencyKey{consumer: consumer, edge: body.edge}]
		if body.revision == 0 || body.producer < 0 || body.producer >= len(work.operationFacts) || body.producer >= len(work.stagedRevisions) || !work.operationFacts[body.producer].staged.ready || work.stagedRevisions[body.producer] != body.revision || dependency == nil || dependency.invalid || dependency.projectionPending || dependency.producer != body.producer || dependency.operation != body.operation || dependency.cut != application.memberCut || dependency.consumed != body.revision {
			return false
		}
	}
	return true
}

// These publishers only append canonical channels/receiver bindings. Counts
// therefore detect a real publication change without copying or comparing the
// whole fact/summary, and repeated original observations remain idempotent.
func installedMemberDonorCounts(fact *callableFacts) [5]int {
	bindings := 0
	for _, edge := range fact.summary.Calls {
		bindings += len(edge.ReceiverBindings)
	}
	return [5]int{len(fact.summary.Calls), bindings, len(fact.directContext), len(fact.fieldCalls), len(fact.callOutcomes)}
}

func sameInstalledMemberFieldCall(a, b sourceFieldCall) bool {
	if a.operation != b.operation || a.target != b.target || a.dependencies != b.dependencies || a.complete != b.complete || a.descriptorOccurrence != nil || b.descriptorOccurrence != nil || len(a.descriptorEffects)+len(b.descriptorEffects) != 0 || !slices.Equal(a.calls, b.calls) || len(a.outcomes) != len(b.outcomes) {
		return false
	}
	for i, outcome := range a.outcomes {
		other := b.outcomes[i]
		if outcome.demand != other.demand || outcome.fulfilled != other.fulfilled {
			return false
		}
		x, y := outcome.installedMember, other.installedMember
		if x == nil && y == nil {
			continue
		}
		if x == nil || y == nil || !sameOperationRequest(x.request, y.request) || x.demand != y.demand || !sameInstalledMemberApplication(&x.application, &y.application) || !sameOperationRequest(x.call, y.call) {
			return false
		}
	}
	return true
}

// installedMemberBodyInputsRepresented consumes the existing real SOURCE-body
// callback. Its binder pointer identifies this traversal's own returned input;
// only detached phase/body identities survive in graph observations.
func installedMemberBodyInputsRepresented(event *sourceInstalledMemberEvent, result *accessorCandidates) bool {
	if event == nil || event.result != result {
		return false
	}
	for _, input := range result.inputs[event.inputStart:] {
		matched := false
		for _, o := range event.bodyObserved {
			if o.inputs != input || input == nil || o.consumer != event.application.request.consumer || o.generation != event.application.generation || !o.call.dependencies || !o.call.complete || o.call.descriptorOccurrence != nil || len(o.call.descriptorEffects) != 0 || input.declaration != o.call.target || input.deferredBody || input.storage != nil || input.operationLifetime != nil || input.population != nil || input.consumedCall != nil || input.fulfilled != nil {
				continue
			}
			ordinary := input.get == nil && input.invocation == o.call.operation
			getter := event.application.phase != installedMemberHas && o.sourceGet == event.get && event.get != nil && !event.get.hasOnly && installedMemberGetKey(event.get, event.application.key) && input.get != nil && input.get.operation == event.get.operation && input.invocation == nil && o.call.operation == event.get.operation && ast.IsGetAccessorDeclaration(o.call.target) && len(o.call.target.Parameters()) == 0
			if !ordinary && !getter {
				continue
			}
			expected := event.application.memberCut
			expected.operation = o.call.operation
			if o.cut != expected {
				continue
			}
			effectOwned := false
			for _, effect := range result.effects[event.effectStart:] {
				effectOwned = effectOwned || effect.operation == o.call.operation && effect.declaration == o.call.target
			}
			retained := false
			for _, call := range result.fieldCalls[event.fieldCallStart:] {
				retained = retained || sameInstalledMemberFieldCall(call, o.call)
			}
			matched = matched || effectOwned && retained
		}
		if !matched {
			return false
		}
	}
	return true
}

// This event-local association is captured at the existing source-body callback;
// summary delivery cannot later replace its zero or old semantic revision.
type sourceInstalledMemberBodyRevision struct {
	operation, declaration *ast.Node
	revision               uint64
}

// finishInstalledMemberDonors captures contributions emitted after the indexed
// population (notably the source literal's own getter) while the SAME original
// accessor alternative remains live. Its C requirement IDs/semantic revisions
// are copied verbatim from that population, never refreshed from current ACKs.
func (work *callableEffectWork) finishInstalledMemberDonors(q *sourceValueQuery, event *sourceInstalledMemberEvent) bool {
	if event == nil || event.result == nil || event.observation == nil || !q.liveInstalledMemberPhase(event, event.get, event.read) {
		return false
	}
	recipe, present := work.operationRecipes[event.application.request.producer]
	id := work.operationIDs[event.application.request.producer]
	if !present || !validInstalledMemberRecipe(recipe) || !sameInstalledMemberApplication(recipe.installedMember, &event.application) || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	original := event.observation
	state := &work.operations[id.index]
	if original.self != original || original.epoch != work.operationEpoch || state.installedMemberObserved != original {
		return false
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	bodies, represented := work.publishInstalledMemberDonors(work.operationFacts, q, event, &recipe, event.result)
	if !represented || !work.publishInstalledMemberPrefix(work.operationFacts, recipe) {
		return false
	}
	observed := *original
	observed.self = &observed
	observed.bodies = append([]sourceInstalledMemberBody(nil), bodies...)
	if !sameInstalledMemberObservation(original, &observed) {
		state = &work.operations[id.index]
		state.installedMemberObserved = &observed
		state.revision++
		work.notifyOperationSubscribers(state)
		event.observation = &observed
	}
	return true
}
