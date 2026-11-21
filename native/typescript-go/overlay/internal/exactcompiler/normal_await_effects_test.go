package exactcompiler

import (
	"os"
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

// A component's retained normal Await owner must expose the actual inherited Get,
// not just a possible Promise payload or an unresolved task summary.
func TestPublicAwaitInheritedThenReceiver(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, row := range []struct {
			name, operand    string
			browser, unknown bool
		}{
			{"known", "receiver", true, false},
			{"mixed", "props.useKnown?receiver:props.foreign", true, true},
			{"quiet-known", "'quiet'", false, false},
		} {
			t.Run(string(target)+"/"+row.name, func(t *testing.T) {
				declarations := ""
				body := "await 'quiet';this.state.label='quiet';"
				if row.browser {
					declarations = `class Parent{seen=false;marker='receiver';get then():undefined{void document.title;this.seen=true;return undefined}}class Receiver extends Parent{}`
					body = `const receiver=new Receiver();await (` + row.operand + `);this.state.label=receiver.seen?receiver.marker:'missing getter';`
				}
				// The Await owns the inherited Get. Module scope keeps the class's identity
				// available before continuation capture considers the task.
				f := newPublicAwaitRequiredFixture(t, declarations+publicAwaitRequiredPage("", body, target))
				analysis, _ := checkPublicAwaitRequiredTask(t, NewSession(), f, target, row.browser, row.unknown)
				if row.name == "quiet-known" {
					quiet := findCallable(t, analysis.Analysis.Callables, "run")
					if quiet.Effect == "unknown" || analysis.Analysis.Tasks[0].EnvironmentEffect == "unknown" {
						t.Fatal("known quiet public effect stayed unknown")
					}
					for _, sources := range [][]EnvironmentEffectSource{quiet.EffectSources, analysis.Analysis.Tasks[0].EffectSources} {
						for _, effect := range sources {
							if effect.Environment == "unknown" {
								t.Fatal("known quiet Await became opaque", effect)
							}
						}
					}
				}
			})
		}
	}
}

// Both supplied protocol arguments evaluate their original operand. Only resolve
// assimilates its nested then getter; independent uncertainty cannot erase either donor.
func TestPublicAwaitNestedResolveReject(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, method := range []string{"resolve", "reject"} {
			for _, variant := range []string{"known", "mixed", "argument-throw"} {
				name := string(target) + "/" + method + "/" + variant
				operand := "outer"
				if variant == "mixed" {
					operand = "props.useKnown?outer:props.foreign"
				}
				t.Run(name, func(t *testing.T) {
					argument := "return nested"
					if variant == "argument-throw" {
						argument = "throw new Error('argument')"
					}
					body := `const nested={get then():undefined{void window.name;return undefined}};const input={get value(){void document.title;` + argument + `}};const outer={then(resolve:(value:unknown)=>void,reject:(reason:unknown)=>void){` + method + `(input.value)}};try{await (` + operand + `);this.state.label='resolved'}catch{this.state.label='rejected'}`
					f := newPublicAwaitRequiredFixture(t, publicAwaitRequiredPage("", body, target))
					analysis, _ := checkPublicAwaitRequiredTask(t, NewSession(), f, target, true, variant == "mixed")
					run := findCallable(t, analysis.Analysis.Callables, "run")
					for _, effects := range [][]EnvironmentEffectSource{run.EffectSources, analysis.Analysis.Tasks[0].EffectSources} {
						argument, assimilation := false, false
						for _, effect := range effects {
							argument = argument || strings.Contains(effect.Description, "document")
							assimilation = assimilation || strings.Contains(effect.Description, "window")
						}
						if !argument || variant != "argument-throw" && assimilation != (method == "resolve") {
							t.Fatal("public argument/assimilation requirements differ from protocol", method, effects)
						}
					}
				})
			}
		}
	}
}

// An async helper's checked primitive is not the Promise object returned by its
// Call. Preserve that object's authored constructor Get at the public task boundary.
func TestPublicAwaitAsyncPrimitiveConstructor(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			body := `const previous=Object.getOwnPropertyDescriptor(Promise.prototype,'constructor');try{Object.defineProperty(Promise.prototype,'constructor',{configurable:true,get(){void document.title;return Promise}});this.state.label=await make()}finally{if(previous)Object.defineProperty(Promise.prototype,'constructor',previous);else Reflect.deleteProperty(Promise.prototype,'constructor')}`
			f := newPublicAwaitRequiredFixture(t, publicAwaitRequiredPage(`async function make(){return 'primitive'}`, body, target))
			checkPublicAwaitRequiredTask(t, NewSession(), f, target, true, false)
		})
	}
}

