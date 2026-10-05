package exactcompiler

import (
	"strings"
	"testing"
)

// Generation ownership must depend on executed registration, and captured
// callbacks must not smuggle a resource through an opaque boundary.
func TestTaskResourceControlFlow(t *testing.T) {
	for _, c := range []struct{ name, body, expected string }{
		{"conditional-own", `if(props.release)task.own(resource as unknown as Disposable);`, "owned"},
		{"conditional-release", `if (props.release) resource.dispose();`, "owned"},
		{"uninvoked-release", `const close=()=>resource.dispose();void close;`, "owned"},
		{"conditional-registration", `if(props.release)task.cleanup(()=>resource.dispose());`, "owned"},
		{"named-cleanup", `const close=()=>resource.dispose();task.cleanup(close);`, "owned"},
		{"aliased-named-cleanup", `const close=()=>resource.dispose();const alias=close;task.cleanup(alias);`, "owned"},
		{"registered-release", `task.cleanup(()=>resource.dispose());`, "owned"},
		{"cleanup-resource-creation", `task.cleanup(()=>{const inner=new Resource();inner.dispose();});`, "closed"},
		{"escaped-read-callback", `const read=()=>resource.value;publish(read);`, "escape"},
		{"escaped-release-callback", `const close=()=>resource.dispose();publish(close);`, "escape"},
		{"anonymous-read-callback", `publish(()=>resource.value);`, "escape"},
		{"published-object-method", `const readers={read(){return resource.value;}};publish(readers);`, "escape"},
		{"published-method-value", `const readers={read(){return resource.value;}};publish(readers.read);`, "escape"},
		{"local-property-callback-result", `const readers={read:()=>resource.value};publish(readers.read());`, "owned"},
		{"escaped-property-callback", `const readers={read:()=>resource.value};publish(readers);`, "escape"},
		{"escaped-method-alias", `const readers={read(){return resource.value;}};const read=readers.read;publish(read);`, "escape"},
		{"type-only-callback", `const read=():typeof resource|undefined=>undefined;publish(read);`, "owned"},
		{"recursive-helper-result", `function read(count:number):Resource{if(count)return read(count-1);return resource;}const value=read(1);void value.value;`, "owned"},
		{"local-method-result", `const readers={read(){return resource.value;}};publish(readers.read());`, "owned"},
		{"returned-object-method", `return {read(){return resource.value;}};`, "escape"},
		{"returned-getter", `return {get read(){return resource.value;}};`, "escape"},
		{"local-identity-return", `const read=()=>resource;const value=read();void value.value;`, "owned"},
		{"local-block-identity-return", `function read(){return resource;}const value=read();void value.value;`, "owned"},
		{"escaped-helper-result", `const read=()=>resource;publish(read());`, "escape"},
		{"escaped-block-helper-result", `function read(){return resource;}publish(read());`, "escape"},
		{"local-boolean-return", `function same(){return resource===resource;}publish(same());`, "owned"},
		{"local-not-result", `publish(!resource);`, "owned"},
		{"local-typeof-result", `publish(typeof resource);`, "owned"},
		{"local-void-result", `publish(void resource);`, "owned"},
		{"escaped-constructor-argument", `class Box{constructor(value:unknown){}}new Box(resource);`, "escape"},
		{"escaped-boolean-callback", `function same(){return resource===resource;}publish(same);`, "escape"},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "resource-flow.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';declare function publish(value:unknown):void;class Resource {value=1;dispose(){}}export function Page(props:{release:boolean}){function run(task:TaskContext=TaskContext.client()){const resource=new Resource();` + c.body + `}run();return()=> <output/>;}`})
			if r.Error != "" || len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %s %#v", r.Error, r.Analysis.Tasks)
			}
			task := r.Analysis.Tasks[0]
			if c.expected == "closed" {
				if !strings.Contains(strings.Join(task.Diagnostics, "\n"), "native lifetime") || r.Code == "" {
					t.Fatalf("native cleanup boundary was not reported: %#v", task.Diagnostics)
				}
				return
			}
			escaped := strings.Contains(strings.Join(task.Diagnostics, "\n"), "escapes its task generation")
			if c.expected == "escape" {
				if !escaped {
					t.Fatalf("lost resource escape: %#v", task)
				}
				return
			}
			if len(r.Diagnostics) != 0 {
				t.Fatalf("valid flow rejected: %#v", r.Diagnostics)
			}
			owned := containsTaskResource(task.Resources, "owned", "dispose")
			if owned != (c.expected == "owned") {
				t.Fatalf("ownership=%t want %s: %#v", owned, c.expected, task)
			}
		})
	}
}

