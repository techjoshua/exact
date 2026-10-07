package exactcompiler

import (
	"fmt"
	"math/rand"
	"reflect"
	"testing"
)

// Compare complete propagated summaries against the original solver across cycles,
// branching receiver paths, progress receivers, pure annotations and isolated nodes.
func TestCallableEffectSchedulingMatchesFullPasses(t *testing.T) {
	random := rand.New(rand.NewSource(731))
	for trial := 0; trial < 120; trial++ {
		facts := make([]callableFacts, 1+random.Intn(9))
		for index := range facts {
			id := fmt.Sprintf("function%d", index)
			facts[index].summary = CallableSummary{ID: id, Name: id, ReevaluationSafe: random.Intn(5) == 0}
			facts[index].progressReceiver = random.Intn(7) == 0
			facts[index].summary.DirectEffectSources = []EnvironmentEffectSource{{Environment: []string{"browser", "server", "unknown"}[random.Intn(3)], Description: id, Path: []string{id}}}
			effect := StateEffect{Path: "value", pathSegments: []string{"value"}, Kind: "write", Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}
			facts[index].directWrites = []StateEffect{effect}
			effect.Kind = "read"
			facts[index].directReads = []StateEffect{effect}
			facts[index].directContext = []ContextEffect{{Kind: "read", Token: id, Confidence: "exact"}}
		}
		for index := range facts {
			for target := range facts {
				if random.Intn(4) != 0 {
					continue
				}
				facts[index].targets = append(facts[index].targets, target)
				facts[index].summary.Calls = append(facts[index].summary.Calls, CallEdge{Resolved: true, TargetID: facts[target].summary.ID, ReceiverBindings: []ReceiverBinding{{Source: "parameter", Path: []string{"child"}}}})
			}
		}
		expected := append([]callableFacts(nil), facts...)
		if !legacyResolveCallableEffects(expected, contextEffectsSignature) {
			expected = append([]callableFacts(nil), facts...)
			if !legacyResolveCallableEffects(expected, contextEffectSetSignature) {
				t.Fatalf("canonical reference did not converge in trial %d", trial)
			}
		}
		resolveCallableEffects(facts)
		for index := range facts {
			actualSummary, expectedSummary := facts[index].summary, expected[index].summary
			actualSummary.Contexts, expectedSummary.Contexts = nil, nil
			if !reflect.DeepEqual(actualSummary, expectedSummary) || contextEffectSetSignature(facts[index].summary.Contexts) != contextEffectSetSignature(expected[index].summary.Contexts) {
				t.Fatalf("trial %d node %d changed propagated summary", trial, index)
			}
		}
	}
}

func legacyResolveCallableEffects(facts []callableFacts, contextSignature func([]ContextEffect) string) bool {
	cycles := callableCycleGroups(facts)
	changed := true
	for passes := 0; changed; passes++ {
		if passes > 100 {
			return false
		}
		changed = false
		for index := range facts {
			fact := &facts[index]
			sources := append(
				[]EnvironmentEffectSource(nil),
				fact.summary.DirectEffectSources...,
			)
			reads := append([]StateEffect(nil), fact.directReads...)
			writes := append([]StateEffect(nil), fact.directWrites...)
			writes = append(writes, opaqueCallStateEffects(fact)...)
			contexts := append([]ContextEffect(nil), fact.directContext...)
			for _, targetIndex := range fact.targets {
				// A progress call emits an observation. Its receiver's state and environment
				// effects execute independently on the browser and never enter the producer.
				if facts[targetIndex].progressReceiver {
					continue
				}
				target := facts[targetIndex].summary
				for _, source := range target.EffectSources {
					path := source.Path
					if len(path) == 0 || path[0] != fact.summary.Name {
						path = append([]string{fact.summary.Name}, path...)
					}
					sources = append(sources, EnvironmentEffectSource{
						Environment: source.Environment,
						Description: source.Description,
						Path:        path,
						Opaque:      source.Opaque,
					})
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
						cycles[index] == cycles[targetIndex],
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
						cycles[index] == cycles[targetIndex],
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}

			sources = uniqueEnvironmentSources(sources)
			if fact.summary.ReevaluationSafe {
				// A checked pure annotation resolves otherwise opaque calls but cannot erase a
				// concrete browser or server dependency discovered by semantic analysis.
				known := sources[:0]
				for _, source := range sources {
					if source.Environment != "unknown" {
						known = append(known, source)
					}
				}
				sources = known
			}
			reads = minimalStateEffects(reads)
			writes = uniqueStateEffects(writes)
			contexts = uniqueContextEffects(contexts)
			if environmentSourcesSignature(sources) !=
				environmentSourcesSignature(fact.summary.EffectSources) {
				fact.summary.EffectSources = sources
				changed = true
			}
			if stateEffectsSignature(reads) != stateEffectsSignature(fact.summary.StateReads) {
				fact.summary.StateReads = reads
				changed = true
			}
			if stateEffectsSignature(writes) != stateEffectsSignature(fact.summary.StateWrites) {
				fact.summary.StateWrites = writes
				changed = true
			}
			if contextSignature(contexts) != contextSignature(fact.summary.Contexts) {
				fact.summary.Contexts = contexts
				changed = true
			}
		}
	}
	return true
}
