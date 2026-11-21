package exactcompiler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// The fixture keeps authored typing roots separate from explicitly prepared execution roots.
type executableFixture struct {
	root       string
	session    *Session
	files      map[string]string
	generation uint64
}

func newExecutableFixture(t *testing.T, files map[string]string) *executableFixture {
	t.Helper()
	root, err := os.MkdirTemp(".", ".executable-selection-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	f := &executableFixture{root: root, session: NewSession(), files: files}
	for name, source := range files {
		if err := os.WriteFile(filepath.Join(f.root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true},"files":["entry.ts"]}`
	if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f *executableFixture) request(kind, file string) Request {
	return Request{Kind: kind, ID: filepath.Join(f.root, file), Source: f.files[file], Root: f.root, ConfigFile: filepath.Join(f.root, "tsconfig.json"), Diagnostics: "semantic"}
}

func (f *executableFixture) synchronize(edges []ExecutableEdge) Response {
	return f.synchronizeTarget(edges, TargetDefault)
}

func (f *executableFixture) synchronizeTarget(edges []ExecutableEdge, target Target) Response {
	f.generation++
	request := f.request("synchronize", "entry.ts")
	snapshot := &ExecutableSelection{Generation: f.generation, Revision: "fixture", Target: target, Edges: edges}
	for name, source := range f.files {
		id := filepath.Join(f.root, name)
		request.Sources = append(request.Sources, ProjectSource{ID: id, Source: source})
		snapshot.Modules = append(snapshot.Modules, ExecutableModule{ID: name, SourceID: id, ContentRevision: preparedContentRevision(source)})
	}
	request.ExecutableSelection = snapshot
	return f.session.Execute(request)
}

func executableSummary(t *testing.T, response Response, name string) CallableSummary {
	t.Helper()
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, summary := range response.Analysis.Callables {
		if summary.Name == name {
			return summary
		}
	}
	t.Fatalf("missing %s: %#v", name, response.Analysis.Callables)
	return CallableSummary{}
}

func assertExecutablePaths(t *testing.T, response Response, name, path string) {
	t.Helper()
	summary := executableSummary(t, response, name)
	if len(summary.StateWrites) != 1 || summary.StateWrites[0].Path != path {
		t.Fatalf("%s writes %#v, want %s", name, summary.StateWrites, path)
	}
}

// A host-selected body supplies effects while the authored signature still owns assignability.
func TestExecutableSelectionEffectsAndTyping(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":  `import {apply,answer} from './helper.js';export const n:number=answer();export function run(state:{a:number,b:number}){apply(state);}import type {Component} from '@exactjs/core';export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;run(this.state);return()=>this.state.b;}`,
		"helper.ts": `export function apply(state:{a:number,b:number}){state.a=2;}export function answer():number{return 2;}`,
		"helper.js": `/** @param {{a:number,b:number}} state */ export let apply=(state)=>{state.b=99;};export function answer(){return "host";}`,
	})
	assertExecutablePaths(t, f.session.Execute(f.request("analyze", "entry.ts")), "run", "a")
	if r := f.synchronize([]ExecutableEdge{{Importer: "entry.ts", Slot: 0, Specifier: "./helper.js", Kind: "import", Selected: "helper.js"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	assertExecutablePaths(t, response, "run", "b")
	if len(response.Diagnostics) != 0 {
		t.Fatalf("authored number signature changed: %#v", response.Diagnostics)
	}
	// A real type error remains visible in the same augmented program.
	f.files["entry.ts"] = strings.Replace(f.files["entry.ts"], "n:number", "n:string", 1)
	// The edited entry needs a fresh snapshot before checking the same selected body.
	if r := f.synchronize([]ExecutableEdge{{Importer: "entry.ts", Slot: 0, Specifier: "./helper.js", Kind: "import", Selected: "helper.js"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	response = f.session.Execute(f.request("analyze", "entry.ts"))
	found := false
	for _, d := range response.Diagnostics {
		found = found || d.Code == "TS2322"
	}
	if !found {
		t.Fatalf("lost authored error: %#v", response.Diagnostics)
	}
}

// Import slots sharing one typed declaration can select different physical bodies.
func TestExecutableSelectionSlotsTransitiveAndBarrels(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts": `import {apply as left} from './helper.js';
import {apply as right} from './helper.js';
import {run as barrel} from './barrel.js';
import * as ns from './helper.js';
import type {Component} from '@exactjs/core';
type State = {a:number,b:number};
const alias=right, nsAlias=ns;
export function a(s:State){left(s);}
export function b(s:State){alias(s);}
export function c(s:State){barrel(s);}
export function d(s:State){ns.apply(s);}
export function e(s:State){nsAlias.apply(s);}
export function Page(this:Component<State>){
	this.state.a=0; this.state.b=0;
	a(this.state); b(this.state); c(this.state); d(this.state); e(this.state);
	return ()=>this.state.a+this.state.b;
}`,
		"helper.ts": `export function apply(s:{a:number,b:number}){s.a=1;}`,
		"helper.js": `import {leaf} from './leaf.js';export function apply(s){leaf(s);}`,
		"other.js":  `export function apply(s){s.a=7;}`,
		"leaf.ts":   `export function leaf(s:{a:number,b:number}){s.a=3;}`,
		"leaf.js":   `export function leaf(s){s.b=9;}`,
		"barrel.ts": `export {apply as run} from './helper.js';`,
		"barrel.js": `export {apply as run} from './helper.js';`,
	})
	edges := []ExecutableEdge{
		{"entry.ts", 0, "./helper.js", "import", "other.js"},
		{"entry.ts", 1, "./helper.js", "import", "helper.js"},
		{"entry.ts", 2, "./barrel.js", "import", "barrel.js"},
		{"entry.ts", 3, "./helper.js", "import", "helper.js"},
		{"helper.js", 0, "./leaf.js", "import", "leaf.js"},
		{"barrel.js", 0, "./helper.js", "import", "helper.js"},
	}
	if r := f.synchronize(edges); r.Error != "" {
		t.Fatal(r.Error)
	}
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	assertExecutablePaths(t, response, "a", "a")
	for _, name := range []string{"b", "c", "d", "e"} {
		assertExecutablePaths(t, response, name, "b")
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", response.Diagnostics)
	}
}

func TestExecutableSelectionEnvironmentAndTransitions(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":  `import {read} from './helper.js';export function run(){return read();}export function Page(){return ()=>run()}`,
		"helper.ts": `export function read(){return "typed";}`,
		"helper.js": `export function read(){return document.title;}`,
	})
	edge := ExecutableEdge{"entry.ts", 0, "./helper.js", "import", "helper.js"}
	for _, selection := range []string{"helper.js", "helper.ts", "helper.js", ""} {
		edge.Selected = selection
		if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
			t.Fatal(r.Error)
		}
		summary := executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
		want := "browser"
		if selection == "helper.ts" {
			want = "neutral"
		}
		if selection == "" {
			want = "unknown"
		}
		if summary.Effect != want {
			t.Fatalf("%s effect %s, want %s", selection, summary.Effect, want)
		}
	}
	// A changed selected source cannot reuse the prior browser summary or authority.
	f.files["helper.js"] = `export function read(){return "updated";}`
	edge.Selected = "helper.js"
	if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
		t.Fatal(r.Error)
	}
	summary := executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
	if summary.Effect != "neutral" {
		t.Fatalf("stale effect %s", summary.Effect)
	}
	compile := f.session.Execute(f.request("compile", "entry.ts"))
	if compile.Error != "" || len(compile.Diagnostics) != 0 {
		t.Fatalf("selected lowering failed: %s %#v", compile.Error, compile.Diagnostics)
	}
	f.session.Execute(Request{Kind: "reset"})
	summary = executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
	if summary.Effect != "neutral" {
		t.Fatalf("reset retained selection %s", summary.Effect)
	}
}

// Execution-only globals cannot erase authored errors, and readonly stays shallow.
func TestExecutableSelectionDiagnosticIsolation(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":   `import {read} from './helper.js';export const n:number=read();export const x=selectedRuntimeGlobal;export function valid(v:Readonly<{nested:{value:number}}>) { v.nested.value++;const alias:{nested:{value:number}}=v;alias.nested={value:2}; }export function invalid(v:Readonly<{value:number}>) { v.value=2; }export function Page(props:{readonly value:number,nested:{value:number}}){props.nested.value=3;const alias:{value:number,nested:{value:number}}=props;alias.value=4;return()=>props.value;}`,
		"helper.ts":  `export function read():number{return 2;}`,
		"helper.js":  `import './augment.js';export function read(){return "host";}`,
		"augment.ts": `export {};declare global {var selectedRuntimeGlobal:number;}`,
	})
	before := f.session.Execute(f.request("analyze", "entry.ts"))
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}, {"helper.js", 0, "./augment.js", "import", "augment.ts"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	after := f.session.Execute(f.request("analyze", "entry.ts"))
	for _, response := range []Response{before, after} {
		codes := map[string]int{}
		for _, d := range response.Diagnostics {
			codes[d.Code]++
		}
		if codes["TS2304"] != 1 || codes["TS2540"] != 1 || len(response.Diagnostics) != 2 {
			t.Fatalf("diagnostic universe changed: %#v", response.Diagnostics)
		}
	}
}

func TestExecutableSelectionValidation(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{"entry.ts": `import {run} from './helper.js';export function call(){return run();}`, "helper.ts": `export function run(){return 1;}`, "helper.js": `export function run(){return 2;}`})
	edge := ExecutableEdge{"entry.ts", 0, "./helper.js", "import", "helper.js"}
	if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
		t.Fatal(r.Error)
	}
	project := f.session.projects[nativeProjectKey(f.request("analyze", "entry.ts"), filepath.Join(f.root, "entry.ts"))]
	snapshot := project.executableSelection.snapshot
	for _, mutate := range []func(*ExecutableSelection){
		func(s *ExecutableSelection) { s.Generation = 0 },
		func(s *ExecutableSelection) { s.Revision = "" },
		func(s *ExecutableSelection) { s.Target = "bad" },
		func(s *ExecutableSelection) { s.Revision = "older" },
		func(s *ExecutableSelection) { s.Generation++; s.Modules = append(s.Modules, s.Modules[0]) },
		func(s *ExecutableSelection) { s.Generation++; s.Edges = append(s.Edges, s.Edges[0]) },
		func(s *ExecutableSelection) { s.Generation++; s.Modules[0].ContentRevision = "stale" },
		func(s *ExecutableSelection) { s.Generation++; s.Edges[0].Selected = "missing" },
	} {
		candidate := snapshot
		candidate.Modules = append([]ExecutableModule(nil), snapshot.Modules...)
		candidate.Edges = append([]ExecutableEdge(nil), snapshot.Edges...)
		mutate(&candidate)
		request := f.request("synchronize", "entry.ts")
		request.ExecutableSelection = &candidate
		for name, source := range f.files {
			request.Sources = append(request.Sources, ProjectSource{ID: filepath.Join(f.root, name), Source: source})
		}
		if r := f.session.Execute(request); r.Error == "" {
			t.Fatalf("invalid selection accepted: %#v", candidate)
		}
	}
	// A delayed unselected batch cannot erase newer selection. Replacements drop stale edges.
	request := f.request("synchronize", "entry.ts")
	for name, source := range f.files {
		request.Sources = append(request.Sources, ProjectSource{ID: filepath.Join(f.root, name), Source: source})
	}
	if r := f.session.Execute(request); r.Error == "" {
		t.Fatal("unselected batch erased selection")
	}
	replacement := snapshot
	replacement.Generation++
	replacement.Edges = nil
	request.ExecutableSelection = &replacement
	if r := f.session.Execute(request); r.Error != "" {
		t.Fatal(r.Error)
	}
	request.ExecutableSelection = &snapshot
	if r := f.session.Execute(request); r.Error == "" {
		t.Fatal("stale selection resurrected after replacement")
	}
}

// Task authority and continuation contracts consume selected facts before construction.
func TestExecutableSelectionTaskAuthority(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":  `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.js';export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;function save(task:TaskContext=TaskContext.server().blocking()){apply(this.state,this);}save();return()=>this.state.b;}`,
		"helper.ts": `import type {Component} from '@exactjs/core';const TypedToken={};export function apply(state:{a:number,b:number},owner:Component<{}>){state.a=2;owner.getContext(TypedToken);}`,
		"helper.js": `const RuntimeToken={};/** @param {{a:number,b:number}} state @param {import('@exactjs/core').Component<{}>} owner */ export function apply(state,owner){state.b=99;owner.getContext(RuntimeToken);}`,
	})
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 1, "./helper.js", "import", "helper.js"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, task := range response.Analysis.Tasks {
		for _, effect := range task.EffectSources {
			if strings.Contains(effect.Description, "TaskContext") {
				t.Fatalf("policy syntax acquired runtime effects: %#v", effect)
			}
		}
	}
	if len(response.Analysis.Continuations) == 0 {
		t.Fatalf("missing contracts: %#v", response.Analysis.Tasks)
	}
	for _, continuation := range response.Analysis.Continuations {
		if len(continuation.Effects.StateWrites) != 1 || continuation.Effects.StateWrites[0].Path != "b" || continuation.Effects.StateWrites[0].Receiver == nil || continuation.Effects.StateWrites[0].Receiver.Kind != "component" {
			t.Fatalf("wrong write authority: %#v, tasks %#v, callables %#v", continuation.Effects, response.Analysis.Tasks, response.Analysis.Callables)
		}
	}
	found := false
	for _, task := range response.Analysis.Tasks {
		for _, context := range task.Contexts {
			if context.Token == "TypedToken" {
				t.Fatal("typed context retained")
			}
			found = found || context.Token == "RuntimeToken"
		}
	}
	// Native JS body typing does not prove this JSDoc receiver's context here.
	// Check selected context ownership with a typed executable body independently.
	_ = found
	f.files["other.ts"] = `import type {Component} from '@exactjs/core';const RuntimeToken={};export function apply(state:{a:number,b:number},owner:Component<{}>){state.b=99;owner.getContext(RuntimeToken);}`
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 1, "./helper.js", "import", "other.ts"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	response = f.session.Execute(f.request("analyze", "entry.ts"))
	found = false
	for _, task := range response.Analysis.Tasks {
		for _, context := range task.Contexts {
			if context.Token == "TypedToken" {
				t.Fatal("typed context retained")
			}
			found = found || context.Token == "RuntimeToken"
		}
	}
	if !found {
		t.Fatalf("selected context missing: %#v", response.Analysis.Tasks)
	}
}

