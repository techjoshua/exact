package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestTypeofLiveControls(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	var saved languageAlternative
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if row.callHistory == nil || !ast.IsTypeOfExpression(row.callHistory.entry.proof.arrow.Body()) {
			return
		}
		seen = true
		saved = row
		call := row.callHistory
		e := call.entry
		o := row.branch.owner
		r := e.proof.entry
		raw := call.raw.alternatives[0]
		if !call.validResult(row) {
			t.Fatal("genuine live source result")
		}
		pc := -1
		for i, event := range r.events {
			if event.kind == "Typeof" {
				pc = i
			}
		}
		if pc < 0 || !typeofReady(r, pc, raw.storage.ready) {
			t.Fatal("genuine ready typeof")
		}
		candidate := h.authority.owner.closedPrefixCandidate
		for _, kind := range []string{"positive", "operand", "node", "kind", "out", "duplicate"} {
			proof := *e.proof
			plan := *proof.plan
			recipe := *r
			recipe.events = append([]storageEvent(nil), r.events...)
			plan.recipe = &recipe
			proof.plan = &plan
			proof.entry = &recipe
			switch kind {
			case "operand":
				recipe.events[pc].a = pc
			case "node":
				recipe.events[pc].node = proof.arrow
			case "kind":
				recipe.events[pc].kind = "ReadCell"
			case "out":
				recipe.events[pc].out = pc - 1
			case "duplicate":
				recipe.events = append(recipe.events, recipe.events[pc])
				recipe.registers++
			}
			c := *candidate
			owner := *candidate.owner
			c.owner = &owner
			population := shortCircuitPopulationProof{candidate: &c, index: candidate.owner.index(h.source), remaining: 4096}
			if population.qualifyBody(&proof) != (kind == "positive") {
				t.Fatal("copied source population accepted", kind)
			}
		}
		for _, kind := range []string{"positive", "unready", "self", "reference", "KEY", "out", "negativePC", "pastPC"} {
			recipe := *r
			recipe.events = append([]storageEvent(nil), r.events...)
			ready := append([]bool(nil), raw.storage.ready...)
			at := pc
			switch kind {
			case "unready":
				ready[recipe.events[pc].a] = false
			case "self":
				recipe.events[pc].a = pc
			case "reference":
				recipe.events[recipe.events[pc].a].kind = "Member"
			case "KEY":
				recipe.events[recipe.events[pc].a].kind = "StaticWellKnownIteratorKey"
			case "out":
				recipe.events[pc].out = -1
			case "negativePC":
				at = -1
			case "pastPC":
				at = len(recipe.events)
			}
			if typeofReady(&recipe, at, ready) != (kind == "positive") {
				t.Fatal("copied ready/role accepted", kind)
			}
		}
		// These are operation kernels on a genuine live branch, not intercepted
		// before-event snapshots or authority to execute another source occurrence.
		prior := languageAlternative{branch: raw.branch}
		operand := raw.storage.values[r.events[pc].a]
		ids, pub := o.next, h.receipt
		for _, allowance := range []int{0, 1, 4096} {
			work := languageCopyWork{remaining: allowance}
			d := expressionSelectionOrdinary
			out := typeofSuccessor(prior, operand, r.events[pc].node, &work, &d)
			if out.completion != languageNormal || out.value.node == nil || out.value.node.Text() != "number" || out.branch != prior.branch || work.used == 0 || d != expressionSelectionOrdinary {
				t.Fatal("known scalar/advisory operation", allowance)
			}
		}
		for _, kind := range []string{"unknown", "errorSentinel", "mixed", "numberMissing", "foreignObject", "generation", "cursorEnv", "pending", "nilwork"} {
			base, value := prior, operand
			work := &languageCopyWork{}
			d := expressionSelectionOrdinary
			switch kind {
			case "unknown":
				value = languageValue{}
			case "errorSentinel":
				value = languageValue{text: "TypeError"}
			case "mixed":
				value.undefined = true
			case "numberMissing":
				value.number = numberPayload{}
			case "foreignObject":
				other := newLanguageOwner()
				b := other.root()
				_, value = other.allocateObject(b)
			case "generation":
				base.branch.generation++
			case "cursorEnv":
				base.branch.env = nil
			case "pending":
				base.pending = languageThrow
				base.pendingValue = operand
			case "nilwork":
				work = nil
			}
			out := typeofSuccessor(base, value, r.events[pc].node, work, &d)
			if out.completion != languageResidual || out.value.node != nil || out.branch != base.branch || o.next != ids || h.receipt != pub {
				t.Fatal("unknown/malformed operation authorized", kind)
			}
		}
		for _, completion := range []languageCompletion{languageThrow, languageResidual, languageReturn} {
			abrupt := raw
			abrupt.completion = completion
			abrupt.remaining = "preserved"
			abrupt.effects = []languageID{e.boundary}
			work := languageCopyWork{}
			d := expressionSelectionOrdinary
			if out := typeofSuccessor(abrupt, operand, r.events[pc].node, &work, &d); !reflect.DeepEqual(out, abrupt) || work.used != 0 {
				t.Fatal("abrupt/residual transport changed")
			}
		}
		if o.next != ids || h.receipt != pub || !call.validResult(row) {
			t.Fatal("kernel control changed original IDs/publication/history")
		}
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-live.ts", Source: `export {};const read=(v:unknown)=>typeof v;read(3);`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
		t.Fatal("live control not reached", response.Error, response.Diagnostics)
	}
	work := languageCopyWork{}
	d := expressionSelectionOrdinary
	if out := typeofSuccessor(languageAlternative{branch: saved.branch}, saved.callHistory.entry.inputs.arguments[0].value, nil, &work, &d); out.completion != languageResidual {
		t.Fatal("disposed live operation renewed")
	}
}

