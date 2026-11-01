package exactcompiler

import (
	"encoding/json"
	"maps"
	"reflect"
	"testing"
)

func TestObjectFormalDefaultLiveControls(t *testing.T) {
	for _, arguments := range []string{`{value:7}`, `{value:7},5`, `{value:7},undefined`} {
		t.Run(arguments, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			var detached languageAlternative
			var saved *closedPrefixHistory
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if row.callHistory == nil || row.callHistory.entry.proof.mapping.objectDefaultMember() == nil {
					return
				}
				seen = true
				saved = h
				detached = row
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("genuine live default field outcome refused")
				}
				owner := row.branch.owner
				next, pub := owner.next, h.receipt

				// Constructor-only mutation of the actual current record. This is
				// not an authored descriptor transition or a replay of its Get.
				rawCurrent := row.callHistory.raw.alternatives[0]
				receiver := row.callHistory.entry.inputs.arguments[0].value.object
				_, present, complete, record := owner.readOwnRecord(rawCurrent.branch, receiver, languageStringKey("value"))
				if !present || !complete || record == nil {
					t.Fatal("genuine current own DATA record missing")
				}
				originalRecord := *record
				defer func() { *record = originalRecord }()
				for _, kind := range []string{"accessor", "deleted"} {
					*record = originalRecord
					if kind == "accessor" {
						record.descriptor.accessor = true
					} else {
						record.deleted = true
					}
					outcome, accepted := h.conditionalFieldCall(row)
					if accepted || len(outcome.outcomes) != 0 {
						t.Fatal("changed current descriptor granted DATA coverage", kind)
					}
					*record = originalRecord
					if _, ok := h.conditionalFieldCall(row); !ok {
						t.Fatal("restored current DATA positive refused", kind)
					}
				}
				// Complete own population is not required to validate this
				// particular present DATA record. It is no purity guarantee.
				population := receiver.ownComplete
				receiver.ownComplete = false
				_, specificDATA := h.conditionalFieldCall(row)
				receiver.ownComplete = population
				if !specificDATA {
					t.Fatal("specific own DATA required whole-object completeness")
				}
				// Direct consumer kernels isolate defensive operand ranges.
				// Genuine source population is checked elsewhere, not bypassed
				// to authorize these copied malformed recipes.
				for _, kind := range []string{"member-range", "read-range"} {
					bad, history, entry := row, *row.callHistory, *row.callHistory.entry
					proof := *entry.proof
					recipe := *proof.entry
					recipe.events = append([]storageEvent(nil), recipe.events...)
					proof.entry = &recipe
					entry.proof = &proof
					history.entry = &entry
					bad.callHistory = &history
					get := -1
					for pc, event := range recipe.events {
						if event.kind == "GetValue" && event.node == proof.mapping.objectDefaultMember() {
							get = pc
						}
					}
					if get < 0 {
						t.Fatal("genuine Get donor missing")
					}
					if kind == "member-range" {
						recipe.events[get].a = -1
					} else {
						recipe.events[recipe.events[get].a].a = -1
					}
					if _, ok := h.objectDefaultFieldCall(bad); ok {
						t.Fatal("malformed operand range accepted", kind)
					}
				}
				if _, ok := h.objectDefaultFieldCall(row); !ok || owner.next != next || h.receipt != pub {
					t.Fatal("consumer kernels changed genuine source/identity/publication")
				}
				for _, kind := range []string{"reference", "receiver", "read-value", "get-value", "get-ready", "merge-ready", "selector-ready", "namespace", "permutation", "generation", "current-state", "caller", "call", "arguments", "recipe", "choice-value", "body-value", "initialize-value", "reference-strict", "reference-future"} {
					bad, history, entry := row, *row.callHistory, *row.callHistory.entry
					receipt := *history.raw
					receipt.alternatives = append([]languageAlternative(nil), receipt.alternatives...)
					raw := &receipt.alternatives[0]
					snapshot := *raw.storage
					snapshot.cells = append([]languageCell(nil), snapshot.cells...)
					snapshot.ready = append([]bool(nil), snapshot.ready...)
					snapshot.values = append([]languageValue(nil), snapshot.values...)
					snapshot.references = append([]languageReference(nil), snapshot.references...)
					raw.storage = &snapshot
					history.raw = &receipt
					history.entry = &entry
					bad.callHistory = &history
					selector := -1
					for pc, event := range entry.proof.entry.events {
						if event.kind == "SelectDefault" {
							selector = pc
						}
					}
					choice, get, _ := defaultChoiceLayout(entry.proof.entry, selector)
					ref := entry.proof.entry.events[get].a
					read := entry.proof.entry.events[ref].a
					switch kind {
					case "choice-value":
						snapshot.values[choice.out] = languageValue{}
					case "body-value":
						snapshot.values[len(entry.proof.entry.events)-2] = languageValue{}
					case "initialize-value":
						snapshot.values[choice.end] = languageValue{}
					case "reference-strict":
						snapshot.references[ref].strict = false
					case "reference-future":
						snapshot.references[ref].id.serial = owner.next + 1
					case "reference":
						snapshot.references[ref].key = languageStringKey("other")
					case "receiver":
						snapshot.references[ref].receiver = languageValue{}
					case "read-value":
						snapshot.values[read] = languageValue{}
					case "get-value":
						snapshot.values[get] = languageValue{}
					case "get-ready":
						snapshot.ready[get] = !snapshot.ready[get]
					case "merge-ready":
						snapshot.ready[choice.merge] = !snapshot.ready[choice.merge]
					case "selector-ready":
						snapshot.ready[choice.a] = false
					case "namespace":
						snapshot.cells[0] = snapshot.cells[1]
					case "permutation":
						snapshot.cells[0], snapshot.cells[1] = snapshot.cells[1], snapshot.cells[0]
					case "generation":
						bad.branch.generation++
					case "current-state":
						bad.branch.state = entry.activation.state
					case "caller":
						entry.caller = entry.activation.env
					case "call", "arguments":
						header := *entry.inputs
						header.arguments = append([]languageCallArgument(nil), header.arguments...)
						if kind == "call" {
							header.call = entry.proof.arrow
						} else {
							header.arguments[0].value = languageValue{}
						}
						entry.inputs = &header
					case "recipe":
						snapshot.recipe = nil
					}
					// Bypass has no receiver/read/Get payload to corrupt. Do not count identical copies.
					if arguments == `{value:7},5` && (kind == "receiver" || kind == "read-value" || kind == "get-value" || kind == "reference-strict") {
						continue
					}
					if _, ok := h.conditionalFieldCall(bad); ok {
						t.Fatal("wrong live tuple accepted", kind)
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
				e := row.callHistory.entry
				c := h.authority.owner.closedPrefixCandidate
				for _, kind := range []string{"positive", "earlier-slot", "read-slot", "member-source", "initializer-donor", "acquired-index", "initialize-source", "initialize-order", "duplicate-init"} {
					proof := *e.proof
					plan := *proof.plan
					mapping := *plan.parameters
					mapping.references = maps.Clone(mapping.references)
					plan.parameters = &mapping
					recipe := *proof.entry
					recipe.events = append([]storageEvent(nil), recipe.events...)
					plan.recipe = &recipe
					proof.plan = &plan
					proof.entry = &recipe
					selector := -1
					for pc, event := range recipe.events {
						if event.kind == "SelectDefault" {
							selector = pc
						}
					}
					choice, get, _ := defaultChoiceLayout(&recipe, selector)
					ref := recipe.events[get].a
					read := recipe.events[ref].a
					switch kind {
					case "earlier-slot":
						mapping.references[mapping.objectDefaultMember().Expression()] = 1
					case "read-slot":
						recipe.events[read].cell = 1
					case "member-source":
						recipe.events[ref].a = choice.a
					case "initializer-donor":
						recipe.events[selector].node = mapping.declarations[0]
					case "acquired-index":
						recipe.events[choice.a].cell = 0
					case "initialize-source":
						recipe.events[choice.end].a = choice.a
					case "initialize-order":
						recipe.events[1], recipe.events[choice.end] = recipe.events[choice.end], recipe.events[1]
					case "duplicate-init":
						recipe.events[read].kind = "InitializeCell"
					}
					candidate, sourceOwner := *c, *c.owner
					candidate.owner = &sourceOwner
					work := shortCircuitPopulationProof{candidate: &candidate, index: c.owner.index(h.source), remaining: 4096}
					if work.qualifyBody(&proof) != (kind == "positive") {
						t.Fatal("wrong source/default population", kind)
					}
				}
				raw := row.callHistory.raw.alternatives[0]
				duplicate := owner.initializeLocal(raw.branch, raw.storage.cells[1], raw.value)
				if duplicate.completion != languageThrow || duplicate.value.text != "ReferenceError" || duplicate.branch != raw.branch || owner.next != next || h.receipt != pub {
					t.Fatal("duplicate initialization changed state/identity/publication")
				}
				if _, ok := h.conditionalFieldCall(row); !ok {
					t.Fatal("copied negatives changed genuine live tuple")
				}
			}
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "/virtual/object-default-live.ts", Source: `export {};const read=(input:{value:number},x:number=input.value)=>x;read(` + arguments + `);`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
				t.Fatal("live source", r.Error, r.Diagnostics, seen)
			}
			if saved == nil || detached.callHistory == nil || !callBodySnapshot(detached.callHistory.entry, detached.callHistory.raw.alternatives[0]) {
				t.Fatal("detached structural tuple lost")
			}
			if _, ok := saved.conditionalFieldCall(detached); ok {
				t.Fatal("disposed issuer renewed field authority")
			}
		})
	}
}

