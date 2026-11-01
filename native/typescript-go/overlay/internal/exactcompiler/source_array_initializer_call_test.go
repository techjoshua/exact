package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"strings"
	"testing"
)

const arrayInitializerCallSource = `export{};function make(input:{value:string}){return()=>input.value}const input={value:'safe'};const xs=[make(input)];`

func TestOriginalArrayInitializerCall(t *testing.T) {
	const id = "/virtual/array-initializer-call.ts"
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := 0
	conditionalFieldObserve = func(h *closedPrefixHistory, final languageAlternative) {
		if h.receipt == nil || h.recipe.call == nil || !ast.IsArrayLiteralExpression(h.recipe.call.Parent) {
			return
		}
		seen++
		if !h.initializerBindingResult(final) {
			t.Fatal("live original array destination publication refused")
		}
		if len(h.callReceipts) != 1 || h.callReceipts[0] == h.receipt {
			t.Fatal("original Call receipt conflated with container result")
		}
		call := h.callReceipts[0].alternatives[0]
		if call.callHistory == nil || !call.callHistory.validResult(call) || call.value.callable == nil || final.value.object == nil || !final.value.object.array || final.branch == call.branch {
			t.Fatal("live genuine creator Return/container separation")
		}
		arrayID, referenceID := final.value.object.id, call.callInputs.reference.id
		if arrayID.owner != referenceID.owner || referenceID.serial == 0 || arrayID.serial >= referenceID.serial {
			t.Fatal("actual array allocation must precede original callee Reference")
		}
		f := call.value.callable
		e := call.callHistory.entry
		if !activationCapturedReturn(call, &languageCopyWork{}) || f.captures != e.activation.env || len(f.capturedLexicals) != 1 || f.capturedLexicals[0].declaration != e.proof.arrow.Parameters()[0] || f.proof.entry != nil || f.proof.plan != nil {
			t.Fatal("original captured formal/defining activation or deferred inner body")
		}
		d, present, complete, _ := final.branch.owner.readOwnRecord(final.branch, final.value.object, languageStringKey("0"))
		if !present || !complete || d.accessor || !d.writable || !d.enumerable || !d.configurable || d.value != call.value {
			t.Fatal("actual array slot must store original callable", present, complete, d)
		}
		before, bp, bc, _ := call.branch.owner.readOwnRecord(call.branch, final.value.object, languageStringKey("0"))
		_ = before
		if bp || !bc {
			t.Fatal("slot was present before original creator Return")
		}
	}
	s := NewSession()
	r := s.Execute(Request{Kind: "compile", ID: id, Source: arrayInitializerCallSource, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid original source", r.Diagnostics)
		}
	}
	h := bindingCloseHistory(s, id)
	if h == nil || h.receipt == nil || len(h.callReceipts) != 1 {
		t.Fatal("same array initializer source lacks original native creator/container receipts", r.Diagnostics)
	}
	if h.reason != "" || h.roots != 1 || h.publications != 1 || seen != 1 {
		t.Fatal("original once source ownership", h.reason, h.roots, h.publications, seen)
	}
	if h.initializerBindingResult(h.receipt.alternatives[0]) {
		t.Fatal("disposed publisher renewed array destination")
	}
}

