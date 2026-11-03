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
