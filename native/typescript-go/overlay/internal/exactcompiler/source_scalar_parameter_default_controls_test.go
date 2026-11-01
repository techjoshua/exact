package exactcompiler

import (
	"fmt"
	"testing"
)

func TestScalarParameterDefaultLiveControls(t *testing.T) {
	for _, argument := range []string{"5", "", "undefined"} {
		t.Run(fmt.Sprint("argument-", argument), func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if row.callHistory.entry.proof.mapping.scalarDefaultParameter(0) == nil {
					return
				}
				seen = true
				call := row.callHistory
				entry := call.entry
				owner := row.branch.owner
				if !call.validResult(row) {
					t.Fatal("untouched actual default Call invalid")
				}
				// The already initialized actual formal must reject a second write without
				// a successor identity or publication. This is not a second body execution.
				identity, publication, rawReceipt := owner.next, h.receipt, call.raw
				raw := call.raw.alternatives[0]
				duplicate := owner.initializeLocal(raw.branch, raw.storage.cells[0], raw.value)
				if duplicate.completion != languageThrow || duplicate.value.text != "ReferenceError" || duplicate.branch != raw.branch || owner.next != identity || h.receipt != publication || call.raw != rawReceipt || !call.validResult(row) {
					t.Fatal("duplicate actual formal initialization changed state/identity/publication")
				}
				// Every malformed payload is a copy. Original acquired/history values stay sealed.
				for _, kind := range []string{"namespace", "call", "arguments", "generation", "current-state", "cursor"} {
					bad := row
					history := *call
					receipt := *call.raw
					receipt.alternatives = append([]languageAlternative(nil), receipt.alternatives...)
					snapshot := *receipt.alternatives[0].storage
					snapshot.cells = append([]languageCell(nil), snapshot.cells...)
					receipt.alternatives[0].storage = &snapshot
					history.raw = &receipt
					bad.callHistory = &history
					switch kind {
					case "namespace":
						snapshot.cells[0].environment = languageID{}
					case "call":
						e := *entry
						header := *entry.inputs
						header.call = entry.proof.arrow
						e.inputs = &header
						history.entry = &e
					case "arguments":
						e := *entry
						header := *entry.inputs
						header.arguments = nil
						if len(entry.inputs.arguments) == 0 {
							header.arguments = []languageCallArgument{{}}
						}
						e.inputs = &header
						history.entry = &e
					case "generation":
						bad.branch.generation++
					case "current-state":
						bad.branch.state = entry.activation.state
					case "cursor":
						bad.branch.cursor++
					}
					if history.validResult(bad) {
						t.Fatal("wrong actual tuple granted completion", kind)
					}
				}
				candidate := h.authority.owner.closedPrefixCandidate
				original := entry.acquisition.alternatives[0]
				next := owner.next
				refused, _ := owner.consumeClosedCallInputs(entry.acquisition.input, original, 4096, candidate)
				if refused.completion != languageResidual || owner.next != next {
					t.Fatal("copied completed acquisition reentered original source")
				}
				// Authenticate the actual recipe through the existing source population owner.
				originalProof := entry.proof
				for _, kind := range []string{"positive", "selector", "merge", "order", "slot", "initializer-donor", "acquired-index", "initialize-source"} {
					proof := *originalProof
					plan := *proof.plan
					recipe := *proof.entry
					recipe.events = append([]storageEvent(nil), recipe.events...)
					plan.recipe = &recipe
					proof.entry = &recipe
					proof.plan = &plan
					selectPC := -1
					for pc, event := range recipe.events {
						if event.kind == "SelectDefault" {
							selectPC = pc
						}
					}
					choice, _, ok := defaultChoiceLayout(&recipe, selectPC)
					if !ok {
						t.Fatal("original layout unavailable")
					}
					switch kind {
					case "selector":
						recipe.events[selectPC].a = selectPC
					case "merge":
						recipe.events[choice.merge].b = -1
					case "order":
						recipe.events[0], recipe.events[choice.end] = recipe.events[choice.end], recipe.events[0]
					case "slot":
						recipe.events[len(recipe.events)-2].cell = 1
					case "initializer-donor":
						recipe.events[selectPC].node = proof.mapping.declarations[0]
					case "acquired-index":
						recipe.events[0].cell = 1
					case "initialize-source":
						recipe.events[choice.end].a = choice.a
					}
					localCandidate := *candidate
					localOwner := *candidate.owner
					localCandidate.owner = &localOwner
					work := shortCircuitPopulationProof{candidate: &localCandidate, index: candidate.owner.index(h.source), remaining: 4096}
					accepted := work.qualifyBody(&proof)
					if accepted != (kind == "positive") {
						t.Fatal("wrong source/default population disposition", kind, accepted)
					}
				}
				recipe := entry.proof.entry
				selectPC := -1
				for pc, event := range recipe.events {
					if event.kind == "SelectDefault" {
						selectPC = pc
					}
				}
				choice, _, _ := defaultChoiceLayout(recipe, selectPC)
				values := make([]languageValue, recipe.registers)
				ready := make([]bool, recipe.registers)
				ready[choice.a] = true
				choices := make([]storageChoice, 0, recipe.choiceSlots)
				disposition := expressionSelectionOrdinary
				out, pc := defaultSelect(languageAlternative{branch: entry.activation}, recipe, selectPC, values, ready, &choices, &disposition)
				if out.completion != languageResidual || pc != selectPC || len(choices) != 0 || ready[choice.out] || disposition != expressionPredicateUnavailable {
					t.Fatal("unknown actual kernel value selected or initialized default")
				}
				values[choice.a] = call.raw.alternatives[0].storage.values[choice.a]
				altered := *recipe
				altered.events = append([]storageEvent(nil), recipe.events...)
				altered.events[selectPC].entry++
				out, _ = defaultSelect(languageAlternative{branch: entry.activation}, &altered, selectPC, values, ready, &choices, &disposition)
				if out.completion != languageResidual {
					t.Fatal("wrong selector labels accepted")
				}
				if argument != "5" {
					empty := make([]storageChoice, 0)
					bounded, _ := defaultSelect(languageAlternative{branch: entry.activation}, recipe, selectPC, values, ready, &empty, &disposition)
					if bounded.completion != languageResidual || len(empty) != 0 {
						t.Fatal("default choice exceeded actual capacity")
					}
				}
				choices = append(choices, storageChoice{destination: -1, merge: choice.merge, end: choice.end})
				values[choice.entry] = languageValue{node: entry.proof.mapping.declarations[0].Initializer()}
				ready[choice.entry] = true
				if defaultMerge(languageAlternative{branch: entry.activation}, recipe, choice.merge, values, ready, &choices).completion != languageResidual {
					t.Fatal("wrong merge accepted")
				}
				if owner.next != next || h.receipt != publication || call.raw != rawReceipt || !call.validResult(row) {
					t.Fatal("negative copies changed actual original or published an identity")
				}
			}
			session := NewSession()
			const id = "/virtual/scalar-default-live.ts"
			r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=7)=>x;read(` + argument + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
				t.Fatal(r.Error, r.Diagnostics, "actual live default absent")
			}
			h := bindingCloseHistory(session, id)
			row := h.receipt.alternatives[0]
			if row.callHistory.validResult(row) {
				t.Fatal("disposed default completed Call renewed authority")
			}
		})
	}
}

func TestScalarParameterDefaultUnsupportedSources(t *testing.T) {
	for _, test := range []struct {
		name, definition, prelude, argument string
		browser                             bool
	}{
		{"unknown-actual", `(x:number=7)=>x`, `declare const input:number;`, "input", false},
		{"captured-default", `(x:number=seed)=>x`, `const seed=7;`, "5", false},
		{"pattern", `({x}={x:7})=>x`, "", "", false},
		{"later-formal", `(x:number=7,y:number=8)=>x`, "", "", false},
		{"reassigned-formal", `(x:number=7)=>(x=9,x)`, "", "5", false},
		{"browser-selected", `(x:number=window.innerWidth)=>x`, "", "", true},
		{"browser-bypassed", `(x:number=window.innerWidth)=>x`, "", "5", true},
		{"default-call", `(x:number=fallback())=>x`, `declare function fallback():number;`, "", false},
		{"throw-default", `(x:number=(()=>{throw 9})())=>x`, "", "", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/scalar-default-refusal.ts"
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};` + test.prelude + `const read=` + test.definition + `;read(` + test.argument + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal("ordinary source qualification", r.Error, r.Diagnostics)
			}
			if h := bindingCloseHistory(session, id); h != nil && h.receipt != nil {
				for _, row := range h.receipt.alternatives {
					if row.completion == languageNormal && row.callHistory != nil {
						t.Fatal("unsupported source gained owned normal default result")
					}
				}
			}
			if test.browser {
				known := false
				for _, callable := range r.Analysis.Callables {
					for _, effect := range callable.EffectSources {
						known = known || effect.Environment == "browser"
					}
				}
				if !known {
					t.Fatal("known browser default effect erased")
				}
				want, reads := 42, 1
				if test.argument == "5" {
					want, reads = 5, 0
				}
				conditionalNodeCompletion(t, r.Code, want, reads)
			}
		})
	}
}
