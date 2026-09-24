package exactcompiler

import "testing"

func TestIslandAttributesAcceptImplicitBooleanValues(t *testing.T) {
	for _, attribute := range []string{`theme:field`, `disabled`, `theme:field={true}`} {
		for _, target := range []Target{TargetServer, TargetClient} {
			t.Run(string(target)+"/"+attribute, func(t *testing.T) {
				response := NewSession().Execute(Request{
					ID: "boolean-island.tsx", Kind: "compile", Target: target,
					ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate,
					Source: `import { TaskContext, type Component } from '@exactjs/core';
export function Probe(this: Component<{ text: string }>) {
 this.state.text = '';
 function serverText(task: TaskContext = TaskContext.server()) { return 'done'; }
 const run = async () => { this.state.text = await serverText(); };
 return () => <section><input ` + attribute + ` value:onInput={this.state.text} /><button onClick={run}>Run</button></section>;
}`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("boolean island attribute failed: %s %#v", response.Error, response.Diagnostics)
				}
			})
		}
	}
}
