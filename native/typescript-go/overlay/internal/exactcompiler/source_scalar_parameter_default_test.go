package exactcompiler

import (
	"testing"
)

func TestScalarParameterDefaultSource(t *testing.T) {
	for _, call := range []string{"5", "", "undefined"} {
		t.Run(map[string]string{"5": "supplied", "": "missing", "undefined": "undefined"}[call], func(t *testing.T) {
			source := `export {};const read=(x:number=7)=>x;read(` + call + `);`
			const id = "/virtual/scalar-parameter-default.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("original source qualification", response.Error, response.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil {
				t.Fatal("actual owned parameter-default Call missing")
			}
			if h.reason != "" || len(h.receipt.alternatives) != 1 {
				t.Fatal("actual default body incomplete", h.reason)
			}
			row := h.receipt.alternatives[0]
			want := 7
			if call == "5" {
				want = 5
			}
			n, known := numericNumberPayload(row.value)
			if row.callHistory == nil || row.completion != languageNormal || !known || float64(n) != float64(want) {
				t.Fatalf("actual default result %s: %v %#v", call, row.remaining, row.value)
			}
			t.Logf("%s actualresult%d completeHeader%v args%d", call, want, row.callHistory.entry.inputs.complete, len(row.callHistory.entry.inputs.arguments))
			raw := row.callHistory.raw.alternatives[0]
			entry := row.callHistory.entry
			r := entry.proof.entry
			snapshot := raw.storage
			if raw.completion != languageReturn || raw.returnBoundary != entry.boundary || snapshot == nil || snapshot.pc != len(r.events) || len(snapshot.cells) != 1 || len(snapshot.choices) != 0 {
				t.Fatal("actual default Return/formal snapshot unavailable")
			}
			argCount := 1
			if call == "" {
				argCount = 0
			}
			if len(entry.inputs.arguments) != argCount {
				t.Fatal("fabricated omitted argument")
			}
			defaultPC := -1
			for pc, event := range r.events {
				if event.kind == "SelectDefault" {
					defaultPC = pc
				}
			}
			choice, initializer, ok := defaultChoiceLayout(r, defaultPC)
			if !ok {
				t.Fatal("missing original default selector")
			}
			selected := call != "5"
			if snapshot.ready[initializer] != selected || snapshot.ready[choice.merge] != selected || !snapshot.ready[choice.out] || r.events[choice.end].kind != "InitializeCell" || r.events[choice.end].a != choice.out {
				t.Fatal("default readiness/order mismatch")
			}
			cell := snapshot.cells[0]
			initializations := 0
			for state := raw.branch.state; state != nil && state != entry.activation.state; state = state.previous {
				if state.storage != nil && state.storage.cell == cell && state.storage.initialized {
					initializations++
					value, known := numericNumberPayload(state.storage.value)
					if !known || float64(value) != float64(want) {
						t.Fatal("wrong actual formal value")
					}
				}
			}
			if initializations != 1 {
				t.Fatalf("formal initialized %d times", initializations)
			}
			for state := entry.activation.state; state != nil; state = state.previous {
				if state.storage != nil && state.storage.cell == cell && state.storage.initialized {
					t.Fatal("formal initialized before original entry")
				}
			}
			conditionalNodeCompletion(t, response.Code, want, 0)
		})
	}
}
