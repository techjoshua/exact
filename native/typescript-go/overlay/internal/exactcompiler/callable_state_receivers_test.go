package exactcompiler

import (
	"reflect"
	"testing"
)

func TestStateEffectsBindAllHelperCallSites(t *testing.T) {
	write := StateEffect{Path: "value", pathSegments: []string{"value"}, Kind: "write", Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}
	edges := []CallEdge{
		{TargetID: "helper", Resolved: true, ReceiverBindings: []ReceiverBinding{{Source: "component", Path: []string{"state", "left"}}}},
		{TargetID: "helper", Resolved: true, ReceiverBindings: []ReceiverBinding{{Source: "component", Path: []string{"state", "right"}}}},
		{TargetID: "helper", Resolved: true, ReceiverBindings: []ReceiverBinding{{Source: "unknown"}}},
	}
	effects := componentStateEffects(mapStateEffects([]StateEffect{write}, edges, "helper", false))
	paths := []string{}
	for _, effect := range effects {
		paths = append(paths, effect.Path)
	}
	if !reflect.DeepEqual(paths, []string{"left.value", "right.value"}) {
		t.Fatalf("wrong component writes: %#v", effects)
	}
	forwarded := bindStateEffect(write, ReceiverBinding{Source: "parameter", SourceParameterIndex: 1, Path: []string{"nested.key"}})
	actual := bindStateEffect(forwarded, ReceiverBinding{Source: "component", Path: []string{"state"}})
	if !reflect.DeepEqual(actual.pathSegments, []string{"nested.key", "value"}) {
		t.Fatalf("lost literal path: %#v", actual)
	}
}

func TestRecursiveHelperEffectsWidenToFiniteAuthority(t *testing.T) {
	effect := StateEffect{Path: "value", pathSegments: []string{"value"}, Kind: "write", Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}
	for range 40 {
		effect = bindStateEffect(effect, ReceiverBinding{Source: "parameter", Path: []string{"child"}})
	}
	before := stateEffectsSignature([]StateEffect{effect})
	effect = bindStateEffect(effect, ReceiverBinding{Source: "parameter", Path: []string{"child"}})
	if before != stateEffectsSignature([]StateEffect{effect}) || effect.Confidence != "unknown" || effect.pathSegments[len(effect.pathSegments)-1] != "*" {
		t.Fatalf("recursive writes must converge and fail closed: %#v", effect)
	}
}

// Branching recursion must reach a conservative fixed point without enumerating tree paths.
func TestBranchingRecursiveHelperEffectsConverge(t *testing.T) {
	for _, mutual := range []bool{false, true} {
		facts := []callableFacts{{summary: CallableSummary{ID: "walk", Name: "walk"}}}
		if mutual {
			facts = append(facts, callableFacts{summary: CallableSummary{ID: "visit", Name: "visit"}})
		}
		for index := range facts {
			target := (index + 1) % len(facts)
			facts[index].targets = []int{target}
			facts[index].directWrites = []StateEffect{{Path: "value", pathSegments: []string{"value"}, Kind: "write", Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}}
			for _, child := range []string{"left", "right"} {
				facts[index].summary.Calls = append(facts[index].summary.Calls, CallEdge{
					Resolved: true, TargetID: facts[target].summary.ID,
					ReceiverBindings: []ReceiverBinding{{Source: "parameter", Path: []string{child}}},
				})
			}
		}
		resolveCallableEffects(facts)
		for _, fact := range facts {
			if len(fact.summary.StateWrites) != 3 {
				t.Fatalf("recursive tree should retain one direct write and two conservative branches: %#v", fact.summary.StateWrites)
			}
			for _, effect := range fact.summary.StateWrites[1:] {
				if effect.Confidence != "unknown" || !reflect.DeepEqual(effect.pathSegments[1:], []string{"*"}) {
					t.Fatalf("recursive suffix must not grant finite write authority: %#v", effect)
				}
			}
		}
	}
}

func TestWholeReceiverRecursionRetainsExactEffects(t *testing.T) {
	facts := []callableFacts{{
		summary:      CallableSummary{ID: "repeat", Name: "repeat", Calls: []CallEdge{{Resolved: true, TargetID: "repeat", ReceiverBindings: []ReceiverBinding{{Source: "parameter"}}}}},
		targets:      []int{0},
		directWrites: []StateEffect{{Path: "value", pathSegments: []string{"value"}, Kind: "write", Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}},
	}}
	resolveCallableEffects(facts)
	if len(facts[0].summary.StateWrites) != 1 || facts[0].summary.StateWrites[0].Confidence != "exact" {
		t.Fatalf("whole-receiver recursion lost finite authority: %#v", facts[0].summary.StateWrites)
	}
}
