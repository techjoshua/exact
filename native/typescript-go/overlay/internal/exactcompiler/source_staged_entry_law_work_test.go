package exactcompiler

import "testing"

// A neutral native Get is a real producer, not a category inferred by its
// consumer. Its descriptive ticket survives cloning, but its live receipt does
// not. This also protects the shared required-membership dispatch.
func TestStagedEntryLawOriginalNativeGetMembership(t *testing.T) {
	withStagedMapProtocolWorkSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:1}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource, work *callableEffectWork, facts []callableFacts) {
		work.prepareOperationUses(facts, query.executable)
		request, registered := work.nativeGetEntryLaw(facts, source)
		if !registered {
			t.Fatal("original native Get law description missing")
		}
		id, admitted := work.requireOperation(facts, request)
		if !admitted {
			t.Fatal("exact source ticket did not enter required membership")
		}
		work.prepareOperationUses(facts, query.executable)
		recipe := work.operationRecipes[request.producer]
		if recipe.delta.extracted || !work.closedOperationDependencies()[id.index] {
			t.Fatal("original Get law was not delivered independently of its immutable description")
		}
		for _, alter := range []func(*sourceStagedOperationRequest){
			func(value *sourceStagedOperationRequest) { value.edge += ":copied" },
			func(value *sourceStagedOperationRequest) { value.cut.use = nil },
			func(value *sourceStagedOperationRequest) { value.producer.selector.field += ":other" },
		} {
			wrong := request
			alter(&wrong)
			if _, accepted := work.requireOperation(facts, wrong); accepted {
				t.Fatal("altered source ticket admitted")
			}
		}
		cloned := make([]callableFacts, len(facts))
		for index, fact := range facts {
			cloned[index] = cloneProjectCallableFact(fact)
		}
		fresh := registerCallableEffectWork(cloned)
		fresh.operationGeneration = work.operationGeneration
		freshID, accepted := fresh.requireOperation(cloned, request)
		if !accepted || fresh.publishEntryLawSource(freshID) || fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("clone reused original graph's neutral Get receipt")
		}
		work.operationGeneration = &projectGeneration{}
		if work.closedOperationDependencies()[id.index] {
			t.Fatal("expired original Get receipt remained ready")
		}
	})
}

// Reconstructing the actual module graph must reobserve each implicit phase.
// Source descriptions and copied proof structs cannot lend another graph the
// original field or entry receipt, even with identical syntax and generation.
func TestStagedEntryLawModuleGraphLifetime(t *testing.T) {
	const source = `const value=Object.defineProperties({},{run:{value:()=>document.title},token:{value:7}});export function invoke(){return value}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/entry-law-lifetime.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	original := stagedDeclarationFacts(session)
	var owner *executableBodyOwner
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
		}
	}
	if owner == nil {
		t.Fatal("original module owner missing")
	}
	facts := make([]callableFacts, len(original))
	for index, fact := range original {
		facts[index] = cloneProjectCallableFact(fact)
	}
	work := registerCallableEffectWork(facts)
	work.operationGeneration = owner.values.generation
	for _, recipe := range work.operationRecipes {
		if recipe.entryLaw != nil && work.passiveEntryLawReady(recipe) {
			t.Fatal("cloned description inherited a positive implicit phase")
		}
	}
	work.prepareOperationUses(facts, owner)
	observed := 0
	for key, proof := range work.entryLawReceipts {
		recipe := work.operationRecipes[key]
		if recipe.entryLaw == nil {
			continue
		} // Primitive input observations own existing eager-operation slots.
		if recipe.entryLaw.kind != stagedEntryLawFieldHas && recipe.entryLaw.kind != stagedEntryLawFieldGet && recipe.entryLaw.kind != stagedEntryLawMapGet {
			continue
		}
		if !work.entryLawLocallyAccounted(recipe, proof) {
			t.Fatal("original implicit source phase did not redeliver")
		}
		observed++
		copy := *proof
		if work.entryLawLocallyAccounted(recipe, &copy) {
			t.Fatal("copied receipt inherited its original issuer")
		}
		cut := proof.cut
		proof.cut.use = nil
		if work.entryLawLocallyAccounted(recipe, proof) {
			t.Fatal("another physical phase borrowed the receipt")
		}
		proof.cut = cut
		generation := proof.generation
		proof.generation = &projectGeneration{}
		if work.entryLawLocallyAccounted(recipe, proof) {
			t.Fatal("expired receipt remained ready")
		}
		proof.generation = generation
	}
	if observed < 3 {
		t.Fatal("actual entry and Has/Get observations missing")
	}
}