// Body-inferred secrecy is per call slot, including transitive return calls.
func TestExecutableSelectionResultPolicies(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":  `import {read as typed} from './helper.js';import {read as selected} from './helper.js';export const a=typed();export const b=selected();`,
		"helper.ts": `export function read(){return "typed";}`,
		"helper.js": `import {leaf} from './leaf.js';export function read(){return leaf();}`,
		"leaf.ts":   `export function leaf(){return "typed";}`,
		"leaf.js":   `/** @exact keep=secret */ const hidden="host";export function leaf(){return hidden;}`,
	})
	edges := []ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.ts"}, {"entry.ts", 1, "./helper.js", "import", "helper.js"}, {"helper.js", 0, "./leaf.js", "import", "leaf.js"}}
	if r := f.synchronize(edges); r.Error != "" {
		t.Fatal(r.Error)
	}
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	seen := map[string]bool{}
	for _, subject := range response.Analysis.Policy.Subjects {
		if subject.Kind == "return" {
			seen[subject.Name] = subject.Policy.Secret
		}
	}
	if seen["typed"] || !seen["selected"] {
		t.Fatalf("selected policy lost/collapsed: %#v", response.Analysis.Policy.Subjects)
	}
}

// Added execution roots may have identical offsets. Dormant ranges remain source-local.
func TestExecutableSelectionDormantSpans(t *testing.T) {
	source := `export function Page(){function browser(){return window.innerWidth;}return()=>"ok";}`
	f := newExecutableFixture(t, map[string]string{"entry.ts": source, "other.ts": source})
	if r := f.synchronize(nil); r.Error != "" {
		t.Fatal(r.Error)
	}
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	project := f.session.projects[nativeProjectKey(f.request("analyze", "entry.ts"), filepath.Join(f.root, "entry.ts"))]
	generation, err := project.advance(context.Background(), filepath.Join(f.root, "entry.ts"), source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	component := generation.sourceFile.Statements.Nodes[0]
	spans := componentDormantCallableSpans(component, project.callableCache.merged, generation.checker)
	if len(spans) != 1 || spans[0].Start != strings.Index(source, "function browser") {
		t.Fatalf("foreign roots changed local dormant spans: %#v", spans)
	}
}

func TestExecutableSelectionSiblingSuffixes(t *testing.T) {
	for _, pair := range []struct{ typed, selected, source string }{
		{"helper.mts", "helper.mjs", `export function apply(s){s.b=9;}`},
		{"helper.cts", "helper.cjs", `function apply(s){s.b=9;}module.exports={apply};`},
	} {
		t.Run(pair.selected, func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":    `import {apply} from './` + pair.selected + `';export function run(s:{a:number,b:number}){apply(s);}export function Page(){const state={a:0,b:0};run(state);return ()=>state.b}`,
				pair.typed:    `export function apply(s:{a:number,b:number}){s.a=2;}`,
				pair.selected: pair.source,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./" + pair.selected, "import", pair.selected}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			assertExecutablePaths(t, f.session.Execute(f.request("analyze", "entry.ts")), "run", "b")
		})
	}
}