// These kernel corruptions borrow a genuine live publisher and restore it.
// They are not authored descriptor transitions or independently intercepted TDZ.
func TestArrayInitializerLiveResultControls(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
		if h.receipt == nil || h.recipe.call == nil || !ast.IsArrayLiteralExpression(h.recipe.call.Parent) {
			return
		}
		if !h.initializerBindingResult(a) {
			t.Fatal("genuine live result")
		}
		seen = true
		o := a.branch.owner
		next := o.next
		callReceipt := h.callReceipts[0]
		call := callReceipt.alternatives[0]
		f := call.value.callable
		for _, name := range []string{"wrong-branch", "copied-array", "copied-callable", "wrong-capture-cell", "wrong-init-value", "wrong-slot-value", "wrong-slot-key", "wrong-length-value", "length-writable", "length-enumerable", "length-configurable", "slot-writable", "slot-enumerable", "slot-configurable", "wrong-final-cell", "wrong-slot-previous", "wrong-program", "wrong-checker", "wrong-recipe", "wrong-generation", "released", "copied-history"} {
			t.Run(name, func(t *testing.T) {
				changed := a
				restore := func() {}
				switch name {
				case "wrong-branch":
					changed.branch = call.branch
				case "copied-array":
					copy := *a.value.object
					changed.value.object = &copy
				case "copied-callable":
					row := a.branch.state.storage.previous.previous
					value := row.descriptor.value
					copy := *f
					row.descriptor.value.callable = &copy
					restore = func() { row.descriptor.value = value }
				case "wrong-capture-cell":
					old := f.capturedLexicals[0]
					f.capturedLexicals[0].cell = call.callInputs.lexicals[0].cell
					restore = func() { f.capturedLexicals[0] = old }
				case "wrong-init-value":
					row := a.branch.state.storage
					old := row.value
					row.value = call.value
					restore = func() { row.value = old }
				case "wrong-slot-value":
					row := a.branch.state.storage.previous.previous
					old := row.descriptor.value
					row.descriptor.value = languageValue{undefined: true}
					restore = func() { row.descriptor.value = old }
				case "wrong-slot-key":
					row := a.branch.state.storage.previous.previous
					old := row.key
					row.key = languageStringKey("1")
					restore = func() { row.key = old }
				case "wrong-length-value", "length-writable", "length-enumerable", "length-configurable":
					row := a.branch.state.storage.previous
					old := row.descriptor
					switch name {
					case "wrong-length-value":
						row.descriptor.value = languageValue{undefined: true}
					case "length-writable":
						row.descriptor.writable = false
					case "length-enumerable":
						row.descriptor.enumerable = true
					case "length-configurable":
						row.descriptor.configurable = true
					}
					restore = func() { row.descriptor = old }
				case "slot-writable", "slot-enumerable", "slot-configurable":
					row := a.branch.state.storage.previous.previous
					old := row.descriptor
					switch name {
					case "slot-writable":
						row.descriptor.writable = false
					case "slot-enumerable":
						row.descriptor.enumerable = false
					case "slot-configurable":
						row.descriptor.configurable = false
					}
					restore = func() { row.descriptor = old }
				case "wrong-final-cell":
					row := a.branch.state.storage
					old := row.cell
					row.cell = call.callInputs.lexicals[0].cell
					if row.cell == old {
						t.Fatal("cell substitution did not change identity")
					}
					restore = func() { row.cell = old }
				case "wrong-slot-previous":
					row := a.branch.state.storage.previous.previous
					old := row.previous
					row.previous = old.previous
					restore = func() { row.previous = old }
				case "wrong-program":
					old := h.authority.program
					h.authority.program = nil
					restore = func() { h.authority.program = old }
				case "wrong-checker":
					old := h.authority.checker
					h.authority.checker = nil
					restore = func() { h.authority.checker = old }
				case "wrong-recipe":
					s := *a.storage
					r := *s.recipe
					s.recipe = &r
					changed.storage = &s
				case "wrong-generation":
					p := h.authority.owner.closedPrefixCandidate
					old := p.generation
					p.generation = &projectGeneration{active: true}
					restore = func() { p.generation = old }
				case "released":
					p := h.authority.owner.closedPrefixCandidate
					p.released = true
					restore = func() { p.released = false }
				case "copied-history":
					copy := *h
					if copy.initializerBindingResult(a) {
						t.Fatal("copied history became live owner")
					}
					return
				}
				defer restore()
				if h.initializerBindingResult(changed) {
					t.Fatal("wrong current array destination accepted")
				}
			})
			if !h.initializerBindingResult(a) || h.callReceipts[0] != callReceipt || o.next != next {
				t.Fatal("read-only control changed original receipt/IDs or failed restoration", name)
			}
		}
	}
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/array-result-controls.ts", Source: arrayInitializerCallSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal(r.Error, r.Diagnostics, seen)
	}
}

