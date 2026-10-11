package exactcompiler

import "testing"

// Dynamic contributions must preserve valid source across both concrete targets without losing the component owner.
func TestReactivePropertyContributionContracts(t *testing.T) {
	for _, attributes := range []string{
		`title={this.state.label} disabled={this.state.disabled}`,
		`title="fallback" {...{title:this.state.label,disabled:this.state.disabled}}`,
		`{...{title:this.state.label,disabled:this.state.disabled}} title="override"`,
		`class={this.state.disabled?'busy':'ready'} style={{color:this.state.disabled?'red':'blue'}}`,
		`aria-label={this.state.label} data-value={this.state.label}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(string(target)+"/"+attributes, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "property-contributions.tsx", Target: target, Source: `import {type Component} from '@exactjs/core';export function Page(this:Component<{label:string;disabled:boolean}>){this.state.label='ready';this.state.disabled=false;return()=> <button ` + attributes + ` onClick={()=>{this.state.disabled=!this.state.disabled;this.state.label='next';}}>{this.state.label}</button>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, d := range response.Diagnostics {
					if d.Severity == "error" {
						t.Fatalf("valid property contributions rejected: %#v", response.Diagnostics)
					}
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Execution.Version != 1 {
					t.Fatalf("missing component execution contract: %#v", response.Analysis.Components)
				}
			})
		}
	}
}