func TestExecutableSelectionMissingAndStaleBodies(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":    `import {apply} from './helper.js';import {TaskContext,type Component} from '@exactjs/core';export function run(s:{a:number,b:number}){apply(s);}export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;const save=(task:TaskContext=TaskContext.server().blocking())=>{run(this.state);};save();return()=>this.state.b;}`,
		"helper.ts":   `export function apply(s:{a:number,b:number}){s.a=2;}`,
		"helper.js":   `export function apply(s){s.b=9;}`,
		"opaque.d.ts": `export declare function apply(s:{a:number,b:number}):void;`,
		"mutable.js":  `export let apply=(s)=>{s.a=2;};apply=(s)=>{s.b=3;};`,
	})
	// The original run/apply path is required by a real component-owned task.
	// Ordinary exported functions alone intentionally do not demand body closure.
	requireEntry := func(response Response) {
		t.Helper()
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		component, task := false, false
		for _, candidate := range response.Analysis.Components {
			component = component || candidate.Name == "Page"
		}
		for _, candidate := range response.Analysis.Tasks {
			task = task || candidate.Component == "Page" && candidate.FunctionDefined && candidate.RequestedPlacement == "server" && candidate.WorkLength > 0
		}
		if !component || !task {
			t.Fatalf("component/task prerequisite not reached: components %#v tasks %#v", response.Analysis.Components, response.Analysis.Tasks)
		}
	}
	// Establish the supported selected body before checking any refusal. The
	// ordinary helper import remains slot0; core at slot1 cannot validate it.
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	positive := f.session.Execute(f.request("analyze", "entry.ts"))
	requireEntry(positive)
	summary := executableSummary(t, positive, "run")
	if len(summary.StateWrites) != 1 || summary.StateWrites[0].Path != "b" || summary.StateWrites[0].Receiver == nil || summary.StateWrites[0].Receiver.Kind != "parameter" {
		t.Fatalf("selected run body lost: %#v", summary)
	}
	typed := false
	for _, edge := range positive.Analysis.Imports {
		if edge.ModuleSpecifier == "./helper.js" {
			typed = edge.ResolvedFile == filepath.Join(f.root, "helper.ts")
		}
	}
	if !typed {
		t.Fatalf("authored typing identity changed: %#v", positive.Analysis.Imports)
	}
	if len(positive.Analysis.Continuations) == 0 {
		t.Fatalf("missing actual task contracts: %#v", positive.Analysis.Tasks)
	}
	for _, continuation := range positive.Analysis.Continuations {
		if len(continuation.Effects.StateWrites) != 1 || continuation.Effects.StateWrites[0].Path != "b" || continuation.Effects.StateWrites[0].Receiver == nil || continuation.Effects.StateWrites[0].Receiver.Kind != "component" {
			t.Fatalf("wrong component task write authority: %#v", continuation.Effects)
		}
	}
	for _, edges := range [][]ExecutableEdge{
		{{"entry.ts", 0, "./helper.js", "import", ""}},
		{{"entry.ts", 0, "./helper.js", "import", "opaque.d.ts"}},
		{{"entry.ts", 0, "./helper.js", "import", "mutable.js"}},
		nil,
		{{"entry.ts", 1, "./helper.js", "import", "helper.js"}},
	} {
		if r := f.synchronize(edges); r.Error != "" {
			t.Fatal(r.Error)
		}
		response := f.session.Execute(f.request("analyze", "entry.ts"))
		requireEntry(response)
		summary := executableSummary(t, response, "run")
		if len(summary.StateWrites) != 0 || summary.Effect != "unknown" {
			t.Fatalf("opaque edge gained authority: %#v", summary)
		}
	}
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	f.files["helper.js"] = `export function apply(s){s.a=77;}`
	f.session.Execute(f.request("analyze", "helper.js"))
	response := f.session.Execute(f.request("analyze", "entry.ts"))
	requireEntry(response)
	summary = executableSummary(t, response, "run")
	if len(summary.StateWrites) != 0 || summary.Effect != "unknown" {
		t.Fatalf("changed source retained stale authority: %#v", summary)
	}
}

