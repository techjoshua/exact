package exactcompiler

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// Snapshot intent belongs to the imported operation and its lexical read boundary.
// A same-named helper or nested snapshot must not freeze independent live inputs.
func TestReactiveSnapshotIdentityAndScope(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "core")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"@exactjs/core","types":"index.d.ts"}`,
		"index.d.ts":   `/** @exact pure */ export declare function peek<T>(read:()=>T):T;`,
	} {
		if err := os.WriteFile(filepath.Join(pkg, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range []struct{ name, prelude, expression, provenance string }{
		{"direct", `import {peek} from '@exactjs/core';`, `peek(()=>props.value)`, "snapshot"},
		{"renamed", `import {peek as snapshot} from '@exactjs/core';`, `snapshot(()=>props.value)`, "snapshot"},
		{"namespace", `import * as core from '@exactjs/core';`, `core.peek(()=>props.value)`, "snapshot"},
		{"indexed namespace", `import * as core from '@exactjs/core';`, `core['peek'](()=>props.value)`, "snapshot"},
		{"template namespace", `import * as core from '@exactjs/core';`, "core[`peek`](()=>props.value)", "snapshot"},
		{"wrapped call", `import {peek} from '@exactjs/core';`, `(peek(()=>props.value) satisfies number)`, "snapshot"},
		{"constant alias", `import {peek} from '@exactjs/core';const snapshot=peek;`, `snapshot(()=>props.value)`, "snapshot"},
		{"shadow", `function peek(value:number){return value}`, `peek(props.value)`, "derived"},
		{"mixed", `import {peek} from '@exactjs/core';`, `peek(()=>props.value)+props.other`, "derived"},
		{"mixed helper", `import {peek} from '@exactjs/core';function mixed(props:{value:number,other:number}){return peek(()=>props.value)+props.other}`, `mixed(props)`, "derived"},
		{"nested", `import {peek} from '@exactjs/core';`, `{read:()=>peek(()=>props.value),label:props.other}`, "derived"},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", Root: root, ID: filepath.Join(root, "page.tsx"), Source: c.prelude + `export function Page(props:{value:number,other:number}){const value=` + c.expression + `;return()=> <p>{value}</p>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, b := range r.Analysis.ReactiveBindings {
				if b.Name == "value" {
					if b.Provenance != c.provenance {
						t.Fatalf("lost snapshot boundary: %#v", b)
					}
					if (c.name == "mixed" || c.name == "mixed helper") && reactiveAllocationKind(b) != "computed" {
						t.Fatalf("inspection must retain the snapshot calculation's own allocation: %#v", b)
					}
					return
				}
			}
			t.Fatal("missing value provenance")
		})
	}
}

// Classification and inspection are insufficient when lowering can move the calculation
// across an untracked read boundary. A live-only control remains eligible for elision.
func TestReactiveSnapshotNativePlanningBoundary(t *testing.T) {
	for _, c := range []struct {
		name, prelude, expression string
		retained                  bool
	}{
		{"live control", "", `props.value+props.other`, false},
		{"direct mixed snapshot", `import {peek} from '@exactjs/core';`, `peek(()=>props.value)+props.other`, true},
		{"aliased mixed snapshot", `import {peek as snapshot} from '@exactjs/core';`, `snapshot(()=>props.value)+props.other`, true},
		{"helper mixed snapshot", `import {peek} from '@exactjs/core';function read(props:{value:number,other:number}){return peek(()=>props.value)+props.other}`, `read(props)`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := c.prelude + `export function Page(props:{value:number,other:number}){const mixed=` + c.expression + `;return()=> <output>{mixed+props.value}</output>;}`
			root := t.TempDir()
			file := filepath.Join(root, "page.tsx")
			pkg := filepath.Join(root, "node_modules", "@exactjs", "core")
			if err := os.MkdirAll(pkg, 0700); err != nil {
				t.Fatal(err)
			}
			for file, text := range map[string]string{
				"package.json": `{"name":"@exactjs/core","types":"index.d.ts"}`,
				"index.d.ts":   `/** @exact pure */ export declare function peek<T>(read:()=>T):T;`,
			} {
				if err := os.WriteFile(filepath.Join(pkg, file), []byte(text), 0600); err != nil {
					t.Fatal(err)
				}
			}
			// Import resolution must see the fixture declarations before creating the generation.
			state, _, err := newProjectState(Request{Root: root, Source: source}, file)
			if err != nil {
				t.Fatal(err)
			}
			resolved, err := state.advance(context.Background(), file, source)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(resolved.release)
			bindings := collectReactiveBindings(resolved.sourceFile, resolved.checker, nil, nil)
			retained, elided := planDerivedBindings(resolved.sourceFile, bindings, resolved.checker)
			for _, binding := range bindings {
				if binding.Name != "mixed" {
					continue
				}
				_, kept := retained[binding.Start]
				_, moved := elided[binding.Start]
				if kept != c.retained || moved == c.retained {
					t.Fatalf("subscription ownership changed: retained=%v elided=%v binding=%#v", kept, moved, binding)
				}
				return
			}
			t.Fatal("missing mixed calculation")
		})
	}
}