// The same public getter consumer must not retain a retired browser requirement
// when its body changes, or derive a different decision from a fresh Session.
func TestPublicAwaitInheritedDonorEdit(t *testing.T) {
	browser := publicAwaitRequiredPage(`class Parent{get then():undefined{void document.title;return undefined}}class Receiver extends Parent{}`, `await new Receiver();this.state.label='done';`, TargetServer)
	quiet := strings.Replace(browser, "void document.title;", "void 0;", 1)
	f := newPublicAwaitRequiredFixture(t, browser)
	session := NewSession()
	checkPublicAwaitRequiredTask(t, session, f, TargetServer, true, false)
	f.files["entry.tsx"] = quiet
	if err := os.WriteFile(f.request("analyze", "entry.tsx").ID, []byte(quiet), 0600); err != nil {
		t.Fatal(err)
	}
	_, retained := checkPublicAwaitRequiredTask(t, session, f, TargetServer, false, false)
	_, fresh := checkPublicAwaitRequiredTask(t, NewSession(), f, TargetServer, false, false)
	if retained.Code != fresh.Code {
		t.Fatal("retained getter edit differs from fresh public compilation")
	}
}

func publicAwaitRequiredPage(declarations, body string, target Target) string {
	return `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{label:string}>,props:{useKnown:boolean;foreign:unknown}){this.state.label='initial';` + declarations + `;const run=async(task:TaskContext=TaskContext.` + string(target) + `())=>{` + body + `};return()=> <button onClick={()=>void run()}>{this.state.label}</button>}`
}

// Validate genuine component/task/state entry before testing an artifact decision.
// No successful value, hidden closure flag, or source membership is an oracle here.
func checkPublicAwaitRequiredTask(t *testing.T, session *Session, f *executableFixture, target Target, browser, unknown bool) (Response, Response) {
	t.Helper()
	analysis := session.Execute(f.request("analyze", "entry.tsx"))
	if analysis.Error != "" || len(analysis.Analysis.Tasks) != 1 || len(analysis.Analysis.Components) != 1 || analysis.Analysis.Components[0].Name != "Page" || !analysis.Analysis.Components[0].Exported {
		t.Fatal("real public Page/task entry absent", analysis.Error, analysis.Diagnostics)
	}
	for _, diagnostic := range analysis.Diagnostics {
		if diagnostic.Severity == "error" && !(browser && target == TargetServer && strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals")) {
			t.Fatal("public fixture has unexpected analysis error", diagnostic)
		}
	}
	run := findCallable(t, analysis.Analysis.Callables, "run")
	write := false
	for _, effect := range analysis.Analysis.Tasks[0].Writes {
		write = write || effect.Path == "label" || strings.HasSuffix(effect.Path, ".label")
	}
	if !write {
		t.Fatal("rendered task label has no public state write", analysis.Analysis.Tasks[0])
	}
	for _, effects := range [][]EnvironmentEffectSource{run.EffectSources, analysis.Analysis.Tasks[0].EffectSources} {
		got, unresolved := false, false
		for _, effect := range effects {
			got = got || effect.Environment == "browser"
			unresolved = unresolved || effect.Environment == "unknown"
		}
		if got != browser || unknown && !unresolved {
			t.Fatal("public Await donor/unknown lost", effects, browser, unknown)
		}
	}
	request := f.request("compile", "entry.tsx")
	request.Target = target
	compiled := session.Execute(request)
	denied := false
	for _, diagnostic := range compiled.Diagnostics {
		if diagnostic.Severity == "error" {
			if !strings.Contains(diagnostic.Message, "task requests server placement but references browser-only globals") {
				t.Fatal("public fixture has unexpected compile error", diagnostic)
			}
			denied = true
		}
	}
	if compiled.Error != "" || browser && target == TargetServer && (!denied || compiled.Code != "") || (!browser || target == TargetClient) && (hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "") {
		t.Fatal("public Await artifact decision", compiled.Error, compiled.Diagnostics)
	}
	if compiled.Code != "" && (!strings.Contains(compiled.Code, "taskAwait") || !strings.Contains(compiled.Code, ".signal")) {
		t.Fatal("public Await lost generation-aware lowering")
	}
	return analysis, compiled
}

