package exactcompiler

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const activationCaptureSource = `export{};function make(input:{value:string}){return()=>input.value}const input={value:'safe'};const selected=make(input);`

func TestActualNestedActivationCaptureReturn(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if h.receipt == nil {
			return
		}
		seen = true
		if row.completion != languageNormal || len(h.callReceipts) != 1 {
			t.Fatalf("original creator/selected completion: %s", h.reason)
		}
		call := h.callReceipts[0].alternatives[0]
		if call.callHistory == nil || !call.callHistory.validResult(call) || call.value.callable == nil || !activationCapturedReturn(call, &languageCopyWork{}) {
			t.Fatal("no actual returned languageCallable")
		}
		e := call.callHistory.entry
		raw := call.callHistory.raw.alternatives[0]
		f := call.value.callable
		if len(raw.storage.cells) != 1 || len(e.inputs.arguments) != 1 || e.inputs.arguments[0].value.object == nil {
			t.Fatal("actual formal/object acquisition absent")
		}
		formal := raw.storage.cells[0]
		if f.captures != e.activation.env || len(f.capturedLexicals) != 1 || f.capturedLexicals[0].cell != formal || formal.environment != e.activation.env.id || f.capturedLexicals[0].declaration != e.proof.arrow.Parameters()[0] {
			t.Fatal("nested capture did not retain original defining activation/formal Cell")
		}
		initialized, markers, creates := 0, 0, 0
		for _, event := range e.proof.entry.events {
			if event.kind == "CreateClosedCallable" {
				creates++
			}
			if event.kind == "GetValue" || event.kind == "Member" || event.kind == "ReadCapturedCell" {
				t.Fatal("deferred nested member read executed at creation")
			}
		}
		for r := raw.branch.state.storage; r != nil; r = r.previous {
			if r.cell == formal && r.initialized {
				initialized++
				if r.value.object != e.inputs.arguments[0].value.object {
					t.Fatal("formal captured snapshot/substitute")
				}
			}
			if r.cell == formal && r.value.callable == f && !r.initialized {
				markers++
			}
		}
		if initialized != 1 || markers != 1 || creates != 1 {
			t.Fatal("formal/creation occurrence", initialized, markers, creates)
		}
		if row.value.callable != f || row.branch.env != e.caller || row.branch.state.previous != call.branch.state || row.branch.state.storage.value.callable != f {
			t.Fatal("original callable not bound on original caller B_out")
		}
	}
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "/virtual/activation-capture.ts", Source: activationCaptureSource, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid source", r.Diagnostics)
		}
	}
	if !seen {
		t.Fatal("same valid make(input)/selected source has no native creator/Return/binding receipt")
	}
	h := bindingCloseHistory(session, "/virtual/activation-capture.ts")
	if h == nil || len(h.callReceipts) != 1 {
		t.Fatal("missing historical original Call")
	}
	if activationCapturedReturn(h.callReceipts[0].alternatives[0], &languageCopyWork{}) {
		t.Fatal("disposed creation proof revived")
	}
}

