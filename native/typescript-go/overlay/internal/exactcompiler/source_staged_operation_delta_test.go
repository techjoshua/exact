package exactcompiler

import "testing"

// These are protocol controls over natural source-produced keys and binder
// associations. Extended envelopes are injected here to exercise lifecycle
// channels. They do not claim descriptor/native/capture source admission.
func stagedDeltaFacts(t *testing.T, source string) []callableFacts {
	t.Helper()
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/operation-delta.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source: %s %#v", response.Error, response.Diagnostics)
	}
	originals := stagedDeclarationFacts(session)
	facts := make([]callableFacts, len(originals))
	for i := range originals {
		facts[i] = cloneProjectCallableFact(originals[i])
	}
	return facts
}

func stagedDeltaFact(t *testing.T, facts []callableFacts, name string) int {
	t.Helper()
	for i := range facts {
		if facts[i].summary.Name == name {
			return i
		}
	}
	t.Fatalf("missing source declaration %s", name)
	return -1
}

func TestStagedOperationDeltaRevisionDelivery(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t)+stagedGetterCaller)
	caller := stagedDeltaFact(t, facts, "invokeStored")
	factory := stagedDeltaFact(t, facts, "acquireMember")
	use := facts[caller].staged.operationUses[0]
	var recipe sourceStagedOperationRecipe
	for i := range facts[factory].staged.operationRecipes {
		if facts[factory].staged.operationRecipes[i].key == use.request.producer {
			recipe = facts[factory].staged.operationRecipes[i]
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.effects = []EnvironmentEffectSource{environmentSource("browser", "window", "acquireMember")}
			recipe.delta.residuals = []sourceStagedOperationResidual{{operation: recipe.key.operation}}
			facts[factory].staged.operationRecipes[i] = recipe
		}
	}
	work := callableEffectWork{extracting: -1}
	id, ok := work.requireOperation(facts, use.request)
	if !ok {
		t.Fatal("natural creating association refused")
	}
	// The test drives the registered producer explicitly instead of its ordinary
	// complete extraction task, so it can observe an unfinished prefix.
	work.extractionQueue = nil
	partial := sourceStagedOperationDelta{effects: recipe.delta.effects, residuals: recipe.delta.residuals}
	if !work.publishOperation(id, partial) {
		t.Fatal("valid independent prefix refused")
	}
	work.prepareOperationUses(facts)
	if !facts[caller].staged.operationsPending {
		t.Fatal("partial extraction became settled")
	}
	before := facts[caller].staged.operationDeliveries
	revision := work.operations[id.index].revision
	if !work.publishOperation(id, partial) || work.operations[id.index].revision != revision {
		t.Fatal("identical prefix created a new revision")
	}
	work.prepareOperationUses(facts)
	if facts[caller].staged.operationDeliveries != before {
		t.Fatal("unchanged prefix replayed contributions")
	}
	full := recipe.delta
	full.extracted = true
	if !work.publishOperation(id, full) {
		t.Fatal("late exposure and extraction disposition refused")
	}
	work.prepareOperationUses(facts)
	if facts[caller].staged.operationsPending || facts[caller].staged.operationCreatingDeliveries != 1 || facts[caller].staged.operationDeliveries != before+1 {
		t.Fatal("late contribution not delivered exactly once")
	}
	known, unknown := false, false
	for _, effect := range facts[caller].summary.DirectEffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Description == "unresolved staged operation alternative"
	}
	if !known || !unknown {
		t.Fatal("independent known/unknown channels lost")
	}
	if work.publishOperation(id, partial) {
		t.Fatal("ready producer rolled back to unfinished prefix")
	}
	forged := cloneOperationDelta(full)
	forged.effects[0].Description = "different source"
	if work.publishOperation(id, forged) {
		t.Fatal("different causal prefix borrowed same cursor")
	}
}

