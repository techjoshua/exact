package exactcompiler

import (
	"strings"
	"testing"
)

// A possible opaque receiver cannot erase a known then body's environment
// dependency before public task placement and artifact authorization.
func TestNormalAwaitConditionalThenEffects(t *testing.T) {
	for _, browser := range []bool{false, true} {
		for _, placement := range []Target{TargetServer, TargetClient} {
			name := string(placement)
			value := "'safe'"
			if browser {
				name += "-browser"
				value = "window.location.href"
			}
			t.Run(name, func(t *testing.T) {
				source := `import {TaskContext} from '@exactjs/core';
const known={then(resolve:(value:string)=>void){resolve(` + value + `)}};
export function Page(props:{known:boolean;foreign:unknown}){
const run=async(task:TaskContext=TaskContext.` + string(placement) + `())=>{await(props.known?known:props.foreign)};
return()=> <button onClick={()=>void run()}>Run</button>}`
				fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
				session := NewSession()
				analysis := session.Execute(fixture.request("analyze", "entry.tsx"))
				if analysis.Error != "" || len(analysis.Analysis.Tasks) != 1 {
					t.Fatal(analysis.Error, analysis.Diagnostics)
				}
				callable := findCallable(t, analysis.Analysis.Callables, "run")
				for _, sources := range [][]EnvironmentEffectSource{callable.EffectSources, analysis.Analysis.Tasks[0].EffectSources} {
					known, unknown := false, false
					for _, effect := range sources {
						known = known || effect.Environment == "browser"
						unknown = unknown || effect.Environment == "unknown"
					}
					if known != browser || !unknown {
						t.Errorf("public effects browser=%v unknown=%v, want %v/true: %#v", known, unknown, browser, sources)
					}
				}
				request := fixture.request("compile", "entry.tsx")
				request.Target = placement
				compiled := session.Execute(request)
				denied := false
				for _, diagnostic := range compiled.Diagnostics {
					denied = denied || diagnostic.Severity == "error" && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals")
				}
				if compiled.Error != "" || browser && placement == TargetServer && (!denied || compiled.Code != "") || (!browser || placement == TargetClient) && (hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "") {
					t.Fatal("incorrect Await artifact decision", compiled.Error, compiled.Diagnostics)
				}
				if placement == TargetClient && (!strings.Contains(compiled.Code, "taskAwait") || !strings.Contains(compiled.Code, ".signal")) {
					t.Fatal("authorized client task lost generation-aware Await lowering")
				}
			})
		}
	}
}

// Conditional, logical and saved operands share the same selected-receiver
// boundary. Their unknown alternative cannot remove a known environment donor.
func TestNormalAwaitAlternativeEffects(t *testing.T) {
	for _, row := range []struct{ name, prefix, operand, effect string }{
		{"conditional", "", "flag?known:foreign", "browser"},
		{"logical-or", "", "foreign||known", "browser"},
		{"logical-and", "", "flag&&known", "browser"},
		{"nullish", "", "foreign??known", "browser"},
		{"saved", "const selected=flag?known:foreign;", "selected", "browser"},
		{"server", "", "flag?known:foreign", "server"},
	} {
		t.Run(row.name, func(t *testing.T) {
			value := "window.location.href"
			if row.effect == "server" {
				value = "process.cwd()"
			}
			source := `declare const process:{cwd():string};export async function run(flag:boolean,foreign:unknown){const known={then(resolve:(value:string)=>void){resolve(` + value + `)}};` + row.prefix + `await(` + row.operand + `)}`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/normal-await-" + row.name + ".ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			callable := findCallable(t, response.Analysis.Callables, "run")
			known, unknown := false, false
			for _, effect := range callable.EffectSources {
				known = known || effect.Environment == row.effect
				unknown = unknown || effect.Environment == "unknown"
			}
			if !known || !unknown {
				t.Fatalf("Await lost known %s or unknown: %#v", row.effect, callable.EffectSources)
			}
		})
	}
}