// The original source enters once before these labeled constructor faults.
// Pure validation cannot create another function, Call, binding or source proof.
func TestActivationCaptureLiveProvenanceGuards(t *testing.T) {
	request := Request{Kind: "compile", ID: "/virtual/activation-live.ts", Source: activationCaptureSource, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	source := generation.sourceFile
	candidate := reserveClosedPrefixCandidate(source, project.program, generation.checker, generation, request)
	if candidate == nil {
		t.Fatal("source discovery")
	}
	defer candidate.release()
	collectProjectCallableEffects(project, source, generation.checker, nil, nil, nil, nil, analyzeAssets(source, generation.checker, request), nil)
	h := candidate.history
	if len(h.callReceipts) != 1 || h.receipt == nil {
		t.Fatal("actual creator completion", h.reason)
	}
	call := h.callReceipts[0].alternatives[0]
	if !activationCapturedReturn(call, &languageCopyWork{}) {
		t.Fatal("live creator positive")
	}
	e := call.callHistory.entry
	f := call.value.callable
	o := call.branch.owner
	if o.callableCaptureState(call.branch, f) || f.proof.entry != nil || f.proof.plan != nil {
		t.Fatal("creation granted inner entry authority")
	}
	if local := o.readLocal(call.branch, f.capturedLexicals[0].cell); local.completion != languageResidual {
		t.Fatal("global local-environment law relaxed")
	}
	raw := call.callHistory.raw.alternatives[0]
	next := o.next
	duplicate := o.createActivationCapturedCallable(raw.branch, f.proof, raw.storage.cells, e)
	if duplicate.completion != languageResidual || duplicate.value.callable != nil || duplicate.branch != raw.branch || o.next != next {
		t.Fatal("completed branch issued duplicate creation")
	}
	wrongEntry := *e
	wrongEntry.caller = e.activation.env
	if wrongEntry.valid(o, wrongEntry.activation) {
		t.Fatal("wrong actual caller entry accepted")
	}
	issued := o.next
	wrong := o.createActivationCapturedCallable(raw.branch, f.proof, raw.storage.cells, &wrongEntry)
	if wrong.completion != languageResidual || wrong.value.callable != nil || o.next != issued {
		t.Fatal("wrong creating entry issued identity")
	}
	originalCell := f.capturedLexicals[0].cell
	var moduleInput languageLexical
	for _, x := range call.callInputs.lexicals {
		if x.declaration.Name() != nil && x.declaration.Name().Text() == "input" {
			moduleInput = x
		}
	}
	if moduleInput.declaration == f.capturedLexicals[0].declaration || moduleInput.cell == originalCell {
		t.Fatal("same-spelling module input confused with actual formal")
	}
	foreignRequest := Request{Kind: "analyze", ID: "/virtual/activation-foreign.ts", Source: "export{};const foreign=0;"}
	foreign, diags, err := newProjectState(foreignRequest, foreignRequest.ID)
	if err != nil || len(diags) != 0 {
		t.Fatal(err, diags)
	}
	foreignGeneration, err := foreign.advance(context.Background(), foreignRequest.ID, foreignRequest.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer foreignGeneration.release()
	for _, kind := range []string{"environment", "cell", "declaration", "marker", "marker-key", "marker-descriptor", "source", "generation", "copied-proof", "copied-callable", "branch", "raw-return", "unissued"} {
		t.Run(kind, func(t *testing.T) {
			bad := call
			restore := func() {}
			switch kind {
			case "environment":
				old := f.captures
				f.captures = e.caller
				restore = func() { f.captures = old }
			case "cell":
				f.capturedLexicals[0].cell = moduleInput.cell
				restore = func() { f.capturedLexicals[0].cell = originalCell }
			case "declaration":
				old := f.capturedLexicals[0].declaration
				f.capturedLexicals[0].declaration = moduleInput.declaration
				restore = func() { f.capturedLexicals[0].declaration = old }
			case "marker":
				marker := call.callHistory.raw.alternatives[0].branch.state.storage
				old := marker.value
				marker.value = languageValue{}
				restore = func() { marker.value = old }
			case "marker-key":
				marker := call.callHistory.raw.alternatives[0].branch.state.storage
				old := marker.key
				marker.key = languageStringKey("unexpected")
				restore = func() { marker.key = old }
			case "marker-descriptor":
				marker := call.callHistory.raw.alternatives[0].branch.state.storage
				old := marker.descriptor
				marker.descriptor = languageDescriptor{writable: true}
				restore = func() { marker.descriptor = old }
			case "source":
				old := f.proof.source
				f.proof.source = foreignGeneration.sourceFile
				restore = func() { f.proof.source = old }
			case "generation":
				old := f.proof.generation
				f.proof.generation++
				restore = func() { f.proof.generation = old }
			case "copied-proof":
				old := f.proof
				copy := *old
				f.proof = &copy
				restore = func() { f.proof = old }
			case "copied-callable":
				copy := *f
				bad.value.callable = &copy
			case "branch":
				bad.branch = e.activation
			case "raw-return":
				bad = call.callHistory.raw.alternatives[0]
				bad.callHistory = call.callHistory
			case "unissued":
				bad.callHistory = nil
			}
			defer restore()
			if activationCapturedReturn(bad, &languageCopyWork{}) {
				t.Fatal("constructor mutation accepted", kind)
			}
		})
	}
	if !activationCapturedReturn(call, &languageCopyWork{}) || h.roots != 1 || h.publications != 1 || len(h.callReceipts) != 1 {
		t.Fatal("inspection changed original execution")
	}
	// Distinct creators in the same continuation are intentionally unadmitted.
}

func TestActivationCaptureSourceBoundaryRefusals(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"different-free-binding", `export{};const other={value:'other'};function make(input:{value:string}){return()=>other.value}const input={value:'safe'};const selected=make(input);`},
		{"shadowed-inner-parameter", `export{};function make(input:{value:string}){return(input:{value:string})=>input.value}const input={value:'safe'};const selected=make(input);`},
		{"proxy-input", `export{};function make(input:{value:string}){return()=>input.value}const input=new Proxy({value:'safe'},{});const selected=make(input);`},
		{"missing-actual-object", `export{};function make(input:{value:string}){return()=>input.value}declare const input:{value:string};const selected=make(input);`},
		{"same-continuation-two-creators", activationCaptureSource + `const second=make(input);`},
	} {
		t.Run(c.name, func(t *testing.T) {
			const id = "/virtual/activation-boundary.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: c.source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatal("invalid source", response.Diagnostics)
				}
			}
			h := bindingCloseHistory(session, id)
			if h != nil && h.receipt != nil && len(h.receipt.alternatives) == 1 && h.receipt.alternatives[0].completion == languageNormal {
				t.Fatal("out-of-scope source gained successful selected callable")
			}
			t.Log("source admission/refusal only, not proof of a deeper live guard")
		})
	}
}