func TestStagedOperationRequiredDisposition(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t)+stagedGetterCaller)
	caller := stagedDeltaFact(t, facts, "invokeStored")
	factory := stagedDeltaFact(t, facts, "acquireMember")
	child := facts[factory].staged.operationUses[0]
	parent := facts[caller].staged.operationUses[0]
	facts[factory].staged.operationUses = nil // the child is required-only, not an explicit source use
	var parentRecipe, childRecipe sourceStagedOperationRecipe
	for i := range facts[factory].staged.operationRecipes {
		recipe := facts[factory].staged.operationRecipes[i]
		if recipe.key == parent.request.producer {
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.required = []sourceStagedOperationRequest{child.request}
			facts[factory].staged.operationRecipes[i] = recipe
			parentRecipe = recipe
		} else if recipe.key == child.request.producer {
			childRecipe = recipe
		}
	}
	work := callableEffectWork{extracting: -1}
	childID, ok := work.requireOperation(facts, child.request)
	if !ok {
		t.Fatal("child source refused")
	}
	parentID, ok := work.requireOperation(facts, parent.request)
	if !ok {
		t.Fatal("parent source refused")
	}
	work.extractionQueue = nil
	pendingChild := childRecipe.delta
	readyParent := parentRecipe.delta
	readyParent.extracted = true
	if !work.publishOperation(childID, pendingChild) || !work.publishOperation(parentID, readyParent) {
		t.Fatal("valid source envelopes refused")
	}
	work.prepareOperationUses(facts)
	if !facts[caller].staged.operationsPending || !facts[factory].staged.operationsPending || work.closedOperationDependencies()[parentID.index] {
		t.Fatal("extracted parent bypassed pending required child")
	}
	before := facts[factory].staged.operationDeliveries
	pendingChild.extracted = true
	if !work.publishOperation(childID, pendingChild) {
		t.Fatal("disposition-only publication refused")
	}
	work.prepareOperationUses(facts)
	if facts[caller].staged.operationsPending || facts[factory].staged.operationsPending || facts[factory].staged.operationDeliveries != before {
		t.Fatal("disposition delivery replayed atoms or failed closure")
	}
	work.operations[childID.index].invalid = true
	if work.closedOperationDependencies()[parentID.index] {
		t.Fatal("required outgoing failure did not revoke closure")
	}
}

func TestStagedOperationRelativeDelta(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedMemberWitness(t))
	index := stagedDeltaFact(t, facts, "selectMember")
	use := facts[index].staged.operationUses[0]
	recipe := facts[index].staged.operationRecipes[0]
	var role sourceRelativeRole
	for _, alternative := range recipe.delta.exposures {
		if alternative.endpoint.kind == relativeEndpointRole {
			role = alternative.endpoint.role
		}
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	demand := sourceRelativeInvokedInput{kind: relativeDemandEffects, role: role, origin: use.call, cut: sourceRelativeCut{operation: use.call, reading: use.call}}
	recipe.delta.relative = []sourceRelativeInvokedInput{demand}
	facts[index].staged.operationRecipes[0] = recipe
	work := callableEffectWork{extracting: -1}
	work.prepareOperationUses(facts)
	if facts[index].staged.operationsPending {
		t.Fatal("supported relative channel remained pending")
	}
	found := false
	for _, actual := range facts[index].staged.invoked {
		found = found || actual == demand
	}
	if !found {
		t.Fatal("relative invocation lost its role or original cut")
	}
	before := facts[index].staged.operationDeliveries
	work.prepareOperationUses(facts)
	if facts[index].staged.operationDeliveries != before {
		t.Fatal("relative channel replayed on unchanged revision")
	}
	invalid := recipe
	invalid.delta = cloneOperationDelta(recipe.delta)
	invalid.delta.relative[0].role.slot = 999
	if validOperationEnvelope(invalid) {
		t.Fatal("nonexistent formal became a relative obligation")
	}
	invalid.delta.relative[0] = demand
	invalid.delta.relative[0].cut.reading = use.request.producer.operation
	if validOperationEnvelope(invalid) {
		t.Fatal("producer Get replaced the original invoked-input cut")
	}

}

func TestStagedOperationPendingAndSliceOwnership(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t)+stagedGetterCaller)
	factory := stagedDeltaFact(t, facts, "acquireMember")
	caller := stagedDeltaFact(t, facts, "invokeStored")
	use := facts[caller].staged.operationUses[0]
	var recipe sourceStagedOperationRecipe
	for _, candidate := range facts[factory].staged.operationRecipes {
		if candidate.key == use.request.producer {
			recipe = candidate
		}
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	recipe.delta.effects = []EnvironmentEffectSource{environmentSource("browser", "window", "acquireMember")}
	recipe.delta.effects[0].Path = []string{"original"}
	// This projection is deliberately not implemented by the invocation consumer.
	// It must not erase the independently delivered known channel or ACK as unknown.
	recipe.delta.exposures[0].endpoint.projection = []string{"unmigrated"}
	facts[factory].staged.operationRecipes = nil
	work := callableEffectWork{extracting: -1}
	if !work.registerOperationRecipe(facts, recipe) {
		t.Fatal("finite source recipe refused")
	}
	recipe.delta.effects[0].Path[0] = "mutated"
	if work.operationRecipes[recipe.key].delta.effects[0].Path[0] != "original" {
		t.Fatal("registration borrowed mutable payload")
	}
	id, ok := work.requireOperation(facts, use.request)
	if !ok {
		t.Fatal("natural source request refused")
	}
	facts[caller].staged.settled = true
	work.dirty = make([]bool, len(facts))
	work.stagedRevisions = make([]uint64, len(facts))
	work.callers = make([][]int, len(facts))
	sealed := work.operationRecipes[recipe.key].delta
	sealed.extracted = true
	if !work.publishOperation(id, sealed) {
		t.Fatal("source prefix refused")
	}
	if facts[caller].staged.settled || !facts[caller].staged.operationsPending || !work.dirty[caller] || work.stagedRevisions[caller] != 1 {
		t.Fatal("publication did not revoke previous closure")
	}
	work.prepareOperationUses(facts)
	if !facts[caller].staged.operationsPending {
		t.Fatal("unsupported projection became completed unknown")
	}
	known := false
	for _, effect := range facts[caller].summary.DirectEffectSources {
		known = known || effect.Environment == "browser" && len(effect.Path) == 1 && effect.Path[0] == "original"
	}
	if !known {
		t.Fatal("unsupported sibling erased independent known contribution")
	}
}