func TestArrayInitializerSourceLimits(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"hole", strings.Replace(arrayInitializerCallSource, "[make(input)]", "[,make(input)]", 1)},
		{"spread", strings.Replace(arrayInitializerCallSource, "[make(input)]", "[...[make(input)]]", 1)},
		{"multiple-elements", strings.Replace(arrayInitializerCallSource, "[make(input)]", "[make(input),make(input)]", 1)},
		{"later-call", arrayInitializerCallSource + `xs[0]!();`},
		{"intervening-write", arrayInitializerCallSource + `input.value='later';`},
		{"default-formal", strings.Replace(arrayInitializerCallSource, "input:{value:string}", "input:{value:string}={value:'default'}", 1)},
		{"unknown-input", strings.Replace(arrayInitializerCallSource, "{value:'safe'}", "{value:unknownValue()}", 1) + `declare function unknownValue():string;`},
		{"different-throw-body", `export{};function make(input:{value:string}){throw 9}const input={value:'safe'};const xs=[make(input)];`},
	} {
		t.Run(c.name, func(t *testing.T) {
			id := "/virtual/array-refusal-" + c.name + ".ts"
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: id, Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatal("invalid refusal fixture", r.Diagnostics)
				}
			}
			if h := bindingCloseHistory(s, id); h != nil && h.roots != 0 {
				t.Fatal("unselected source domain entered", h.roots)
			}
		})
	}
}

// Publisher validation is independent of emitted JavaScript behavior. A missing
// precision receipt must not prevent the separate runtime contract from running.
func TestArrayInitializerPublisherResponseParity(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			req := Request{Kind: "compile", ID: "/virtual/array-creation-runtime.ts", Source: arrayInitializerCallSource, Target: target, Diagnostics: "semantic"}
			conditionalFieldObserve = nil
			normal := NewSession().Execute(req)
			seen := 0
			conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
				if h.receipt != nil && h.recipe.call != nil && ast.IsArrayLiteralExpression(h.recipe.call.Parent) {
					seen++
					if !h.initializerBindingResult(a) {
						t.Fatal("actual array publisher")
					}
				}
			}
			observed := NewSession().Execute(req)
			if normal.Error != "" || hasErrorDiagnostic(normal.Diagnostics) || normal.Code == "" || seen != 1 {
				t.Fatal("original emitted creation unavailable", normal.Error, normal.Diagnostics, seen)
			}
			clean := func(r Response) map[string]any {
				b, e := json.Marshal(r)
				if e != nil {
					t.Fatal(e)
				}
				var m map[string]any
				if e = json.Unmarshal(b, &m); e != nil {
					t.Fatal(e)
				}
				delete(m, "timings")
				return m
			}
			if !reflect.DeepEqual(clean(normal), clean(observed)) {
				t.Fatal("full Response differs excluding top-level timings only")
			}
		})
	}
}

// Ordinary source composition preserves the actual array and deferred callable
// without requiring a compile-time construction receipt.
func TestArrayInitializerCreationRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/array-creation-runtime.ts", Source: arrayInitializerCallSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal("original emitted creation unavailable", r.Error, r.Diagnostics)
			}
			script := `const vm=require('node:vm'),fs=require('node:fs');const c=vm.createContext({exports:{}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);if(!vm.runInContext("Array.isArray(xs)&&xs.length===1&&Object.hasOwn(xs,'0')&&typeof xs[0]==='function'&&input.value==='safe'",c))throw Error('actual creation only');const d=vm.runInContext("Object.getOwnPropertyDescriptor(xs,'0')",c);if(!d.writable||!d.enumerable||!d.configurable)throw Error('slot descriptor');`
			sourceNodeScript(t, r.Code, script)
		})
	}
}

