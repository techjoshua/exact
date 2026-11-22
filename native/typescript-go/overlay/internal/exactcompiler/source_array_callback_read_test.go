package exactcompiler

import (
	"slices"
	"testing"
)

// Render helper placement must retain eager callback effects on both targets.
func TestRenderHelperCollectionPlacement(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, row := range []struct{ name, setup, render, placement string }{
		{"literal-map", "", `<div>{['one','two'].map(value => <button onClick={click}>{value}</button>)}</div>`, "isomorphic"},
		{"literal-map-getter", "", `<div>{[{get value(){return document.title}}, {value:'two'}].map(item => <button onClick={click}>{item.value}</button>)}</div>`, "client"},
		{"literal-map-empty", "", `<div>{([] as string[]).map(() => <span>{document.title}</span>)}<button onClick={click}>go</button></div>`, "isomorphic"},
		{"local-filter-index", `const visible = ['one','two'].filter(value => value.length !== 0);`, `<button onClick={click}>{visible[0]}</button>`, "isomorphic"},
		{"local-filter-index-empty", `const visible = ([] as string[]).filter(value => value.length !== 0);`, `<button onClick={click}>{visible[0]}</button>`, "isomorphic"},
		{"local-filter-predicate", `const visible = ['one','two'].filter(value => value !== document.title);`, `<button onClick={click}>{visible[0]}</button>`, "client"},
		{"local-filter-getter", `const visible = [{get value(){return document.title}}, {value:'two'}].filter(item => item.value !== '');`, `<button onClick={click}>{visible[0] ? 'visible' : 'empty'}</button>`, "client"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				source := `import type { Component } from '@exactjs/core';
function view(click: () => void) { ` + row.setup + " return " + row.render + `; }
export function Workspace(this: Component<{count:number}>) {
	this.state.count = 0;
	return () => view(() => this.state.count++);
}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "helper-collection.tsx",
					ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic", ServerComponents: true})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("compilation: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != row.placement {
					t.Fatalf("expected %s placement: %#v", row.placement, response.Analysis.Components)
				}
				targets := []string{string(TargetClient)}
				if row.placement == "isomorphic" {
					targets = append(targets, string(TargetServer))
				}
				if got := response.Analysis.Components[0].ArtifactTargets; !slices.Equal(got, targets) {
					t.Fatalf("expected targets %v, got %v", targets, got)
				}
			})
		}
	}
}