func TestTypeofCachePolicyReset(t *testing.T) {
	const id = "/virtual/typeof-cache.ts"
	session := NewSession()
	request := Request{Kind: "compile", ID: id, Source: `export {};const read=(v:unknown)=>typeof v;read(3);`, Diagnostics: "semantic"}
	first := session.Execute(request)
	history := bindingCloseHistory(session, id)
	if first.Error != "" || hasErrorDiagnostic(first.Diagnostics) || history == nil {
		t.Fatal(first.Error, first.Diagnostics)
	}
	for _, threshold := range []string{"1", "false", "4096"} {
		request.Analysis.EstimatedCostWarningThreshold = []byte(threshold)
		request.TraceAnalysisCost = true
		response := session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code != first.Code || !reflect.DeepEqual(response.Analysis, first.Analysis) || bindingCloseHistory(session, id) != history || history.roots != 1 || history.publications != 1 {
			t.Fatal("advisory/cache changed semantic result", threshold)
		}
		warnings := 0
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Code == "EXACT_ANALYSIS_COST" {
				warnings++
				if diagnostic.Severity != "warning" {
					t.Fatal("advisory became error")
				}
			}
		}
		if warnings > 1 || threshold == "false" && warnings != 0 || threshold == "1" && warnings != 1 {
			t.Fatal("advisory warning count", threshold, warnings)
		}
	}
	if response := session.Execute(Request{Kind: "reset"}); response.Error != "" {
		t.Fatal(response.Error)
	}
	reset := session.Execute(request)
	next := bindingCloseHistory(session, id)
	if reset.Error != "" || hasErrorDiagnostic(reset.Diagnostics) || next == nil || next == history || next.receipt == history.receipt || reset.Code != first.Code || !reflect.DeepEqual(reset.Analysis, first.Analysis) {
		t.Fatal("reset semantic/lifetime binding")
	}
	request.Source = `export {};const read=(v:unknown)=>typeof v;read(null);`
	changed := session.Execute(request)
	current := bindingCloseHistory(session, id)
	if changed.Error != "" || hasErrorDiagnostic(changed.Diagnostics) || current == nil || current == next || current.receipt.alternatives[0].value.node.Text() != "object" {
		t.Fatal("changed acquired value reused stale result")
	}
}

