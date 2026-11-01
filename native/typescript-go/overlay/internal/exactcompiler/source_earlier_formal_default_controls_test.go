package exactcompiler

import (
	"maps"
	"testing"
)

func TestEarlierFormalDefaultLiveControls(t *testing.T) {
	var sibling *languageCallHistory
	for _, arguments := range []string{"", "5", "undefined,9", "5,9"} {
		t.Run(arguments, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				call := row.callHistory
				entry := call.entry
				if entry.proof.mapping.scalarDefaultParameter(1) == nil {
					return
				}
				seen = true
				if !call.validResult(row) {
					t.Fatal("actual two-formal positive")
				}
				owner := row.branch.owner
				next, publication, originalRaw := owner.next, h.receipt, call.raw
				candidate := h.authority.owner.closedPrefixCandidate
				for _, kind := range []string{"positive", "earlier-slot", "read-cell", "initializer-donor", "acquired-index", "initialize-source", "initialize-order", "duplicate-initialize"} {
					proof := *entry.proof
					plan := *proof.plan
					mapping := *plan.parameters
					mapping.references = maps.Clone(mapping.references)
					plan.parameters = &mapping
					recipe := *proof.entry
					recipe.events = append([]storageEvent(nil), recipe.events...)
					plan.recipe, proof.entry, proof.plan = &recipe, &recipe, &plan
					selects := []int{}
					for pc, e := range recipe.events {
						if e.kind == "SelectDefault" {
							selects = append(selects, pc)
						}
					}
					first, _, firstOK := defaultChoiceLayout(&recipe, selects[0])
					second, read, secondOK := defaultChoiceLayout(&recipe, selects[1])
					if !firstOK || !secondOK {
						t.Fatal("actual two default layouts")
					}
					switch kind {
					case "earlier-slot":
						mapping.references[mapping.declarations[1].Initializer()] = 1
					case "read-cell":
						recipe.events[read].cell = 1
					case "initializer-donor":
						recipe.events[selects[1]].node = mapping.declarations[0].Initializer()
					case "acquired-index":
						recipe.events[second.a].cell = 0
					case "initialize-source":
						recipe.events[second.end].a = first.out
					case "initialize-order":
						recipe.events[first.end], recipe.events[second.a] = recipe.events[second.a], recipe.events[first.end]
					case "duplicate-initialize":
						recipe.events[read].kind = "InitializeCell"
					}
					localCandidate, localOwner := *candidate, *candidate.owner
					localCandidate.owner = &localOwner
					work := shortCircuitPopulationProof{candidate: &localCandidate, index: candidate.owner.index(h.source), remaining: 4096}
					if work.qualifyBody(&proof) != (kind == "positive") {
						t.Fatal("wrong exact formal population", kind)
					}
				}
				for _, kind := range []string{"state", "cursor", "caller", "namespace", "permutation", "sibling-activation", "serial", "summary", "owner", "original-call", "arguments", "generation"} {
					if kind == "sibling-activation" && sibling == nil {
						continue
					}
					bad, history, copiedEntry := row, *call, *entry
					history.entry, bad.callHistory = &copiedEntry, &history
					switch kind {
					case "state":
						bad.branch.state = entry.activation.state
						history.outward = bad.branch
					case "cursor":
						bad.branch.cursor++
						history.outward = bad.branch
					case "caller":
						copiedEntry.caller = entry.activation.env
					case "generation":
						bad.branch.generation++
					case "original-call", "arguments":
						header := *entry.inputs
						copiedEntry.inputs = &header
						if kind == "original-call" {
							header.call = entry.proof.arrow
						} else {
							header.arguments = append(append([]languageCallArgument(nil), header.arguments...), languageCallArgument{})
						}
					case "namespace", "permutation", "sibling-activation", "serial", "summary", "owner":
						raw := *call.raw
						raw.alternatives = append([]languageAlternative(nil), raw.alternatives...)
						snapshot := *raw.alternatives[0].storage
						snapshot.cells = append([]languageCell(nil), snapshot.cells...)
						if kind == "serial" {
							snapshot.cells[0].id.serial++
						} else if kind == "summary" {
							snapshot.cells[0].summary = true
						} else if kind == "owner" {
							snapshot.cells[0].id.owner = nil
						} else if kind == "namespace" {
							snapshot.cells[0] = snapshot.cells[1]
						} else if kind == "permutation" {
							snapshot.cells[0], snapshot.cells[1] = snapshot.cells[1], snapshot.cells[0]
						} else {
							snapshot.cells[0] = sibling.raw.alternatives[0].storage.cells[0]
						}
						raw.alternatives[0].storage, history.raw = &snapshot, &raw
					}
					if history.validResult(bad) {
						t.Fatal("wrong live actual association", kind)
					}
				}
				raw := call.raw.alternatives[0]
				// Read an actually issued persistent x-initialized state while its owner
				// and original formal namespace are live. This state-projection kernel
				// is not an observation of the event cursor or a new completion proof.
				var afterX *languageState
				for state := raw.branch.state; state != nil && state != entry.activation.state; state = state.previous {
					if state.storage != nil && state.storage.initialized && state.storage.cell == raw.storage.cells[0] {
						afterX = state
						break
					}
				}
				if afterX == nil {
					t.Fatal("actual x initialization state missing")
				}
				atX := raw.branch
				atX.state = afterX
				x := owner.readLocal(atX, raw.storage.cells[0])
				y := owner.readLocal(atX, raw.storage.cells[1])
				actualX, known := numericNumberPayload(x.value)
				storedX, stored := numericNumberPayload(afterX.storage.value)
				if x.completion != languageNormal || !known || !stored || actualX != storedX || y.completion != languageThrow || y.value.text != "ReferenceError" || x.branch != atX || y.branch != atX {
					t.Fatal("earlier initialized/later TDZ state relation")
				}
				for _, cell := range raw.storage.cells {
					duplicate := owner.initializeLocal(raw.branch, cell, raw.value)
					if duplicate.completion != languageThrow || duplicate.value.text != "ReferenceError" || duplicate.branch != raw.branch {
						t.Fatal("duplicate formal initialized")
					}
					if owner.readLocal(entry.activation, cell).completion != languageThrow {
						t.Fatal("formal initialized before prologue")
					}
				}
				if owner.next != next || h.receipt != publication || call.raw != originalRaw || !call.validResult(row) {
					t.Fatal("negative copied tuples mutated genuine publication")
				}
			}
			session := NewSession()
			const id = "/virtual/earlier-formal-live.ts"
			r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=7,y:number=x)=>y;read(` + arguments + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
				t.Fatal("live original missing", r.Error, r.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			row := h.receipt.alternatives[0]
			sibling = row.callHistory
			if row.callHistory.validResult(row) {
				t.Fatal("disposed earlier-formal history renewed")
			}
		})
	}
}

func TestEarlierFormalDefaultIsolationAndRefusals(t *testing.T) {
	session := NewSession()
	var previous *languageCallHistory
	for _, argument := range []string{"5", "11", "undefined,9"} {
		const id = "/virtual/earlier-formal-isolation.ts"
		r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=7,y:number=x)=>y;read(` + argument + `);`, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		h := bindingCloseHistory(session, id)
		if h == nil || h.receipt == nil {
			t.Fatal("independent actual Call missing")
		}
		row := h.receipt.alternatives[0]
		want := 5
		if argument == "11" {
			want = 11
		}
		if argument == "undefined,9" {
			want = 9
		}
		n, known := numericNumberPayload(row.value)
		if row.callHistory == nil || !known || int(n) != want {
			t.Fatal("different actual argument reused result")
		}
		if previous != nil && (previous.id == row.callHistory.id || previous.entry.activation.env == row.callHistory.entry.activation.env || previous.raw.alternatives[0].storage.cells[0] == row.callHistory.raw.alternatives[0].storage.cells[0]) {
			t.Fatal("independent Call/formal namespace coalesced")
		}
		previous = row.callHistory
	}
	for _, test := range []struct {
		name, prelude, definition, arguments string
		browser                              bool
	}{
		{"unknown-x", `declare const input:number;`, `(x:number=7,y:number=x)=>y`, "input", false},
		{"unknown-y", `declare const input:number;`, `(x:number=7,y:number=x)=>y`, "5,input", false},
		{"captured-default", `const seed=7;`, `(x:number=7,y:number=seed)=>y`, "", false},
		{"expression-default", "", `(x:number=7,y:number=x+1)=>y`, "", false},
		{"browser-default", "", `(x:number=7,y:number=window.innerWidth)=>y`, "", true},
		{"call-default", `declare function value():number;`, `(x:number=7,y:number=value())=>y`, "", false},
		{"throw-default", "", `(x:number=7,y:number=(()=>{throw 9})())=>y`, "", false},
		{"wrong-body", "", `(x:number=7,y:number=x)=>x`, "", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/earlier-formal-refusal.ts"
			s := NewSession()
			r := s.Execute(Request{Kind: "compile", ID: id, Source: `export {};` + test.prelude + `const read=` + test.definition + `;read(` + test.arguments + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal("ordinary source qualification", r.Error, r.Diagnostics)
			}
			if h := bindingCloseHistory(s, id); h != nil && h.receipt != nil {
				for _, row := range h.receipt.alternatives {
					if row.completion == languageNormal && row.callHistory != nil {
						t.Fatal("unsupported default granted normal Call")
					}
				}
			}
			if test.browser {
				known := false
				for _, c := range r.Analysis.Callables {
					for _, e := range c.EffectSources {
						known = known || e.Environment == "browser"
					}
				}
				if !known {
					t.Fatal("known browser default effect lost")
				}
			}
		})
	}
}

