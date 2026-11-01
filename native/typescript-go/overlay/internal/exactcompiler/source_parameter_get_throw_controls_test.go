package exactcompiler

import "testing"

func TestParameterDefaultGetThrowLive(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		call := row.callHistory
		if call.entry.proof.mapping.nullDefaultMember() == nil || row.completion != languageThrow {
			return
		}
		seen = true
		if !call.validCompletion(row) || !call.parameterDefaultGetThrowProducer() || !h.parameterDefaultGetTerminal(row) {
			t.Fatal("actual live Get/outerCall/terminal positive")
		}
		owner := row.branch.owner
		next, publications := owner.next, h.publications
		_, get, ok := parameterDefaultGetLayout(call.entry)
		if !ok {
			t.Fatal("actual layout")
		}
		for _, kind := range []string{"call", "ref", "default-branch", "choice", "pc", "error", "get-value", "namespace", "read-state", "entry-state", "receipt", "missing", "duplicate", "node", "recipe", "init-ready", "merge-ready", "generation"} {
			bad, history, rawReceipt := row, *call, *call.raw
			rawReceipt.alternatives = append([]languageAlternative(nil), rawReceipt.alternatives...)
			raw := rawReceipt.alternatives[0]
			snapshot := *raw.storage
			snapshot.cells = append([]languageCell(nil), snapshot.cells...)
			snapshot.values = append([]languageValue(nil), snapshot.values...)
			snapshot.references = append([]languageReference(nil), snapshot.references...)
			snapshot.ready = append([]bool(nil), snapshot.ready...)
			snapshot.choices = copyStorageChoices(snapshot.choices)
			raw.storage = &snapshot
			raw.objects = copyStorageObjectHistory(raw.objects)
			index := -1
			for i, obs := range raw.objects {
				if obs.recipe == call.entry.proof.entry && obs.pc == get {
					index = i
				}
			}
			if index < 0 {
				t.Fatal("actual Get observation missing")
			}
			getReceipt := *raw.objects[index].receipt
			getReceipt.alternatives = append([]languageAlternative(nil), getReceipt.alternatives...)
			raw.objects[index].receipt = &getReceipt
			choice, _, _ := defaultChoiceLayout(call.entry.proof.entry, 1)
			switch kind {
			case "call":
				e, in := *call.entry, *call.entry.inputs
				in.call = e.proof.arrow
				e.inputs = &in
				history.entry = &e
			case "ref":
				snapshot.references[get-1].id.serial++
			case "default-branch":
				snapshot.values[0] = languageValue{}
			case "choice":
				snapshot.choices[0].destination++
			case "pc":
				snapshot.pc++
			case "error":
				raw.value = languageValue{text: "other error"}
				history.value = raw.value
				bad.value = raw.value
			case "get-value":
				getReceipt.alternatives[0].value = languageValue{text: "other error"}
			case "namespace":
				snapshot.cells[0].environment = languageID{}
			case "read-state":
				getReceipt.input.state = nil
			case "entry-state":
				if call.entry.activation.state.previous == nil {
					t.Fatal("actual prior prefix state unavailable")
				}
				raw.branch.state = call.entry.activation.state.previous
				snapshot.childBranch = raw.branch
				getReceipt.input = raw.branch
				getReceipt.alternatives[0].branch = raw.branch
				bad.branch.state = raw.branch.state
				history.outward = bad.branch
			case "receipt":
				getReceipt.occurrence.serial = 0
			case "missing":
				raw.objects = nil
			case "duplicate":
				raw.objects = append(raw.objects, raw.objects[index])
			case "node":
				raw.objects[index].node = call.entry.proof.arrow
			case "recipe":
				raw.objects[index].recipe = h.recipe
			case "init-ready":
				snapshot.ready[choice.end] = true
			case "merge-ready":
				snapshot.ready[choice.merge] = true
			case "generation":
				bad.branch.generation++
			}
			rawReceipt.alternatives[0] = raw
			history.raw = &rawReceipt
			bad.callHistory = &history
			if history.validCompletion(bad) {
				t.Fatal("wrong live completed Get/Call tuple", kind)
			}
		}
		copyPublisher := *h
		if copyPublisher.parameterDefaultGetTerminal(row) {
			t.Fatal("copied publisher")
		}
		copyPublisher.mode[0] ^= 1
		if copyPublisher.parameterDefaultGetTerminal(row) {
			t.Fatal("wrong mode publisher")
		}
		raw := call.raw.alternatives[0]
		// The existing observation is after production. These constructor kernels
		// exercise the shared preissuer predicate without replaying Get or forging
		// an unissued raw producer. They do not claim an actual preissuer source cut.
		if _, _, ok := parameterDefaultGetSnapshot(call.entry, raw); !ok {
			t.Fatal("genuine issuer-snapshot positive")
		}
		for _, kind := range []string{"receiver", "readiness", "choice"} {
			copied := raw
			snapshot := *raw.storage
			snapshot.references = append([]languageReference(nil), snapshot.references...)
			snapshot.ready = append([]bool(nil), snapshot.ready...)
			snapshot.choices = copyStorageChoices(snapshot.choices)
			copied.storage = &snapshot
			switch kind {
			case "receiver":
				snapshot.references[get-1].receiver = languageValue{}
			case "readiness":
				snapshot.ready[get-1] = false
			case "choice":
				snapshot.choices[0].destination++
			}
			if _, _, ok := parameterDefaultGetSnapshot(call.entry, copied); ok {
				t.Fatal("shared preissuer snapshot kernel accepted mismatch", kind)
			}
		}
		if _, ok := owner.completedGetCapacity(len(raw.objects)); !ok {
			t.Fatal("genuine capacity positive")
		}
		limited := *owner
		limited.next = ^uint64(0) - 1
		if limited.canIssue(3) {
			t.Fatal("capacity kernel overflow admitted")
		}
		if _, ok := limited.completedGetCapacity(len(raw.objects)); ok {
			t.Fatal("completed Get capacity kernel overflow admitted")
		}
		selected := languageAlternative{branch: raw.branch, completion: raw.completion, value: raw.value}
		if _, again := owner.finishParameterDefaultGet(call.entry, raw, selected, call.entry.proof.entry, get); again {
			t.Fatal("actual Get sealed twice")
		}
		selected.completion = languageNormal
		if _, again := owner.finishParameterDefaultGet(call.entry, raw, selected, call.entry.proof.entry, get); again {
			t.Fatal("Normal operation relabeled Throw")
		}
		h.publish(&callableFacts{})
		if owner.next != next || h.publications != publications || !call.validCompletion(row) || !h.parameterDefaultGetTerminal(row) {
			t.Fatal("negatives changed genuine identity/publication")
		}
	}
	session := NewSession()
	const id = "/virtual/parameter-default-get-live.ts"
	r := session.Execute(Request{Kind: "compile", ID: id, Source: `export {};const read=(x:number=(null as any).value)=>x;read();`, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal("live producer absent", r.Error, r.Diagnostics)
	}
	h := bindingCloseHistory(session, id)
	row := h.receipt.alternatives[0]
	if !row.callHistory.parameterDefaultGetThrowProducer() {
		t.Fatal("detached actual tuple not retained")
	}
	if row.callHistory.validCompletion(row) || h.parameterDefaultGetTerminal(row) {
		t.Fatal("disposed source admission renewed")
	}
}