// Local callable aliases must retain the helper's captured dependencies without rewriting it.
func TestReactiveLocalCallableAliasDependencies(t *testing.T) {
	for _, prelude := range []string{
		`function read(){return props.value}const alias=read;`,
		`const read=()=>props.value;const first=read;const alias=first;`,
		`const table={read:()=>props.value};const alias=table.read;`,
		`const table={read(){return props.value}};const alias=table.read;`,
		`function read(){return props.value}const table={read};const alias=table.read;`,
		`function read(){return props.value}const table={read:read};const alias=table.read;`,
		`const table={read:()=>props.value};const alias=table['read'];`,
		"const table={read:()=>props.value};const alias=table[`read`];",
		`const read=()=>props.value;const alias=(read satisfies ()=>number);`,
		`const read=()=>props.value;const alias=(read as ()=>number)!;`,
		`const table={read:()=>props.value};const alias=()=>table['read']();`,
	} {
		r := NewSession().Execute(Request{Kind: "analyze", ID: "page.tsx", Source: `export function Page(props:{value:number}){` + prelude + `const value=alias();return()=> <p>{value}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		assertReactiveBinding(t, r.Analysis.ReactiveBindings, "value", "derived", true)
	}
}

// Instance captures must remain live through the same aliases as parent-owned props.
func TestReactiveCallableAliasInstanceInputs(t *testing.T) {
	for _, prelude := range []string{
		`const read=()=>this.state.value;const first=read;const alias=first;`,
		`const table={read:()=>this.state.value};const alias=table.read;`,
		`const read=()=>this.props.value;const alias=read;`,
		`const table={read:()=>this.state.value};const alias=table['read'];`,
		`const read=()=>this.state.value;const alias=(read satisfies ()=>number);`,
	} {
		r := NewSession().Execute(Request{Kind: "analyze", ID: "page.tsx", Source: `export function Page(this:{state:{value:number},props:{value:number}}){` + prelude + `const value=alias();return()=> <p>{value}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		assertReactiveBinding(t, r.Analysis.ReactiveBindings, "value", "derived", true)
	}
}

func TestReactiveCallableTableMutationRequiresProof(t *testing.T) {
	for _, mutation := range []string{`table.read=()=>{shared++;return props.value};`, `const other=table;other.read=()=>{shared++;return props.value};`} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "page.tsx", Source: `let shared=0;export function Page(props:{value:number}){const table={read:()=>props.value};` + mutation + `const alias=table.read;const value=alias();return()=> <p>{value}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if !containsDiagnosticCode(r.Diagnostics, "EXACT2202") {
			t.Fatalf("unproven selected helper reevaluated: %#v", r.Diagnostics)
		}
	}
}

// Pre-bind setup scheduling must observe the same imported snapshot identity.
func TestSnapshotSetupAssignmentIdentity(t *testing.T) {
	for _, c := range []struct{ prelude, expression, execution string }{
		{`import {peek} from '@exactjs/core';`, `peek(()=>props.value)`, "initialization"},
		{`import {peek as snapshot} from '@exactjs/core';`, `snapshot(()=>props.value)`, "initialization"},
		{`import * as core from '@exactjs/core';`, `core.peek(()=>props.value)`, "initialization"},
		{`import {peek} from '@exactjs/core';const snapshot=peek;`, `snapshot(()=>props.value)`, "initialization"},
		{`import {peek} from '@exactjs/core';const snapshot=peek satisfies typeof peek;`, `snapshot(()=>props.value)`, "initialization"},
		{`import {peek} from '@exactjs/core';`, `(peek(()=>props.value) satisfies number)`, "initialization"},
		{`import * as core from '@exactjs/core';`, "core[`peek`](()=>props.value)", "initialization"},
		{`function peek(value:number){return value}`, `peek(props.value)`, "deferred-reactive"},
		{`import {peek} from '@exactjs/core';`, `peek(()=>props.value)+props.other`, "deferred-reactive"},
	} {
		source := c.prelude + `export function Page(props:{value:number,other:number}){this.state.value=` + c.expression + `;return()=> <p>{this.state.value}</p>;}`
		writes := collectAuthoredSetupAssignmentExecutions(filepath.Join(t.TempDir(), "page.tsx"), source)
		if len(writes) != 1 || writes[0].execution != c.execution {
			t.Fatalf("%s %s: %#v", c.prelude, c.expression, writes)
		}
	}
}
