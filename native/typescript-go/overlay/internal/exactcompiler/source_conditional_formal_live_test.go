package exactcompiler

import (
	"fmt"
	"testing"
)

func TestConditionalFormalLivePublisherControls(t *testing.T) {
	for _, take := range []bool{true, false} {
		t.Run(fmt.Sprint(take), func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if row.callHistory.entry.proof.mapping == nil || len(row.callHistory.entry.proof.mapping.declarations) != 2 {
					return
				}
				seen = true
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("actual live positive refused")
				}
				copied := *h
				if _, ok := copied.conditionalFieldCall(row); ok {
					t.Fatal("copied publisher granted authority")
				}
				wrongMode := *h
				wrongMode.mode[0] ^= 1
				if _, ok := wrongMode.conditionalFieldCall(row); ok {
					t.Fatal("foreign mode granted coverage")
				}
				foreign := row
				foreign.callHistory = nil
				if _, ok := h.conditionalFieldCall(foreign); ok {
					t.Fatal("missing actual history granted coverage")
				}
				if got := row.callHistory.raw.alternatives[0].storage; got == nil {
					t.Fatal("no actual body snapshot")
				}
				alter := func(change func(*languageAlternative)) languageAlternative {
					out := row
					history := *row.callHistory
					receipt := *history.raw
					receipt.alternatives = append([]languageAlternative(nil), receipt.alternatives...)
					snapshot := *receipt.alternatives[0].storage
					snapshot.references = append([]languageReference(nil), snapshot.references...)
					snapshot.ready = append([]bool(nil), snapshot.ready...)
					receipt.alternatives[0].storage = &snapshot
					change(&receipt.alternatives[0])
					history.raw = &receipt
					out.callHistory = &history
					return out
				}
				for _, kind := range []string{"reference", "ready", "namespace", "call", "arguments", "generation"} {
					bad := alter(func(a *languageAlternative) {
						switch kind {
						case "reference":
							for pc, event := range a.storage.recipe.events {
								if event.kind == "Member" {
									if take {
										a.storage.references[pc].key = languageStringKey("foreign")
									} else {
										a.storage.references[pc] = row.callHistory.entry.inputs.reference
									}
								}
							}
						case "ready":
							for pc, event := range a.storage.recipe.events {
								if event.kind == "GetValue" {
									a.storage.ready[pc] = !take
								}
							}
						case "call":
							entry := *a.storage.entry
							header := *entry.inputs
							header.call = entry.proof.arrow
							entry.inputs = &header
							a.storage.entry = &entry
						case "arguments":
							entry := *a.storage.entry
							header := *entry.inputs
							header.arguments = append([]languageCallArgument(nil), header.arguments...)
							header.arguments[1] = header.arguments[0]
							entry.inputs = &header
							a.storage.entry = &entry
						case "generation":
							a.branch.generation++
						case "namespace":
							a.storage.cells = append([]languageCell(nil), a.storage.cells...)
							a.storage.cells[0].environment = languageID{}
						}
					})
					if _, ok := h.conditionalFieldCall(bad); ok {
						t.Fatal("wrong live tuple accepted", kind)
					}
				}
				bad := row
				bad.branch.guard += "foreign"
				if _, ok := h.conditionalFieldCall(bad); ok {
					t.Fatal("wrong branch accepted")
				}
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("negative copies mutated original live tuple")
				}

			}
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/conditional-formal-live.ts", Source: fmt.Sprintf(`export {};const read=(take:boolean,input:{value:number})=>take?input.value:0;read(%v,{value:9});`, take)})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
				t.Fatal(r.Error, r.Diagnostics, "live publisher absent")
			}
		})
	}
}
