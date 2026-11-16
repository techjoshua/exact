package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Exercise the actual deferred original body and original constructor query.
// The first target read must subscribe while its creating source is absent;
// neither immutable syntax nor registration can pay the result obligation.
func TestStagedReflectiveTargetOriginalPendingSource(t *testing.T) {
	withOriginalCacheConstructionSources(t, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		var caller, site *ast.Node
		for _, fact := range facts {
			if fact.summary.Name == "domainOperationPrototype" {
				caller = fact.node
			}
		}
		if caller == nil {
			t.Fatal("original constructor owner missing")
		}
		walkNode(caller, func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			return true
		})
		if site == nil {
			t.Fatal("original constructor site missing")
		}
		root, ok := work.registerStagedConstructionEffects(facts, work.memberNodes[caller], site, owner)
		if !ok {
			t.Fatal("original constructor source registration unavailable")
		}
		for _, phase := range append([]string{""}, stagedConstructionPhases[:]...) {
			if !validStagedConstructionEffectsRecipe(work.operationRecipes[stagedConstructionRequest(root, phase).producer]) {
				t.Fatal("original constructor phase source missing", phase)
			}
		}
		var request sourceStagedOperationRequest
		for _, recipe := range work.operationRecipes {
			if member := recipe.memberSource; member != nil && member.targetSource != nil && sameOperationRequest(member.targetSource.construction, root) {
				if !validStagedReflectiveTargetRecipe(recipe) || member.targetSource.sourceCut != (sourceRelativeCut{}) || recipe.delta.extracted || len(recipe.delta.required) != 0 {
					t.Fatal("initial construction observation supplied a creating result")
				}
				request = member.request
			}
		}
		if request.producer.operation == nil {
			t.Fatal("actual constructor owner did not register pending target")
		}
		query := newSourceDependencyQuery(site, owner.checker, owner, caller)
		query.standardConstructionSource, query.protectedMember = site, site
		revoke, installed := work.beginStagedMemberWork(query, facts, root)
		if !installed {
			t.Fatal("original constructor source loan unavailable")
		}
		defer revoke()
		query.stagedMember.constructionCallee = true
		checked := false
		var originalOperation *ast.Node
		var originalTarget sourceValue
		query.stagedMember.reflectiveTarget = func(operation *ast.Node, target sourceValue) sourceStagedReflectiveTargetTransfer {
			transfer := work.prepareStagedReflectiveTarget(facts, query, operation, target)
			if !transfer.registered {
				return transfer
			}
			if !checked && sameOperationRequest(request, transfer.request) {
				checked = true
				originalOperation, originalTarget = operation, target
				recipe := work.operationRecipes[request.producer]
				if !validStagedReflectiveTargetRecipe(recipe) || recipe.memberSource.targetSource.sourceCut != (sourceRelativeCut{}) || recipe.delta.extracted || len(recipe.delta.required) != 0 || transfer.current {
					t.Fatal("descriptive target supplied a creating result")
				}
				copied := *query
				if work.prepareStagedReflectiveTarget(facts, &copied, operation, target).registered {
					t.Fatal("copied query issued target source")
				}
				bad := target
				bad.node = nil
				if work.prepareStagedReflectiveTarget(facts, query, operation, bad).registered {
					t.Fatal("unrelated raw target issued binding source")
				}
				reading := query.reading
				query.reading = operation
				wrongCut := work.prepareStagedReflectiveTarget(facts, query, operation, target)
				query.reading = reading
				if wrongCut.registered {
					t.Fatal("different physical read issued target source")
				}
				for _, change := range []func(*sourceStagedReflectiveTargetSource){
					func(s *sourceStagedReflectiveTargetSource) { s.parent.edge += ":other" },
					func(s *sourceStagedReflectiveTargetSource) { s.generation = new(projectGeneration) },
					func(s *sourceStagedReflectiveTargetSource) { s.sourceCut = s.creating.cut },
				} {
					wrong := *recipe.memberSource.targetSource
					change(&wrong)
					if _, accepted := work.registerStagedReflectiveTargetSource(facts, query, wrong); accepted {
						t.Fatal("wrong parent/generation or descriptive source receipt accepted")
					}
				}
			}
			return transfer
		}
		query.selectSourceConstruction(site, nil, &accessorCandidates{})
		if !checked {
			t.Fatal("same original registered root did not renew target loan")
		}
		revoke()
		if work.prepareStagedReflectiveTarget(facts, query, originalOperation, originalTarget).registered {
			t.Fatal("expired original loan issued target relationship")
		}
		if work.stagedReflectiveTargetCurrent(request) {
			t.Fatal("pending target became current without creating event delivery")
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(cloned)
		if fresh.stagedReflectiveTargetCurrent(request) {
			t.Fatal("cloned description inherited target delivery")
		}
		// Enter only the producer task actually queued by the first pending
		// subscription. No whole-graph drain or ordinary initializer use is lent.
		id, adopted := work.operationIDs[request.producer]
		if !adopted {
			t.Fatal("pending original target has no adopted source task")
		}
		// Match the owning dispatcher's consumed-task protocol even though
		// deferred canonical tasks keep extractionHead behind this operation.
		takeTask := func(operation sourceStagedOperationID) (callableExtractionTask, bool) {
			for index := work.extractionHead; index < len(work.extractionQueue); index++ {
				candidate := work.extractionQueue[index]
				if candidate.operation == operation && !candidate.delivery && !candidate.operationDone {
					work.extractionQueue[index].operationDone = true
					return candidate, true
				}
			}
			return callableExtractionTask{}, false
		}
		phase := stagedConstructionRequest(root, "callee")
		phaseID := work.operationIDs[phase.producer]
		initial, initialQueued := takeTask(phaseID)
		if !initialQueued {
			t.Fatal("original constructor callee task missing")
		}
		work.extractOperation(facts, initial, owner)
		task, queued := takeTask(id)
		if !queued {
			t.Fatal("pending target did not queue its original producer")
		}
		callsBefore := len(facts[work.memberNodes[caller]].staged.calls)
		work.extractOperation(facts, task, owner)
		published := work.operationRecipes[request.producer]
		if !validStagedReflectiveTargetRecipe(published) || published.memberSource.targetSource.sourceCut == (sourceRelativeCut{}) || !published.delta.extracted || len(published.delta.required) == 0 || !sameOperationRequest(published.delta.required[0], published.memberSource.targetSource.creating) {
			t.Fatal("actual late Create event did not retain its full original Effects root")
		}
		if work.stagedReflectiveTargetCurrent(request) {
			t.Fatal("source publication bypassed its subscriber ACK")
		}
		for _, candidate := range work.extractionQueue[work.extractionHead:] {
			if candidate.operation == phaseID && !candidate.delivery && !candidate.operationDone {
				t.Fatal("constructor refresh preceded actual target delivery")
			}
		}
		beforeDelivery := len(work.extractionQueue)
		work.deliverOperationSubscribers(facts, id, owner)
		if !work.stagedReflectiveTargetCurrent(request) {
			t.Fatal("actual source revision was not applied to the target subscriber")
		}
		refresh := false
		for _, candidate := range work.extractionQueue[beforeDelivery:] {
			refresh = refresh || candidate.operation == phaseID && !candidate.delivery && !candidate.operationDone
		}
		if !refresh || len(facts[work.memberNodes[caller]].staged.calls) != callsBefore {
			t.Fatal("delivery lost constructor continuation or activated creating Call")
		}
		priorObservation := work.constructionEffectsObserved[root.producer]
		priorPhase := cloneOperationDelta(work.operationRecipes[phase.producer].delta)
		refreshTask, refreshQueued := takeTask(phaseID)
		if !refreshQueued {
			t.Fatal("delivered constructor continuation could not be dispatched")
		}
		work.extractOperation(facts, refreshTask, owner)
		observation := work.constructionEffectsObserved[root.producer]
		if observation == nil || observation == priorObservation || observation.issuer == nil || observation.issuer.observation != observation || observation.generation != work.operationGeneration || !sameOperationRequest(observation.root, root) || observation.cut != (sourceRelativeCut{operation: site, reading: site}) {
			t.Fatal("delivered continuation did not reobserve the original construction")
		}
		currentPhase := work.operationRecipes[phase.producer]
		if !validStagedConstructionEffectsRecipe(currentPhase) || !operationDeltaPrefix(priorPhase, currentPhase.delta) || len(observation.phases) != len(stagedConstructionPhases) {
			t.Fatal("fresh construction observation lost its prior required prefix")
		}
		parentC := published.memberSource.targetSource.parent
		retainedC := false
		for _, required := range currentPhase.delta.required {
			retainedC = retainedC || sameOperationRequest(required, parentC)
		}
		if !retainedC || !work.stagedReflectiveTargetCurrent(request) || len(facts[work.memberNodes[caller]].staged.calls) != callsBefore {
			t.Fatal("reobservation lost original C/target delivery or activated the creating Call")
		}
		completed := make([]callableFacts, len(facts))
		for i := range facts {
			completed[i] = cloneProjectCallableFact(facts[i])
		}
		freshCompleted := registerCallableEffectWork(completed)
		if freshCompleted.stagedReflectiveTargetCurrent(request) {
			t.Fatal("cloned completed description inherited source revision/ACK")
		}
	})
}