func TestStagedOperationRequiredBackedge(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t))
	factory := stagedDeltaFact(t, facts, "acquireMember")
	use := facts[factory].staged.operationUses[0]
	for i := range facts[factory].staged.operationRecipes {
		recipe := &facts[factory].staged.operationRecipes[i]
		if recipe.key == use.request.producer {
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.required = []sourceStagedOperationRequest{use.request}
		}
	}
	work := callableEffectWork{extracting: -1}
	work.prepareOperationUses(facts)
	if len(work.operations) != 2 || facts[factory].staged.operationsPending {
		t.Fatal("ready required backedge recursively expanded or failed to close")
	}
	before := facts[factory].staged.operationDeliveries
	work.prepareOperationUses(facts)
	if facts[factory].staged.operationDeliveries != before {
		t.Fatal("required backedge replayed its contributions")
	}
}

func TestStagedOperationIndependentSubscribers(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t)+stagedGetterCaller+`export function otherStored(){const saved=acquireMember();return saved();}`)
	first := stagedDeltaFact(t, facts, "invokeStored")
	second := stagedDeltaFact(t, facts, "otherStored")
	a, b := facts[first].staged.operationUses[0], facts[second].staged.operationUses[0]
	if a.request.inputs == b.request.inputs || a.request.producer != b.request.producer {
		t.Fatal("source creating associations are not independent")
	}
	work := callableEffectWork{extracting: -1}
	id, ok := work.requireOperation(facts, a.request)
	if !ok {
		t.Fatal("first subscriber refused")
	}
	if _, ok := work.requireOperation(facts, b.request); !ok {
		t.Fatal("second subscriber refused")
	}
	work.prepareOperationUses(facts)
	if facts[first].staged.operationsPending || facts[second].staged.operationsPending || facts[first].staged.operationCreatingDeliveries != 1 || facts[second].staged.operationCreatingDeliveries != 1 {
		t.Fatal("one subscriber consumed the other's prefix")
	}
	state := &work.operations[id.index]
	if len(state.subscribers) != 2 {
		t.Fatal("creating occurrences merged into one subscriber")
	}
	beforeA, beforeB := facts[first].staged.operationDeliveries, facts[second].staged.operationDeliveries
	work.prepareOperationUses(facts)
	if facts[first].staged.operationDeliveries != beforeA || facts[second].staged.operationDeliveries != beforeB {
		t.Fatal("independent cursors replayed on a no-op drain")
	}
}

func TestStagedOperationReceiverPayloadRemainsPending(t *testing.T) {
	facts := stagedDeltaFacts(t, stagedGetterWitness(t))
	factory := stagedDeltaFact(t, facts, "acquireMember")
	use := facts[factory].staged.operationUses[0]
	for i := range facts[factory].staged.operationRecipes {
		recipe := &facts[factory].staged.operationRecipes[i]
		if recipe.key == use.request.producer {
			recipe.delta = cloneOperationDelta(recipe.delta)
			recipe.delta.invoked[0].alternative.endpoint = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: recipe.key.operation.Expression()}
			recipe.delta.effects = []EnvironmentEffectSource{environmentSource("browser", "window", "acquireMember")}
		}
	}
	work := callableEffectWork{extracting: -1}
	work.prepareOperationUses(facts)
	if !facts[factory].staged.operationsPending {
		t.Fatal("unconsumed invocation receiver association acquired ACK")
	}
	known := false
	for _, effect := range facts[factory].summary.DirectEffectSources {
		known = known || effect.Environment == "browser" && effect.Description == "window"
	}
	if !known {
		t.Fatal("unconsumed receiver erased independent known contribution")
	}
}