// A then body's already known state dependencies must travel on the same
// public effect edge, independently of an opaque sibling operand.
func TestNormalAwaitStateEffects(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{value:number}>,props:{known:boolean;foreign:unknown}){
this.state.value=0;const owner=this;
const known={then(resolve:(value:number)=>void){owner.state.value++;resolve(owner.state.value)}};
const run=async(task:TaskContext=TaskContext.server())=>{await(props.known?known:props.foreign)};
return()=> <button onClick={()=>void run()}>Run</button>}`
	fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
	response := NewSession().Execute(fixture.request("analyze", "entry.tsx"))
	if response.Error != "" || len(response.Analysis.Tasks) != 1 {
		t.Fatal(response.Error, response.Diagnostics)
	}
	then := findCallable(t, response.Analysis.Callables, "then")
	run := findCallable(t, response.Analysis.Callables, "run")
	if len(then.StateReads) == 0 || len(then.StateWrites) == 0 {
		t.Fatal("fixture has no known state donor", then)
	}
	if len(run.StateReads) == 0 || len(run.StateWrites) == 0 || len(response.Analysis.Tasks[0].Reads) == 0 || len(response.Analysis.Tasks[0].Writes) == 0 {
		t.Fatal("Await lost known state donor", run, response.Analysis.Tasks)
	}
}

// Standard scalar settlement does not erase argument getters, authored shadows,
// constructor hooks or the unresolved assimilation work of non-scalar inputs.
func TestImmediateScalarPromiseAwaitAuthoredEffects(t *testing.T) {
	for _, row := range []struct{ name, before, operand, effect string }{
		{"argument-getter", `const input={get value(){return document.title}};`, `Promise.resolve(input.value)`, "browser"},
		{"shadow", `const Promise={resolve(value:string){document.title=value;return value}};`, `Promise.resolve('next')`, "browser"},
		{"constructor-hook", `Object.defineProperty(Promise.prototype,'constructor',{get(){document.title='constructor';return Promise}});`, `Promise.resolve('next')`, "browser"},
		{"unknown-input", "", `Promise.resolve(foreign)`, "unknown"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>,foreign:unknown){
this.state.label='initial';async function run(task:TaskContext=TaskContext.server()){
` + row.before + `await ` + row.operand + `;this.state.label='done';}
return()=> <button onClick={()=>void run()}>{this.state.label}</button>;}`
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
			session := NewSession()
			response := session.Execute(fixture.request("analyze", "entry.tsx"))
			if response.Error != "" || len(response.Analysis.Tasks) != 1 {
				t.Fatal("authored task analysis entry missing", response.Error, response.Diagnostics)
			}
			run := findCallable(t, response.Analysis.Callables, "run")
			for _, sources := range [][]EnvironmentEffectSource{run.EffectSources, response.Analysis.Tasks[0].EffectSources} {
				found := false
				for _, effect := range sources {
					found = found || effect.Environment == row.effect
				}
				if !found {
					t.Fatalf("actual %s obligation missing: %#v", row.effect, sources)
				}
			}
			if row.effect == "browser" {
				request := fixture.request("compile", "entry.tsx")
				request.Target = TargetServer
				compiled := session.Execute(request)
				denied := false
				for _, diagnostic := range compiled.Diagnostics {
					denied = denied || diagnostic.Severity == "error" && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals")
				}
				if compiled.Error != "" || !denied || compiled.Code != "" {
					t.Fatal("authored browser work acquired server artifact", compiled.Error, compiled.Diagnostics)
				}
			}
		})
	}
}