func TestEarlierFormalDefaultTDZQualification(t *testing.T) {
	for _, test := range []struct{ definition, code string }{
		{`(x:number=y,y:number=7)=>y`, "TS2373"},
		{`(x:number=x,y:number=7)=>y`, "TS2372"},
	} {
		definition := test.definition
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: "/virtual/invalid-default.ts", Source: `export {};const read=` + definition + `;read();`, Diagnostics: "semantic"})
		qualified := false
		for _, diagnostic := range r.Diagnostics {
			qualified = qualified || diagnostic.Severity == "error" && diagnostic.Code == test.code
		}
		if r.Error != "" || !qualified {
			t.Fatal("missing expected default-parameter diagnostic", test.code, r.Error, r.Diagnostics)
		}
		if h := bindingCloseHistory(session, "/virtual/invalid-default.ts"); h != nil && h.receipt != nil {
			for _, row := range h.receipt.alternatives {
				if row.callHistory != nil {
					t.Fatal("invalid TS claimed owned default Call")
				}
			}
		}
		t.Log("TypeScript rejects this source before native entry", r.Diagnostics)
		// Independent JavaScript semantics, not a valid-TS source admission claim.
		conditionalNodeCompletion(t, `let result=0;try {const read=`+definition+`;read()}catch(error){if(error instanceof ReferenceError)result=1}result;`, 1, 0)
	}
}
