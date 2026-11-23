package exactcompiler

import (
	"path/filepath"
	"slices"
	"strings"
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
		{"local-filter-map", `const visible = ['one','two'].filter(value => value.length !== 0);`, `<div>{visible.map(value => <button onClick={click}>{value}</button>)}</div>`, "isomorphic"},
		{"local-filter-map-empty", "", `<div>{([] as string[]).filter(() => true).map(value => <span>{value}</span>)}<button onClick={click}>go</button></div>`, "isomorphic"},
		{"local-filter-map-predicate", "", `<div>{['one'].filter(value => value !== document.title).map(value => <button onClick={click}>{value}</button>)}</div>`, "client"},
		{"local-filter-map-element-getter", "", `<div>{[{get value(){return document.title}}].filter(() => true).map(item => <button onClick={click}>{item.value}</button>)}</div>`, "client"},
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

// A live helper uses every authored state replacement as a possible filter input.
func TestRenderHelperStateFilterPlacement(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, row := range []struct{ name, initial, update, predicate, placement string }{
		{"original", "['one','two']", "", "item.length !== 0", "isomorphic"},
		{"replacement", "[]", "this.state.items = ['later'];", "item.length !== 0", "isomorphic"},
		{"reached-browser-predicate", "[]", "this.state.items = ['later'];", "item !== document.title", "client"},
		{"empty", "[]", "", "item.length !== 0", "isomorphic"},
		{"own-override", "['one']", `this.state.items.filter = (() => [document.title]) as typeof this.state.items.filter;`, "item.length !== 0", "unknown"},
		{"assignment-escape", "['one']", `const escaped = (this.state.items = ['later']); escaped.filter = (() => [document.title]) as typeof escaped.filter;`, "item.length !== 0", "unknown"},
		{"unknown-write", "['one']", "this.state.items = external();", "item.length !== 0", "unknown"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				source := `import type { Component } from '@exactjs/core';
declare function external(): string[];
function view(state: {items:string[]}, click: () => void) {
	const visible = state.items.filter(item => ` + row.predicate + `);
	return <div>{visible.map(value => <button onClick={click}>{value}</button>)}</div>;
}
export function Workspace(this: Component<{count:number;items:string[]}>) {
	this.state.count = 0;
	this.state.items = ` + row.initial + `;
	return () => view(this.state, () => { this.state.count++; ` + row.update + ` });
}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "helper-state-filter.tsx",
					ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic", ServerComponents: true})
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

// An imported array has a checker alias, while the confined-filter proof needs
// a local const declaration. The original map remains owned by the reactive read.
func TestReactiveImportedArrayMapPlacement(t *testing.T) {
	config := timeSemanticConfig(t)
	root := filepath.Dir(config)
	entry := filepath.Join(root, "page.tsx")
	provider := filepath.Join(root, "bundles.ts")
	const page = `import type { Component } from '@exactjs/core';
import { bundles } from './bundles.js';
function presentation(step: number) {
  return bundles.map(bundle => bundle + step).join(',');
}
export function Page(this: Component<{step:number}>) {
  this.state.step = 1;
  const text = this.reactive(() => presentation(this.state.step));
  return () => <button onClick={() => this.state.step++}>{text.get()}</button>;
}
`
	session := NewSession()
	setup := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{
		{ID: provider, Source: `export const bundles = Object.freeze([0, 1]);`},
		{ID: entry, Source: page},
	}})
	if setup.Error != "" || hasErrorDiagnostic(setup.Diagnostics) {
		t.Fatal(setup.Error, setup.Diagnostics)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		response := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config,
			Source: page, Target: target, Diagnostics: "semantic", ServerComponents: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		if len(response.Analysis.Components) != 1 || !strings.Contains(response.Code, "bundles.map") {
			t.Fatalf("%s: lost the original reactive map: %#v", target, response.Analysis.Components)
		}
	}
}
