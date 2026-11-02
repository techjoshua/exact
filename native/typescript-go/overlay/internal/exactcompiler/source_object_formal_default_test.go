package exactcompiler

import (
	"testing"
)

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
