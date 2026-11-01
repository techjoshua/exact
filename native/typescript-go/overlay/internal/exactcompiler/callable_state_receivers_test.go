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

// Convergence compares complete unordered obligations without sorting caller-owned arrays.
func TestCallableStateEffectSetSignature(t *testing.T) {
	for _, kind := range []string{"read", "write"} {
		t.Run(kind, func(t *testing.T) {
			base := StateEffect{Kind: kind, Path: "a.b", pathSegments: []string{"a.b"}, Confidence: "exact", Receiver: &StateReceiver{Kind: "parameter", Index: 0, Root: "value"}}
			other := StateEffect{Kind: kind, Path: "tail", pathSegments: []string{"tail"}, Confidence: "unknown", Receiver: &StateReceiver{Kind: "unknown"}}
			values := []StateEffect{base, other}
			unchanged := append([]StateEffect(nil), values...)
			signature := stateEffectSetSignature(values)
			if signature != stateEffectSetSignature([]StateEffect{other, base}) {
				t.Fatal("reordered identical obligations changed comparison")
			}
			if !reflect.DeepEqual(values, unchanged) {
				t.Fatal("comparison reordered retained effects")
			}
			mutations := []struct {
				name   string
				change func(*StateEffect)
			}{
				{"display path", func(v *StateEffect) { v.Path = "other" }},
				{"property boundary", func(v *StateEffect) { v.pathSegments = []string{"a", "b"} }},
				{"missing provenance", func(v *StateEffect) { v.pathSegments = nil }},
				{"confidence", func(v *StateEffect) { v.Confidence = "unknown" }},
				{"operation", func(v *StateEffect) { v.Operation = "delete" }},
				{"kind", func(v *StateEffect) {
					if v.Kind == "read" {
						v.Kind = "write"
					} else {
						v.Kind = "read"
					}
				}},
				{"receiver ownership", func(v *StateEffect) { v.Receiver.Kind = "unknown" }},
				{"receiver index", func(v *StateEffect) { v.Receiver.Index = 1 }},
				{"receiver root", func(v *StateEffect) { v.Receiver.Root = "" }},
				{"missing receiver", func(v *StateEffect) { v.Receiver = nil }},
			}
			for _, variant := range mutations {
				changed := base
				receiver := *base.Receiver
				changed.Receiver = &receiver
				variant.change(&changed)
				if signature == stateEffectSetSignature([]StateEffect{changed, other}) {
					t.Fatalf("lost %s obligation", variant.name)
				}
			}
			if signature == stateEffectSetSignature([]StateEffect{base}) || signature == stateEffectSetSignature([]StateEffect{base, other, other}) {
				t.Fatal("comparison discarded membership or duplicate occurrence")
			}
		})
	}
}

// The same recursive topology previously exposed context-set permutations. Independent
// state paths must reach their callers without making list order a progress signal.
func TestRecursiveStateSetsConverge(t *testing.T) {
	edges := [][]int{{1, 3, 4}, {4}, {}, {0}, {0, 2, 3}}
	for _, kind := range []string{"read", "write"} {
		t.Run(kind, func(t *testing.T) {
			facts := make([]callableFacts, len(edges))
			for i, targets := range edges {
				id := string(rune('a' + i))
				facts[i] = callableFacts{summary: CallableSummary{ID: id, Name: id}, targets: targets}
				effect := StateEffect{Kind: kind, Path: id, pathSegments: []string{id}, Confidence: "exact"}
				if kind == "read" {
					facts[i].directReads = []StateEffect{effect}
				} else {
					facts[i].directWrites = []StateEffect{effect}
				}
			}
			before := append([]callableFacts(nil), facts...)
			if legacyResolveCallableEffects(before, contextEffectSetSignature) {
				t.Fatal("owned fixture no longer distinguishes ordered state churn")
			}
			resolveCallableEffects(facts)
			for _, i := range []int{0, 1, 3, 4} {
				effects := facts[i].summary.StateReads
				if kind == "write" {
					effects = facts[i].summary.StateWrites
				}
				if len(effects) != 5 {
					t.Fatalf("lost reachable %s obligations: %#v", kind, effects)
				}
			}
			isolated := facts[2].summary.StateReads
			if kind == "write" {
				isolated = facts[2].summary.StateWrites
			}
			if len(isolated) != 1 {
				t.Fatal("isolated target inherited caller effects")
			}
		})
	}
}

