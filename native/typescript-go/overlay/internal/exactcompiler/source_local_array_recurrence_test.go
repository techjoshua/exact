package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const scopeSequenceSource = `
interface Scope { source: { color: string }; parent?: Scope }
function make(scope: Scope, index: number) { return () => resolve(scope, index); }
export function Stored(props: { foreign?: Scope; index: number }) {
 const tail: Scope = { source: { color: 'tail' }, parent: props.foreign };
 const head: Scope = { source: { color: 'head' }, get parent() {
  Object.defineProperty(tail, 'source', { get: () => ({color: 'steady'}) });
  return tail;
 } };
 SELECTION
}
`

const scopeSequenceResolver = `
function resolve(input: Scope, index: number) {
 const ancestry: Scope[] = [];
 for (let current: Scope | undefined = input; current; current = current.parent) ancestry.push(current);
 return ancestry[index]?.source.color;
}
`

func TestLocalArrayRecurrenceComponentDonors(t *testing.T) {
	for _, row := range []struct {
		name, selection string
		direct          bool
	}{
		{"direct extraction", `
const ancestry: Scope[] = [];
for (let current: Scope | undefined = head; current; current = current.parent) ancestry.push(current);
const value = ancestry[props.index]?.source.color;
return () => <span>{value}</span>;`, true},
		{"bound invocation", `
const read = make(head, props.index);
return () => <span>{read()}</span>;`, false},
		{"derived read", `
const definition = this.reactive(() => {
 const tail: Scope = { source: { color: 'tail' }, parent: props.foreign };
 return { source: { color: 'head' }, get parent() {
  Object.defineProperty(tail, 'source', { get: () => ({color: 'steady'}) });
  return tail;
 } };
});
const read = this.reactive(() => this.state.preference ? resolve(definition.get(), props.index) : resolve(definition.get(), 0));
return () => <span>{read.get()}</span>;`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			root := t.TempDir()
			id := filepath.Join(root, "scope.tsx")
			jsx := `declare namespace JSX {interface Element {} interface IntrinsicElements {span:{children?:unknown}}}`
			if err := os.WriteFile(filepath.Join(root, "jsx-types.d.ts"), []byte(jsx), 0600); err != nil {
				t.Fatal(err)
			}
			component := strings.Replace(scopeSequenceSource, "SELECTION", row.selection, 1) + scopeSequenceResolver
			var sources []ProjectSource
			if row.name == "derived read" {
				component = `import type { Component } from '@exactjs/core';
import { resolve, type Scope } from './scope-resolver.js';
export function Stored(this: Component<{ preference: boolean }>, props: { foreign?: Scope; index: number }) {
 this.state.preference = false;
` + row.selection + "\n}"
				resolver := `export interface Scope { source: { color: string }; parent?: Scope }` + strings.Replace(scopeSequenceResolver, "function resolve", "export function resolve", 1)
				resolverID := filepath.Join(root, "scope-resolver.ts")
				if err := os.WriteFile(resolverID, []byte(resolver), 0600); err != nil {
					t.Fatal(err)
				}
				sources = []ProjectSource{{ID: resolverID, Source: resolver}}
				for name, source := range map[string]string{
					"core":     `import type {ReactiveValue} from '@exactjs/reactive'; export interface Component<S> { state: S; reactive<T>(callback: () => T): ReactiveValue<T> }`,
					"reactive": `export type ReactiveValue<T> = { get(): T };`,
				} {
					dir := filepath.Join(root, "node_modules", "@exactjs", name)
					if err := os.MkdirAll(dir, 0700); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(filepath.Join(dir, "index.d.ts"), []byte(source), 0600); err != nil {
						t.Fatal(err)
					}
				}
			}
			config := filepath.Join(root, "tsconfig.json")
			if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","lib":["esnext","dom"],"jsx":"preserve","skipLibCheck":true,"strict":true}}`), 0600); err != nil {
				t.Fatal(err)
			}
			neutral := `/// <reference path="./jsx-types.d.ts" />` + "\n" + component
			browser := strings.Replace(neutral, "color: 'steady'", "color: document.title", 1)
			for _, target := range []Target{TargetClient, TargetServer} {
				var application [3]string
				for _, packageType := range []string{"application", "library"} {
					session := NewSession()
					for edit, source := range []string{neutral, browser, neutral} {
						result := session.Execute(Request{Kind: "compile", ID: id, Root: root, ConfigFile: config, Sources: sources, Source: source, Target: target, PackageType: packageType})
						if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) || result.Code == "" {
							t.Fatal(target, packageType, edit, result.Error, result.Diagnostics)
						}
						if packageType == "application" {
							application[edit] = result.Code
						} else if application[edit] != result.Code {
							t.Fatal(target, edit, "package mode changed the generated component")
						}
						var known, browserDonor, residual bool
						for _, fact := range result.Analysis.Callables {
							if row.direct && fact.Name != "Stored" || !row.direct && !strings.HasPrefix(fact.Name, "<anonymous@") {
								continue
							}
							var browserEffect, unknownEffect bool
							sources := fact.EffectSources
							if row.direct {
								sources = fact.DirectEffectSources
							}
							for _, effect := range sources {
								browserEffect = browserEffect || effect.Environment == "browser"
								unknownEffect = unknownEffect || effect.Environment == "unknown"
							}
							browserDonor = browserDonor || browserEffect
							known = known || browserEffect && unknownEffect
							residual = residual || unknownEffect
						}
						if known != (edit == 1) || browserDonor != (edit == 1) || !residual {
							t.Fatalf("%s %s edit %d: browser+unknown=%v, unknown=%v", target, packageType, edit, known, residual)
						}
					}
				}
			}
		})
	}
}
