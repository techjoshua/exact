package exactcompiler

import "testing"

// The render helper's actual argument can account for a state field Get. Other
// sources and projections still contribute their own effects to placement.
func TestComponentStateFieldReadPlacement(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, row := range []struct {
		name, setup, render, placement, diagnostic string
	}{
		{"direct", "", "<button onClick={click}>{this.state.items}</button>", "isomorphic", ""},
		{"helper", "", "view(this.state, click)", "isomorphic", ""},
		{"literal-key", "", "indexed(this.state, click)", "isomorphic", ""},
		{"ordinary-getter", "", "view({get items(){return [document.title]}}, click)", "client", ""},
		{"mixed-getter", "", "view(props.flag ? this.state : {get items(){return [document.title]}}, click)", "client", ""},
		{"independent-unknown-field", "", "withUnknown(this.state, props.other, click)", "unknown", ""},
		{"nested-value", "", "nested(this.state, click)", "unknown", ""},
		{"whole-state-replacement", "this.state={get items(){return [document.title]}};", "view(this.state, click)", "unknown", ""},
		{"deferred-state-replacement", "", "view(this.state, () => { this.state={get items(){return [document.title]}}; })", "unknown", ""},
		{"reflective-replacement", "Object.defineProperty(this.state,'items',{get(){return [document.title]}});", "view(this.state, click)", "", "EXACT_STATE_WRITE"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				const helper = `
import type { Component } from '@exactjs/core';
type State = { items: string[] };
function view(state: State, click: () => void) { return <button onClick={click}>{state.items}</button>; }
function indexed(state: State, click: () => void) { return <button onClick={click}>{state['items']}</button>; }
function withUnknown(state: State, other: State, click: () => void) { return <button onClick={click}>{state.items}{other.items}</button>; }
function nested(state: State, click: () => void) { return <button onClick={click}>{state.items[0]}</button>; }
export function Workspace(this: Component<State>, props: { flag: boolean; other: State }) {
	this.state.items = ['one'];
	const click = () => { this.state.items = ['two']; };
`
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "helper-state-field.tsx", ConfigFile: config,
					Target: target, Diagnostics: "semantic", ServerComponents: true,
					Source: helper + row.setup + "return () => " + row.render + ";}",
				})
				if row.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, row.diagnostic) {
						t.Fatalf("missing %s: %s %#v", row.diagnostic, response.Error, response.Diagnostics)
					}
					return
				}
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("compilation: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != row.placement {
					t.Fatalf("expected %s placement: %#v", row.placement, response.Analysis.Components)
				}
			})
		}
	}
}