// A task owns its body Effects without executing in the caller. Argument work
// still belongs to the caller, and child uncertainty/settlement donors survive.
func TestTaskOwnedAwaitEffectBoundaries(t *testing.T) {
	for _, row := range []struct{ name, declarations, child, argument, runEffect, childEffect string }{
		{"caller-getter", "", `return value;`, `({get value(){return document.title}}).value`, "browser", ""},
		{"unknown-child", `declare function foreign():string;`, `return foreign();`, `'next'`, "unknown", "unknown"},
		{"async-child-then", "", `return {get then(){document.title='settlement';return undefined}};`, `'next'`, "unknown", "browser"},
	} {
		t.Run(row.name, func(t *testing.T) {
			async, policy := "", "TaskContext.latest().blocking()"
			if row.name == "async-child-then" {
				async = "async "
			}
			if row.name == "caller-getter" {
				policy = "TaskContext.server().blocking()"
			}
			source := `import {TaskContext,type Component} from '@exactjs/core';` + row.declarations + `
export function Page(this:Component<{label:string}>){this.state.label='initial';
` + async + `function child(value:string,task:TaskContext=TaskContext.latest().blocking()){` + row.child + `}
async function run(task:TaskContext=` + policy + `){await child(` + row.argument + `);this.state.label='done';}
return()=> <button onClick={()=>void run()}>{this.state.label}</button>;}`
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
			session := NewSession()
			response := session.Execute(fixture.request("analyze", "entry.tsx"))
			if response.Error != "" || len(response.Analysis.Tasks) != 2 {
				t.Fatal("real child/caller task entry missing", response.Error, response.Diagnostics)
			}
			run, child := findCallable(t, response.Analysis.Callables, "run"), findCallable(t, response.Analysis.Callables, "child")
			for _, check := range []struct {
				fact   CallableSummary
				effect string
			}{{run, row.runEffect}, {child, row.childEffect}} {
				expected := check.effect
				if expected == "" {
					expected = "browser"
				}
				found := false
				for _, effect := range check.fact.EffectSources {
					found = found || effect.Environment == expected
				}
				if found != (check.effect != "") {
					t.Fatalf("%s obligation %q incorrect: %#v", check.fact.Name, check.effect, check.fact.EffectSources)
				}
			}
			if row.name != "async-child-then" {
				compiled := session.Execute(fixture.request("compile", "entry.tsx"))
				if compiled.Error != "" || !hasDiagnosticCode(compiled.Diagnostics, "EXACT2001") || compiled.Code != "" {
					t.Fatal("unpaid caller/child Effects acquired artifact", compiled.Error, compiled.Diagnostics)
				}
			}
		})
	}
}

// Transport/type ownership still applies when the caller only observes a child
// task result. The awaited-result adapter supplies no assignment permission.
func TestTaskOwnedAwaitResultTypeRefuser(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{value:number}>){this.state.value=0;
function child(task:TaskContext=TaskContext.client()){return 'wrong';}
async function run(task:TaskContext=TaskContext.client()){this.state.value=await child();}
return()=> <button onClick={()=>void run()}>{this.state.value}</button>;}`
	fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
	response := NewSession().Execute(fixture.request("compile", "entry.tsx"))
	if response.Error != "" || !hasDiagnosticCode(response.Diagnostics, "TS2322") {
		t.Fatal("child-owned Effects authorized invalid awaited output", response.Error, response.Diagnostics)
	}
}

// The later Await operand has a receipts-only accumulator. Its genuine child
// dependency was already published on the same live caller fact by the Call.
func TestTaskOwnedAwaitRetainsCanonicalChildDependency(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>,suffix:string){this.state.label='initial';
function child(value:string,task:TaskContext=TaskContext.latest().blocking()){return value+suffix;}
async function run(value:string,task:TaskContext=TaskContext.latest().blocking()){this.state.label=await child(value);return this.state.label;}
return()=> <button onClick={()=>run('next')}>{this.state.label}</button>;}`
	fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
	session := NewSession()
	response := session.Execute(fixture.request("compile", "entry.tsx"))
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Tasks) != 2 {
		t.Fatal("original task/Await consumer rejected", response.Error, response.Diagnostics)
	}
	run, child := findCallable(t, response.Analysis.Callables, "run"), findCallable(t, response.Analysis.Callables, "child")
	retained := false
	for _, edge := range run.Calls {
		retained = retained || edge.Resolved && edge.TargetID == child.ID
	}
	if !retained {
		t.Fatal("accepted Await lost the original child Effects dependency", run.Calls)
	}
	for _, effect := range run.EffectSources {
		if effect.Environment == "unknown" {
			t.Fatal("known owned child acquired an opaque fallback", effect)
		}
	}
	checked := 0
	for _, project := range session.projects {
		for _, fact := range project.callableCache.merged.facts {
			if fact.summary.ID != run.ID && fact.summary.ID != child.ID {
				continue
			}
			checked++
			if fact.normalInputs != nil || len(fact.normalCalls) != 0 {
				t.Fatal("cached task retained live Call/frame authority", fact.summary.Name)
			}
			if publisher := project.callableCache.owner.pendingMemberPublishers[fact.node]; publisher != nil && publisher.live {
				t.Fatal("completed task retained a live original publisher", fact.summary.Name)
			}
		}
	}
	if checked < 2 {
		t.Fatal("original cached caller/child lifetime entry absent", checked)
	}
}