func TestActivationCapturePreCallMissingAndTDZInputs(t *testing.T) {
	for _, kind := range []string{"missing-argument", "missing-initialized-module-cell"} {
		t.Run(kind, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			var candidate *closedPrefixCandidate
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if h.receipt != nil || !moduleActivationCaptureCreator(row.callInputs.callee.callable.proof.arrow) {
					return
				}
				seen = true
				candidate = h.authority.owner.closedPrefixCandidate
				view := row.storage
				work := languageCopyWork{}
				if !candidate.initializerCallReady(h.recipe, row, view.cells, view.values, view.ready, &work) {
					t.Fatal("genuine pre-Call positive")
				}
				if kind == "missing-argument" {
					row.callInputs.arguments = nil
				} else {
					var input languageCell
					for _, x := range row.callInputs.lexicals {
						if x.declaration.Name() != nil && x.declaration.Name().Text() == "input" {
							input = x.cell
						}
					}
					for r := row.branch.state.storage; r != nil; r = r.previous {
						if r.cell == input && r.initialized {
							r.initialized = false
							break
						}
					}
				}
				if candidate.initializerCallReady(h.recipe, row, view.cells, view.values, view.ready, &work) || candidate.bodyClaimed {
					t.Fatal("missing acquired/current initialized input admitted")
				}
			}
			const id = "/virtual/activation-missing.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: activationCaptureSource, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
				t.Fatal(response.Error, response.Diagnostics, seen)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || h.receipt.alternatives[0].completion != languageResidual || len(h.callReceipts) != 0 || candidate.bodyClaimed {
				t.Fatal("input refusal issued creator or selected result")
			}
			t.Log("constructor pre-Call missing/TDZ-shape refusal, no authored TDZ behavior claim")
		})
	}
}