// The existing observation is reached immediately before the actual consumer.
// Negative cases deliberately poison its live buffers, so actual execution must
// refuse before the creator body and must not initialize xs.
func TestArrayInitializerPreCallRefusals(t *testing.T) {
	for _, name := range []string{"positive", "slot-present", "wrong-length", "copied-array", "unready-callee", "unknown-argument", "initialized-destination", "wrong-call"} {
		t.Run(name, func(t *testing.T) {
			old := conditionalFieldObserve
			defer func() { conditionalFieldObserve = old }()
			seen := false
			var p *closedPrefixCandidate
			var destination languageCell
			conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
				_, pc, ok := sourceArrayInitializerCallLayout(h.recipe)
				if !ok || h.receipt != nil {
					return
				}
				seen = true
				p = h.authority.owner.closedPrefixCandidate
				v := a.storage
				if v == nil || v.pc != pc || p == nil || p.bodyClaimed || len(h.callReceipts) != 0 || h.publications != 0 {
					t.Fatal("not actual pre-Call source boundary")
				}
				if !p.initializerCallReady(h.recipe, a, v.cells, v.values, v.ready, &languageCopyWork{}) {
					t.Fatal("actual pre-Call positive")
				}
				r := h.recipe
				arrayReg := r.events[pc+1].a
				array := v.values[arrayReg].object
				destination = v.cells[r.events[len(r.events)-1].cell]
				switch name {
				case "slot-present":
					a.branch.state.storage = &languageStorage{previous: a.branch.state.storage, object: array, key: languageStringKey("0"), initialized: true, descriptor: languageDescriptor{value: languageValue{undefined: true}, writable: true, enumerable: true, configurable: true}}
				case "wrong-length":
					for row := a.branch.state.storage; row != nil; row = row.previous {
						if row.object == array && row.key == languageStringKey("length") {
							row.descriptor.value = languageValue{undefined: true}
							break
						}
					}
				case "copied-array":
					copy := *array
					v.values[arrayReg].object = &copy
				case "unready-callee":
					v.ready[r.events[pc].a] = false
				case "unknown-argument":
					a.callInputs.arguments[0].value = languageValue{}
				case "initialized-destination":
					a.branch.state.storage = &languageStorage{previous: a.branch.state.storage, cell: destination, initialized: true, value: languageValue{undefined: true}}
				case "wrong-call":
					a.callInputs.call = a.callInputs.callee.callable.proof.arrow
				}
				if got := p.initializerCallReady(r, a, v.cells, v.values, v.ready, &languageCopyWork{}); got != (name == "positive") {
					t.Fatal("pre-Call result", got)
				}
			}
			id := "/virtual/array-precall-" + name + ".ts"
			s := NewSession()
			r := s.Execute(Request{Kind: "compile", ID: id, Source: arrayInitializerCallSource, Diagnostics: "semantic"})
			if r.Error != "" || !seen {
				t.Fatal(r.Error, r.Diagnostics, seen)
			}
			h := bindingCloseHistory(s, id)
			if h == nil || h.receipt == nil {
				t.Fatal("actual original source disposition absent")
			}
			if name == "positive" {
				if len(h.callReceipts) != 1 || !p.bodyClaimed {
					t.Fatal("positive did not enter creator")
				}
				return
			}
			a := h.receipt.alternatives[0]
			if a.completion != languageResidual || p.bodyClaimed || len(h.callReceipts) != 0 || a.storage == nil || a.storage.ready[a.storage.pc] {
				t.Fatal("refusal issued creator Call/result", a.completion, p.bodyClaimed, len(h.callReceipts))
			}
			n := 0
			for row := a.branch.state.storage; row != nil; row = row.previous {
				if row.cell == destination && row.initialized {
					n++
				}
			}
			want := 0
			if name == "initialized-destination" {
				want = 1
			}
			if n != want {
				t.Fatal("refusal performed destination initialization", n, want)
			}
		})
	}
}

