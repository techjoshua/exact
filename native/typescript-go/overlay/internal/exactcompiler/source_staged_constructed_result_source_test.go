package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A demanded result may prepare original source relationships before the
// collector reaches the Call. Neither that preparation nor a future Set's
// inventory membership can supply execution, ordinary use or a stored body.
func TestStagedConstructedResultSourcePassiveThenReached(t *testing.T) {
	const source = `const table=new WeakMap<object,()=>string>();function factory(key:object){return table.get(key)}export function invoke(key:object){factory(key);table.set(key,()=>document.title);return table.get(key)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var site, read, futureSet *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
				_, name := accessorReceiver(node.Expression())
				if name == "get" && enclosingCallableNode(node) != enclosingCallableNode(creating) {
					read = node
				}
				if name == "set" {
					futureSet = node
				}
			}
			return true
		})
		if site == nil || read == nil || futureSet == nil {
			t.Fatal("original construction/member occurrences missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		reader := work.memberNodes[enclosingCallableNode(read)]
		writer := work.memberNodes[enclosingCallableNode(futureSet)]
		if _, represented := work.prepareConstructedResultSource(facts, reader, read, owner); !represented || len(work.operationIDs) != 0 {
			t.Fatal("original demanded source bootstrap failed or adopted an operation")
		}
		if contribution, published := owner.standardConstructions[site]; !published || !contribution.selectionComplete || contribution.site != site {
			t.Fatal("inventory replaced original constructor source publication")
		}

		visitImplicitAccessors(site, owner.checker, nil, owner, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
		request, represented := work.prepareConstructedResultSource(facts, reader, read, owner)
		if !represented || request.producer.operation != read || request.consumer != facts[reader].node || request.cut != (sourceRelativeCut{operation: read, use: read, reading: read}) {
			t.Fatal("original published construction did not prepare its member source")
		}
		future, represented := work.prepareConstructedResultSource(facts, writer, futureSet, owner)
		if !represented {
			t.Fatal("original future Set source relationship missing")
		}
		for _, index := range []int{reader, writer} {
			fact := &facts[index]
			if len(fact.staged.constructedOccurrences)+len(fact.staged.operationUses)+len(fact.staged.operationSkipped) != 0 || fact.staged.operationsPending {
				t.Fatal("passive result preparation enrolled an ordinary occurrence")
			}
		}
		if len(work.operationIDs) != 0 {
			t.Fatal("passive source preparation acquired operation IDs")
		}
		root := work.operationRecipes[request.producer]
		if len(root.constructedGroup) != 1 || !validConstructedMemberRecipe(root) {
			t.Fatal("actual member source group missing")
		}
		selected := root.constructedGroup[0]
		for _, role := range []string{"own-writers", "eager-inputs", "callee", "member-result"} {
			debt := work.operationRecipes[constructedMemberRequest(&selected, role).producer]
			if debt.delta.extracted || !validConstructedMemberRecipe(debt) || len(debt.delta.invoked)+len(debt.delta.effects)+len(debt.delta.relative)+len(debt.delta.residuals) != 0 {
				t.Fatal("passive role acquired completion or invocation", role)
			}
		}
		if _, represented := work.prepareConstructedResultSource(facts, writer, read, owner); represented {
			t.Fatal("another declaration borrowed the original occurrence")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if _, represented := work.prepareConstructedResultSource(facts, reader, read, owner); represented {
			t.Fatal("another generation reused the source preparation")
		}
		work.operationGeneration = generation
		if !work.stageConstructedResultOccurrence(facts, reader, read, owner) {
			t.Fatal("original reached occurrence refused its passive prefix")
		}
		work.prepareConstructedOccurrences(facts, owner)
		id, adopted := work.operationIDs[request.producer]
		uses := 0
		for _, use := range facts[reader].staged.operationUses {
			if sameOperationRequest(use.request, request) {
				uses++
			}
		}
		if !adopted || uses != 1 || len(facts[reader].staged.constructedOccurrences) != 1 || len(work.operations[id.index].dependencies) == 0 {
			t.Fatal("later ordinary activation did not enroll required membership")
		}
		work.prepareOperationUses(facts, owner)
		callee := constructedMemberRequest(&selected, "callee")
		calleeID, issued := work.operationIDs[callee.producer]
		if !issued || work.operations[calleeID.index].revision == 0 || len(work.operations[calleeID.index].delta.exposures) != 1 {
			t.Fatal("required original callee prefix was not delivered")
		}
		endpoint := work.operations[calleeID.index].delta.exposures[0].endpoint
		if endpoint.producer != read || endpoint.get != read.Expression() || endpoint.cut != selected.cut || endpoint.expression != selected.method {
			t.Fatal("callee prefix lost its original producer/Get/cut")
		}
		if _, adopted := work.operationIDs[future.producer]; adopted || len(facts[writer].staged.constructedOccurrences)+len(facts[writer].staged.operationUses) != 0 {
			t.Fatal("reached Get activated a passive future Set")
		}
		for _, fact := range facts {
			if len(fact.summary.DirectEffectSources)+len(fact.summary.EffectSources) != 0 {
				t.Fatal("stored callback body executed during source preparation")
			}
		}
	})
}

// Cached recipes do not supply a new graph's construction publication or Get.
// Reissuing both original source owners may prepare the same description while
// leaving ordinary activation to its independent reached consumer.
func TestStagedConstructedResultSourceFreshOwner(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();function factory(key:object){return table.get(key)}export function invoke(key:object){return factory(key)}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var site, read *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
				read = node
			}
			return true
		})
		if site == nil || read == nil {
			t.Fatal("original source missing")
		}
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(read)]
		visitImplicitAccessors(site, owner.checker, nil, owner, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
		request, prepared := work.prepareConstructedResultSource(facts, caller, read, owner)
		if !prepared {
			t.Fatal("original passive source missing")
		}
		cloned := make([]callableFacts, len(facts))
		for index, fact := range facts {
			cloned[index] = cloneProjectCallableFact(fact)
		}
		freshOwner := newExecutableBodyOwner(owner.project, owner.checker)
		fresh := registerCallableEffectWork(cloned)
		if _, represented := fresh.prepareConstructedResultSource(cloned, caller, read, freshOwner); represented || len(fresh.operationIDs) != 0 || len(freshOwner.standardConstructions) != 0 {
			t.Fatal("cached source replaced missing original publication authority")
		}
		freshRestore := registerPendingMemberFacts(freshOwner, cloned)
		defer freshRestore()
		// The live source registry allows demanded bootstrap to visit the
		// original New owner before ordinary collection. Cached recipes alone
		// supplied neither this publication nor a current member issuance.
		if fresh.constructedIssued[[2]*ast.Node{read, site}] {
			t.Fatal("clone inherited original member issuance")
		}
		reissued, prepared := fresh.prepareConstructedResultSource(cloned, caller, read, freshOwner)
		construction, published := freshOwner.standardConstructions[site]
		if !prepared || !sameOperationRequest(reissued, request) || !published || construction.site != site || construction.owner != sourceStagedModuleOwner(site) || !construction.selectionComplete || !fresh.constructedIssued[[2]*ast.Node{read, site}] || len(fresh.operationIDs) != 0 || len(cloned[caller].staged.operationUses)+len(cloned[caller].staged.constructedOccurrences) != 0 {
			t.Fatal("fresh original source did not reissue passively")
		}
		visitImplicitAccessors(site, freshOwner.checker, nil, freshOwner, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
		repeated, prepared := fresh.prepareConstructedResultSource(cloned, caller, read, freshOwner)
		if !prepared || !sameOperationRequest(repeated, request) || len(fresh.operationIDs) != 0 || len(cloned[caller].staged.operationUses)+len(cloned[caller].staged.constructedOccurrences) != 0 {
			t.Fatal("later original New collection changed passive source ownership")
		}
	})
}
