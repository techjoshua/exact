package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A component entry must account for saved function execution and the property Get
// independently. Source stays ordinary and the callback property remains uninvoked.
const callableEntrySource = `function source(){return 0}
source.run=()=>0;
const box={member:source};
const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`

func callableEntryRequest(t *testing.T, source string, target Target) Request {
	t.Helper()
	dir, e := os.MkdirTemp(".", ".callable-entry-")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	dir, e = filepath.Abs(dir)
	if e != nil {
		t.Fatal(e)
	}
	config := filepath.Join(dir, "tsconfig.json")
	if e = os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true,"types":["node"],"lib":["ES2022","DOM"],"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx","noEmit":true},"include":["*.tsx"]}`), 0600); e != nil {
		t.Fatal(e)
	}
	if target == TargetServer {
		source = strings.Replace(source, "saved.run=()=>document.title.length;", "saved.run=()=>process.pid;", 1)
	}
	request := Request{Kind: "compile", ID: filepath.Join(dir, "entry.tsx"), Root: dir, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"}
	qualification := NewSession().validateAuthoredJavaScript(request)
	if qualification.Error != "" || hasErrorDiagnostic(qualification.Diagnostics) {
		t.Fatalf("invalid authored source: %s %#v", qualification.Error, qualification.Diagnostics)
	}
	return request
}
func callableEntryPage(t *testing.T, response Response) Component {
	t.Helper()
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, d := range response.Diagnostics {
		if d.Severity == "error" && d.Code != "EXACT2101" {
			t.Fatalf("unexpected diagnostic: %#v", d)
		}
	}
	for _, page := range response.Analysis.Components {
		if page.Name == "Page" {
			return page
		}
	}
	t.Fatal("lost Page")
	return Component{}
}
func assertCallableEntryBody(t *testing.T, response Response, name, environment string, unknown bool) {
	t.Helper()
	page := executableSummary(t, response, "Page")
	body := executableSummary(t, response, name)
	edge, effect, opaque := false, environment == "", false
	for _, call := range page.Calls {
		edge = edge || call.Resolved && call.TargetID == body.ID
	}
	for _, source := range page.EffectSources {
		effect = effect || source.Environment == environment
		opaque = opaque || source.Environment == "unknown"
	}
	if !edge || !effect || unknown && !opaque {
		t.Fatalf("lost source edge/effect or alternative: %#v", page)
	}
}
func TestSourceCallableEntryOwnership(t *testing.T) {
	for _, test := range []struct {
		name, source      string
		neutral, bodyEdge bool
	}{
		{"exact-positive", callableEntrySource, true, true},
		{"prototype-setter-before-allocation", `Object.defineProperty(Function.prototype,'run',{configurable:true,set(value:unknown){void document.title}});` + callableEntrySource, false, true},
		{"own-getter-after-allocation", callableEntrySource + `export function mutate(){Object.defineProperty(source,'run',{get(){return document.title}})}export function enter(){mutate();return <Page/>}`, false, true},
		{"own-setter-after-allocation", callableEntrySource + `export function mutate(){Object.defineProperty(source,'run',{set(value:unknown){void document.title}})}export function enter(){mutate();return <Page/>}`, false, true},
		{"alias-descriptor", callableEntrySource + `const alias=source;export function mutate(){Object.defineProperty(alias,'run',{get(){return document.title}})}export function enter(){mutate();return <Page/>}`, false, true},
		{"exposed-container", callableEntrySource + `export const exposed=box;`, true, true},
		{"returned-container", callableEntrySource + `export function expose(){return box}`, true, true},
		{"escaped-container", callableEntrySource + `declare function escape(value:unknown):void;escape(box);`, false, true},
		{"unknown-startup", `declare function startup():void;startup();` + callableEntrySource, true, true},
		{"proxy-receiver", strings.Replace(callableEntrySource, `box.member`, `new Proxy(box.member,{get(target,key,receiver){return Reflect.get(target,key,receiver)}})`, 1), false, false},
		{"private-arrow", strings.Replace(callableEntrySource, `function source(){return 0}`, `const source=()=>0;`, 1), true, true},
		{"private-function-expression", strings.Replace(callableEntrySource, `function source(){return 0}`, `const source=function(){return 0};`, 1), true, true},
		{"exported-arrow", strings.Replace(callableEntrySource, `function source(){return 0}`, `export const source=()=>0;`, 1), true, true},
		{"exported-function-expression", strings.Replace(callableEntrySource, `function source(){return 0}`, `export const source=function(){return 0};`, 1), true, true},
		{"exported-function-declaration", `export ` + callableEntrySource, true, true},
		{"export-list-source", callableEntrySource + `