// A new confidence or path is meaningful work even after earlier membership converged.
func TestCallableStateChangesStillReachCallers(t *testing.T) {
	for _, kind := range []string{"read", "write"} {
		t.Run(kind, func(t *testing.T) {
			effect := StateEffect{Kind: kind, Path: "first", pathSegments: []string{"first"}, Confidence: "exact"}
			facts := []callableFacts{{summary: CallableSummary{ID: "caller", Name: "caller"}, targets: []int{1}}, {summary: CallableSummary{ID: "callee", Name: "callee"}}}
			set := func(value StateEffect) {
				if kind == "read" {
					facts[1].directReads = []StateEffect{value}
				} else {
					facts[1].directWrites = []StateEffect{value}
				}
			}
			check := func(want StateEffect) {
				resolveCallableEffects(facts)
				actual := facts[0].summary.StateReads
				if kind == "write" {
					actual = facts[0].summary.StateWrites
				}
				if len(actual) != 1 || !reflect.DeepEqual(actual[0], want) {
					t.Fatalf("caller lost changed obligation: %#v", actual)
				}
			}
			set(effect)
			check(effect)
			effect.Confidence = "unknown"
			set(effect)
			check(effect)
			effect.Path = "second"
			effect.pathSegments = []string{"second"}
			set(effect)
			check(effect)
		})
	}
}

// Erased receiver wrappers preserve parameter identity and finite leaf authority.
// Computed selection and an unrelated object must not acquire that authority.
var transparentParameterReceiverCases = []struct {
	name, receiver, path, confidence string
	ordinary                         bool
}{
	{"non-null", `state.rows[0]!`, "rows.0.label", "exact", false},
	{"parenthesized", `(state.rows[0]!)`, "rows.0.label", "exact", false},
	{"as", `(state.rows[0] as Row)`, "rows.0.label", "exact", false},
	{"satisfies", `(state.rows[0]! satisfies Row)`, "rows.0.label", "exact", false},
	{"type-assertion", `(<Row>state.rows[0])`, "rows.0.label", "exact", false},
	{"nested", `((state as State).rows[0]!)`, "rows.0.label", "exact", false},
	{"computed", `state.rows[index]!`, "rows.*.label", "unknown", false},
	{"ordinary", `other.rows[0]!`, "", "", true},
}

func transparentParameterReceiverSource(receiver string) string {
	return `type Row={label:string}; type State={rows:Row[]}; const other:State={rows:[{label:"ordinary"}]}; export function update(state:State,index=0){` + receiver + `.label=` + receiver + `.label+"!";}`
}

func TestParameterEffectsThroughTransparentReceivers(t *testing.T) {
	for _, c := range transparentParameterReceiverCases {
		t.Run(c.name, func(t *testing.T) {
			source := transparentParameterReceiverSource(c.receiver)
			for _, target := range []Target{TargetClient, TargetServer} {
				req := Request{Kind: "compile", ID: "transparent-" + c.name + ".ts", Source: source, Target: target, Diagnostics: "semantic"}
				res := NewSession().Execute(req)
				if res.Error != "" || hasErrorDiagnostic(res.Diagnostics) {
					t.Fatalf("%s: %s %#v", target, res.Error, res.Diagnostics)
				}
				found := false
				for _, callable := range res.Analysis.Callables {
					if callable.Name != "update" {
						continue
					}
					found = true
					for _, effects := range [][]StateEffect{callable.StateReads, callable.StateWrites} {
						parameter := []StateEffect{}
						for _, e := range effects {
							if e.Receiver != nil && e.Receiver.Kind == "parameter" {
								parameter = append(parameter, e)
							}
						}
						if c.ordinary {
							if len(parameter) != 0 {
								t.Fatalf("ordinary object acquired parameter authority: %#v", parameter)
							}
							continue
						}
						expectedPath := c.path
						if len(effects) != 0 && effects[0].Kind == "read" {
							expectedPath = c.path[:len(c.path)-len(".label")]
						}
						if len(parameter) != 1 || parameter[0].Path != expectedPath || parameter[0].Confidence != c.confidence || parameter[0].Receiver.Index != 0 || parameter[0].Receiver.Root != "value" {
							t.Fatalf("lost parameter leaf or uncertainty: %#v", parameter)
						}
					}
				}
				if !found {
					t.Fatal("lost authored callable")
				}
			}
		})
	}
}
