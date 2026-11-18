package exactcompiler

import "testing"

// The explicit replacement harness preserves the original cyclic source graph.
// This backend fault control does not make ordinary exports execution roots.
// The failed extraction is not a language rule about recursion.
func TestStagedPublicationSCCOutgoingProducerFault(t *testing.T) {
	const source = `declare const flag:boolean;export function entry():number{return a();}function a():number{if(flag)return b();return leaf();}function b():number{return a();}function leaf(){window;return 1;}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-outgoing.ts", Source: source, Diagnostics: "semantic", stagedReplacement: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source SCC: %s %#v", response.Error, response.Diagnostics)
	}
	// Qualify the original source edges before withholding any producer.
	for _, relation := range [][2]string{{"entry", "a"}, {"a", "b"}, {"b", "a"}, {"a", "leaf"}} {
		caller := executableSummary(t, response, relation[0])
		callee := executableSummary(t, response, relation[1])
		found := false
		for _, call := range caller.Calls {
			found = found || call.Resolved && call.TargetID == callee.ID
		}
		if !found {
			t.Fatal("original cyclic dependency UNREACHED", relation)
		}
	}
	// bySource caches descriptions with settlement cleared; this control
	// inspects the actual resolved source graph before cloning it.
	original := qualifiedIncrementalProject(t, session).callableCache.merged.facts
	facts := make([]callableFacts, len(original))
	leaf := -1
	var owner *executableBodyOwner
	var sourceAnalysis callableAnalysis
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
			sourceAnalysis = project.callableCache.bySource[original[0].sourceFile]
		}
	}
	for index := range original {
		facts[index] = cloneProjectCallableFact(original[index])
		if facts[index].summary.Name == "leaf" {
			leaf = index
			facts[index].staged.ready = false
			facts[index].summary.DirectEffectSources = nil
		}
	}
	if owner == nil || leaf < 0 {
		t.Fatal("missing source producer")
	}
	// Rebuild propagated summaries through the production merge. A raw clone
	// deliberately retains old derived summaries until this boundary resets them.
	sourceAnalysis.facts = facts
	blocked := mergeProjectCallableEffects(facts[leaf].sourceFile, []callableAnalysis{sourceAnalysis}, owner)
	facts, pending := blocked.facts, blocked.pending
	if len(pending) == 0 || pending[0].reason != stagedPendingLocalProducer || pending[0].producer != facts[leaf].node {
		t.Fatal("outgoing failure lost its earliest producer cause")
	}
	for _, fact := range facts {
		if (fact.summary.Name == "a" || fact.summary.Name == "b" || fact.summary.Name == "entry") && fact.staged.settled {
			t.Fatalf("recursive component published around its missing outgoing producer: %s", fact.summary.Name)
		}
	}
	facts[leaf].staged.ready = true
	facts[leaf].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original[leaf].summary.DirectEffectSources...)
	sourceAnalysis.facts = facts
	completed := mergeProjectCallableEffects(facts[leaf].sourceFile, []callableAnalysis{sourceAnalysis}, owner)
	if len(completed.pending) != 0 {
		for _, pending := range completed.pending {
			consumer, producer := "", ""
			for _, fact := range completed.facts {
				if fact.node == pending.consumer {
					consumer = fact.summary.Name
				}
				if fact.node == pending.producer {
					producer = fact.summary.Name
				}
			}
			t.Logf("pending consumer=%s producer=%s reason=%d", consumer, producer, pending.reason)
		}
		t.Fatal("completed outgoing producer did not release the recursive component")
	}
	for _, fact := range completed.facts {
		if !fact.staged.settled {
			t.Fatalf("completed source graph did not settle: %s", fact.summary.Name)
		}
	}
	if !original[leaf].staged.ready || !original[leaf].staged.settled {
		t.Fatal("fault or delivery mutated the retained source graph")
	}
}

func TestStagedPublicationTracksDispositionRevision(t *testing.T) {
	const source = `function leaf(){return 1;}export function entry(){return leaf();}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-disposition.ts", Source: source, stagedReplacement: true})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	original := qualifiedIncrementalProject(t, session).callableCache.merged.facts
	facts := make([]callableFacts, len(original))
	for index := range original {
		facts[index] = cloneProjectCallableFact(original[index])
	}
	leaf, entry := -1, -1
	for index := range facts {
		if facts[index].summary.Name == "leaf" {
			leaf = index
		}
		if facts[index].summary.Name == "entry" {
			entry = index
		}
	}
	if leaf < 0 || entry < 0 || !original[leaf].staged.ready || !original[entry].staged.ready || len(facts[entry].staged.calls) != 1 {
		t.Fatal("missing source dependency")
	}
	work := newCallableEffectWork(facts)
	call := facts[entry].staged.calls[0]
	if call.invocation.declaration != facts[leaf].node {
		t.Fatal("original source dependency UNREACHED")
	}
	id := ""
	for _, edge := range facts[entry].summary.Calls {
		if edge.TargetID == facts[leaf].summary.ID && facts[entry].fieldEdgeOperations[edge.ID] == call.invocation.operation {
			id = edge.ID
		}
	}
	if id == "" {
		t.Fatal("source Call lost its owning dependency edge")
	}
	work.requireStagedSummary(facts, entry, leaf, id, call.invocation.operation, call.invocation.cut)
	work.observeStagedSummary(facts, entry, leaf, id)
	cycles := callableCycleGroups(facts)
	if pending := work.settleStagedPublication(facts, cycles); len(pending) != 0 {
		t.Fatal("current source delivery did not settle")
	}
	work.dirty[entry] = false
	work.stagedContributionChanged(leaf)
	if pending := work.settleStagedPublication(facts, cycles); len(pending) == 0 || !work.dirty[entry] {
		t.Fatal("unchanged environment bits hid a required disposition revision")
	}
	work.observeStagedSummary(facts, entry, leaf, id)
	if pending := work.settleStagedPublication(facts, cycles); len(pending) != 0 {
		t.Fatal("new disposition delivery did not settle")
	}
}

