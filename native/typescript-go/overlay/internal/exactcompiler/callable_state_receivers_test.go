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
	effects := componentStateEffects(mapStateEffects([]StateEffect{write}, edges, "helper"))
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
