package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source capture descriptions preserve creating endpoints and actual source
// alternatives. They supply only pending-output refusal, never normal authority.
func TestPendingCalleeSourceCaptures(t *testing.T) {
	const source = `function project(input:object){return Object.freeze(input)}const first={},second={};export const value=project(first);`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/capture-descriptions.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/capture-descriptions.ts")
		if file == nil {
			continue
		}
		var call, other, body, first, second *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) {
				body = n
			}
			if ast.IsCallExpression(n) {
				if call == nil {
					call = n
				} else {
					other = n
				}
			}
			if ast.IsObjectLiteralExpression(n) {
				if first == nil {
					first = n
				} else {
					second = n
				}
			}
			return true
		})
		if call == nil || other == nil || body == nil || first == nil || second == nil {
			t.Fatal("missing checker-owned source endpoints")
		}
		q := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, body)
		fresh := func() sourceValue {
			return sourceValue{node: first, capture: &acquiredCallableScope{bindings: sourceValueBindings{7: {{node: second, path: []string{"value"}, rest: [][]sourceValue{{{node: body}}}}, {undefined: true}}}, creators: map[*ast.Node]sourceValueCreation{body: {invocation: other, returning: second}}}}
		}
		initial := sourceValueBindings{1: {fresh()}}
		remaining := q.remaining
		cost := q.estimatedCost
		release := q.beginCalleeAcquisition(call, initial)
		if release == nil || !q.pendingCalleeOutput(call, initial) || !q.pendingCalleeOutput(call, sourceValueBindings{1: {fresh()}}) {
			t.Fatal("acyclic source capture did not match contents independently of scope allocation")
		}
		if q.estimatedCost <= cost || q.remaining != remaining {
			t.Fatal("capture work unaccounted or depleted fuel")
		}
		for _, row := range []struct {
			name   string
			change func(*sourceValue)
		}{
			{"absent-capture", func(v *sourceValue) { v.capture = nil }},
			{"empty-capture", func(v *sourceValue) { v.capture = &acquiredCallableScope{} }},
			{"binding-key", func(v *sourceValue) { v.capture.bindings[8] = v.capture.bindings[7]; delete(v.capture.bindings, 7) }},
			{"ordered-alternatives", func(v *sourceValue) { a := v.capture.bindings[7]; a[0], a[1] = a[1], a[0] }},
			{"new-input", func(v *sourceValue) { v.capture.bindings[7][0].node = first }},
			{"capture-path", func(v *sourceValue) { v.capture.bindings[7][0].path[0] = "other" }},
			{"creator-body", func(v *sourceValue) {
				v.capture.creators[other] = v.capture.creators[body]
				delete(v.capture.creators, body)
			}},
			{"creating-call", func(v *sourceValue) {
				v.capture.creators[body] = sourceValueCreation{invocation: call, returning: second}
			}},
			{"creating-return", func(v *sourceValue) {
				v.capture.creators[body] = sourceValueCreation{invocation: other, returning: first}
			}},
			{"nested-normal", func(v *sourceValue) { v.capture.bindings[7][0].normal = &sourceNormalValue{} }},
			{"nested-acquired", func(v *sourceValue) { v.capture.bindings[7][0].acquired = &sourceObservedValue{} }},
			{"nested-native", func(v *sourceValue) { v.capture.bindings[7][0].native = &sourceNativeValue{} }},
		} {
			t.Run(row.name, func(t *testing.T) {
				value := fresh()
				row.change(&value)
				if q.pendingCalleeOutput(call, sourceValueBindings{1: {value}}) {
					t.Fatal("changed or unsupported capture withheld pending output")
				}
			})
		}
		initial[1][0].capture.bindings[7][0].rest[0][0].node = first
		if q.pendingCalleeOutput(call, initial) {
			t.Fatal("snapshot aliased container inside capture")
		}
		initial[1][0].capture.bindings[7][0].rest[0][0].node = body
		initial[1][0].capture.creators[body] = sourceValueCreation{invocation: call}
		if q.pendingCalleeOutput(call, initial) {
			t.Fatal("snapshot aliased capture creator map")
		}
		initial[1][0].capture.creators[body] = sourceValueCreation{invocation: other, returning: second}
		if !q.pendingCalleeOutput(call, initial) {
			t.Fatal("restored capture no longer matched")
		}
		clone := *q
		if clone.pendingCalleeOutput(call, initial) {
			t.Fatal("query copy inherited capture borrow")
		}
		part := q.projectSourceCallReturns(call, initial, func(sourceValue, sourceValueBindings) { t.Error("pending capture output published") }, func() { t.Error("pending capture output dispatched") })
		if !part.opaque || !part.valueIncomplete || len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 || len(part.fieldCalls) != 0 {
			t.Fatal("capture refusal granted normal authority")
		}
		prior := q.pendingCallee
		nested := q.beginCalleeAcquisition(other, initial)
		if nested == nil {
			t.Fatal("nested capture borrow refused")
		}
		nested()
		if q.pendingCallee != prior {
			t.Fatal("nested capture failed to restore prior")
		}
		release()
		if q.pendingCallee != nil || prior.owner != nil || q.pendingCalleeOutput(call, initial) {
			t.Fatal("expired capture borrow retained")
		}
		// Present empty captures remain distinct from absent ones.
		empty := sourceValueBindings{1: {{node: first, capture: &acquiredCallableScope{}}}}
		release = q.beginCalleeAcquisition(call, empty)
		if release == nil || !q.pendingCalleeOutput(call, empty) || q.pendingCalleeOutput(call, sourceValueBindings{1: {{node: first}}}) {
			t.Fatal("empty capture presence lost")
		}
		release()
		// A current capture cycle cannot masquerade as the prior finite leaf.
		cycleScope := &acquiredCallableScope{bindings: make(sourceValueBindings)}
		cycle := sourceValue{node: first, capture: cycleScope}
		cycleScope.bindings[7] = []sourceValue{cycle}
		finite := sourceValueBindings{1: {{node: first, capture: &acquiredCallableScope{bindings: sourceValueBindings{7: {{node: first}}}}}}}
		release = q.beginCalleeAcquisition(call, finite)
		if release == nil {
			t.Fatal("finite capture leaf refused")
		}
		prior = q.pendingCallee
		if q.pendingCalleeOutput(call, sourceValueBindings{1: {cycle}}) || q.beginCalleeAcquisition(call, sourceValueBindings{1: {cycle}}) != nil || q.pendingCallee != prior {
			t.Fatal("cyclic capture became equivalent or damaged prior")
		}
		release()
		bad := fresh()
		bad.capture.bindings[7][0].normal = &sourceNormalValue{}
		if q.beginCalleeAcquisition(call, sourceValueBindings{1: {bad}}) != nil {
			t.Fatal("normal value inside capture described")
		}
		q.dependenciesOnly = false
		cost = q.estimatedCost
		if q.beginCalleeAcquisition(call, initial) != nil || q.pendingCalleeOutput(call, initial) || q.estimatedCost != cost || q.remaining != remaining {
			t.Fatal("normal query acquired or paid for capture availability")
		}
	}
}

// The original captured input reaches the emitted native Call. Its copied
// browser getter executes once and retains Throw in its emitted client artifact.
func TestSourceCaptureFreezeEmittedOrdering(t *testing.T) {
	const source = `const key=Symbol.for('tag');function install(metadata:object){const operation=Object.create(null);Object.defineProperty(operation,key,{value:Object.freeze({...metadata})});return operation}const provider={get metadata(){return {get value(){return document.title}}}};export const value=install(provider.metadata).value;`
	for _, target := range []Target{TargetClient} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/capture-order.ts", Source: source, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');for(const abrupt of [false,true]){let gets=0;const out={},sentinel=Error('stop');const context={exports:out,document:{get title(){gets++;if(abrupt)throw sentinel;return 'browser'}}};try{vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),context);if(abrupt)throw Error('missing Throw');assert.equal(out.value,undefined);assert.ok(Object.hasOwn(out,'value'))}catch(error){if(!abrupt||error!==sentinel)throw error}assert.equal(gets,1)}`)
		})
	}
}