func TestActivationCaptureMatchedRuntimeAndResponseParity(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			request := Request{Kind: "compile", ID: "/virtual/activation-emitted.ts", Source: activationCaptureSource, Target: target, Diagnostics: "semantic"}
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			conditionalFieldObserve = nil
			normal := NewSession().Execute(request)
			seen := false
			conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
				if h.receipt != nil {
					seen = true
					if !h.initializerBindingResult(row) {
						t.Fatal("actual live callable binding")
					}
				}
			}
			observed := NewSession().Execute(request)
			if normal.Error != "" || hasErrorDiagnostic(normal.Diagnostics) || !seen {
				t.Fatal(normal.Error, normal.Diagnostics, seen)
			}
			clean := func(r Response) map[string]any {
				b, e := json.Marshal(r)
				if e != nil {
					t.Fatal(e)
				}
				m := map[string]any{}
				if e = json.Unmarshal(b, &m); e != nil {
					t.Fatal(e)
				}
				delete(m, "timings")
				return m
			}
			if !reflect.DeepEqual(clean(normal), clean(observed)) {
				t.Fatal("normal/observed full Response differs excluding only top-level timings")
			}
			conditionalNodeCompletion(t, normal.Code+`;if(typeof selected!=='function'||selected===make)throw Error('actual function creation identity');1;`, 1, 0)
		})
	}
}

// Each case first qualifies the genuine source and completed index. The second
// reservation corrupts only the named constructor relation, before execution.
func TestActivationCaptureIndexedConstructionGuards(t *testing.T) {
	for _, kind := range []string{"missing-index", "parent", "region", "layout", "prelude-binding", "duplicate-prelude"} {
		t.Run(kind, func(t *testing.T) {
			request := Request{Kind: "compile", ID: "/virtual/activation-indexed-guards.ts", Source: activationCaptureSource, Diagnostics: "semantic"}
			project, ds, err := newProjectState(request, request.ID)
			if err != nil || len(ds) != 0 {
				t.Fatal(err, ds)
			}
			generation, err := project.advance(context.Background(), request.ID, request.Source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			source := generation.sourceFile
			if len(generation.checker.GetDiagnostics(context.Background(), source)) != 0 {
				t.Fatal("invalid fixture")
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			positive := reserveClosedPrefixCandidate(source, project.program, generation.checker, generation, request)
			if positive == nil {
				t.Fatal("genuine reservation")
			}
			positive.attach(owner.values, owner)
			owner.values.index(source)
			positive.qualifyIndex()
			if positive.history.state != prefixQualified || positive.history.roots != 0 {
				t.Fatal("genuine indexed positive")
			}
			positive.release()
			candidate := reserveClosedPrefixCandidate(source, project.program, generation.checker, generation, request)
			if candidate == nil {
				t.Fatal("new genuine reservation")
			}
			defer candidate.release()
			candidate.attach(owner.values, owner)
			r := candidate.history.recipe
			proof := r.events[0].callable
			inner := activationCaptureInner(proof.arrow)
			index := owner.values.indexes[source]
			restore := func() {}
			switch kind {
			case "missing-index":
				old := index.normalOccurrences[inner.Body()]
				delete(index.normalOccurrences, inner.Body())
				restore = func() { index.normalOccurrences[inner.Body()] = old }
			case "parent":
				old := index.normalOccurrences[inner.Body()]
				changed := *old
				changed.parent = index.normalOccurrences[source.AsNode()]
				index.normalOccurrences[inner.Body()] = &changed
				restore = func() { index.normalOccurrences[inner.Body()] = old }
			case "region":
				old := index.normalOccurrences[inner.Body()]
				changed := *old
				changed.region = proof.arrow
				index.normalOccurrences[inner.Body()] = &changed
				restore = func() { index.normalOccurrences[inner.Body()] = old }
			case "layout":
				proof.entry.events[2].callable.captureDeclarations[0] = r.declarations[1]
			case "prelude-binding":
				r.events[0].cell = 1
			case "duplicate-prelude":
				r.events = append(r.events, r.events[0])
			}
			defer restore()
			candidate.qualifyIndex()
			h := candidate.history
			if h.state != prefixRefused || h.roots != 0 || h.publications != 0 || h.receipt != nil || len(h.callReceipts) != 0 {
				t.Fatal("corrupt indexed constructor issued execution", kind, h.state)
			}
			t.Log("constructor-only indexed/prelude refusal before root/Call/creation/publication", kind)
		})
	}
}
