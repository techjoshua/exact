package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Companion emission must preserve the normal JSX pipeline for bodies and parameter defaults.
func TestTaskHelperJSXSyntax(t *testing.T) {
	cases := map[string]string{
		"class method fragment":   `export class Counter { #count=9; render(){return <><span>{this.#count}</span></>;} }`,
		"class getter":            `export class Counter { #count=9; get view(){return <span>{this.#count}</span>;} }`,
		"class parameter default": `export class Counter { #count=9; get count(){return this.#count;} render(view=<span>default</span>){return view;} }`,
		"nested class":            `export class Counter { #count=9; render(){class Inner { #value=1; render(){return <span>{this.#value}</span>;} }return <section>{new Inner().render()}{this.#count}</section>;} }`,
		"module helper control":   `export function view(owner:{count:number}) { owner.count++; return <span>{owner.count}</span>; }`,
	}
	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			for _, target := range []Target{TargetClient, TargetServer} {
				result := NewSession().Execute(Request{Kind: "compile", Target: target, Root: root, ID: filepath.Join(root, "helper.tsx"), Source: source, Diagnostics: "syntax"})
				if result.Error != "" {
					t.Fatalf("%s failed: %s", target, result.Error)
				}
				for _, diagnostic := range result.Diagnostics {
					t.Errorf("%s: %s %s", target, diagnostic.Code, diagnostic.Message)
				}
			}
		})
	}
}
