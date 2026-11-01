package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The compiler sees the original qualified source, without counters or hooks.
// The Node witness separately wraps emitted own methods, preserving this and
// arguments, and restores their exact descriptors after the unchanged binding.
const twoElementSource = `export {};
let mark = 0;
const Q = { done: false, value: 3 };
const C = { value: 0 };
const I = {
  result: Q,
  closeResult: C,
  next: function(this: { result: typeof Q }) { return this.result; },
  return: function(this: { closeResult: typeof C }) { return this.closeResult; }
};
const O = {
  iterator: I,
  [Symbol.iterator]: function(this: { iterator: typeof I }) { return this.iterator; }
};
const [x, y] = O;
`

func twoElementTerminal(t *testing.T, h *closedPrefixHistory, exhausted bool) languageAlternative {
	t.Helper()
	if h == nil || h.receipt == nil || h.roots != 1 || h.publications != 1 {
		t.Fatal("one actual source publication")
	}
	var row languageAlternative
	found := 0
	for _, a := range h.receipt.alternatives {
		if a.binding != nil && a.binding.complete(a) {
			row = a
			found++
		}
	}
	if found != 1 || row.completion != languageNormal || row.value != (languageValue{}) {
		t.Fatal("one normal owned binding terminal", found)
	}
	c := row.binding
	if len(c.plan.elements) != 2 || c.elementIndex != 1 || !completedElements(c, row, 2) || c.completed == nil || c.completed.previous == nil || c.completed.previous.previous != nil || c.origin == nil || !c.routed {
		t.Fatal("actual ordered Initialize prefix and final Park")
	}
	second, first := c.completed, c.completed.previous
	if first.descriptor != c.plan.elementAt(0) || second.descriptor != c.plan.elementAt(1) || first.target == second.target || first.record == second.record {
		t.Fatal("distinct source targets and records")
	}
	for _, n := range []*bindingElementCompletion{first, second} {
		if n.initialized == nil || len(n.initialized.alternatives) != 1 || n.initialized.alternatives[0].binding == nil || n.initialized.alternatives[0].binding.completed != n || n.initialized.alternatives[0].branch.state.storage != n.record || bindingInitializedRecord(row.branch, n.target, bindingCompletionValue(n)) != n.record {
			t.Fatal("same actual Initialize record retained through later work")
		}
		v := bindingCompletionValue(n)
		if exhausted {
			if v != (languageValue{undefined: true}) {
				t.Fatal("exhaustion initialized a value")
			}
		} else if number, known := numericNumberPayload(v); !known || float64(number) != 3 {
			t.Fatal("selected actual Number3")
		}
	}
	if exhausted {
		if !c.done || first.step == nil || second.step != nil || second.sticky != first || second.valueReceipt != nil || c.close != nil || c.returnGet != nil {
			t.Fatal("sticky exhaustion invented later protocol work")
		}
	} else if c.done || first.step == nil || second.step == nil || first.step == second.step || first.step.entry == second.step.entry || first.step.raw == second.step.raw || first.step.entry.boundary == second.step.entry.boundary || first.step.value != second.step.value || first.step.entry.inputs.callee != second.step.entry.inputs.callee || c.close == nil || c.close.completion != languageNormal {
		t.Fatal("fresh Next histories for the same callable/result and one Close")
	}
	return row
}