func TestExecutableSelectionConfigRevision(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export const n:number=null;`, "helper.js": `export function read(){return 1;}`})
	if r := f.synchronize(nil); r.Error != "" {
		t.Fatal(r.Error)
	}
	before := f.session.Execute(f.request("analyze", "entry.ts"))
	if !hasDiagnosticCode(before.Diagnostics, "TS2322") {
		t.Fatalf("missing strict control: %#v", before.Diagnostics)
	}
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":false,"skipLibCheck":true},"files":["entry.ts"]}`
	if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	if r := f.synchronize(nil); r.Error != "" {
		t.Fatal(r.Error)
	}
	after := f.session.Execute(f.request("analyze", "entry.ts"))
	if len(after.Diagnostics) != 0 {
		t.Fatalf("stale configuration proof: %#v", after.Diagnostics)
	}
}

// Preparing executable helper facts does not rewrite an ordinary caller into a
// task-owned entry or replace the import specifier resolved by the host.
func TestExecutableSelectionOrdinaryHelperImport(t *testing.T) {
	for _, selected := range []string{"helper.js", "helper.ts"} {
		f := newExecutableFixture(t, map[string]string{
			"entry.ts":  `import {apply} from './helper.js';export function invoke(state:{a:number,b:number}){apply(state);}`,
			"helper.ts": `export function apply(state:{a:number,b:number}){state.a=2;}`,
			"helper.js": `/** @param {{a:number,b:number}} state */ export function apply(state){state.b=99;}`,
		})
		if r := f.synchronizeTarget([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", selected}}, TargetServer); r.Error != "" {
			t.Fatal(r.Error)
		}
		request := f.request("compile", "entry.ts")
		request.Target = TargetServer
		r := f.session.Execute(request)
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || !containsString(executableImportBindings(r.Code, "./helper.js"), "apply") || strings.Contains(r.Code, "__exact_owned_") {
			t.Fatalf("ordinary helper acquired private ownership: %s %#v\n%s", r.Error, r.Diagnostics, r.Code)
		}
	}
}

// Parse import bindings so quote style and printer spacing are not contracts.
func executableImportBindings(code, module string) []string {
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/generated.ts", Path: tspath.Path("/generated.ts")}, code, core.ScriptKindTS)
	var result []string
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !ast.IsImportDeclaration(node) {
			return true
		}
		declaration := node.AsImportDeclaration()
		if declaration.ModuleSpecifier.Text() != module || declaration.ImportClause == nil {
			return false
		}
		bindings := declaration.ImportClause.AsImportClause().NamedBindings
		if bindings != nil && ast.IsNamedImports(bindings) {
			for _, item := range bindings.AsNamedImports().Elements.Nodes {
				name := item.AsImportSpecifier().PropertyName
				if name == nil {
					name = item.Name()
				}
				result = append(result, name.Text())
			}
		}
		return false
	})
	return result
}

