package exactcompiler

import (
	"strings"
	"testing"
)

const aliasedDescriptorTask = `import {TaskContext,type Component} from '@exactjs/core';
 function probe(){const descriptor={value:()=>document.title,enumerable:true};return Object.defineProperty({},'callback',descriptor)}
 export function Page(this:Component<{label:string}>) {
 this.state.label='initial';
 function show(task:TaskContext=TaskContext.server()){
 void task;
 this.state.label=String((probe() as {callback:()=>string}).callback());
 }
 return () => <button onClick={() => show()}>{this.state.label}</button>;
 }`

// A stored descriptor callback contributes effects when the task calls it.
func TestComponentTaskStoredDescriptorCallback(t *testing.T) {
	held := strings.Replace(aliasedDescriptorTask, ".callback());", ".callback ? 'held' : 'missing');", 1)
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"aliased-callback", aliasedDescriptorTask, true},
		{"held-callback", held, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newPublicAwaitRequiredFixture(t, row.source)
			var application string
			for _, kind := range []string{"application", "library"} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.PackageType = TargetServer, kind
				response := NewSession().Execute(request)
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				assertComponentCallbackPolicy(t, response, row.browser)
				if kind == "application" {
					application = response.Code
				} else if application != response.Code {
					t.Fatal("the same component emitted different server code in the two package modes")
				}
				if !row.browser {
					continue
				}
				browser := false
				for _, candidate := range response.Analysis.Tasks {
					if !candidate.FunctionDefined || candidate.CompilerComputation || candidate.CompilerSetup {
						continue
					}
					for _, effect := range candidate.EffectSources {
						browser = browser || effect.Environment == "browser" && effect.Description == "document"
					}
				}
				if !browser {
					t.Fatalf("%s did not retain the task's document effect", kind)
				}
			}
		})
	}
}
