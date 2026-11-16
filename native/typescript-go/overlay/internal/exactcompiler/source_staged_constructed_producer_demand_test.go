package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This source-owner control deliberately stops before a selected Get. The
// unchanged target-pending test separately qualifies the real consumer entry.
func TestStagedConstructedResultProducerDemandAndRefusers(t *testing.T) {
	withOriginalCacheConstructionSources(t, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		caller := -1
		for i := range facts {
			if facts[i].summary.Name == "domainOperationPrototype" {
				caller = i
			}
		}
		if caller < 0 {
			t.Fatal("original declaration missing")
		}
		var upstream, member, creating *ast.Node
		walkNode(facts[caller].node, func(n *ast.Node) bool {
			if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
				return true
			}
			receiver, name := accessorReceiver(n.Expression())
			if ast.IsIdentifier(receiver) && name == "get" {
				if receiver.Text() == "domainOperationPrototypes" {
					upstream = n
				}
				if receiver.Text() == "domains" {
					member = n
				}
			}
			if ast.IsIdentifier(receiver) && receiver.Text() == "Object" && name == "create" {
				creating = n
			}
			return true
		})
		if upstream == nil || member == nil || creating == nil {
			t.Fatal("original producer/member/native demand missing")
		}
		original := stagedConstructedOccurrenceAt(&facts[caller], upstream, owner)
		if original == nil || len(original.sites) != 1 || len(work.operationRecipes[original.request.producer].constructedGroup) != 0 {
			t.Fatal("PENDING_PRODUCER_ENTRY_UNREACHED: original upstream source must precede group publication")
		}
		parent, known := stagedNativeInputOccurrenceRequest(&facts[caller], creating)
		if !known {
			t.Fatal("original native source request missing")
		}
		query := newSourceDependencyQuery(creating, owner.checker, owner, facts[caller].node)
		query.initializing = creating
		revoke, installed := query.beginStagedNativeGetSource(work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectCreate, call: creating, get: creating.Expression(), request: parent})
		if !installed {
			t.Fatal("original declaration SOURCE loan refused")
		}
		defer revoke()
		// A real issuer/request API supplies the pending writer ticket. No Get/C,
		// selected group, binder or delivery flag is installed by this control.
		ticket := query.registerWriterInputRequest(member)
		if ticket == nil {
			t.Fatal("actual source issuer did not create a writer ticket")
		}
		defer ticket.revoke()
		request := stagedCallResultRequest(upstream, facts[caller].node)
		recipe, described := work.operationRecipes[request.producer]
		if !described || !validStagedCallResultRecipe(recipe) || !validStagedConstructedResultSource(recipe.callResult) || !sameOperationRequest(recipe.callResult.constructedRoot, original.request) {
			t.Fatal("authentic pending upstream producer not described")
		}
		if recipe.delta.extracted || len(recipe.delta.exposures) != 0 || len(recipe.callResult.readings) != 0 || len(work.operationRecipes[original.request.producer].constructedGroup) != 0 || work.freshStagedCallResultReading(recipe) {
			t.Fatal("description supplied a selected group, physical reader or DATA/currentness")
		}
		if _, current := work.currentConstructedCallResultRoles(recipe); current {
			t.Fatal("pending producer acquired real member-result roles")
		}
		if len(recipe.callResult.constructedPreparation) != 1 || recipe.callResult.constructedPreparation[0].use != original.sites[0] {
			t.Fatal("original module New prerequisite was not retained")
		}
		root := recipe.callResult.constructedPreparation[0]
		for _, phase := range append([]string{""}, stagedConstructionPhases[:]...) {
			required := stagedConstructionRequest(root, phase)
			child := work.operationRecipes[required.producer]
			if !operationContainsRequest(recipe.delta.required, required) || !validStagedConstructionEffectsRecipe(child) || !sameOperationRequest(child.constructionEffects.root, root) {
				t.Fatal("missing authentic original constructor prerequisite", phase)
			}
		}
		id, adopted := work.operationIDs[request.producer]
		if !adopted || work.constructedResultProducerTask(id) == nil {
			t.Fatal("pending producer lacks its existing adopted DATA task")
		}
		if work.passiveStagedConstructedCallResultReady(recipe) {
			t.Fatal("producer demand replaced real issued Get/result DATA")
		}
		missingPhase := recipe
		missingPhase.delta = cloneOperationDelta(recipe.delta)
		missingPhase.delta.required = missingPhase.delta.required[1:]
		if validStagedCallResultRecipe(missingPhase) {
			t.Fatal("pending producer omitted its immutable constructor prefix")
		}
		copy := cloneStagedCallResultSource(recipe.callResult)
		if copy == recipe.callResult || !sameStagedCallResultSource(copy, recipe.callResult) {
			t.Fatal("pending description clone changed its contract")
		}
		copy.constructedPreparation[0].producer.declaration = facts[caller].node
		if validStagedConstructedResultSource(copy) || !validStagedConstructedResultSource(recipe.callResult) {
			t.Fatal("clone admitted a foreign New owner or mutated original")
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(cloned)
		if fresh.constructedResultProducerTask(id) != nil {
			t.Fatal("clone inherited old task/epoch authority")
		}
		// Refusal uses the expired ORIGINAL ticket, not fabricated graph receipts.
		ticket.revoke()
		if _, accepted := work.describeConstructedResultProducer(facts, caller, *original, query, ticket); accepted {
			t.Fatal("revoked ticket renewed a pending producer demand")
		}
	})
}