func TestArrayInitializerAliasAndPriorState(t *testing.T) {
	for _, source := range []string{
		strings.Replace(arrayInitializerCallSource, "const xs=", "const alias=input;const xs=", 1),
		strings.Replace(arrayInitializerCallSource, "const xs=", "input.value='current';const xs=", 1),
	} {
		old := conditionalFieldObserve
		defer func() { conditionalFieldObserve = old }()
		seen := false
		conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
			if h.receipt == nil {
				return
			}
			if !h.initializerBindingResult(a) {
				t.Fatal("original current-state array publication")
			}
			seen = true
			call := h.callReceipts[0].alternatives[0]
			input := call.callInputs.arguments[0].value.object
			d, present, complete, _ := a.branch.owner.readOwnRecord(a.branch, input, languageStringKey("value"))
			want := "safe"
			if strings.Contains(source, "'current'") {
				want = "current"
			}
			if !present || !complete || d.value.node == nil || d.value.node.Text() != want {
				t.Fatal("actual prior state not retained", d)
			}
			for _, v := range call.callInputs.lexicals {
				if v.declaration.Name() != nil && v.declaration.Name().Text() == "alias" {
					got := a.branch.owner.readLocal(a.branch, v.cell)
					if got.completion != languageNormal || got.value.object != input {
						t.Fatal("same actual object alias identity")
					}
				}
			}
		}
		r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/array-alias-current.ts", Source: source, Diagnostics: "semantic"})
		conditionalFieldObserve = old
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
			t.Fatal(r.Error, r.Diagnostics, seen)
		}
	}
}

// A shadow slot tests the existing projection consumer with genuine live
// receipts. It cannot execute a Call or publish through the original slot.
func TestArrayInitializerOriginalCallProjection(t *testing.T) {
	old := conditionalFieldObserve
	defer func() { conditionalFieldObserve = old }()
	seen := false
	conditionalFieldObserve = func(h *closedPrefixHistory, a languageAlternative) {
		if h.receipt == nil || h.recipe.call == nil || !ast.IsArrayLiteralExpression(h.recipe.call.Parent) {
			return
		}
		p := h.authority.owner.closedPrefixCandidate
		if p == nil || p.frame == nil || p.slot == nil || len(h.callReceipts) != 1 {
			t.Fatal("original live source slot absent")
		}
		frame := *p.frame
		slot := *p.slot
		slot.closedView = nil
		frame.operations = map[*ast.Node]*sourceNormalOperation{h.call: &slot}
		q := sourceValueQuery{owner: p.owner, executable: p.executable, inputs: &frame}
		next := p.owner.language.next
		q.projectClosedPrefixPhase(sourceNormalPhase{node: h.call, role: sourceNormalSelect}, &slot, h)
		if slot.closedView == nil || slot.closedView.result != h.callReceipts[0] || slot.closedView.result == h.receipt {
			t.Fatal("Call projection relabeled post-container receipt as original Return")
		}
		if slot.closedView.result.alternatives[0].value != h.callReceipts[0].alternatives[0].value || p.owner.language.next != next {
			t.Fatal("projection changed value or issued IDs")
		}
		original := h.callReceipts[0]
		for _, name := range []string{"wrong-phase", "wrong-table-slot", "wrong-owner", "wrong-program", "wrong-checker"} {
			t.Run(name, func(t *testing.T) {
				slot.closedView = nil
				phase := sourceNormalPhase{node: h.call, role: sourceNormalSelect}
				oldAuthority := slot.authority
				oldTable := frame.operations
				defer func() { slot.authority = oldAuthority; frame.operations = oldTable }()
				switch name {
				case "wrong-phase":
					phase.node = h.call.Expression()
				case "wrong-table-slot":
					frame.operations = map[*ast.Node]*sourceNormalOperation{h.call: p.slot}
				case "wrong-owner":
					slot.authority.owner = nil
				case "wrong-program":
					slot.authority.program = nil
				case "wrong-checker":
					slot.authority.checker = nil
				}
				q.projectClosedPrefixPhase(phase, &slot, h)
				if slot.closedView != nil && slot.closedView.result != nil {
					t.Fatal("mismatched projection lent original receipt")
				}
			})
			slot.closedView = nil
			q.projectClosedPrefixPhase(sourceNormalPhase{node: h.call, role: sourceNormalSelect}, &slot, h)
			if slot.closedView == nil || slot.closedView.result != original || h.callReceipts[0] != original || p.owner.language.next != next {
				t.Fatal("projection restoration changed original receipt or issued IDs", name)
			}
		}
		seen = true
	}
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/array-call-projection.ts", Source: arrayInitializerCallSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !seen {
		t.Fatal(r.Error, r.Diagnostics, seen)
	}
}