// The actual component helper edge is required by the explicit replacement
// protocol. Ordinary public MAY analysis uses its independent CallEdge owner.
func TestComponentPublicationRequiredProducerDelivery(t *testing.T) {
	t.Run("replacement", func(t *testing.T) {
		session := NewSession()
		request := Request{Kind: "compile", ID: "component-publication-delivery.tsx", Source: stagedFrameworkConsumerSource, Target: TargetClient, SourceMap: true, Diagnostics: "semantic", stagedReplacement: true}
		initial := session.Execute(request)
		if initial.Error != "" || hasErrorDiagnostic(initial.Diagnostics) || initial.Code == "" || len(initial.Analysis.Components) != 1 {
			t.Fatal("component positive before producer withholding", initial.Error, initial.Diagnostics)
		}
		observe := executableSummary(t, initial, "observe")
		known, unknown := false, false
		for _, effect := range observe.EffectSources {
			known = known || effect.Environment == "browser"
			unknown = unknown || effect.Environment == "unknown"
		}
		if !known || !unknown || len(initial.Analysis.Tasks) != 1 || !initial.Analysis.Tasks[0].BrowserEffects {
			t.Fatal("helper contribution did not reach component task", known, unknown, initial.Analysis.Tasks)
		}
		cache := qualifiedIncrementalProject(t, session).callableCache
		original := cache.merged.facts
		producer, consumer := -1, -1
		for i := range original {
			if original[i].summary.ID == observe.ID {
				producer = i
			}
		}
		if producer < 0 || !original[producer].staged.ready || !original[producer].staged.settled {
			t.Fatal("UNREACHED: extracted component helper producer")
		}
		for i, fact := range original {
			for _, call := range fact.staged.calls {
				if call.invocation.declaration == original[producer].node && fact.staged.ready && fact.staged.settled {
					consumer = i
				}
			}
		}
		if consumer < 0 {
			t.Fatal("UNREACHED: actual component helper summary dependency")
		}
		facts := make([]callableFacts, len(original))
		for i := range original {
			facts[i] = cloneProjectCallableFact(original[i])
		}
		if pending := stagedPublicationPending(facts); len(pending) == 0 {
			t.Fatal("clone inherited settled component publication authority")
		}
		facts[producer].staged.ready = false
		facts[producer].summary.DirectEffectSources = nil
		pending := resolveCallableEffects(facts, cache.owner)
		required := false
		for _, debt := range pending {
			required = required || debt.producer == original[producer].node && debt.consumer == original[consumer].node
		}
		if !required || facts[consumer].staged.settled {
			t.Fatal("required component producer was not withheld", pending)
		}
		file := original[producer].sourceFile
		direct := callableAnalysisFromFacts(file, facts, nil)
		if len(direct.pending) == 0 || len(direct.summaries) != 0 {
			t.Fatal("direct component summary projection published debt")
		}
		// Retain the real immutable source context. No normal query or
		// source registration is fabricated for either independent clone.
		source := cache.bySource[file]
		source.facts = facts
		merged := mergeProjectCallableEffects(file, []callableAnalysis{source}, cache.owner)
		if len(merged.pending) == 0 || len(merged.summaries) != 0 {
			t.Fatal("merged component summary projection published debt")
		}
		facts[producer].staged.ready = true
		facts[producer].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original[producer].summary.DirectEffectSources...)
		if pending := resolveCallableEffects(facts, cache.owner); len(pending) != 0 || !facts[consumer].staged.settled || facts[consumer].staged.revisionDeliveries == 0 {
			t.Fatal("restored component contribution did not deliver and settle", pending)
		}
		if merged.facts[producer].staged.ready || merged.facts[consumer].staged.settled || !original[producer].staged.ready || !original[consumer].staged.settled {
			t.Fatal("delivery changed an independent component graph")
		}
		merged.facts[producer].staged.ready = true
		merged.facts[producer].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original[producer].summary.DirectEffectSources...)
		source.facts = merged.facts
		completed := mergeProjectCallableEffects(file, []callableAnalysis{source}, cache.owner)
		if len(completed.pending) != 0 || !completed.facts[consumer].staged.settled || completed.facts[consumer].staged.revisionDeliveries == 0 {
			t.Fatal("independent merged component contribution did not settle")
		}
		for _, graph := range [][]callableFacts{facts, completed.facts} {
			known, unknown = false, false
			for _, effect := range graph[consumer].summary.EffectSources {
				known = known || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !known || !unknown {
				t.Fatal("component delivery lost known donor or runtime uncertainty")
			}
		}
	})
}
