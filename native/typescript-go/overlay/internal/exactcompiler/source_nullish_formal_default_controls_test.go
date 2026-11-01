package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/jsnum"
	"testing"
)

func TestNullishFormalDefaultLiveControls(t *testing.T) {
	for _, args := range []string{`{value:3}`, `{value:null}`, `{value:undefined}`, `{value:null},5`} {
		t.Run(args, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			var stored languageAlternative
			var saved *closedPrefixHistory
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if row.callHistory == nil || row.callHistory.entry.proof.mapping.objectDefaultMember() == nil {
					return
				}
				seen = true
				stored = row
				saved = h
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("genuine live nullish positive")
				}
				call := row.callHistory
				e := call.entry
				raw := call.raw.alternatives[0]
				r := e.proof.entry
				n, d := -1, -1
				for pc, event := range r.events {
					if event.kind == "SelectNullish" {
						n = pc
					}
					if event.kind == "SelectDefault" {
						d = pc
					}
				}
				inner := r.events[n]
				outer, _, _ := defaultChoiceLayout(r, d)
				get := inner.a
				ref := r.events[get].a
				owner := row.branch.owner
				ids, pub := owner.next, h.receipt
				// A genuine selected RHS precedes each independent copied-buffer
				// corruption. Raw Return, entry and all other buffers stay fixed.
				if raw.storage.ready[inner.entry] {
					for _, kind := range []string{"RHS-zero", "RHS-NaN", "Initialize-zero", "bodyRead-zero"} {
						bad, history := row, *call
						receipt := *call.raw
						receipt.alternatives = append([]languageAlternative(nil), receipt.alternatives...)
						snapshot := *raw.storage
						snapshot.values = append([]languageValue(nil), snapshot.values...)
						receipt.alternatives[0].storage = &snapshot
						history.raw = &receipt
						bad.callHistory = &history
						zero := raw.storage.values[inner.entry]
						zero.number = numberPayloadOf(0)
						switch kind {
						case "RHS-zero":
							snapshot.values[inner.entry] = zero
						case "RHS-NaN":
							v := zero
							v.number = numberPayloadOf(jsnum.NaN())
							n, known := numericNumberPayload(v)
							if !known || !n.IsNaN() {
								t.Fatal("canonical NaN corruption missing")
							}
							snapshot.values[inner.entry] = v
						case "Initialize-zero":
							snapshot.values[outer.end] = zero
						case "bodyRead-zero":
							snapshot.values[len(r.events)-2] = zero
						}
						if receipt.alternatives[0].value != raw.value || history.entry != e || call.raw.alternatives[0].value != raw.value {
							t.Fatal("negative changed rawReturn/entry")
						}
						if _, ok := h.conditionalFieldCall(bad); ok {
							t.Fatal("numeric/Return join corruption accepted", kind)
						}
						if _, ok := h.conditionalFieldCall(row); !ok {
							t.Fatal("genuine selected positive lost", kind)
						}
					}
				}
				// Existing selector kernel only. These canonical carriers are
				// not new authored NaN/signed-zero sources or Call outcomes.
				zeroNumber := jsnum.Number(0)
				for _, number := range []jsnum.Number{jsnum.NaN(), -zeroNumber} {
					carrier := raw.storage.values[inner.entry]
					if carrier.node == nil {
						carrier = languageValue{node: r.events[inner.entry].node}
					}
					carrier.number = numberPayloadOf(number)
					values := make([]languageValue, r.registers)
					ready := make([]bool, r.registers)
					values[get], ready[get] = carrier, true
					stack := make([]storageChoice, 0, r.choiceSlots)
					out, next := shortCircuitSelect(languageAlternative{branch: raw.branch, completion: languageNormal}, inner, n, len(r.events), values, ready, &stack, r.choiceSlots)
					if out.completion != languageNormal || next != inner.end || len(stack) != 0 || !ready[inner.out] || values[inner.out] != carrier || out.value != carrier || ready[inner.entry] || ready[inner.merge] {
						t.Fatal("non-nullish special-number forwarding kernel")
					}
				}
				// Constructor-only choice-stack composition using the actual acquired
				// selector operands. This is not an intercepted source phase.
				values := make([]languageValue, r.registers)
				ready := make([]bool, r.registers)
				values[outer.a] = raw.storage.values[outer.a]
				ready[outer.a] = true
				frames := make([]storageChoice, 0, r.choiceSlots)
				prior := languageAlternative{branch: raw.branch, completion: languageNormal}
				disposition := expressionSelectionOrdinary
				selected, next := defaultSelect(prior, r, d, values, ready, &frames, &disposition)
				if args == `{value:null},5` {
					if next != outer.end || len(frames) != 0 {
						t.Fatal("bypass opened default frame")
					}
				} else {
					if next != outer.entry || len(frames) != 1 || frames[0] != (storageChoice{destination: outer.out, merge: outer.merge, end: outer.end}) {
						t.Fatal("outer default frame")
					}
					values[get] = raw.storage.values[get]
					ready[get] = true
					_, next = shortCircuitSelect(selected, inner, n, len(r.events), values, ready, &frames, r.choiceSlots)
					take, known := acquiredNullish(raw.branch, values[get])
					if !known {
						t.Fatal("actual left unavailable")
					}
					if take {
						if len(frames) != 2 || next != inner.entry || frames[1] != (storageChoice{destination: inner.out, merge: inner.merge, end: inner.end}) {
							t.Fatal("two exact nested frames")
						}
					} else if len(frames) != 1 || next != inner.end {
						t.Fatal("nonnull left incorrectly entered RHS")
					}
				}
				for _, kind := range []string{"left", "unknown-left", "ref", "inner-ready", "RHS-ready", "merge-ready", "inner-value", "RHS-value", "outer-value", "state", "generation", "call"} {
					// Unready unused payloads are not executed values. Do not require
					// corruption of those buffers to invalidate a genuine bypass.
					if args == `{value:null},5` && (kind == "left" || kind == "unknown-left" || kind == "inner-value") {
						continue
					}
					bad, history := row, *call
					receipt := *call.raw
					receipt.alternatives = append([]languageAlternative(nil), receipt.alternatives...)
					s := *raw.storage
					s.ready = append([]bool(nil), s.ready...)
					s.values = append([]languageValue(nil), s.values...)
					s.references = append([]languageReference(nil), s.references...)
					receipt.alternatives[0].storage = &s
					history.raw = &receipt
					bad.callHistory = &history
					switch kind {
					case "left":
						s.values[get] = raw.value
						if s.values[get] == raw.storage.values[get] {
							continue
						}
					case "unknown-left":
						s.values[get] = languageValue{}
					case "ref":
						s.references[ref].key = languageStringKey("other")
					case "inner-ready":
						s.ready[n] = !s.ready[n]
					case "RHS-ready":
						s.ready[inner.entry] = !s.ready[inner.entry]
					case "merge-ready":
						s.ready[inner.merge] = !s.ready[inner.merge]
					case "inner-value":
						s.values[n] = languageValue{}
					case "RHS-value":
						if !s.ready[inner.entry] {
							continue
						}
						s.values[inner.entry] = languageValue{}
					case "outer-value":
						s.values[outer.out] = languageValue{}
					case "state":
						bad.branch.state = e.activation.state
					case "generation":
						bad.branch.generation++
					case "call":
						entry := *e
						header := *e.inputs
						header.call = e.proof.arrow
						entry.inputs = &header
						history.entry = &entry
					}
					if _, ok := h.conditionalFieldCall(bad); ok {
						t.Fatal("wrong live nullish tuple", kind)
					}
				}
				for _, kind := range []string{"selector-left", "merge-owner", "RHS-donor"} {
					// Constructor-only defensive recipe kernel. It cannot qualify source.
					bad, history, entry, proof := row, *call, *e, *e.proof
					recipe := *r
					recipe.events = append([]storageEvent(nil), r.events...)
					proof.entry = &recipe
					entry.proof = &proof
					history.entry = &entry
					bad.callHistory = &history
					switch kind {
					case "selector-left":
						recipe.events[n].a = ref
					case "merge-owner":
						recipe.events[inner.merge].b = d
					case "RHS-donor":
						recipe.events[inner.entry].node = recipe.events[get].node
					}
					if _, ok := h.objectDefaultFieldCall(bad); ok {
						t.Fatal("copied recipe kernel accepted", kind)
					}
				}
				copied := *h
				if _, ok := copied.conditionalFieldCall(row); ok {
					t.Fatal("copied publisher")
				}
				copied = *h
				copied.mode[0] ^= 1
				if _, ok := copied.conditionalFieldCall(row); ok {
					t.Fatal("wrong mode")
				}
				receiver := e.inputs.arguments[0].value.object
				_, _, _, record := owner.readOwnRecord(raw.branch, receiver, languageStringKey("value"))
				if record == nil {
					t.Fatal("actual current record")
				}
				original := *record
				defer func() { *record = original }()
				for _, kind := range []string{"accessor", "deleted", "unknown"} {
					*record = original
					switch kind {
					case "accessor":
						record.descriptor.accessor = true
					case "deleted":
						record.deleted = true
					case "unknown":
						record.descriptor.value = languageValue{}
					}
					if _, ok := h.conditionalFieldCall(row); ok {
						t.Fatal("changed descriptor/carrier gained coverage", kind)
					}
					*record = original
					if _, ok := h.conditionalFieldCall(row); !ok {
						t.Fatal("restored descriptor positive")
					}
				}
				if owner.next != ids || h.receipt != pub {
					t.Fatal("copies changed identities/publication")
				}
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("genuine positive lost after negatives")
				}
			}
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "/virtual/nullish-default-live.ts", Source: `export {};const read=(input:{value:number|null|undefined},x:number=input.value??7)=>x;read(` + args + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
				t.Fatal(r.Error, r.Diagnostics, seen)
			}
			if !callBodySnapshot(stored.callHistory.entry, stored.callHistory.raw.alternatives[0]) {
				t.Fatal("detached structural facts lost")
			}
			if _, ok := saved.conditionalFieldCall(stored); ok {
				t.Fatal("dead publisher renewed authority")
			}
		})
	}
}