func TestObjectFormalDefaultRefusals(t *testing.T) {
	const definition = `const read=(input:{value:number},x:number=input.value)=>x;`
	for _, test := range []struct{ name, source string }{
		{"unknown-input", `declare const input:{value:number};` + definition + `read(input);`},
		{"unknown-x", `declare const x:number;` + definition + `read({value:7},x);`},
		{"proxy", definition + `read(new Proxy({value:7},{}));`},
		{"inherited", definition + `read(Object.create({value:7}));`},
		{"getter-throw", definition + `read({get value():number{try{throw 9}finally{}}});`},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/object-default-refuse.ts", Source: `export {};` + test.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if d.Severity == "error" && d.Code != "EXACT2101" {
					t.Fatal("ordinary TS source qualification", d)
				}
			}
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, out := range call.outcomes {
							if out.fulfilled {
								t.Fatal("unsupported input granted field coverage", test.name)
							}
						}
					}
				}
			}
			h := bindingCloseHistory(session, "/virtual/object-default-refuse.ts")
			if h != nil && h.receipt != nil {
				for _, row := range h.receipt.alternatives {
					if row.callHistory != nil && row.callHistory.parameterDefaultGetThrowProducer() {
						t.Fatal("object role borrowed null GetThrow producer")
					}
				}
			}
		})
	}
}

