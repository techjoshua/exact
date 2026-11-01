package exactcompiler

import "testing"

func TestEarlierFormalDefaultSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, test := range []struct {
			name, arguments    string
			x, y, count        int
			defaultX, defaultY bool
		}{
			{"missing-both", "", 7, 7, 0, true, true},
			{"supplied-x", "5", 5, 5, 1, false, true},
			{"supplied-y", "undefined,9", 7, 9, 2, true, false},
			{"both-supplied", "5,9", 5, 9, 2, false, false},
			{"explicit-undefined", "undefined,undefined", 7, 7, 2, true, true},
		} {
			t.Run(string(target)+"/"+test.name, func(t *testing.T) {
				const id = "/virtual/earlier-formal-default.ts"
				session := NewSession()
				r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=7,y:number=x)=>y;read(` + test.arguments + `);`, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
					t.Fatal("unchanged source qualification", r.Error, r.Diagnostics)
				}
				h := bindingCloseHistory(session, id)
				if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 {
					t.Fatal("actual earlier-formal default Call missing")
				}
				row := h.receipt.alternatives[0]
				value, known := numericNumberPayload(row.value)
				if row.completion != languageNormal || row.callHistory == nil || !known || int(value) != test.y {
					t.Fatal("actual result", row.remaining, row.value)
				}
				entry := row.callHistory.entry
				raw := row.callHistory.raw.alternatives[0]
				snapshot := raw.storage
				if !entry.inputs.complete || len(entry.inputs.arguments) != test.count || raw.completion != languageReturn || raw.returnBoundary != entry.boundary || snapshot == nil || len(snapshot.cells) != 2 || snapshot.pc != len(entry.proof.entry.events) || len(snapshot.choices) != 0 {
					t.Fatal("original vector/Return/formal namespace")
				}
				selectors := []int{}
				for pc, event := range entry.proof.entry.events {
					if event.kind == "SelectDefault" {
						selectors = append(selectors, pc)
					}
				}
				if len(selectors) != 2 {
					t.Fatal("missing actual default intervals")
				}
				for i, selected := range []bool{test.defaultX, test.defaultY} {
					choice, producer, ok := defaultChoiceLayout(entry.proof.entry, selectors[i])
					if !ok || snapshot.ready[producer] != selected || snapshot.ready[choice.merge] != selected || !snapshot.ready[choice.out] || entry.proof.entry.events[choice.end].kind != "InitializeCell" || entry.proof.entry.events[choice.end].cell != i {
						t.Fatal("actual default selection/readiness/order", i)
					}
					if i == 1 {
						read := entry.proof.entry.events[producer]
						if read.kind != "ReadCell" || read.cell != 0 || read.node != entry.proof.mapping.declarations[1].Initializer() || selectors[1] <= entry.proof.entry.events[selectors[0]].end {
							t.Fatal("second initializer is not original earlier formal read")
						}
						if selected {
							n, k := numericNumberPayload(snapshot.values[producer])
							if !k || int(n) != test.x {
								t.Fatal("earlier cell default value")
							}
						}
					}
				}
				order := []int{}
				for state := raw.branch.state; state != nil && state != entry.activation.state; state = state.previous {
					if state.storage == nil || !state.storage.initialized {
						continue
					}
					for i, cell := range snapshot.cells {
						if state.storage.cell == cell {
							order = append(order, i)
							n, k := numericNumberPayload(state.storage.value)
							want := test.x
							if i == 1 {
								want = test.y
							}
							if !k || int(n) != want {
								t.Fatal("actual initialized cell value", i)
							}
						}
					}
				}
				if len(order) != 2 || order[0] != 1 || order[1] != 0 {
					t.Fatal("formal initialize once/order", order)
				}
				for state := entry.activation.state; state != nil; state = state.previous {
					if state.storage != nil {
						for _, cell := range snapshot.cells {
							if state.storage.initialized && state.storage.cell == cell {
								t.Fatal("formal initialized before activation")
							}
						}
					}
				}
				conditionalNodeCompletion(t, r.Code, test.y, 0)
			})
		}
	}
}