// A canonical actual Get failure is used as the predecessor. This is a kernel
// completion-transport control, not a source outer-Call Throw producer claim.
func TestTypeofActualGetThrowKernel(t *testing.T) {
	o := newLanguageOwner()
	b := o.root()
	f := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	ref := o.member(b, languageValue{node: f.NewToken(ast.KindNullKeyword)}, languageStringKey("value"))
	child := o.getReference(b, ref)
	if child.completion != languageThrow || child.value.text != "TypeError" {
		t.Fatal("canonical actual null Get did not throw")
	}
	ids := o.next
	work := languageCopyWork{}
	d := expressionSelectionOrdinary
	out := typeofSuccessor(child, child.value, nil, &work, &d)
	if !reflect.DeepEqual(out, child) || o.next != ids || work.used != 0 {
		t.Fatal("typeof evaluated/normalized actual abrupt child")
	}
}

func TestTypeofExistingHoistedValueKernel(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := 0
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if row.callHistory == nil || !moduleFunctionDeclaration(row.callHistory.entry.proof.arrow) {
			return
		}
		if !row.callHistory.validResult(row) {
			t.Fatal("existing actual hoisted Call")
		}
		work := languageCopyWork{}
		answer, ok := acquiredTypeof(row.branch, row.callHistory.entry.inputs.callee, &work)
		if !ok || answer != "function" {
			t.Fatal("actual represented hoisted callable kernel", answer, ok)
		}
		seen++
	}
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-hoisted-kernel.ts", Source: hoistedModuleSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || seen == 0 {
		t.Fatal("unchanged hoisted source/kernel unexecuted", r.Error, r.Diagnostics, seen)
	}
}

func TestTypeofExistingArrayValueKernel(t *testing.T) {
	o := newLanguageOwner()
	b := o.root()
	work := languageCopyWork{}
	actual := o.allocateArray(b, nil, &work)
	if actual.completion != languageNormal || actual.value.object == nil || !actual.value.object.array {
		t.Fatal("existing actual array allocation")
	}
	ids := o.next
	answer, ok := acquiredTypeof(actual.branch, actual.value, &work)
	if !ok || answer != "object" || o.next != ids {
		t.Fatal("actual represented array classification")
	}
}

// typeofNestedSource keeps an actual same-shaped conditional sibling before
// the nested operand. Neither source identity nor the final output is replaced
// in the copied population challenges below.
func typeofNestedSource(take string) string {
	return `export {};const read=(take:boolean,v:number)=>((v=take?v:0),typeof(take?v:0));read(` + take + `,3);`
}