func TestObjectFormalDefaultBrowserGetter(t *testing.T) {
	for _, args := range []string{`input`, `input,5`, `input,undefined`} {
		t.Run(args, func(t *testing.T) {
			source := `export {};const read=(input:{value:number},x:number=input.value)=>x;const input={get value(){return window.innerWidth}};read(` + args + `);`
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "/virtual/object-default-browser.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser := false
			for _, fact := range r.Analysis.Callables {
				for _, effect := range fact.EffectSources {
					browser = browser || effect.Environment == "browser"
				}
			}
			if !browser {
				t.Fatal("independent browser getter effect erased")
			}
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, out := range call.outcomes {
							if out.fulfilled {
								t.Fatal("accessor granted DATA coverage")
							}
						}
					}
				}
			}
			want, gets := 42, 1
			if args == `input,5` {
				want, gets = 5, 0
			}
			conditionalNodeCompletion(t, r.Code, want, gets)
		})
	}
}

func TestObjectFormalDefaultPolicyCacheReset(t *testing.T) {
	const id = "/virtual/object-default-policy.ts"
	session := NewSession()
	request := Request{Kind: "compile", ID: id, Source: `export {};const read=(input:{value:number},x:number=input.value)=>x;read({value:7});`, Diagnostics: "semantic"}
	first := session.Execute(request)
	history := bindingCloseHistory(session, id)
	if first.Error != "" || hasErrorDiagnostic(first.Diagnostics) || history == nil || history.receipt == nil {
		t.Fatal("genuine first policy source", first.Error, first.Diagnostics)
	}
	for _, threshold := range []string{"1", "false", "4096"} {
		request.Analysis.EstimatedCostWarningThreshold = []byte(threshold)
		request.TraceAnalysisCost = true
		response := session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code != first.Code || !reflect.DeepEqual(response.Analysis, first.Analysis) || bindingCloseHistory(session, id) != history || history.roots != 1 || history.publications != 1 {
			t.Fatal("policy replayed/changed actual default result", threshold)
		}
		warnings := 0
		for _, d := range response.Diagnostics {
			if d.Code == "EXACT_ANALYSIS_COST" {
				warnings++
				if d.Severity != "warning" {
					t.Fatal("advisory became semantic")
				}
			}
		}
		if warnings > 1 || threshold == "false" && warnings != 0 || threshold == "1" && warnings != 1 {
			t.Fatal("cached advisory classification", threshold, warnings)
		}
	}
	if r := session.Execute(Request{Kind: "reset"}); r.Error != "" {
		t.Fatal(r.Error)
	}
	reset := session.Execute(request)
	next := bindingCloseHistory(session, id)
	a, _ := json.Marshal(first.Analysis)
	b, _ := json.Marshal(reset.Analysis)
	if reset.Error != "" || hasErrorDiagnostic(reset.Diagnostics) || next == nil || next == history || next.receipt == history.receipt || reset.Code != first.Code || string(a) != string(b) {
		a, _ := json.Marshal(first.Analysis)
		b, _ := json.Marshal(reset.Analysis)
		t.Fatalf("reset details err=%q diagnostics=%v nil=%v samehistory=%v samereceipt=%v samecode=%v analysis BEFORE%s AFTER%s", reset.Error, reset.Diagnostics, next == nil, next == history, next != nil && next.receipt == history.receipt, reset.Code == first.Code, a, b)
	}
	objectDefaultAssert(t, next.receipt.alternatives[0], 7, true)
}
