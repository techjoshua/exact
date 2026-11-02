package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"regexp"
	"runtime/debug"
	"testing"
	"time"
)

const nativeDescriptorFreezeCycleSource = `const key=Symbol.for('tag');function install(metadata:object){const operation=Object.create(null);Object.defineProperty(operation,key,{value:Object.freeze({...metadata})});return operation}export const value=install({}).value;`

// Each valid source runs in its own process so a stack fatal cannot mask donor
// controls. The stack cap is a test containment boundary, not analysis fuel.
func TestNativeDescriptorFreezeAcquisition(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"symbol", nativeDescriptorFreezeCycleSource, false},
		{"literal-key", `const key='metadata';function install(metadata:object){const operation=Object.create(null);Object.defineProperty(operation,key,{value:Object.freeze({...metadata})});return operation}export const value=install({}).value;`, false},
		{"unknown-key", `declare const key:PropertyKey;function install(metadata:object){const operation=Object.create(null);Object.defineProperty(operation,key,{value:Object.freeze({...metadata})});return operation}export const value=install({}).value;`, false},
		{"returned-metadata", `const key=Symbol.for('tag');function metadata(){return {label:'safe'}}function install(input:object){const operation=Object.create(null);Object.defineProperty(operation,key,{value:Object.freeze({...input})});return operation}export const value=install(metadata()).value;`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			if os.Getenv("EXACT_NATIVE_ACQUISITION_CHILD") != row.name {
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestNativeDescriptorFreezeAcquisition$/^"+regexp.QuoteMeta(row.name)+"$", "-test.v")
				command.Env = append(os.Environ(), "EXACT_NATIVE_ACQUISITION_CHILD="+row.name)
				if output, err := command.CombinedOutput(); err != nil {
					t.Fatalf("source acquisition %s: %v\n%s", row.name, err, output)
				}
				return
			}
			previous := debug.SetMaxStack(8 << 20)
			defer debug.SetMaxStack(previous)
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-acquisition.ts", Source: row.source, Diagnostics: "semantic"})
			browser, _ := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser {
				t.Fatalf("browser=%v want=%v", browser, row.browser)
			}
		})
	}
}

// Original JavaScript completes normally. Compiler emission is checked after
// acquisition terminates, without reconstructing Object.create as normal DATA.
func TestNativeDescriptorFreezeOriginalRuntime(t *testing.T) {
	sourceNodeScript(t, nativeDescriptorFreezeCycleSource, `const fs=require('node:fs'),vm=require('node:vm'),exports={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports});if(!Object.hasOwn(exports,'value')||exports.value!==undefined)throw Error('changed original completion');`)
}

func TestNativeDescriptorFreezeEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-cycle-runtime.ts", Source: nativeDescriptorFreezeCycleSource, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),exports={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports});if(!Object.hasOwn(exports,'value')||exports.value!==undefined)throw Error('changed emitted completion');`)
		})
	}
}

