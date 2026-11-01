package exactcompiler

import (
	"encoding/json"
	"testing"
)

func TestObjectFormalDefaultSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, args := range []string{`{value:7}`, `{value:7},5`, `{value:7},undefined`} {
			t.Run(string(target)+"/"+args, func(t *testing.T) {
				const id = "/virtual/object-formal-default.ts"
				session := NewSession()
				r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(input:{value:number},x:number=input.value)=>x;read(` + args + `);`, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
					t.Fatal("source qualification", r.Error, r.Diagnostics)
				}
				h := bindingCloseHistory(session, id)
				if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
					t.Fatal("actual owned Call missing", h)
				}
				row := h.receipt.alternatives[0]
				n, ok := numericNumberPayload(row.value)
				want := 7
				if args == `{value:7},5` {
					want = 5
				}
				if row.callHistory == nil || row.completion != languageNormal || !ok || int(n) != want {
					t.Fatal("actual original Call", row.remaining, row.completion, row.value, h.reason)
				}
				data, _ := json.Marshal(r)
				var response map[string]json.RawMessage
				if err := json.Unmarshal(data, &response); err != nil {
					t.Fatal(err)
				}
				delete(response, "timings")
				normalized, _ := json.Marshal(response)
				t.Log("OBJECTDEFAULTRESPONSE", string(normalized))
				count := 2
				if args == `{value:7}` {
					count = 1
				}
				if len(row.callHistory.entry.inputs.arguments) != count {
					t.Fatal("original complete vector invented/erased actual argument", count)
				}
				objectDefaultAssert(t, row, want, args != `{value:7},5`)
				joined := false
				for _, project := range session.projects {
					if project.callableCache == nil {
						continue
					}
					for _, fact := range project.callableCache.merged.facts {
						for _, call := range fact.fieldCalls {
							for _, out := range call.outcomes {
								if out.demand.operation == row.callHistory.entry.proof.mapping.objectDefaultMember() && out.fulfilled {
									joined = true
								}
							}
						}
					}
				}
				if !joined {
					t.Fatal("exact actual default field outcome missing")
				}
				conditionalNodeCompletion(t, r.Code, want, 0)
			})
		}
	}
}

// The completed snapshot is structural evidence. Live issuer checks belong to
// the publication test, not a disposed Session query reconstructed here.
func objectDefaultAssert(t *testing.T, row languageAlternative, want int, selected bool) {
	t.Helper()
	h := row.callHistory
	if h == nil || h.entry == nil || h.raw == nil || len(h.raw.alternatives) != 1 {
		t.Fatal("actual history missing")
	}
	e := h.entry
	raw := h.raw.alternatives[0]
	r := e.proof.entry
	s := raw.storage
	if raw.completion != languageReturn || raw.returnBoundary != e.boundary || !callBodySnapshot(e, raw) || s.pc != len(r.events) || len(s.choices) != 0 || len(s.cells) != 2 {
		t.Fatal("actual original namespace/Return")
	}
	if len(e.inputs.arguments) < 1 || e.inputs.arguments[0].value.object == nil || e.inputs.arguments[0].value.object.id.owner != row.branch.owner {
		t.Fatal("input not from acquired original allocation")
	}
	selector := -1
	for pc, event := range r.events {
		if event.kind == "SelectDefault" {
			if selector >= 0 {
				t.Fatal("duplicate default")
			}
			selector = pc
		}
	}
	choice, get, ok := defaultChoiceLayout(r, selector)
	if !ok || r.events[get].kind != "GetValue" || r.events[choice.a].kind != "ReadAcquiredArgument" || r.events[choice.a].cell != 1 || r.events[choice.end].kind != "InitializeCell" || r.events[choice.end].cell != 1 || r.events[choice.end].a != choice.out {
		t.Fatal("exact default event order")
	}
	refPC := r.events[get].a
	readPC := r.events[refPC].a
	if r.events[readPC].kind != "ReadCell" || r.events[readPC].cell != 0 || readPC <= 1 || r.events[1].kind != "InitializeCell" || r.events[1].cell != 0 || selector <= 1 {
		t.Fatal("earlier original formal Initialize before ReadLocal")
	}
	if s.ready[choice.merge] != selected || !s.ready[choice.out] || s.ready[get] != selected || s.ready[refPC] != selected || s.ready[readPC] != selected {
		t.Fatal("selected/bypassed readiness")
	}
	if selected {
		ref := s.references[refPC]
		if s.values[readPC] != e.inputs.arguments[0].value || ref.receiver != e.inputs.arguments[0].value || ref.id.serial == 0 || ref.key != languageStringKey("value") || ref.cell != (languageCell{}) {
			t.Fatal("original earlier formal/reference association")
		}
		n, known := numericNumberPayload(s.values[get])
		if !known || int(n) != want {
			t.Fatal("actual selected normal Get value")
		}
	} else if s.references[refPC] != (languageReference{}) {
		t.Fatal("bypassed default issued reference")
	}
	order := []int{}
	for state := raw.branch.state; state != nil && state != e.activation.state; state = state.previous {
		if state.storage == nil || !state.storage.initialized {
			continue
		}
		for i, cell := range s.cells {
			if state.storage.cell == cell {
				order = append(order, i)
				if i == 0 && state.storage.value != e.inputs.arguments[0].value {
					t.Fatal("formal0 identity replaced")
				}
				if i == 1 {
					n, k := numericNumberPayload(state.storage.value)
					if !k || int(n) != want {
						t.Fatal("formal1 initialized wrong value")
					}
				}
			}
		}
	}
	if len(order) != 2 || order[0] != 1 || order[1] != 0 {
		t.Fatal("actual initialization once/order", order)
	}
	if raw.storage.ready[len(r.events)-2] != true || r.events[len(r.events)-2].kind != "ReadCell" || r.events[len(r.events)-2].cell != 1 {
		t.Fatal("body must read original initialized formal1")
	}
}

func TestObjectFormalDefaultCurrentWriteAndExecutions(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		source := `export {};const read=(input:{value:number},x:number=input.value)=>x;const input={value:7};input.value=11;read(input);`
		const id = "/virtual/object-default-current.ts"
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatal(r.Error, r.Diagnostics)
		}
		h := bindingCloseHistory(session, id)
		if h == nil || h.receipt == nil {
			t.Fatal("no current-write Call")
		}
		row := h.receipt.alternatives[0]
		objectDefaultAssert(t, row, 11, true)
		joined := false
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			facts := project.callableCache.merged.facts
			for _, caller := range facts {
				for _, callee := range facts {
					for _, effect := range callee.summary.DirectEffectSources {
						if effect.fieldOrigin == nil {
							continue
						}
						for _, edge := range caller.summary.Calls {
							joined = joined || fieldFallbackFulfilled(&caller, &callee, edge, effect)
						}
					}
				}
			}
		}
		if !joined {
			t.Fatal("current write field outcome not fulfilled")
		}
		conditionalNodeCompletion(t, r.Code, 11, 0)
	}
	// Separate actual executions remain separate across the current source revision.
	var first *languageCallHistory
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	count := 0
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if row.callHistory == nil || row.callHistory.entry.proof.mapping.objectDefaultMember() == nil {
			return
		}
		count++
		if first == nil {
			first = row.callHistory
			return
		}
		a, b := first, row.callHistory
		if a.entry.inputs.arguments[0].value.object == b.entry.inputs.arguments[0].value.object || a.raw.alternatives[0].storage.cells[0] == b.raw.alternatives[0].storage.cells[0] {
			t.Fatal("actual executions shared object/formal identity")
		}
	}
	session := NewSession()
	for _, test := range []struct {
		source string
		want   int
	}{
		{`export {};const read=(input:{value:number},x:number=input.value)=>x;read({value:7});`, 7},
		{`export {};const read=(input:{value:number},x:number=input.value)=>x;read({value:11});`, 11},
	} {
		r := session.Execute(Request{Kind: "compile", ID: "/virtual/object-default-revision.ts", Source: test.source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal("independent execution", r.Error, r.Diagnostics)
		}
		conditionalNodeCompletion(t, r.Code, test.want, 0)
	}
	if count != 2 {
		t.Fatal("actual execution count", count)
	}
}