func TestNullishFormalDefaultCurrentWriteAndRefusals(t *testing.T) {
	const definition = `const read=(input:{value:number|null|undefined},x:number=input.value??7)=>x;`
	for _, value := range []string{"11", "null", "undefined", "next"} {
		t.Run(value, func(t *testing.T) {
			prefix := ""
			if value == "next" {
				prefix = "const next=11;"
			}
			source := `export {};` + definition + prefix + `const input:{value:number|null|undefined}={value:3};input.value=` + value + `;read(input);`
			const id = "/virtual/nullish-current.ts"
			s := NewSession()
			r := s.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			h := bindingCloseHistory(s, id)
			if h == nil || h.receipt == nil {
				t.Fatal("current source Call")
			}
			row := h.receipt.alternatives[0]
			want := 7
			if value == "11" || value == "next" {
				want = 11
			}
			n, k := numericNumberPayload(row.value)
			if !k || int(n) != want {
				t.Fatal("current field value lost")
			}
			fulfilled := false
			for _, project := range s.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, out := range call.outcomes {
							if out.fulfilled && out.demand.operation == row.callHistory.entry.proof.mapping.objectDefaultMember() {
								fulfilled = true
							}
						}
					}
				}
			}
			if !fulfilled {
				t.Fatal("current field write lacks exact outcome")
			}
			conditionalNodeCompletion(t, r.Code, want, 0)
		})
	}
	for _, tail := range []string{`declare const input:{value:number|null|undefined};read(input);`, `declare const x:number;read({value:null},x);`, `read(new Proxy({value:null},{}));`, `read(Object.create({value:null}));`, `read({get value():number{try{throw 9}finally{}}});`} {
		s := NewSession()
		r := s.Execute(Request{Kind: "analyze", ID: "/virtual/nullish-refuse.ts", Source: `export {};` + definition + tail, Diagnostics: "semantic"})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		for _, diag := range r.Diagnostics {
			if diag.Severity == "error" && diag.Code != "EXACT2101" {
				t.Fatal("TS source qualification", diag)
			}
		}
		for _, project := range s.projects {
			if project.callableCache == nil {
				continue
			}
			for _, fact := range project.callableCache.merged.facts {
				for _, call := range fact.fieldCalls {
					for _, out := range call.outcomes {
						if out.fulfilled {
							t.Fatal("unsupported source paid default field")
						}
					}
				}
			}
		}
	}
}

