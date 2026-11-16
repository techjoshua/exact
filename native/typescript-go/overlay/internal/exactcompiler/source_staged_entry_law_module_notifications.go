package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// These are derived same-graph notification memberships, never law evidence.
// A module delivery can retry only an already-adopted law's existing publisher.
type sourceStagedEntryLawModuleKey struct {
	law      sourceStagedOperationRequest
	producer int
}
type sourceStagedEntryLawModuleWatch struct {
	id                sourceStagedOperationID
	law, availability sourceStagedOperationRequest
	receipt           *sourceStagedEntryLawReceipt
	membership        sourceStagedDependencyKey
	module            sourceStagedModuleRequirement
}

func (work *callableEffectWork) indexEntryLawModuleInput(id sourceStagedOperationID, consumer int, module sourceStagedModuleRequirement, availability sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || module.producer < 0 {
		return
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	proof := work.entryLawReceipts[state.key]
	if recipe.entryLaw == nil || !validStagedEntryLawRecipe(recipe) || proof == nil || proof.prefix == nil || proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != work.operationGeneration || !sameStagedEntryLawSource(proof.source, recipe.entryLaw) || !sameOperationRequest(proof.prefix.source.request, availability) || !runtimeModuleEvaluation(recipe.entryLaw.base.consumer) {
		return
	}
	watch := sourceStagedEntryLawModuleWatch{id: id, law: recipe.entryLaw.request, availability: availability, receipt: proof, membership: sourceStagedDependencyKey{consumer, module.edge}, module: module}
	work.ensureNativeCapabilityNotifications()
	n := work.nativeCapabilityNotifications
	if n.entryLaws[watch.membership] == nil {
		n.entryLaws[watch.membership] = make(map[sourceStagedEntryLawModuleKey]sourceStagedEntryLawModuleWatch)
	}
	n.entryLaws[watch.membership][sourceStagedEntryLawModuleKey{watch.law, module.producer}] = watch
	// Registration may follow actual module consumption. This is an attempt at
	// the existing current publisher, not another observation or summary ACK.
	work.publishModuleCurrentEntryLaw(watch)
}

// indexRegisteredEntryLawModules covers adoption/dependency registration after
// earlier authentic source membership. It visits this operation's inputs only.
func (work *callableEffectWork) indexRegisteredEntryLawModules(id sourceStagedOperationID) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	proof := work.entryLawReceipts[state.key]
	if work.operationRecipes[state.key].entryLaw == nil || proof == nil || proof.prefix == nil {
		return
	}
	availability := proof.prefix.source.request
	consumer, known := work.memberNodes[availability.consumer]
	if !known {
		return
	}
	for _, module := range state.moduleInputs {
		work.indexEntryLawModuleInput(id, consumer, module, availability)
	}
}

// An actual original bit/prefix may arrive after module consumption. Enroll
// that already-adopted receipt's own inputs before the same idempotent retry.
// This does not observe source work or create a law receipt from description.
func (work *callableEffectWork) entryLawModuleSourceChanged(request sourceStagedOperationRequest) {
	id := work.operationIDs[request.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	proof := work.entryLawReceipts[request.producer]
	if recipe.entryLaw == nil || !sameOperationRequest(recipe.entryLaw.request, request) || proof == nil || proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != work.operationGeneration || proof.prefix == nil {
		return
	}
	work.registerNativeModuleInputs(work.operationFacts, id)
	work.indexRegisteredEntryLawModules(id)
}

// entryLawModuleWatchCurrent authenticates the actual law, source factory and
// consumed module subscription anew. The index supplies no capability/current
// bits; copied receipts, stale graphs and pre-initialization inputs refuse.
func (work *callableEffectWork) entryLawModuleWatchCurrent(w sourceStagedEntryLawModuleWatch) bool {
	g := work.operationGeneration
	if g == nil || !g.active || g.project == nil || g.project.activeGeneration != g || w.id.epoch != work.operationEpoch || w.id.index == 0 || int(w.id.index) >= len(work.operations) || work.operationIDs[w.law.producer] != w.id {
		return false
	}
	state := &work.operations[w.id.index]
	recipe := work.operationRecipes[state.key]
	proof := work.entryLawReceipts[state.key]
	if state.key != w.law.producer || state.invalid || !state.dependenciesRegistered || !validStagedEntryLawRecipe(recipe) || !sameOperationRequest(recipe.entryLaw.request, w.law) || !runtimeModuleEvaluation(recipe.entryLaw.base.consumer) || proof == nil || proof != w.receipt || proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != g || !sameStagedEntryLawSource(proof.source, recipe.entryLaw) || proof.prefix == nil || proof.prefix.source.generation != g || proof.prefix.source.cut != proof.cut || !sameOperationRequest(proof.prefix.source.request, w.availability) {
		return false
	}
	consumer, cok := work.memberNodes[w.availability.consumer]
	producer, pok := work.memberNodes[w.module.declaration]
	if !cok || !pok || w.law.consumer != w.availability.consumer || consumer != w.membership.consumer || producer != w.module.producer || consumer < 0 || consumer >= len(work.operationFacts) || producer < 0 || producer >= len(work.operationFacts) || producer >= len(work.stagedRevisions) || work.stagedRevisions[producer] == 0 {
		return false
	}
	if work.operationFacts[consumer].node != w.availability.consumer || work.operationFacts[producer].node != w.module.declaration {
		return false
	}
	for _, index := range []int{consumer, producer} {
		fact := &work.operationFacts[index]
		if fact.sourceFile == nil || ast.GetSourceFileOfNode(fact.node) != fact.sourceFile || g.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
			return false
		}
	}
	if !slices.Contains(state.moduleInputs, w.module) {
		return false
	}
	_, member := work.memberModuleMemberships[w.membership]
	listed := false
	for _, m := range work.memberModuleRequirements[consumer] {
		listed = listed || m.producer == producer && m.edge == w.module.edge
	}
	d := work.stagedRequired[w.membership]
	if !member || !listed || d == nil || d.invalid || d.projectionPending || d.producer != producer || d.operation != w.availability.producer.operation || d.cut != w.availability.cut || d.consumed != work.stagedRevisions[producer] || !work.operationFacts[producer].staged.ready {
		return false
	}
	// Required child adoption still precedes publication. These checks are ONLY
	// registered association correspondence. Child X/revision/APPLIED/blocked or
	// closure do not become new local-law premises; the old publisher decides
	// semantic readiness and all child Effects remain publication debts.
	for _, r := range recipe.delta.required {
		found := false
		for _, dep := range state.dependencies {
			if !sameOperationRequest(dep.request, r) {
				continue
			}
			child := dep.producer
			if child.epoch != work.operationEpoch || child.index == 0 || int(child.index) >= len(work.operations) {
				return false
			}
			source := &work.operations[child.index]
			sub := source.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
			if source.key != r.producer || work.operationIDs[r.producer] != child || !source.dependenciesRegistered || sub == nil || !sameOperationRequest(sub.request, r) {
				return false
			}
			found = true
			break
		}
		if !found {
			return false
		}
	}
	return true
}
func (work *callableEffectWork) publishModuleCurrentEntryLaw(w sourceStagedEntryLawModuleWatch) bool {
	return work.entryLawModuleWatchCurrent(w) && work.publishEntryLawSource(w.id)
}
func (work *callableEffectWork) afterEntryLawModuleConsumption(consumer, producer int, edge string) {
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	for key, w := range n.entryLaws[sourceStagedDependencyKey{consumer, edge}] {
		if key.producer == producer {
			work.publishModuleCurrentEntryLaw(w)
		}
	}
}