func TestParameterDefaultGetConservativeSources(t *testing.T) {
	for _, test := range []struct {
		name, prelude, definition string
		browser                   bool
	}{
		{"unknown-receiver", `declare const input:any;`, `(x:number=input.value)=>x`, false},
		{"non-null-receiver", "", `(x:number=({value:9} as any).value)=>x`, false},
		{"optional-null", "", `(x:number=(null as any)?.value)=>x`, false},
		{"default-call", `declare function input():number;`, `(x:number=input())=>x`, false},
		{"browser-default", "", `(x:number=window.innerWidth)=>x`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			s := NewSession()
			const id = "/virtual/parameter-default-get-refusal.ts"
			r := s.Execute(Request{Kind: "compile", ID: id, Source: `export {};` + test.prelude + `const read=` + test.definition + `;read();`, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if d.Severity == "error" && len(d.Code) > 1 && d.Code[:2] == "TS" {
					t.Fatal("ordinary fixture invalid", d)
				}
			}
			if h := bindingCloseHistory(s, id); h != nil && h.receipt != nil {
				for _, row := range h.receipt.alternatives {
					if row.callHistory != nil && row.callHistory.parameterDefaultGetThrowProducer() {
						t.Fatal("unselected receiver/default domain issued producer")
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
					t.Fatal("known browser effect lost")
				}
			}
		})
	}
}

func TestParameterDefaultGetRetainsPrefix(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		call := row.callHistory
		if call.entry.proof.mapping.nullDefaultMember() == nil || row.completion != languageThrow {
			return
		}
		seen = true
		raw := call.raw.alternatives[0]
		if !call.validCompletion(row) || raw.branch.state != call.entry.activation.state {
			t.Fatal("actual prefix/current state not retained")
		}
		var cell languageCell
		for _, lexical := range call.entry.inputs.lexicals {
			if lexical.declaration.Name().Text() == "box" {
				cell = lexical.cell
			}
		}
		var object *languageObject
		for state := raw.branch.state; state != nil; state = state.previous {
			if state.storage != nil && state.storage.cell == cell && state.storage.initialized {
				object = state.storage.value.object
				break
			}
		}
		d, present, complete, _ := raw.branch.owner.readOwnRecord(raw.branch, object, languageStringKey("value"))
		n, known := numericNumberPayload(d.value)
		if object == nil || !present || !complete || !known || int(n) != 1 {
			t.Fatal("actual ordered prefix Put lost")
		}
		before := call.entry.acquisition.alternatives[0].objects
		if len(raw.objects) != len(before)+1 || !sameStorageObjectHistory(raw.objects[:len(before)], before) || h.publications != 1 {
			t.Fatal("prefix observations adopted more than once")
		}
	}
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/default-get-prefix.ts", Source: `export {};const box={value:0};box.value=1;const read=(x:number=(null as any).value)=>x;read();`, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal("actual prefix case", r.Error, r.Diagnostics)
	}
}
