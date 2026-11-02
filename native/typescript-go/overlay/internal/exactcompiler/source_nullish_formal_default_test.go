package exactcompiler

import (
	"testing"
)

// These are immutable installed facts after request disposal, not live renewal.
func nullishDefaultSnapshot(t *testing.T, row languageAlternative, want int, args string) {
	t.Helper()
	call := row.callHistory
	e := call.entry
	raw := call.raw.alternatives[0]
	r := e.proof.entry
	s := raw.storage
	if !callBodySnapshot(e, raw) || raw.completion != languageReturn || raw.returnBoundary != e.boundary || s.pc != len(r.events) || len(s.choices) != 0 || r.choiceSlots != 2 {
		t.Fatal("actual body/Return/two-choice capacity")
	}
	d, n, g := -1, -1, -1
	for pc, event := range r.events {
		switch event.kind {
		case "SelectDefault":
			d = pc
		case "SelectNullish":
			n = pc
		case "GetValue":
			if g >= 0 {
				t.Fatal("duplicate Get event")
			}
			g = pc
		}
	}
	outer, producer, ok := defaultChoiceLayout(r, d)
	if !ok || producer != n || r.events[n].a != g || g <= d || n != g+1 || r.events[n].end != outer.merge {
		t.Fatal("ordered nested source producers")
	}
	selected := args != `{value:null},5` && args != `{value:3},5` && args != `{value:undefined},5`
	count := 1
	if !selected || args == `{value:null},undefined` {
		count = 2
	}
	if len(e.inputs.arguments) != count {
		t.Fatal("original vector count")
	}
	ref := r.events[g].a
	read := r.events[ref].a
	inner := r.events[n]
	if s.ready[g] != selected || s.ready[ref] != selected || s.ready[read] != selected || s.ready[n] != selected || s.ready[outer.merge] != selected {
		t.Fatal("outer selection/bypass readiness")
	}
	if selected {
		receiver := e.inputs.arguments[0].value
		if receiver.object == nil || s.values[read] != receiver || s.references[ref].receiver != receiver || s.references[ref].id.serial == 0 || s.references[ref].key != languageStringKey("value") {
			t.Fatal("actual original formal object/ref")
		}
		left := s.values[g]
		take := left.undefined || left.node != nil && left.node.Kind == storageNullKind
		if s.ready[inner.entry] != take || s.ready[inner.merge] != take || s.values[n] != raw.value {
			t.Fatal("actual inner branch/merge result")
		}
		if take {
			v, k := numericNumberPayload(s.values[inner.entry])
			if !k || v != 7 || left == raw.value {
				t.Fatal("null/undefined Get incorrectly equated with Return")
			}
		} else {
			v, k := numericNumberPayload(left)
			if !k || int(v) != want || left != raw.value {
				t.Fatal("normal left was not forwarded")
			}
		}
	} else {
		if s.references[ref] != (languageReference{}) {
			t.Fatal("bypass issued reference")
		}
		for pc := outer.entry; pc < outer.merge; pc++ {
			if s.ready[pc] {
				t.Fatal("bypass executed Get/RHS", pc)
			}
		}
	}
	order := []int{}
	first, last := uint64(0), uint64(0)
	for state := raw.branch.state; state != nil && state != e.activation.state; state = state.previous {
		if state.storage == nil || !state.storage.initialized {
			continue
		}
		for i, cell := range s.cells {
			if state.storage.cell == cell {
				order = append(order, i)
				if i == 0 {
					first = state.id.serial
					if state.storage.value != e.inputs.arguments[0].value {
						t.Fatal("formal0 not original acquired object")
					}
				} else {
					last = state.id.serial
					v, k := numericNumberPayload(state.storage.value)
					if !k || int(v) != want {
						t.Fatal("formal1 initializer result")
					}
				}
			}
		}
	}
	if len(order) != 2 || order[0] != 1 || order[1] != 0 {
		t.Fatal("Initialize once/in declaration order", order)
	}
	if selected && !(first < s.references[ref].id.serial && s.references[ref].id.serial < last) {
		t.Fatal("Member reference issuance outside formal initialization order")
	}
}
