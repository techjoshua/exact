package exactcompiler

import "testing"

func TestStateEffectPathIdentity(t *testing.T) {
	literal := StateEffect{Path: "page.title", pathSegments: []string{"page.title"}, Kind: "write"}
	nested := StateEffect{Path: "page.title", pathSegments: []string{"page", "title"}, Kind: "write"}
	if len(uniqueStateEffects([]StateEffect{literal, nested, literal})) != 2 {
		t.Fatal("distinct properties must survive effect deduplication")
	}
	if stateEffectsSignature([]StateEffect{literal}) == stateEffectsSignature([]StateEffect{nested}) {
		t.Fatal("fixed point propagation must detect changed path identity")
	}
	parent := StateEffect{Path: "page", pathSegments: []string{"page"}, Kind: "read"}
	if !stateEffectPathContains(parent, nested) || stateEffectPathContains(parent, literal) {
		t.Fatal("ancestry must compare property segments")
	}
	if len(minimalStateEffects([]StateEffect{parent, literal, nested})) != 2 {
		t.Fatal("minimization must retain the distinct dotted property")
	}
	opaque := StateEffect{Path: "page", Kind: "read"}
	if stateEffectPathContains(opaque, nested) {
		t.Fatal("a display label does not prove ancestry")
	}
	mapped := mapStateEffects([]StateEffect{literal, nested}, nil, "unused")
	if stateEffectsSignature(mapped) != stateEffectsSignature([]StateEffect{literal, nested}) {
		t.Fatal("propagation must preserve structured identity")
	}
}