// Pending-state calls and resource-release calls share one expression boundary.
// Execute this source in native coverage as well as the emitted behavior suite.
func TestTaskResourceReleaseWithPendingState(t *testing.T) {
	for _, method := range []string{"resource.dispose();", "resource.dispose?.();", "task.cleanup(()=>resource.dispose());", "task.own(resource as unknown as Disposable);"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "pending-release.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';class Resource {dispose(){}}export function Page(){this.state.value=0;async function run(release:boolean,task:TaskContext=TaskContext.client().blocking()){this.state.value++;const resource=new Resource();if(release){` + method + `}await Promise.resolve();}return()=> <button onClick={()=>run(true)}>{this.state.value}</button>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" || len(r.Analysis.Tasks) != 1 {
			t.Fatalf("blocking resource flow rejected: %s %#v", r.Error, r.Diagnostics)
		}
		resources := r.Analysis.Tasks[0].Resources
		if len(resources) != 1 || len(resources[0].ReleaseCalls) != 1 {
			t.Fatalf("blocking release ownership lost: %#v", resources)
		}
	}
}

// Cleanup may consume a signal captured by an earlier helper. Keep explicit
// signal adaptation coherent without injecting a signal into new native work.
func TestTaskCleanupExplicitSignalConsumption(t *testing.T) {
	r := NewSession().Execute(Request{Kind: "compile", ID: "cleanup-signal.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';declare function consume(signal:AbortSignal):void;declare function nativeWork(options?:{signal?:AbortSignal}):void;export function Page(){function run(task:TaskContext=TaskContext.client()){task.cleanup(()=>{consume(task.signal);nativeWork();});}run();return()=> <output/>;}`})
	if r.Error != "" || len(r.Analysis.Tasks) != 1 || r.Code == "" {
		t.Fatalf("cleanup consumption rejected: %s %#v", r.Error, r.Diagnostics)
	}
	if !hasDiagnosticCode(r.Diagnostics, "EXACT2003") {
		t.Fatalf("missing cleanup signal boundary warning: %#v", r.Diagnostics)
	}
	calls := r.Analysis.Tasks[0].SignalCalls
	if len(calls) != 1 || calls[0].Mode != "direct" || !calls[0].ExistingOnly {
		t.Fatalf("explicit cleanup signal adaptation lost or implicit work rewritten: %#v", calls)
	}
}

// Direct, option and event arguments share the cleanup boundary. Native defaults
// and capture flags must not acquire implicit cancellation after producer closure.
func TestTaskCleanupSignalArgumentForms(t *testing.T) {
	for _, c := range []struct {
		name, body string
		calls      int
		warning    bool
	}{
		{"direct", `consume(task.signal);`, 1, false},
		{"absent-direct", `consume(undefined);`, 1, true},
		{"omitted-options", `nativeWork();`, 0, true},
		{"absent-options", `nativeWork(undefined);`, 1, true},
		{"empty-options", `nativeWork({});`, 1, true},
		{"explicit-options", `nativeWork({signal:task.signal});`, 1, false},
		{"optional-options", `nativeWork(optional);`, 1, true},
		{"nullable-options", `nativeWork(nullable);`, 1, true},
		{"capture-flag", `target.addEventListener('x',()=>{},true);`, 1, true},
		{"explicit-event-options", `target.addEventListener('x',()=>{},{signal:task.signal,capture:true});`, 1, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "cleanup-arguments.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';declare function consume(signal?:AbortSignal):void;declare function nativeWork(options?:{signal?:AbortSignal}):void;declare const target:EventTarget;declare const optional:{signal?:AbortSignal};declare const nullable:{signal:AbortSignal|undefined};export function Page(){function run(task:TaskContext=TaskContext.client()){task.cleanup(()=>{` + c.body + `});}run();return()=> <output/>;}`})
			if r.Error != "" || len(r.Analysis.Tasks) != 1 || r.Code == "" {
				t.Fatalf("cleanup argument rejected: %s %#v", r.Error, r.Diagnostics)
			}
			calls := r.Analysis.Tasks[0].SignalCalls
			if len(calls) != c.calls || hasDiagnosticCode(r.Diagnostics, "EXACT2003") != c.warning {
				t.Fatalf("cleanup boundary changed: %#v %#v", calls, r.Diagnostics)
			}
			for _, call := range calls {
				if !call.ExistingOnly {
					t.Fatalf("cleanup injected implicit signal: %#v", call)
				}
			}
		})
	}
}