func TestTypeofNestedPopulationFollowup(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, take := range []string{"true", "false"} {
			t.Run(string(target)+"/"+take, func(t *testing.T) {
				source := typeofNestedSource(take)
				cwd, err := os.Getwd()
				if err != nil {
					t.Fatal(err)
				}
				id := filepath.Join(cwd, "typeof-nested-followup.ts")
				qualified := NewSession().Execute(Request{Kind: "check", ID: id, Source: source, Diagnostics: "semantic"})
				if qualified.Error != "" || hasErrorDiagnostic(qualified.Diagnostics) {
					t.Fatal("actual TS7 qualifier before native source", qualified.Error, qualified.Diagnostics)
				}
				old := conditionalFieldObserve
				defer func() { conditionalFieldObserve = old }()
				seen := false
				conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
					if row.callHistory == nil {
						return
					}
					call := row.callHistory
					e := call.entry
					r := e.proof.entry
					raw := call.raw.alternatives[0]
					typePC := -1
					sibling := -1
					for pc, event := range r.events {
						if event.kind == "Typeof" {
							typePC = pc
						}
						if sibling < 0 && event.kind == "SelectConditional" {
							sibling = pc
						}
					}
					if typePC < 0 || sibling < 0 {
						return
					}
					seen = true
					if !call.validResult(row) || raw.storage == nil || row.value.node == nil || row.value.node.Text() != "number" || r.events[typePC].a == sibling {
						t.Fatal("genuine nested original Call/result")
					}
					originalOperand := r.events[typePC].a
					if r.events[originalOperand].kind != "SelectConditional" || r.events[sibling].node == r.events[originalOperand].node {
						t.Fatal("same-shaped distinct sibling fixture")
					}
					left, leftKnown := numericNumberPayload(raw.storage.values[sibling])
					right, rightKnown := numericNumberPayload(raw.storage.values[originalOperand])
					if !leftKnown || !rightKnown || left != right {
						t.Fatal("distinct sibling acquired values must have the same numeric result")
					}
					candidate := h.authority.owner.closedPrefixCandidate
					ids, pub, originalRaw := row.branch.owner.next, h.receipt, call.raw
					for _, kind := range []string{"positive", "earlier-sibling", "late-child"} {
						proof := *e.proof
						plan := *proof.plan
						recipe := *r
						recipe.events = append([]storageEvent(nil), r.events...)
						plan.recipe = &recipe
						proof.plan = &plan
						proof.entry = &recipe
						switch kind {
						case "earlier-sibling":
							recipe.events[typePC].a = sibling
						case "late-child":
							child := -1
							for pc := originalOperand - 1; pc >= 0; pc-- {
								if r.events[pc].kind == "ReadCell" && r.events[pc].cell == 0 {
									child = pc
									break
								}
							}
							if child < 0 {
								t.Fatal("original conditional selector read unavailable")
							}
							event := r.events[child]
							event.out = len(recipe.events)
							recipe.events = append(recipe.events, event)
							recipe.registers++
						}
						if recipe.events[typePC].node != r.events[typePC].node || recipe.events[typePC].out != r.events[typePC].out || !typeofReady(&recipe, typePC, raw.storage.ready) {
							t.Fatal("challenge lost fixed source/output or local readiness", kind)
						}
						// Local classification still yields number for the wrong same-shaped
						// sibling. Only source population may authenticate the actual operand.
						work := languageCopyWork{}
						answer, known := acquiredTypeof(row.branch, raw.storage.values[recipe.events[typePC].a], &work)
						if !known || answer != "number" {
							t.Fatal("challenge failed to isolate population", kind)
						}
						c := *candidate
						owner := *candidate.owner
						c.owner = &owner
						population := shortCircuitPopulationProof{candidate: &c, index: candidate.owner.index(h.source), remaining: 4096, recipe: &recipe, runtime: plan.runtime, body: &proof}
						if population.typeofInterval(typePC) != (kind == "positive") {
							t.Fatal("exact interval disposition", kind)
						}
						population = shortCircuitPopulationProof{candidate: &c, index: candidate.owner.index(h.source), remaining: 4096}
						if population.qualifyBody(&proof) != (kind == "positive") {
							t.Fatal("completed body population disposition", kind)
						}
					}
					// Restore the genuine source proof after the independent copy challenges.
					c := *candidate
					owner := *candidate.owner
					c.owner = &owner
					positive := shortCircuitPopulationProof{candidate: &c, index: candidate.owner.index(h.source), remaining: 4096}
					if !positive.qualifyBody(e.proof) || !call.validResult(row) || row.branch.owner.next != ids || h.receipt != pub || call.raw != originalRaw {
						t.Fatal("population copies changed genuine history/publication")
					}
				}

				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
					t.Fatal("nested source qualification/live population", response.Error, response.Diagnostics, seen)
				}
				typeofFollowupResponse(t, response)
				script := `const fs=require('node:fs'),vm=require('node:vm');if(vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{},require})!=='number')throw Error('nested typeof');`
				sourceNodeScript(t, source, script)
				sourceNodeScript(t, response.Code, script)
			})
		}
	}
}