// These component entries use the real module-scoped JSX contract, not a global
// ambient shim. Configure once before any request so the body-edit test retains
// one unchanged owning configuration across its observations.
func newPublicAwaitRequiredFixture(t *testing.T, source string) *executableFixture {
	t.Helper()
	f := newExecutableFixture(t, map[string]string{"entry.tsx": source})
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
	if err := os.WriteFile(f.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	return f
}

// Only Await supplies these protocol roles. Ordinary same-shaped callbacks and
// an authored replacement keep their own behavior; source membership is not a role.
func TestPublicAwaitResolverRoleRefusals(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, row := range []struct{ name, invoke, replacement string }{
			{"ordinary call", "outer.then((_value:unknown)=>undefined,(_reason:unknown)=>undefined);await 'quiet'", ""},
			{"replaced resolve", "await outer", "resolve=(_value:unknown)=>undefined;"},
		} {
			t.Run(string(target)+"/"+row.name, func(t *testing.T) {
				body := `const nested={get then():undefined{void window.name;return undefined}};const input={get value(){void document.title;return nested}};const outer={then(resolve:(value:unknown)=>void,reject:(reason:unknown)=>void){` + row.replacement + `resolve(input.value)}};` + row.invoke + `;this.state.label='done';`
				f := newPublicAwaitRequiredFixture(t, publicAwaitRequiredPage("", body, target))
				analysis, _ := checkPublicAwaitRequiredTask(t, NewSession(), f, target, true, false)
				run := findCallable(t, analysis.Analysis.Callables, "run")
				for _, effects := range [][]EnvironmentEffectSource{run.EffectSources, analysis.Analysis.Tasks[0].EffectSources} {
					for _, effect := range effects {
						if strings.Contains(effect.Description, "window") {
							t.Fatal("ordinary callback borrowed an Await resolve role", effect)
						}
					}
				}
			})
		}
	}
}

// A retired Await binder cannot qualify an ordinary callback in the next source
// generation. The real task loses its browser denial and agrees with a fresh Session.
func TestPublicAwaitResolverRoleEdit(t *testing.T) {
	body := `const nested={get then():undefined{void window.name;return undefined}};const input={get value(){return nested}};const outer={then(resolve:(value:unknown)=>void,reject:(reason:unknown)=>void){resolve(input.value)}};await outer;this.state.label='done';`
	before := publicAwaitRequiredPage("", body, TargetServer)
	after := strings.Replace(before, "await outer;", "outer.then((_value:unknown)=>undefined,(_reason:unknown)=>undefined);await 'quiet';", 1)
	f := newPublicAwaitRequiredFixture(t, before)
	session := NewSession()
	checkPublicAwaitRequiredTask(t, session, f, TargetServer, true, false)
	f.files["entry.tsx"] = after
	if err := os.WriteFile(f.request("analyze", "entry.tsx").ID, []byte(after), 0600); err != nil {
		t.Fatal(err)
	}
	retained, retainedCode := checkPublicAwaitRequiredTask(t, session, f, TargetServer, false, false)
	fresh, freshCode := checkPublicAwaitRequiredTask(t, NewSession(), f, TargetServer, false, false)
	if retainedCode.Code != freshCode.Code || retained.Analysis.Tasks[0].EnvironmentEffect != fresh.Analysis.Tasks[0].EnvironmentEffect {
		t.Fatal("retired Await role changed retained task output")
	}
}