func TestNullishFormalDefaultBrowserEffect(t *testing.T) {
	for _, args := range []string{"input", "input,5"} {
		source := `export {};const read=(input:{value:number|null|undefined},x:number=input.value??7)=>x;const input={get value(){return window.innerWidth}};read(` + args + `);`
		s := NewSession()
		r := s.Execute(Request{Kind: "compile", ID: "/virtual/nullish-browser.ts", Source: source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		browser := false
		for _, f := range r.Analysis.Callables {
			for _, e := range f.EffectSources {
				browser = browser || e.Environment == "browser"
			}
		}
		if !browser {
			t.Fatal("known browser effect lost")
		}
		for _, project := range s.projects {
			if project.callableCache == nil {
				continue
			}
			for _, fact := range project.callableCache.merged.facts {
				for _, call := range fact.fieldCalls {
					for _, o := range call.outcomes {
						if o.fulfilled {
							t.Fatal("getter received DATA coverage")
						}
					}
				}
			}
		}
		want, gets := 42, 1
		if args == "input,5" {
			want, gets = 5, 0
		}
		conditionalNodeCompletion(t, r.Code, want, gets)
	}
}

func TestNullishFormalDefaultSourceAdmission(t *testing.T) {
	for _, definition := range []string{
		`const read=(input:{value:number|undefined},x:number=input.value??7)=>x;`,
		`const read=(input:{value:number|null|undefined},x:number=input.value??8)=>x;`,
	} {
		const id = "/virtual/nullish-default-admission.ts"
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};` + definition + `read({value:3});`, Diagnostics: "semantic"})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		for _, diagnostic := range r.Diagnostics {
			if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
				t.Fatal("unsupported ordinary TS source", diagnostic)
			}
		}
		history := bindingCloseHistory(session, id)
		if history != nil && history.receipt != nil {
			for _, row := range history.receipt.alternatives {
				if row.callHistory != nil && row.callHistory.entry != nil && row.callHistory.entry.proof.entry != nil {
					t.Fatal("unsupported finite shape entered native body")
				}
			}
		}
		// Emission availability is intentionally not asserted for conservative input.
	}
}