// A host snapshot owns executable source, while published declaration-only operations
// retain their environment contract. It never authorizes a private implementation.
func TestExecutableSelectionPublishedDeclarationOperations(t *testing.T) {
	for _, example := range []struct{ name, source, effect, selected string }{
		{"browser", `import {render} from '@exactjs/dom'; export function run(input:Parameters<typeof render>[0],root:Element){render(input,root)}`, "browser", ""},
		{"browser-namespace", `import * as DOM from '@exactjs/dom'; export function run(input:Parameters<typeof DOM.render>[0],root:Element){DOM['render'](input,root)}`, "browser", ""},
		{"policy-value", `import {TaskContext} from '@exactjs/core';export function Page(){function run(task:TaskContext=TaskContext.latest()){return 1}return ()=>run()}`, "neutral", ""},
		{"neutral", `import {reactive} from '@exactjs/reactive'; export function run(){return reactive({value:1})}`, "neutral", ""},
		{"server", `import {platform} from 'node:os'; export function run(){return platform()}`, "server", ""},
		{"unowned-local", `import {read} from './unowned.js'; export function run(){return read()}`, "unknown", ""},
		{"selected-replacement", `import {render} from '@exactjs/dom'; export function run(input:Parameters<typeof render>[0],root:Element){render(input,root)}`, "server", "replacement.js"},
	} {
		t.Run(example.name, func(t *testing.T) {
			source := example.source
			switch example.name {
			case "browser", "browser-namespace", "selected-replacement":
				source += "export function Page(props:{input:Parameters<typeof run>[0],root:Element}){run(props.input,props.root);return ()=>null}"
			case "policy-value":
				// The policy default is consumed by its owning component task.
			default:
				source += "export function Page(){return ()=>run()}"
			}
			f := newExecutableFixture(t, map[string]string{"entry.ts": source, "unowned.d.ts": `export declare function read():number;`, "replacement.js": `export function render(){void process.version;}`})
			if example.name == "server" {
				config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"types":["node"]},"files":["entry.ts"]}`
				if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
					t.Fatal(err)
				}
			}
			before := f.session.Execute(f.request("analyze", "entry.ts"))
			if len(before.Analysis.Imports) == 0 {
				t.Fatalf("missing actual import: %#v", before)
			}
			edge := ExecutableEdge{Importer: "entry.ts", Slot: 0, Specifier: before.Analysis.Imports[0].ModuleSpecifier, Kind: "import", Selected: example.selected}
			if response := f.synchronize([]ExecutableEdge{edge}); response.Error != "" {
				t.Fatal(response.Error)
			}
			response := f.session.Execute(f.request("analyze", "entry.ts"))
			if len(response.Diagnostics) != 0 {
				t.Fatalf("invalid authored control: %#v", response.Diagnostics)
			}
			summary := executableSummary(t, response, "run")
			if summary.Effect != example.effect {
				t.Fatalf("%s lost operation contract: %#v", example.name, summary)
			}
		})
	}
}

// Checked casing must preserve the original selected input, not bless another
// authored spelling which happens to normalize to the same generated text.
func TestExecutableSelectionCheckedCasingIdentity(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.tsx": `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.js';export function Page(this:Component<{value:number}>){this.state.value=0;const save=(task:TaskContext=TaskContext.server().blocking())=>{apply(this.state);};return()=> <button onclick={()=>save()}>Save</button>;}`,
		"entry.ts":  `export {};`,
		"helper.ts": `export function apply(state:{value:number}){state.value=2;}`,
		"helper.js": `/** @param {{value:number}} state */ export function apply(state){state.value=99;}`,
	})
	edges := []ExecutableEdge{{"entry.tsx", 1, "./helper.js", "import", "helper.js"}}
	if r := f.synchronizeTarget(edges, TargetServer); r.Error != "" {
		t.Fatal(r.Error)
	}
	compile := func() Response {
		request := f.request("compile", "entry.tsx")
		request.Target = TargetServer
		request.Diagnostics = "syntax"
		return f.session.Execute(request)
	}
	hasSelectedValueWrite := func(response Response) bool {
		for _, task := range response.Analysis.Tasks {
			for _, write := range task.Writes {
				if write.Path == "value" && write.Confidence == "exact" {
					return true
				}
			}
		}
		return false
	}
	initial := compile()
	if initial.Error != "" || len(initial.Diagnostics) != 0 || !hasSelectedValueWrite(initial) {
		t.Fatalf("original checked input lost: %s %#v\n%s", initial.Error, initial.Diagnostics, initial.Code)
	}
	f.files["entry.tsx"] = strings.ReplaceAll(f.files["entry.tsx"], "onclick=", "onCLICK=")
	stale := compile()
	if stale.Error != "" || hasSelectedValueWrite(stale) {
		t.Fatalf("different authored input gained stale selection: %s\n%s", stale.Error, stale.Code)
	}
	if r := f.synchronizeTarget(edges, TargetServer); r.Error != "" {
		t.Fatal(r.Error)
	}
	renewed := compile()
	if renewed.Error != "" || len(renewed.Diagnostics) != 0 || !hasSelectedValueWrite(renewed) {
		t.Fatalf("fresh selection not renewed: %s %#v\n%s", renewed.Error, renewed.Diagnostics, renewed.Code)
	}
}
