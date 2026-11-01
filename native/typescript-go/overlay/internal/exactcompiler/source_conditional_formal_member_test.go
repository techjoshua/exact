package exactcompiler

import (
	"fmt"
	"testing"
)

// The unchanged ordinary source qualifies before any new body admission.
func TestConditionalFormalMemberSource(t *testing.T) {
	for _, take := range []bool{true, false} {
		t.Run(fmt.Sprint(take), func(t *testing.T) {
			source := fmt.Sprintf(`export {};const read=(take:boolean,input:{value:number})=>take?input.value:0;read(%v,{value:9});`, take)
			const id = "/virtual/conditional-formal.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}

			h := bindingCloseHistory(session, id)
			if h == nil {
				t.Fatal("no closed original acquisition")
			}
			t.Logf("history state=%d reason=%s roots=%d publications=%d", h.state, h.reason, h.roots, h.publications)
			if h.reason != "" || h.roots != 1 || h.publications != 1 {
				t.Fatal("original closed Call did not complete", h.reason)
			}
			if h.receipt == nil {
				t.Fatal("no receipt")
			}

			if len(h.receipt.alternatives) != 1 {
				t.Fatal("ambiguous original completion")
			}
			a := h.receipt.alternatives[0]
			want := float64(0)
			if take {
				want = 9
			}
			value, known := numericNumberPayload(a.value)
			if a.callHistory == nil || a.completion != languageNormal || !known || float64(value) != want {
				t.Fatalf("wrong actual Call result %#v", a)
			}
			raw := a.callHistory.raw.alternatives[0]
			r := a.callHistory.entry.proof.entry
			gets := 0
			for pc, event := range r.events {
				if event.kind == "GetValue" {
					if raw.storage.ready[pc] {
						gets++
					}
					m := event.a
					if take && raw.storage.references[m].id.serial == 0 || !take && raw.storage.references[m] != (languageReference{}) {
						t.Fatal("wrong selected reference population")
					}
				}
			}
			if take && gets != 1 || !take && gets != 0 {
				t.Fatalf("actual read population %d", gets)
			}
			joined := false
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				facts := project.callableCache.merged.facts
				for _, caller := range facts {
					for _, target := range facts {
						for _, effect := range target.summary.DirectEffectSources {
							if effect.fieldOrigin == nil {
								continue
							}
							for _, edge := range caller.summary.Calls {
								if fieldFallbackFulfilled(&caller, &target, edge, effect) {
									joined = true
								}
							}
						}
					}
				}
			}
			if !joined {
				t.Fatal("original field outcome not joined")
			}
			for i, a := range h.receipt.alternatives {
				t.Logf("row%d completion=%d reason=%s header=%v history=%v storage=%v", i, a.completion, a.remaining, a.callInputs != nil, a.callHistory != nil, a.storage != nil)
				if a.callInputs != nil {
					t.Logf("header complete=%v arguments=%d", a.callInputs.complete, len(a.callInputs.arguments))
					for j, arg := range a.callInputs.arguments {
						t.Logf("argument%d object=%v callable=%v", j, arg.value.object != nil, arg.value.callable != nil)
					}
				}
			}
		})
	}
}

func TestConditionalFormalRefusalsAndCurrentWrite(t *testing.T) {
	const definition = `const read=(take:boolean,input:{value:number})=>take?input.value:0;`
	for _, test := range []struct {
		name, source string
		want         float64
		normal       bool
	}{
		{"current-data-write", `export {};` + definition + `const input={value:9};input.value=11;read(true,input);`, 11, true},
		{"selected-accessor", `export {};` + definition + `read(true,{get value():number{try{throw 9}finally{}}});`, 0, false},
		{"unknown-predicate-source", `export {};declare const take:boolean;` + definition + `read(take,{value:9});`, 0, false},
		{"proxy-source", `export {};` + definition + `read(true,new Proxy({value:9},{}));`, 0, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/conditional-formal-control.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			history := bindingCloseHistory(session, id)
			if test.normal {
				if history == nil || history.receipt == nil {
					t.Fatal("missing current actual source history")
				}
				row := history.receipt.alternatives[0]
				n, known := numericNumberPayload(row.value)
				if row.completion != languageNormal || row.callHistory == nil || !known || float64(n) != test.want {
					t.Fatal("lost latest data write", row.remaining)
				}
				matched := false
				for _, project := range session.projects {
					if project.callableCache == nil {
						continue
					}
					facts := project.callableCache.merged.facts
					for _, caller := range facts {
						for _, target := range facts {
							for _, effect := range target.summary.DirectEffectSources {
								if effect.fieldOrigin == nil {
									continue
								}
								for _, edge := range caller.summary.Calls {
									if fieldFallbackFulfilled(&caller, &target, edge, effect) {
										matched = true
									}
								}
							}
						}
					}
				}
				if !matched {
					t.Fatal("latest data write lacks exact fulfilled field outcome")
				}
			}
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, outcome := range call.outcomes {
							if outcome.fulfilled && !test.normal {
								t.Fatal("unsupported source gained conditional coverage")
							}
						}
					}
				}
			}
		})
	}
}

// A disposed source history remains structural evidence, never a new issuer.
func TestConditionalFormalDisposedPublisherRefuses(t *testing.T) {
	const id = "/virtual/conditional-formal-lifetime.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `export {};const read=(take:boolean,input:{value:number})=>take?input.value:0;read(true,{value:9});`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	h := bindingCloseHistory(session, id)
	if h == nil || h.receipt == nil {
		t.Fatal("missing actual source")
	}
	row := h.receipt.alternatives[0]
	if _, ok := h.conditionalFieldCall(row); ok {
		t.Fatal("disposed publisher renewed field authority")
	}
	copy := *h
	if _, ok := copy.conditionalFieldCall(row); ok {
		t.Fatal("copied history renewed field authority")
	}
	// Kernel refusal uses the real finalized recipe, not a fabricated source Get.
	recipe := row.callHistory.entry.proof.entry
	pc := -1
	for i, event := range recipe.events {
		if event.kind == "SelectConditional" {
			pc = i
		}
	}
	if pc < 0 {
		t.Fatal("no original selector")
	}
	owner := newLanguageOwner()
	branch := owner.root()
	values := make([]languageValue, recipe.registers)
	ready := make([]bool, recipe.registers)
	ready[recipe.events[pc].a] = true
	choices := make([]storageChoice, 0, recipe.choiceSlots)
	disposition := expressionSelectionOrdinary
	refused, next := conditionalSelect(languageAlternative{branch: branch}, recipe, pc, values, ready, &choices, &disposition)
	if refused.completion != languageResidual || next != pc || len(choices) != 0 || disposition != expressionPredicateUnavailable {
		t.Fatal("unknown predicate selected an arm")
	}
}