// This characterizes arbitrary in-package metadata copies. It is not a source
// producer, a forged-namespace security claim, or a new invocation permission.
func TestTypeofCapturedCopyCharacterization(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if row.callHistory == nil || len(row.callHistory.entry.inputs.arguments) != 1 {
			return
		}
		call := row.callHistory
		entry := call.entry
		value := entry.inputs.arguments[0].value
		fn := value.callable
		if fn == nil || fn.proof.empty {
			return
		}
		seen = true
		if !call.validResult(row) || len(fn.capturedLexicals) != 1 || fn.captures == nil {
			t.Fatal("genuine captured source input")
		}
		work := languageCopyWork{}
		answer, ok := acquiredTypeof(row.branch, value, &work)
		if !ok || answer != "function" {
			t.Fatal("genuine captured function category")
		}
		raw := call.raw.alternatives[0]
		readPC := -1
		for pc, event := range entry.proof.entry.events {
			if event.kind == "ReadCell" {
				readPC = pc
			}
		}
		copiedInputs := copyLanguageCallInputs(entry.inputs)
		if readPC < 0 || raw.storage.values[readPC].callable != fn || copiedInputs.arguments[0].value.callable != fn {
			t.Fatal("actual argument/formal/copy transfer changed callable identity")
		}
		ids, pub, body := row.branch.owner.next, h.receipt, call.raw
		for _, kind := range []string{"severed-lexicals", "copied-environment", "both"} {
			copied := *fn
			environment := *fn.captures
			if kind != "copied-environment" {
				copied.capturedLexicals = nil
			}
			if kind != "severed-lexicals" {
				environment.outer = entry.activation.env
				copied.captures = &environment
			}
			alternative := value
			alternative.callable = &copied
			work := languageCopyWork{}
			answer, accepted := acquiredTypeof(row.branch, alternative, &work)
			// No assertion that arbitrary constructor copies must be accepted or refused.
			// Current acceptance alone does not show a supported path can produce them.
			t.Log("TYPEOF_CALLABLE_COPY", kind, accepted, answer)
			if accepted && answer != "function" {
				t.Fatal("structural copy produced a different category")
			}
		}
		work = languageCopyWork{}
		answer, ok = acquiredTypeof(row.branch, value, &work)
		if !ok || answer != "function" || len(fn.capturedLexicals) != 1 || fn.captures.outer != nil || row.branch.owner.next != ids || h.receipt != pub || call.raw != body || !call.validResult(row) {
			t.Fatal("characterization mutated/invoked original function")
		}
	}
	const source = `export {};const box={value:3};const f=()=>box.value;const alias=f;const read=(v:unknown)=>typeof v;read(alias);`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-captured-copy.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
		t.Fatal("genuine captured alias source", response.Error, response.Diagnostics, seen)
	}
	typeofFollowupResponse(t, response)
	sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');if(vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})!=='function')throw Error('captured typeof');`)
}

// Public source compilation is not a raw-completion receipt. The wrapper is
// neutral here so a legacy source path is not mislabeled as a native Throw.
func TestTypeofAbruptSourceQualification(t *testing.T) {
	for _, tc := range []struct {
		name, source string
		control      bool
	}{
		{"existing-control", `export {};const read=(x:number=(null as any).value)=>x;read();`, true},
		{"typeof-wrapper", `export {};const read=(x:string=typeof (null as any).value)=>x;read();`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			id := "/virtual/typeof-abrupt-" + tc.name + ".ts"
			qualified := NewSession().Execute(Request{Kind: "check", ID: id, Source: tc.source, Diagnostics: "semantic"})
			if qualified.Error != "" || hasErrorDiagnostic(qualified.Diagnostics) {
				t.Fatal("actual TS7 abrupt source qualifier", qualified.Error, qualified.Diagnostics)
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: tc.source, Target: TargetClient, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if d.Severity == "error" && d.Code != "EXACT2101" {
					t.Fatal("unexpected source error", d)
				}
			}
			h := bindingCloseHistory(session, id)
			owned := h != nil && h.receipt != nil && len(h.receipt.alternatives) == 1 && h.receipt.alternatives[0].callHistory != nil
			if tc.control && !owned {
				t.Fatal("existing GetThrow control lost actual Call")
			}
			if owned {
				row := h.receipt.alternatives[0]
				raw := row.callHistory.raw.alternatives[0]
				if row.completion != languageThrow || raw.completion != languageThrow || row.value.text != "TypeError" || raw.value != row.value || raw.storage == nil {
					t.Fatal("actual source abrupt output changed", row.remaining)
				}
				for _, event := range raw.storage.recipe.events {
					if event.kind == "Typeof" && raw.storage.ready[event.out] {
						t.Fatal("abrupt child fabricated typeof result")
					}
				}
			} else {
				t.Log("OPEN_TYPEOF_SOURCE_ABRUPT no owned native Call/Get completion", tc.name, "publicCode", response.Code != "", "diagnostics", response.Diagnostics)
			}
			typeofFollowupResponse(t, response)
			script := `const fs=require('node:fs'),vm=require('node:vm');let caught=false;try{vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{}})}catch(e){if(!e||e.name!=='TypeError')throw e;caught=true}if(!caught)throw Error('expected actual TypeError');`
			sourceNodeScript(t, tc.source, script)
			if response.Code != "" && !hasErrorDiagnostic(response.Diagnostics) {
				sourceNodeScript(t, response.Code, script)
			}
		})
	}
}

