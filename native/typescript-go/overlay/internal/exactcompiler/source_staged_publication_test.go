package exactcompiler

import (
	"reflect"
	"strings"
	"testing"
)

// A source-produced graph retains its dependency when the producer's local
// extraction is withheld. Unknown is not used to publish that unfinished graph.
// Restoring the real source contribution delivers known and unknown together.
func TestStagedPublicationWaitsForSourceProducer(t *testing.T) {
	const source = `declare function foreign():void;function leaf(){window;foreign();return 1;}export function entry(){return leaf();}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-publication.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source qualification: %s %#v", response.Error, response.Diagnostics)
	}
	original := stagedDeclarationFacts(session)
	var owner *executableBodyOwner
	var sourceAnalysis callableAnalysis
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
			sourceAnalysis = project.callableCache.bySource[original[0].sourceFile]
		}
	}
	facts := make([]callableFacts, len(original))
	leaf, entry := -1, -1
	for index := range original {
		facts[index] = cloneProjectCallableFact(original[index])
		switch facts[index].summary.Name {
		case "leaf":
			leaf = index
		case "entry":
			entry = index
		}
	}
	if owner == nil || leaf < 0 || entry < 0 {
		t.Fatal("missing source work owners")
	}
	if pending := stagedPublicationPending(facts); len(pending) == 0 {
		t.Fatal("clone inherited the old graph's publication authority")
	}
	facts[leaf].staged.ready = false
	facts[leaf].summary.DirectEffectSources = nil
	pending := resolveCallableEffects(facts, owner)
	if len(pending) == 0 || facts[entry].staged.settled || facts[leaf].staged.settled {
		t.Fatal("required unextracted source producer settled")
	}
	if message := stagedPublicationError(pending); !strings.Contains(message, "coverage gap") || !strings.Contains(message, "/virtual/staged-publication.ts:") {
		t.Fatalf("missing causal pending source: %q", message)
	}
	blocked := callableAnalysisFromFacts(facts[entry].sourceFile, facts, nil)
	if len(blocked.pending) == 0 || len(blocked.summaries) != 0 {
		t.Fatal("direct summary projection published pending work")
	}
	sourceAnalysis.facts = facts
	merged := mergeProjectCallableEffects(facts[entry].sourceFile, []callableAnalysis{sourceAnalysis}, owner)
	if len(merged.pending) == 0 || len(merged.summaries) != 0 {
		t.Fatal("merged summary projection published pending work")
	}
	facts[leaf].staged.ready = true
	facts[leaf].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original[leaf].summary.DirectEffectSources...)
	if pending := resolveCallableEffects(facts, owner); len(pending) != 0 {
		t.Fatalf("late source contribution did not settle: %#v", pending)
	}
	known, unknown := false, false
	for _, effect := range facts[entry].summary.EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !known || !unknown || !facts[entry].staged.settled {
		t.Fatal("late delivery lost donor/residual or closure")
	}
	if !original[leaf].staged.ready || !original[entry].staged.settled {
		t.Fatal("cloned work changed the retained source graph")
	}
	if len(merged.pending) == 0 || merged.facts[leaf].staged.ready || merged.facts[entry].staged.settled {
		t.Fatal("late delivery changed an independent merged clone")
	}
	merged.facts[leaf].staged.ready = true
	merged.facts[leaf].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original[leaf].summary.DirectEffectSources...)
	sourceAnalysis.facts = merged.facts
	completed := mergeProjectCallableEffects(facts[entry].sourceFile, []callableAnalysis{sourceAnalysis}, owner)
	if len(completed.pending) != 0 || !completed.facts[entry].staged.settled {
		t.Fatal("independently delivered merged clone did not settle")
	}
	known, unknown = false, false
	for _, effect := range completed.facts[entry].summary.EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !known || !unknown || !facts[entry].staged.settled {
		t.Fatal("merged clone delivery lost an alternative or changed its sibling")
	}
}

const stagedPublicationJourneySource = `declare function foreign():void;export function entry(){return leaf();}function leaf(){window;foreign();return 1;}export const stable=1;`

// This is the ordinary Session path, with no injected scheduling behavior. Source
// order makes entry request its real queued leaf before leaf's local extraction.
// Public code/summary publication follows later extraction and revision delivery.
func TestStagedPublicationSourceSessionJourney(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-journey.ts", Source: stagedPublicationJourneySource, Target: TargetClient, SourceMap: true, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatalf("source Session: %s %#v", response.Error, response.Diagnostics)
	}
	known, unknown, journey := false, false, false
	for _, effect := range executableSummary(t, response, "entry").EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "entry" {
			journey = fact.staged.pendingBeforeLocal == 1 && fact.staged.revisionDeliveries > 0 && fact.staged.ready && fact.staged.settled
		}
	}
	if !known || !unknown || !journey {
		t.Fatalf("source producer/request/delivery/publication journey missing: known=%t unknown=%t journey=%t", known, unknown, journey)
	}
}

// An admitted static producer cannot fail to extract in a correct implementation.
// Inject a backend delivery failure into its real source-derived retained graph,
// rather than inventing unsupported authored semantics. The public Session must
// fail causally and emit no partial artifacts, including the independent stable.
func TestStagedPublicationSessionFaultFailsClosed(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "compile", ID: "/virtual/staged-session-fault.ts", Source: stagedPublicationJourneySource, Target: TargetClient, SourceMap: true, Diagnostics: "semantic"}
	initial := session.Execute(request)
	if initial.Error != "" || hasErrorDiagnostic(initial.Diagnostics) || initial.Code == "" {
		t.Fatalf("valid source before injected failure: %s %#v", initial.Error, initial.Diagnostics)
	}
	injected := false
	for _, project := range session.projects {
		cache := project.callableCache
		if cache == nil {
			continue
		}
		for source, analysis := range cache.bySource {
			if source.FileName() != request.ID {
				continue
			}
			facts := make([]callableFacts, len(analysis.facts))
			for index := range analysis.facts {
				facts[index] = cloneProjectCallableFact(analysis.facts[index])
				if facts[index].summary.Name == "leaf" {
					facts[index].staged.ready = false
					facts[index].summary.DirectEffectSources = nil
				}
			}
			pending := resolveCallableEffects(facts, cache.owner)
			if len(pending) == 0 {
				t.Fatal("fault did not create the real required dependency")
			}
			blocked := callableAnalysis{facts: facts, pending: pending}
			cache.bySource[source] = blocked
			cache.fingerprints[source] = callableAnalysisFingerprint(blocked)
			cache.merged, cache.analyses = blocked, nil
			injected = true
		}
	}
	if !injected {
		t.Fatal("missing retained source graph for backend fault")
	}
	blocked := session.Execute(request)
	if !strings.Contains(blocked.Error, "coverage gap") || !strings.Contains(blocked.Error, request.ID+":") {
		t.Fatalf("Session lost causal producer failure: %q", blocked.Error)
	}
	if blocked.Code != "" || blocked.SourceMap != nil || len(blocked.RuntimeDependencies) != 0 || !reflect.DeepEqual(blocked.Structure, ArtifactStructure{}) || !reflect.DeepEqual(blocked.Analysis, newSessionResponse(request.ID).Analysis) {
		t.Fatal("pending Session published partial code, map, runtime or planning artifacts")
	}
}

func TestStagedPublicationGenerationReplacement(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "analyze", ID: "/virtual/staged-generation.ts", Source: stagedPublicationJourneySource, Diagnostics: "semantic"}
	var prior *projectCallableCache
	for _, browser := range []bool{true, false, true} {
		request.Source = stagedPublicationJourneySource
		if !browser {
			request.Source = strings.ReplaceAll(request.Source, "window;foreign();", "")
		}
		response := session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("source generation: %s %#v", response.Error, response.Diagnostics)
		}
		known := false
		for _, effect := range executableSummary(t, response, "entry").EffectSources {
			known = known || effect.Environment == "browser"
		}
		if known != browser {
			t.Fatalf("stale generation donor: got %t want %t", known, browser)
		}
		for _, project := range session.projects {
			cache := project.callableCache
			if cache == nil || cache == prior || cache.program != project.program || prior != nil && prior.ownsGeneration(project.program, cache.owner.checker) {
				t.Fatal("replacement generation inherited cached publication ownership")
			}
			prior = cache
		}
	}
}

// The topology is produced by real mutually recursive source. The failed local
// extraction is a backend fault injection, not a language rule about recursion.
func TestStagedPublicationSCCOutgoingProducerFault(t *testing.T) {
	const source = `declare const flag:boolean;export function entry():number{return a();}function a():number{if(flag)return b();return leaf();}function b():number{return a();}function leaf(){window;return 1;}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-outgoing.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source SCC: %s %#v", response.Error, response.Diagnostics)
	}
	original := stagedDeclarationFacts(session)
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
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-disposition.ts", Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	original := stagedDeclarationFacts(session)
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
	if leaf < 0 || entry < 0 {
		t.Fatal("missing source dependency")
	}
	work := newCallableEffectWork(facts)
	call := facts[entry].staged.calls[0]
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