export {source};
`, true, true},
		{"export-list-box", callableEntrySource + `
export {box};
`, true, true},
		{"export-alias-source", callableEntrySource + `
export {source as shared};
`, true, true},
		{"export-alias-box", callableEntrySource + `
const publicAlias=box;export {publicAlias as shared};
`, true, true},
		{"default-source", callableEntrySource + `
export default source;
`, true, true},
		{"default-container", callableEntrySource + `
export default box;
`, true, true},
		{"typeonly-source", callableEntrySource + `
export type {source};
`, true, true},
		{"runtime-reexport", callableEntrySource + `
export {createComponentRegistry as reexported} from '@exactjs/core';
`, true, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				request := callableEntryRequest(t, test.source, target)
				response := NewSession().Execute(request)
				page := callableEntryPage(t, response)
				if test.name == "own-setter-after-allocation" && target == TargetServer {
					// A future deferred setter must not erase the earlier assignments
					// that establish this ordinary function property's runtime and type.
					for _, assignment := range []string{`source.run = () => 0`, `saved.run = () => process.pid`} {
						if !strings.Contains(response.Code, assignment) {
							t.Fatalf("earlier property assignment was pruned: %s", response.Code)
						}
					}
				}
				if test.neutral {
					if test.name != "unknown-startup" && (hasErrorDiagnostic(response.Diagnostics) || response.Code == "") || page.Placement != "isomorphic" || page.EnvironmentEffect != "neutral" || len(page.Diagnostics) != 0 || len(page.ArtifactTargets) != 2 {
						t.Fatalf("owned entry not qualified: %#v %#v", page, response.Diagnostics)
					}
				} else if page.Placement == "isomorphic" || page.EnvironmentEffect == "neutral" {
					t.Fatalf("unaccounted actual operation gained neutrality: %#v", page)
				}
				if test.name == "unknown-startup" && !hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal("actual opaque startup lost its module diagnostic")
				}
				if test.bodyEdge {
					assertCallableEntryBody(t, response, "source", "", false)
				}
			}
		})
	}
}

// Every known acquired body remains even when another alternative or execution
// route is unknown. These are effect retention checks, not neutral Page claims.
func TestSourceCallableEntryBodyAlternatives(t *testing.T) {
	for _, test := range []struct {
		name, source, body, environment string
		unknown                         bool
	}{
		{"source-browser-body", strings.Replace(callableEntrySource, `0`, `document.title.length`, 1), "source", "browser", false},
		{"source-server-body", strings.Replace(callableEntrySource, `0`, `process.pid`, 1), "source", "server", false},
		{"source-browser-default", strings.Replace(callableEntrySource, `){return 0`, `value=document.title.length){return value`, 1), "source", "browser", false},
		{"conditional-foreign", strings.Replace(callableEntrySource, `function source(){return 0}
source.run=()=>0;
const box={member:source};
const saved=box.member`, `declare const choose:boolean;declare const foreign:typeof source;function source(){return document.title.length}
source.run=()=>0;
const box={member:source};
const saved=choose?box.member:foreign`, 1), "source", "browser", true},
		{"source-server-default", strings.Replace(callableEntrySource, `){return 0`, `value=process.pid){return value`, 1), "source", "server", false},
		{"foreign-first", strings.Replace(callableEntrySource, `function source(){return 0}
source.run=()=>0;
const box={member:source};
const saved=`, `declare const choose:boolean;declare const foreign:typeof source;function source(){return document.title.length}
source.run=()=>0;
const box={member:source};
const saved=choose?foreign:`, 1), "source", "browser", true},
		{"called-before-capture", `function source(){return 0}
source.run=()=>0;
const box={member:source};
function replace(){function next(){return document.title.length}next.run=()=>0;box.member=next}replace();const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, "next", "browser", false},
		{"hoisted-called-before-capture", strings.Replace(callableEntrySource, `const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, `replace();const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
function replace(){function next(){return document.title.length}next.run=()=>0;box.member=next}`, 1), "next", "browser", false},
		{"conditional-before-capture", `function source(){return 0}
source.run=()=>0;
const box={member:source};
function replace(){function next(){return document.title.length}next.run=()=>0;box.member=next}declare const choose:boolean;if(choose)replace();const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, "next", "browser", false},
		{"foreign-invocation-before-capture", `function source(){return 0}
source.run=()=>0;
const box={member:source};
function replace(){function next(){return document.title.length}next.run=()=>0;box.member=next}declare function invoke(fn:()=>void):void;invoke(replace);const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, "next", "browser", false},
		{"eager-computed-assignment", `function source(){return 0}
source.run=()=>0;
const box={member:source};
function next(){return document.title.length}next.run=()=>0;const eager={[(box.member=next,'key')](){}};const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, "next", "browser", false},
		{"reached-nested-assignment", `function source(){return 0}
source.run=()=>0;
const box={member:source};
function next(){return document.title.length}next.run=()=>0;function outer(){function inner(){box.member=next}inner()}outer();const saved=box.member;
saved.run=()=>document.title.length;
export function selectedProbe(){return saved.run()}
export function Page(){
 const direct=saved();
 const kind=typeof saved.run;
 return ()=> <p data-callable-property>{direct}:{kind}</p>;
}
export const callablePropertyRoot=()=> <Page/>;
`, "next", "browser", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(callableEntryRequest(t, test.source, target))
				callableEntryPage(t, response)
				assertCallableEntryBody(t, response, test.body, test.environment, test.unknown)
			}
		})
	}
}

