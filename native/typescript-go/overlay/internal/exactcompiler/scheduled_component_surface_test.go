package exactcompiler

import (
	"strings"
	"testing"
)

// Scheduled direct artifacts use the same focused component operations as synchronous frames.
func TestScheduledComponentReactiveSourceForms(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, scheduled := range []bool{false, true} {
		task := ""
		if scheduled {
			task = `function prepare(_task:TaskContext=TaskContext.server().blocking()){this.state.value++}prepare();`
		}
		for _, c := range []struct{ name, setup, view string }{
			{"literal", `const cell=this.reactive(()=>this.state.value);`, `cell.get().toFixed(0)`},
			{"named", `const calculate=()=>this.state.value;const cell=this.reactive(calculate);`, `cell.get().toFixed(0)`},
			{"named-alias", `const calculate=()=>this.state.value;const alias=calculate;const cell=this.reactive(alias);`, `cell.get().toFixed(0)`},
			{"named-member", `const calculations={value:()=>this.state.value};const cell=this.reactive(calculations['value']);`, `cell.get().toFixed(0)`},
			{"named-wrapper", `const calculate=()=>this.state.value;const cell=this.reactive((calculate satisfies ()=>number));`, `cell.get().toFixed(0)`},
			{"extracted-named", `const calculate=this.reactive;const read=()=>this.state.value;const cell=calculate(read);`, `cell.get().toFixed(0)`},
			{"extracted", `const calculate=this.reactive;const cell=calculate(()=>this.state.value);`, `cell.get().toFixed(0)`},
			{"value", `const cell=this.reactive(3);`, `cell.get().toFixed(0)`},
			{"extracted-value", `const calculate=this.reactive;const cell=calculate(3);`, `cell.get().toFixed(0)`},
			{"template", "const cell=this.reactive`value ${this.state.value}`;", `cell.get().toUpperCase()`},
			{"extracted-template", "const calculate=this.reactive;const cell=calculate`value ${this.state.value}`;", `cell.get().toUpperCase()`},
		} {
			for _, target := range []Target{TargetClient, TargetServer} {
				name := c.name + "/" + string(target)
				if scheduled {
					name += "/scheduled"
				}
				t.Run(name, func(t *testing.T) {
					response := NewSession().Execute(Request{Kind: "compile", ID: "scheduled-component-reactive.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createRef,type Component} from '@exactjs/core';const field=createRef<HTMLElement>('field');export function Page(this:Component<{value:number}>){this.state.value=1;` + task + c.setup + `return()=> <output>{` + c.view + `}</output>}`})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("supported source rejected: %s %#v", response.Error, response.Diagnostics)
					}
					placement := "isomorphic"
					if scheduled {
						placement = "server"
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != placement {
						t.Fatalf("component lost portable placement: %#v", response.Analysis.Components)
					}
					if target == TargetServer && (strings.Contains(response.Code, "this.reactive") || !strings.Contains(response.Code, "directSsrReactive")) {
						t.Fatalf("direct owner retained an unavailable operation:\n%s", response.Code)
					}
				})
			}
		}
	}
}

// Scheduled frames link request-local capabilities even when setup contains a server task.
func TestScheduledComponentRequestCapabilities(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, c := range []struct{ name, setup, helper string }{
		{"ref", `const binding=this.ref(field);void binding;`, "directSsrRef"},
		{"extracted-ref", `const create=this.ref;void create(field);`, "directSsrRefMethod"},
		{"refs-get", `void this.refs.get(field);`, "directSsrReadRef"},
		{"extracted-refs", `const refs=this.refs;void refs.get(field);`, "directSsrRefs"},
		{"extracted-lifecycle", `const register=this.onUnmount;register(()=>undefined);`, "directSsrLifecycleMethod"},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "scheduled-request-capabilities.tsx", ConfigFile: config, Target: TargetServer, Diagnostics: "semantic", Source: `import {TaskContext,createRef,type Component} from '@exactjs/core';const field=createRef<HTMLElement>('field');export function Page(this:Component<{value:number}>){this.state.value=1;function prepare(_task:TaskContext=TaskContext.server().blocking()){this.state.value++}prepare();` + c.setup + `return()=> <output>{this.state.value}</output>}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("supported scheduled capability rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Components) != 1 || (response.Analysis.Components[0].Placement != "server" && response.Analysis.Components[0].Placement != "isomorphic") || !strings.Contains(response.Code, c.helper) {
				t.Fatalf("scheduled request capability lost ownership or lowering: %#v\n%s", response.Analysis.Components, response.Code)
			}
		})
	}
}
