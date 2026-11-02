package exactcompiler

import (
	"strings"
	"testing"
)

// Task facade checks consume emitted ownership contracts. Advisory work estimates
// remain available in the response, while every other diagnostic rejects the fixture.
func assertContinuationTaskCompilation(t *testing.T, target Target, response Response) {
	t.Helper()
	if response.Error != "" || response.Code == "" {
		t.Fatalf("%s: missing compiled task artifact: %s %#v", target, response.Error, response.Diagnostics)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity != "warning" || diagnostic.Code != "EXACT_ANALYSIS_COST" {
			t.Fatalf("%s: unexpected task diagnostic: %#v", target, diagnostic)
		}
	}
}

// Child control must select the same definition and owner as invocation. Direct
// SSR construction precedes a request task frame, so only executor reconstruction binds.
func TestContinuationTaskFacadesRetainRequestOwner(t *testing.T) {
	source := `import {TaskContext,type Component} from '@exactjs/core';
 export function Page(this:Component<{value:number}>){this.state.value=0;
 function ordinary(){return 1;}
 async function child(task:TaskContext=TaskContext.server().parallel()){await Promise.resolve();return 7;}
 async function parent(task:TaskContext=TaskContext.server().parallel()){
 const invocation=child();const observed=invocation.catch(()=>-1);
 await Promise.resolve();child.cancel('stop');await observed;this.state.value=ordinary();}
 return()=> <button onClick={()=>parent()}/>;}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "child-facade.tsx", Target: target, Source: source})
		assertContinuationTaskCompilation(t, target, response)
		expected := []string{"bindTaskForHost as"}
		if target == TargetServer {
			expected = []string{"bindTask as __exactBindContinuationTask", "const child = __exactDefineTask(", "const child = __exactBindContinuationTask", "__exactInvokeTask(task, __exactBoundServerChild", ".cancel(", "const ordinary = function ordinary"}
		}
		for _, text := range expected {
			if !strings.Contains(response.Code, text) {
				t.Fatalf("%s omitted %q", target, text)
			}
		}
	}
}

// Shorthand property symbols are local to the parent body. Their authored value
// symbols must retain the same task facade as direct and expanded references.
func TestContinuationTaskShorthandFacades(t *testing.T) {
	source := `import {TaskContext,type Component} from '@exactjs/core';
 export function Page(this:Component<{value:number}>){this.state.value=0;
 async function child(task:TaskContext=TaskContext.server().parallel()){await Promise.resolve();return 7;}
 const setupAlias=child;const multiAlias=setupAlias;
 const replacement=()=>29;let mutable:()=>number|Promise<number>=child;mutable=replacement;
 async function parent(task:TaskContext=TaskContext.server().blocking()){
 const shorthand={child};const expanded={child:child};
 const aliases={setupAlias,multiAlias,expanded:setupAlias};const opposite={mutable};
 const local=(()=>{const child=()=>23;const shadow={child};return shadow.child();})();
 await child();this.state.value=shorthand.child.result+expanded.child.result+aliases.setupAlias.result+aliases.multiAlias.result+local;}
 parent();return()=> <output>{this.state.value}</output>;}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "shorthand-facade.tsx", Target: TargetServer, Source: source})
	assertContinuationTaskCompilation(t, TargetServer, response)
	for _, expected := range []string{"const shorthand = { child: __exactBoundServerChild", "const expanded = { child: __exactBoundServerChild", "const shadow = { child }", "setupAlias: __exactBoundServerChild", "multiAlias: __exactBoundServerChild", "expanded: __exactBoundServerChild", "const opposite = { mutable }"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("task value or ordinary shadow omitted %q", expected)
		}
	}
}

// Destructured context policies introduce a private parameter during lowering.
// That generated name has no authored symbol, while task values in its body do.
const serverTaskDestructuredContextSource = `import {TaskContext,type Component} from '@exactjs/core';
export const snapshots:unknown[][]=[];
export function Page(this:Component<{value:number}>){this.state.value=0;
async function child(task:TaskContext=TaskContext.server().parallel()){await Promise.resolve();return 7;}
const setupAlias=child;
const parent=async ({signal}:TaskContext=TaskContext.server().blocking())=>{
 const __exactTaskContext=1;void __exactTaskContext;void signal;
 const shorthand={child};const aliases={setupAlias};const expanded={child:child};
 const ordinary=(()=>{const child=()=>23;return {child}.child();})();
 snapshots.push(['idle',child.pending,setupAlias.pending,shorthand.child.pending,aliases.setupAlias.pending]);
 const invocation=child();snapshots.push(['running',child.pending,setupAlias.pending]);
 await invocation;snapshots.push(['done',child.result,setupAlias.result,expanded.child.result,ordinary]);
 this.state.value=child.result!;
};parent();return()=> <output>{this.state.value}</output>;}`

func TestContinuationTaskDestructuredContextFacades(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "destructured-context-facade.tsx", Target: target, Source: serverTaskDestructuredContextSource})
		assertContinuationTaskCompilation(t, target, response)
		if target == TargetServer {
			for _, expected := range []string{"const shorthand = { child: __exactBoundServerChild", "const aliases = { setupAlias: __exactBoundServerChild", "const expanded = { child: __exactBoundServerChild", "const { signal } = __exactTaskContext_", "const child = () => 23"} {
				if !strings.Contains(response.Code, expected) {
					t.Fatalf("server context or authored value omitted %q", expected)
				}
			}
		}
	}
}

// A browser placeholder is not a runtime task definition. Its omitted call must not
// cause the parent to bind that placeholder before any authored server work runs.
func TestContinuationTaskFacadeOmitsClientPlaceholder(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "client-placeholder.tsx", Target: TargetServer, Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const browser=(value:number,task:TaskContext=TaskContext.client())=>{this.state.value=value;};async function run(task:TaskContext=TaskContext.server().blocking()){await Promise.resolve();browser(100);this.state.value+=2;}run();return()=> <output>{this.state.value}</output>;}`})
	assertContinuationTaskCompilation(t, TargetServer, response)
	if strings.Contains(response.Code, "__exactBindRequestTask(browser)") || strings.Contains(response.Code, "__exactInvokeTask(task, browser") {
		t.Fatalf("omitted client task gained runtime task-definition authority:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, "__exactActivateServerTask(") {
		t.Fatalf("server work lost its actual activation:\n%s", response.Code)
	}
}