// The original library-typed receiver cannot waive an actually invoked authored
// foreign replacement. The uninvoked element read remains separately checked.
func TestSourceCallableForeignOverrideExecution(t *testing.T) {
	source := `const xs=[{get value(){return document.title}}];declare function foreign(this:{value:string}[]):{value:string}[];xs.slice=Boolean(Date.now())?foreign:()=>[];xs.slice();export const value=xs[0]!.value;`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/closure.ts", Source: source + `export const stable='stable';`, Target: target, Diagnostics: "semantic"})
		refused, unknownValue, edge, unknownExecution := false, false, false, false
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, d := range response.Diagnostics {
			if d.Severity == "error" {
				if d.Code != "EXACT2101" {
					t.Fatalf("unexpected diagnostic: %#v", d)
				}
				refused = true
			}
		}
		for _, value := range response.Analysis.Exports {
			unknownValue = unknownValue || value.Name == "value" && value.Placement == "unknown"
		}
		for _, caller := range response.Analysis.Callables {
			acquiredBody := false
			for _, call := range caller.Calls {
				for _, body := range response.Analysis.Callables {
					acquiredBody = acquiredBody || call.Resolved && call.TargetID == body.ID && strings.HasPrefix(body.Name, "<anonymous@")
				}
			}
			edge = edge || acquiredBody
			if acquiredBody {
				for _, effect := range caller.DirectEffectSources {
					unknownExecution = unknownExecution || effect.Environment == "unknown"
				}
			}
		}
		if !refused || !unknownValue || !edge || !unknownExecution {
			t.Fatalf("foreign execution/known body/value contract lost: %#v", response.Analysis)
		}
	}
	assertClosurePlacement(t, strings.Replace(source, "xs.slice();", "", 1), "client")
}
