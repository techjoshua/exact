package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Read-modify-write setup expressions participate in the same cycle contract as assignments.
func TestNormalizationComputationCycleControls(t *testing.T) {
	for _, c := range []struct {
		name, body string
		cycle      bool
	}{
		{"direct", `this.state.a = this.state.a + props.input;`, true},
		{"mutual", `this.state.a = this.state.b; this.state.b = this.state.a;`, true},
		{"compound", `this.state.a += props.input;`, true},
		{"logical", `this.state.a ||= props.input;`, true},
		{"increment", `if (props.input) this.state.a++;`, true},
		{"prefix", `if (props.input) ++this.state.a;`, true},
		{"acyclic", `this.state.a = props.input; this.state.b = this.state.a;`, false},
		{"snapshot", `this.state.a = peek(() => this.state.a) + props.input;`, false},
		{"initialization", `this.state.a ??= 1;`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := normalizeAuthoredSource(normalizationTestFile(t, c.name+".tsx"),
				`import {peek} from '@exactjs/core'; export function Probe(this: Component<{a:number;b:number}>, props:{input:number}) {`+c.body+`return () => <output>{this.state.a}</output>;}`)
			if c.cycle != (err != nil && strings.Contains(err.Error(), "reactive dependency cycle")) {
				t.Fatalf("cycle classification changed: %v", err)
			}
		})
	}
}

// The async escape check must follow lexical ownership rather than a reused identifier spelling.
func TestNormalizationAsyncLexicalEscapeControls(t *testing.T) {
	for _, c := range []struct {
		name, setup, render string
		escapes             bool
	}{
		{"escape", `const value = await load();`, `() => <output>{value}</output>`, true},
		{"parameter-shadow", `const value = await load();`, `() => <output>{[1].map(value => value)}</output>`, false},
		{"local-shadow", `const value = await load();`, `() => { const value = 2; return <output>{value}</output>; }`, false},
		{"block-local", `if (true) { const value = await load(); }`, `() => { const value = 2; return <output>{value}</output>; }`, false},
		{"duplicate-scope", `const value = await load(); if (true) { const value = 2; }`, `() => <output>{value}</output>`, true},
		{"overlapping-cycle", `this.state.a = await load(this.state.a.value);`, `() => <output/>`, true},
		{"hoisted-escape", `if (true) { var value = await load(); }`, `() => <output>{value}</output>`, true},
		{"state", `this.state.a = await load();`, `() => <output>{this.state.a}</output>`, false},
		{"nested-return", `if (true) { await load(); return () => <output/>; }`, `() => <output/>`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := normalizeAuthoredSource(normalizationTestFile(t, c.name+".tsx"),
				`export function Probe(this: Component<{a:number}>) {`+c.setup+`return `+c.render+`;}`)
			if c.escapes != (err != nil) {
				t.Fatalf("lexical escape classification changed: %v", err)
			}
		})
	}
}

// Snapshot discovery must respect catch and loop bindings before attributing a core import.
func TestNormalizationSnapshotScopedControls(t *testing.T) {
	for _, c := range []struct {
		name, statement string
		snapshot        bool
	}{
		{"import", `peek(() => 1);`, true},
		{"alias", `const read = peek; read(() => 1);`, true},
		{"mutable", `let read = peek; read(() => 1);`, false},
		{"type-import", `peek(() => 1);`, false},
		{"catch", `try {} catch (peek) { peek(() => 1); }`, false},
		{"for-of", `for (const peek of values) { peek(() => 1); }`, false},
		{"for", `for (let peek = ordinary; condition; ) { peek(() => 1); }`, false},
		{"for-in", `for (const peek in values) { peek(() => 1); }`, false},
		{"catch-pattern", `try {} catch ({peek}) { peek(() => 1); }`, false},
		{"outside-catch", `try {} catch (peek) {} peek(() => 1);`, true},
		{"outside-catch-pattern", `try {} catch ({peek}) {} peek(() => 1);`, true},
		{"nested-function", `function nested(){var peek=ordinary;} peek(() => 1);`, true},
		{"nested-class", `class Nested{method(){var peek=ordinary;}} peek(() => 1);`, true},
		{"function-name", `const recurse = function peek() { peek(() => 1); };`, false},
		{"switch", `switch (value) { case 1: const peek = ordinary; peek(() => 1); }`, false},
		{"hoisted-var", `if (value) { var peek = ordinary; } peek(() => 1);`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			imports := `import {peek} from '@exactjs/core';`
			if c.name == "type-import" {
				imports = `import type {peek} from '@exactjs/core';`
			}
			source := parseNormalizationSource(normalizationTestFile(t, c.name+".ts"), imports+`function test(){`+c.statement+`}`)
			calls := 0
			walkNode(source.AsNode(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && !ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
					calls++
					if normalizationPeekCall(node) != c.snapshot {
						t.Fatal("snapshot identity crossed a lexical boundary")
					}
				}
				return true
			})
			if calls == 0 {
				t.Fatal("source did not contain a call witness")
			}
		})
	}
}
