package exactcompiler

import "testing"

func TestPartitionSpreadActivationAndCaptureOwnership(t *testing.T) {
	for _, c := range []struct{ name, setup, attributes, mode string }{
		{"inline", ``, `{...{onClick:()=>this.state.count++,title:'safe'}}`, "interaction"},
		{"const alias", `const attrs={onClick:()=>this.state.count++,title:'safe'};`, `{...attrs}`, "interaction"},
		{"nested overwrite", `const base={onClick:()=>this.state.count++};const attrs={...base,title:'safe',onClick:()=>this.state.count+=2};`, `{...attrs}`, "interaction"},
		{"conditional", `const attrs=props.flag?{onClick:()=>this.state.count++,title:'first'}:{title:'second',onClick:()=>this.state.count+=2};`, `{...attrs}`, "interaction"},
		{"conditional nested", `const attrs=props.flag?{onClick:()=>this.state.count++}:{...(props.flag?{onClick:()=>this.state.count+=2}:{onClick:()=>this.state.count+=3})};`, `{...attrs}`, "interaction"},
		{"conditional mismatch", `const attrs=props.flag?{onClick:()=>this.state.count++}:{onInput:()=>this.state.count++};`, `{...attrs}`, "eager"},
		{"mutable", `let attrs={onClick:()=>this.state.count++};`, `{...attrs}`, "eager"},
		{"escaped", `const attrs={onClick:()=>this.state.count++};void attrs.onClick;`, `{...attrs}`, "eager"},
		{"opaque any", `const attrs:any={onClick:()=>this.state.count++};`, `{...attrs}`, "eager"},
		{"index signature", `const attrs:Record<string,unknown>={onClick:()=>this.state.count++};`, `{...attrs}`, "eager"},
		{"effectful value", `const attrs={onClick:()=>this.state.count++,title:String(props.flag)};`, `{...attrs}`, "eager"},
		{"effectful condition", `const attrs=Boolean(props.flag)?{onClick:()=>this.state.count++}:{onClick:()=>this.state.count+=2};`, `{...attrs}`, "eager"},
		{"unsupported nested handler", `const attrs={onInput:(event:any)=>{this.state.count=event.relatedTarget.value}};`, `{...attrs}`, "eager"},
		{"asserted literal", `const attrs=({onClick:()=>this.state.count++} as const);`, `{...attrs}`, "interaction"},
		{"satisfies literal", `const attrs={onClick:()=>this.state.count++} satisfies {onClick:()=>void};`, `{...attrs}`, "interaction"},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import {type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>,props:{flag:boolean}){this.state.count=0;` + c.setup + `return()=> <button ` + c.attributes + `>{this.state.count}</button>;}`
			for _, target := range []Target{TargetServer, TargetClient} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/spread.tsx", Target: target, ComponentContractProjection: ComponentContractProjectionHydrate, ServerComponents: true, Source: source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("%s spread rejected: %s %#v", target, response.Error, response.Diagnostics)
				}
				found := false
				for _, b := range response.Analysis.Boundaries {
					if b.Kind == "client-island" {
						found = true
						if b.Activation.Mode != c.mode {
							t.Fatalf("%s expected %s, got %#v", target, c.mode, b.Activation)
						}
					}
				}
				if !found {
					t.Fatalf("%s lost interactive spread ownership", target)
				}
			}
		})
	}
}