// Ordinary source returns remain available after callee selection. Distinct
// inputs/captures and independent unknown alternatives retain their own donors.
func TestNativeCalleeAcquisitionDonors(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"direct", `export function read(){return Object.freeze({get value(){return document.title}}).value}`, true, false},
		{"captured", `function wrap(input:{value:string}){return ()=>Object.freeze(input).value}export function read(){return wrap({get value(){return document.title}})()}`, true, false},
		{"different-inputs", `function project(input:{value:string}){return Object.freeze(input).value}export function read(){project({value:'safe'});return project({get value(){return document.title}})}`, true, false},
		{"current-write", `export function read(){let input={value:'safe'};input={get value(){return document.title}};return Object.freeze(input).value}`, true, false},
		{"foreign", `declare function foreign():{value:string};export function read(flag:boolean){return Object.freeze(flag?{get value(){return document.title}}:foreign()).value}`, true, true},
		{"default", `export function read(input={get value(){return document.title}}){return Object.freeze(input).value}`, true, false},
		{"earlier-output", `const value=Object.freeze({get label(){return document.title}});export function read(){return value.label}`, true, false},
		{"throw", `export function read(){return Object.freeze({get value():string{throw Error('stop')}}).value}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/callee-donors.ts", Source: row.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			fact := findCallable(t, r.Analysis.Callables, "read")
			browser, unknown := false, false
			for _, effect := range fact.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != row.browser || row.unknown && !unknown {
				t.Fatalf("browser=%v unknown=%v want browser=%v independentUnknown=%v", browser, unknown, row.browser, row.unknown)
			}
		})
	}
}

// These checks exercise negative availability with checker-owned syntax. They
// grant no normal operation, input plan, body completion or output value.
func TestPendingCalleeAvailabilityLifetime(t *testing.T) {
	const source = `function project(input:object){return Object.freeze(input)}const first={},second={};export const value=project(first);`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/callee-borrow.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/callee-borrow.ts")
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
			t.Fatal("missing source endpoints")
		}
		q := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, body)
		bindings := sourceValueBindings{1: {{node: first, path: []string{"value"}}}}
		q.creators = map[*ast.Node]sourceValueCreation{body: {invocation: other}}
		beforeCost, beforeRemaining := q.estimatedCost, q.remaining
		release := q.beginCalleeAcquisition(call, bindings)
		if release == nil || !q.pendingCalleeOutput(call, bindings) {
			t.Fatal("live syntax context not withheld")
		}
		if q.estimatedCost <= beforeCost || q.remaining != beforeRemaining {
			t.Fatal("snapshot work was unaccounted or depleted execution fuel")
		}
		initial := q.pendingCallee
		copy := *q
		if copy.pendingCalleeOutput(call, bindings) {
			t.Fatal("query copy inherited borrow")
		}
		if q.pendingCalleeOutput(other, bindings) {
			t.Fatal("other original Call withheld")
		}
		part := q.projectSourceCallReturns(call, bindings, func(sourceValue, sourceValueBindings) { t.Error("pending output published") }, func() { t.Error("pending output dispatched") })
		if !part.opaque || !part.valueIncomplete || len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 || len(part.fieldCalls) != 0 {
			t.Fatal("pending output issued authority")
		}
		saved := bindings[1][0]
		for _, value := range []sourceValue{{node: second, path: []string{"value"}}, {node: first, path: []string{"other"}}, {node: first, path: []string{"value"}, undefined: true}, {node: first, capture: &acquiredCallableScope{}}, {node: first, rest: [][]sourceValue{}}, {node: first, entrySlot: first}} {
			bindings[1][0] = value
			if q.pendingCalleeOutput(call, bindings) {
				t.Fatal("changed or unsupported input withheld")
			}
		}
		bindings[1][0] = saved
		bindings[1][0].path[0] = "changed"
		if q.pendingCalleeOutput(call, bindings) {
			t.Fatal("snapshot aliased mutable path")
		}
		bindings[1][0].path[0] = "value"
		q.creators[body] = sourceValueCreation{invocation: call}
		if q.pendingCalleeOutput(call, bindings) {
			t.Fatal("snapshot aliased creator map")
		}
		q.creators[body] = sourceValueCreation{invocation: other}
		q.reading = other
		if q.pendingCalleeOutput(call, bindings) {
			t.Fatal("different read cut withheld")
		}
		q.reading = call
		// The constructor supplies the initial read cut, which must be restored exactly.
		if !q.pendingCalleeOutput(call, bindings) {
			t.Fatal("restored source context did not match")
		}
		nested := q.beginCalleeAcquisition(other, bindings)
		if nested == nil {
			t.Fatal("nested syntax context refused")
		}
		nested()
		if q.pendingCallee != initial || !q.pendingCalleeOutput(call, bindings) {
			t.Fatal("nested borrow failed to restore prior")
		}
		q.inputs = &sourceValueInputs{}
		beforeCost = q.estimatedCost
		if q.pendingCalleeOutput(call, bindings) || q.beginCalleeAcquisition(call, bindings) != nil {
			t.Fatal("input frame acquired availability proof")
		}
		q.inputs = nil
		q.dependenciesOnly = false
		if q.pendingCalleeOutput(call, bindings) || q.beginCalleeAcquisition(call, bindings) != nil {
			t.Fatal("normal query acquired availability proof")
		}
		if q.estimatedCost != beforeCost || q.remaining != beforeRemaining {
			t.Fatal("normal or installed-input refusal charged source snapshot work")
		}
		q.dependenciesOnly = true
		release()
		if q.pendingCallee != nil || initial.owner != nil || initial.call != nil || q.pendingCalleeOutput(call, bindings) {
			t.Fatal("expired borrow retained")
		}
	}
}
