package exactcompiler

import (
	"strings"
	"testing"
)

// Projection must not query synthetic helper import aliases with the source checker, and must
// retain ordinary executable references and side effects while erasing dormant client closures.
func TestServerProjectionUsesAuthoredSymbolsAfterHelperImports(t *testing.T) {
	cases := []struct{ name, imports, locals, render string }{
		{"generated helper import", `import {TaskContext,type Component} from "@exactjs/core";`, `const visible="server-visible";const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);} function shown(){return visible;}`, `shown()`},
		{"authored alias", `import {TaskContext,type Component,createContext as makeContext} from "@exactjs/core";`, `const visible="server-visible";const context=makeContext<string>("ordinary");void context;const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);} function shown(){return visible;}`, `shown()`},
		{"namespace and shorthand", `import {TaskContext,type Component} from "@exactjs/core";import * as core from "@exactjs/core";`, `const visible="server-visible";const box={visible};const context=core.createContext<string>("ordinary");void context;const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);} function shown(){return box.visible;}`, `shown()`},
		{"expanded property control", `import {TaskContext,type Component} from "@exactjs/core";import * as core from "@exactjs/core";`, `const visible="server-visible";const box={visible:visible};const context=core.createContext<string>("ordinary");void context;const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);} function shown(){return box.visible;}`, `shown()`},
		{"aliased import shadow", `import {TaskContext,type Component,createContext as visible} from "@exactjs/core";`, `const visible="server-visible";const box={visible};const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);} function shown(){return box.visible;}`, `shown()`},
		{"overload", `import {TaskContext,type Component} from "@exactjs/core";`, `function shown(value:string):string;function shown(value:string){return value;}const clientOnly="client-only-marker";function dormant(){console.log(clientOnly);}`, `shown("server-visible")`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			source := c.imports + `export function append(values:number[]){return values.push(2);}
  export function Page(this:Component<{values:number[]}>){this.state.values=[1];
  const send=async(task:TaskContext=TaskContext.server())=>{append(this.state.values);};send();
  const effect=console.log("retained-effect-marker");void effect;
  ` + c.locals + `return()=> <main onClick={()=>dormant()}>` + `{` + c.render + `}</main>;}`
			for _, target := range []Target{TargetServer, TargetClient} {
				request := Request{ID: "projection-" + strings.ReplaceAll(c.name, " ", "-") + ".tsx", Kind: "compile", Target: target, ServerComponents: true, Source: source}
				response := NewSession().Execute(request)
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if !strings.Contains(response.Code, "server-visible") || !strings.Contains(response.Code, "retained-effect-marker") {
					t.Fatalf("lost live data or effect:\n%s", response.Code)
				}
				if target == TargetServer {
					if !strings.Contains(response.Code, "assertArrayCompletionVersion") {
						t.Fatalf("control never produced synthetic import:\n%s", response.Code)
					}
					if strings.Contains(response.Code, "function dormant") {
						t.Fatalf("dormant client closure retained:\n%s", response.Code)
					}
				} else if !strings.Contains(response.Code, "client-only-marker") {
					t.Fatalf("client closure lost:\n%s", response.Code)
				}
			}
		})
	}
}
