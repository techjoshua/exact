package exactcompiler

import "testing"

// The demand is independent of eager Effects. Actual source traversal publishes
// the creating association, and the existing typed Value consumer receives it.
func TestStagedEagerReturnValueOriginalGet(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/eager-value.ts", Source: stagedEagerCallWitness, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	facts := stagedDeclarationFacts(session)
	var owner *executableBodyOwner
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
		}
	}
	for index := range facts {
		facts[index] = cloneProjectCallableFact(facts[index])
	}
	work := callableEffectWork{extracting: -1}
	work.indexOperationSources(facts)
	var source *sourceStagedNativeGetSource
	for key, recipe := range work.operationRecipes {
		if key.kind == relativeDemandEffects && key.selector.field == "value" {
			source = recipe.nativeGet
			break
		}
	}
	if source == nil {
		t.Fatal("missing original field source")
	}
	work.prepareOperationUses(facts, owner)
	acquiredWork := owner.values.work
	parent, ok := work.ensureFieldExposure(facts, source, "value")
	if !ok {
		t.Fatal("Value source refused")
	}
	request := source.request
	request.producer = parent.key
	roles, _ := fieldSourceRequests(request)
	if _, ok := work.requireOperation(facts, roles.ownWriters); !ok {
		t.Fatal("typed original Value demand refused")
	}
	work.prepareOperationUses(facts, owner)
	if owner.values.work != acquiredWork {
		t.Fatal("late Value demand reentered source acquisition or rebound the initializer")
	}
	value := work.operationRecipes[parent.key]
	if len(value.delta.exposures) != 1 {
		t.Fatalf("known return carrier not delivered: %d", len(value.delta.exposures))
	}
	alternative := value.delta.exposures[0]
	if alternative.creating == nil || !alternative.creating.delivered || alternative.endpoint.creation != alternative.creating.request.operation || alternative.endpoint.producer != alternative.creating.request.declaration || alternative.endpoint.cut != alternative.creating.request.cut || alternative.endpoint.returning == nil || alternative.endpoint.cut.operation == source.request.producer.operation {
		t.Fatal("creating Call/return/cut was retargeted to the later Get")
	}
	own := work.operations[work.operationIDs[roles.ownWriters.producer].index]
	subscriber := own.subscribers[sourceStagedOperationConsumer{consumer: roles.ownWriters.consumer, edge: roles.ownWriters.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != own.revision || own.delta.extracted {
		t.Fatal("known Value prefix was blocked or mistaken for complete alternatives")
	}
	// A byte-equivalent descriptive packet is not this graph's creating issuer.
	requirement, _ := work.eagerReturnRequirement(source, alternative.endpoint.creation)
	if requirement == nil || requirement.inputs != alternative.creating {
		t.Fatal("publication lost its original graph packet")
	}
	copyEdge := *alternative.creating
	copied := alternative
	copied.creating = &copyEdge
	if work.currentEagerReturnAlternative(source, copied) {
		t.Fatal("copied descriptive packet acquired graph identity")
	}
	queue := len(work.extractionQueue)
	work.prepareOperationUses(facts, owner)
	if len(work.extractionQueue) != queue || len(work.operationRecipes[parent.key].delta.exposures) != 1 {
		t.Fatal("unchanged return projection replayed work or grew alternatives")
	}
	cloned := make([]callableFacts, len(facts))
	for index := range facts {
		cloned[index] = cloneProjectCallableFact(facts[index])
	}
	fresh := callableEffectWork{extracting: -1}
	fresh.indexOperationSources(cloned)
	if _, ok := fresh.requireOperation(cloned, roles.ownWriters); !ok {
		t.Fatal("cloned Value source refused")
	}
	fresh.prepareOperationUses(cloned, owner)
	if len(fresh.operationRecipes[parent.key].delta.exposures) != 1 {
		t.Fatal("graph cloning duplicated or discarded the sealed return prefix")
	}
	newRequirement, _ := fresh.eagerReturnRequirement(source, alternative.endpoint.creation)
	if newRequirement == nil || newRequirement.inputs == alternative.creating {
		t.Fatal("cloned graph reused creating publication authority")
	}
}