// This borrows a genuine completed creator result while live. The inner body
// has no entry recipe. No artificial callable, invocation or capture read occurs.
func TestTypeofDeferredCaptureSourceValue(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, row languageAlternative) {
		if len(h.callReceipts) != 1 || row.value.callable == nil {
			return
		}
		created := h.callReceipts[0].alternatives[0]
		if created.callHistory == nil || !moduleActivationCaptureCreator(created.callHistory.entry.proof.arrow) {
			return
		}
		seen = true
		work := languageCopyWork{}
		if !activationCapturedReturn(created, &work) || created.value != row.value || row.value.callable.proof.entry != nil {
			t.Fatal("genuine deferred creator result unavailable")
		}
		ids, pub, raw := row.branch.owner.next, h.receipt, created.callHistory.raw
		answer, known := acquiredTypeof(row.branch, row.value, &work)
		if !known || answer != "function" {
			t.Fatal("genuine created function category must not require body entry", known, answer)
		}
		fn := row.value.callable
		if fn.proof.finalizedBodyProof(row.branch.owner) || fn.proof.entry != nil || !validCallTarget(row.branch.owner, created.callHistory.entry.inputs) || created.callHistory.entry.inputs.callee.callable == fn {
			t.Fatal("category confused construction with actual original Call target/body entry")
		}
		copiedInputs := copyLanguageCallInputs(created.callHistory.entry.inputs)
		copiedInputs.callee = row.value
		if validCallTarget(row.branch.owner, copiedInputs) {
			t.Fatal("typeof granted mismatched original creator target")
		}
		var foreign *ast.SourceFile
		for _, source := range h.authority.program.GetSourceFiles() {
			if source != fn.proof.source {
				foreign = source
				break
			}
		}
		if foreign == nil {
			t.Fatal("genuine foreign source for copy control unavailable")
		}
		for _, kind := range []string{"namespace", "generation", "source", "inner", "parent", "layout"} {
			proof := *fn.proof
			copyFn := *fn
			copyFn.proof = &proof
			value := row.value
			value.callable = &copyFn
			switch kind {
			case "namespace":
				proof.namespace = newLanguageOwner()
			case "generation":
				proof.generation++
			case "source":
				proof.source = foreign
			case "inner":
				proof.arrow = created.callHistory.entry.proof.arrow
				value.node = proof.arrow
			case "parent":
				// Copying the parameter also severs exact declaration identity. This is
				// a compound constructor refusal, not an independent parent-only guard.
				parameter := ast.NewNodeFactory(ast.NodeFactoryHooks{}).DeepCloneNode(proof.captureDeclarations[0])
				parameter.Parent = proof.arrow
				proof.captureDeclarations = []*ast.Node{parameter}
			case "layout":
				proof.captureReferences = map[*ast.Node]int{proof.arrow.Body().Expression(): 1}
			}
			work := languageCopyWork{}
			if _, accepted := acquiredTypeof(row.branch, value, &work); accepted {
				t.Fatal("wrong construction category tuple accepted", kind)
			}
		}
		work = languageCopyWork{}
		answer, known = acquiredTypeof(row.branch, row.value, &work)
		if !known || answer != "function" || !activationCapturedReturn(created, &work) {
			t.Fatal("genuine construction category not restored")
		}
		if row.branch.owner.next != ids || h.receipt != pub || created.callHistory.raw != raw {
			t.Fatal("typeof invoked or mutated genuine deferred closure")
		}
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/typeof-deferred-capture.ts", Source: activationCaptureSource, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || !seen {
		t.Fatal("existing creator source qualification", response.Error, response.Diagnostics, seen)
	}
}

func typeofFollowupResponse(t *testing.T, response Response) {
	t.Helper()
	data, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(data, &fields); err != nil {
		t.Fatal(err)
	}
	delete(fields, "timings")
	data, err = json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	t.Log("TYPEOFFOLLOWUPRESPONSE", string(data))
}