// A task activation settles its own return even when the event discards it.
func TestSynchronousTaskReturnSettlementPlacement(t *testing.T) {
	for _, row := range []struct {
		name, body string
		browser    bool
	}{
		{"ignored-helper", "function make(){return known};void make();return 1", false},
		{"returned-object", "return known", true},
		{"ignored-getter", "const box={get value(){return props.selected ? known : props.foreign}};void box.value;return 1", false},
		{"returned-getter", "const box={get value(){return props.selected ? known : props.foreign}};return box.value", true},
		{"mixed-return", "return props.selected ? known : props.foreign", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				source := "import {TaskContext} from '@exactjs/core';" + `
export function Page(props:{selected:boolean;foreign:unknown}){
 const run=(task:TaskContext=TaskContext.` + string(target) + `())=>{
 const known={get then(){document.title;return undefined}};
 ` + row.body + `
 };
 return()=> <button onClick={()=>void run()}>Run</button>
}`
				fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 {
					t.Fatal(response.Error, response.Diagnostics)
				}
				task := response.Analysis.Tasks[0]
				unknown := false
				for _, effect := range task.EffectSources {
					unknown = unknown || effect.Environment == "unknown"
				}
				denied := row.browser && target == TargetServer
				if task.BrowserEffects != row.browser || (row.name == "mixed-return" || row.name == "returned-getter") && !unknown || hasErrorDiagnostic(response.Diagnostics) != denied || (response.Code == "") != denied {
					t.Fatal(task.EffectSources, response.Diagnostics)
				}
			})
		}
	}
}

// A prototype writer applies only to its execution target. The other task's
// selected constructor Get retains its own placement and original state write.
func TestPublicAwaitConstructorWriterTaskPlacement(t *testing.T) {
	const imports = `import {TaskContext,type Component} from '@exactjs/core';`
	const getter = `Object.defineProperty(Promise.prototype,'constructor',{configurable:true,get(){void document.title;return Promise}});`
	const reader = `async function make(){return 'value'};this.state.label=await make()`
	const writer = `const previous=Object.getOwnPropertyDescriptor(Promise.prototype,'constructor');try{` + getter + `async function create(){return 'own'};this.state.label=await create()}finally{if(previous)Object.defineProperty(Promise.prototype,'constructor',previous);else Reflect.deleteProperty(Promise.prototype,'constructor')}`
	// Optimistic work uses the invoking browser even for a server task.
	const optimistic = `task.optimistic(()=>{` + getter + `});this.state.label='server'`
	component := func(name, task, body string, placement Target) string {
		return `export function ` + name + `(this:Component<{label:string}>){this.state.label='';const ` + task + `=async(task:TaskContext=TaskContext.` + string(placement) + `())=>{` + body + `};return()=> <button onClick={()=>void ` + task + `() }>{this.state.label}</button>}`
	}
	for _, row := range []struct {
		name, write           string
		reader, writer        Target
		sameFile              bool
		readDonor, writeDonor bool
	}{
		{"imported-client-writer", writer, TargetServer, TargetClient, false, false, true},
		{"same-file-client-writer", writer, TargetServer, TargetClient, true, false, true},
		{"same-realm-server-writer", writer, TargetServer, TargetServer, true, true, true},
		{"same-realm-optimistic-writer", optimistic, TargetClient, TargetServer, true, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			page := imports + component("Page", "read", reader, row.reader)
			peer := component("Peer", "write", row.write, row.writer)
			if row.sameFile {
				page += "\n" + peer
			} else {
				page = `export {Peer} from './peer.js';` + page
			}
			f := newPublicAwaitRequiredFixture(t, page)
			if !row.sameFile {
				f.files["peer.tsx"] = imports + peer
				if err := os.WriteFile(f.request("compile", "peer.tsx").ID, []byte(imports+peer), 0600); err != nil {
					t.Fatal(err)
				}
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				compile := func(file string, denied bool) Response {
					t.Helper()
					request := f.request("compile", file)
					request.Target = target
					r := session.Execute(request)
					if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) != denied || (r.Code == "") != denied {
						t.Fatal(target, r.Error, r.Diagnostics)
					}
					return r
				}
				check := func(r Response, name string, browser bool) {
					t.Helper()
					c := findCallable(t, r.Analysis.Callables, name)
					got := false
					for _, effect := range c.EffectSources {
						got = got || effect.Environment == "browser" && strings.Contains(effect.Description, "document")
					}
					if got != browser {
						t.Fatal(target, name, got, c.EffectSources)
					}
				}
				r := compile("entry.tsx", row.reader == TargetServer && row.readDonor || row.sameFile && row.writer == TargetServer && row.writeDonor)
				check(r, "read", row.readDonor)
				if !row.sameFile {
					r = compile("peer.tsx", row.writer == TargetServer && row.writeDonor)
				}
				check(r, "write", row.writeDonor)
			}
		})
	}
}