func TestBindingTwoElementsSourceEmitted(t *testing.T) {
	for _, exhausted := range []bool{false, true} {
		name := "repeated"
		source := twoElementSource
		if exhausted {
			name = "exhausted"
			source = strings.Replace(source, "done: false", "done: true", 1)
		}
		t.Run(name, func(t *testing.T) {
			const id = "/virtual/two-elements.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			row := twoElementTerminal(t, bindingCloseHistory(session, id), exhausted)
			c := row.binding
			count := row.branch.owner.next
			for _, kind := range []string{"missing-prefix", "wrong-record", "wrong-target", "wrong-descriptor"} {
				bad := *c
				node := *c.completed
				bad.completed = &node
				other := row
				other.binding = &bad
				switch kind {
				case "missing-prefix":
					node.previous = nil
				case "wrong-record":
					node.record = node.previous.record
				case "wrong-target":
					node.target = node.previous.target
				case "wrong-descriptor":
					node.descriptor = node.previous.descriptor
				}
				if completedElements(&bad, other, 2) || row.branch.owner.next != count {
					t.Fatal("foreign completed prefix accepted or inspection issued IDs", kind)
				}
			}
			dir := t.TempDir()
			plain := filepath.Join(dir, "plain.mts")
			observed := filepath.Join(dir, "observed.mts")
			if err := os.WriteFile(plain, []byte(response.Code+"\nexport const __witness={values:[x,y]};\n"), 0600); err != nil {
				t.Fatal(err)
			}
			// Instrument only the emitted child. Exactly one known binding statement
			// is retained verbatim, with no replay, compiler hook or authored capture.
			start := strings.LastIndex(response.Code, "const [x, y]")
			if start < 0 {
				t.Fatal("emitted binding observation anchor missing")
			}
			end := strings.Index(response.Code[start:], ";")
			if end < 0 {
				t.Fatal("emitted binding statement missing")
			}
			end += start + 1
			const before = `
const __counts={next:0,close:0,factory:0};
const __saved=[];
function __wrap(object,key,name){
 const descriptor=Object.getOwnPropertyDescriptor(object,key);
 if(!descriptor||typeof descriptor.value!=='function')throw Error('missing own protocol method');
 __saved.push([object,key,descriptor]);
 Object.defineProperty(object,key,{...descriptor,value:function(...args){__counts[name]++;return Reflect.apply(descriptor.value,this,args)}});
}
__wrap(I,'next','next');__wrap(I,'return','close');__wrap(O,Symbol.iterator,'factory');
`
			const after = `
for(const [object,key,descriptor] of __saved)Object.defineProperty(object,key,descriptor);
export const __witness={values:[x,y],counts:__counts,before:__saved.map(x=>x[2]),after:__saved.map(([object,key])=>Object.getOwnPropertyDescriptor(object,key))};
`
			code := response.Code[:start] + before + response.Code[start:end] + after + response.Code[end:]
			if err := os.WriteFile(observed, []byte(code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			t.Cleanup(cancel)
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const plain=(await import(pathToFileURL(process.argv[1]).href)).__witness;
const observed=(await import(pathToFileURL(process.argv[2]).href)).__witness;
const done=process.argv[3]==='exhausted';
assert.deepEqual(plain.values,done?[undefined,undefined]:[3,3]);
assert.deepEqual(observed.values,plain.values);
assert.deepEqual(observed.counts,{next:done?1:2,close:done?0:1,factory:1});
assert.deepEqual(observed.after,observed.before);
console.log('two-elements');`
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, plain, observed, name).CombinedOutput()
			if err != nil || strings.TrimSpace(string(output)) != "two-elements" {
				t.Fatalf("emitted iterator semantics: %v %s", err, output)
			}
		})
	}
}

// Use the ordinary production collector while its generation is live. This
// authenticates the retained Next endpoint before testing missing/copied prefix
// refusals. The Session test above supplies the public and emitted boundary.
func TestBindingTwoElementsRetainedNext(t *testing.T) {
	request := Request{Kind: "compile", ID: "/virtual/two-elements-live.ts", Source: twoElementSource, Diagnostics: "semantic"}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(generation.release)
	candidate := reserveClosedPrefixCandidate(generation.sourceFile, project.program, generation.checker, generation, request)
	if candidate == nil {
		t.Fatal("missing actual source reservation")
	}
	t.Cleanup(candidate.release)
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil, candidate)
	row := twoElementTerminal(t, candidate.history, false)
	step := row.binding.completed.step
	entry := step.entry
	parent := entry.acquisition.alternatives[0]
	owner := row.branch.owner
	endpoint, ok := retainedBindingNextAcquisition(owner, parent, entry.inputs)
	if !ok || endpoint != parent.branch || entry.inputs.targetOrigin != row.binding.completed.previous.step.entry.inputs.targetOrigin {
		t.Fatal("actual retained Next endpoint/original Get proof")
	}
	count := owner.next
	for _, kind := range []string{"missing-prefix", "wrong-record", "wrong-element", "wrong-input", "wrong-header"} {
		bad := parent
		context := *parent.binding
		bad.binding = &context
		inputs := *entry.inputs
		bad.callInputs = &inputs
		switch kind {
		case "missing-prefix":
			context.completed = nil
		case "wrong-record":
			completed := *context.completed
			completed.record = &languageStorage{}
			context.completed = &completed
		case "wrong-element":
			context.elementIndex = 0
		case "wrong-input":
			bad.branch.cursor++
		case "wrong-header":
			inputs.calleeBranch.cursor++
		}
		if _, ok := retainedBindingNextAcquisition(owner, bad, &inputs); ok || owner.next != count {
			t.Fatal("unpaid Next bridge accepted", kind)
		}
	}
}

// The new descriptor population does not widen pre-record Getter or numeric
// method terminals that authenticated only EMPTY/ONE caller targets.
func TestBindingTwoElementsFirstRoleLimits(t *testing.T) {
	for _, test := range []struct{ name, source string }{
		{"Getter", strings.Replace(firstIteratorGetterThrowSource(), "const [] = O;", "const [x,y] = O;", 1)},
		{"numeric-method", strings.Replace(firstMethodSource(false, false), "const [x] = O;", "const [x,y] = O;", 1)},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/two-first-role-limit.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if d.Severity == "error" && d.Code != "EXACT2101" {
					t.Fatal("invalid source control", response.Diagnostics)
				}
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.recipe == nil || h.recipe.binding == nil || len(h.recipe.binding.elements) != 2 {
				t.Fatal("missing actual two-target source population")
			}
			if bindingGetterRole(h.recipe, h.recipe.binding.first.get) != 0 {
				t.Fatal("two targets gained single-target first Getter role")
			}
			if h.receipt != nil {
				for _, row := range h.receipt.alternatives {
					if row.binding != nil && (row.binding.firstMethod != nil || row.binding.firstGetterThrowOutput(row) || row.binding.complete(row)) {
						t.Fatal("unproved multi-target pre-record terminal")
					}
				}
			} else if h.state != prefixRefused {
				t.Fatal("unsupported role lost its owned refusal")
			}
		})
	}
}
