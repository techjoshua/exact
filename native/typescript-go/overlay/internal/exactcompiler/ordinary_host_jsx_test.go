package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Ordinary helpers retain host JSX while actual component render roots remain native.
func TestOrdinaryCompiledComponentHostJSX(t *testing.T) {
	source := `import {renderToString} from '@exactjs/ssr';import type {Child} from '@exactjs/core';
export function Page(props:{label:string,children?:Child}){return()=> <section>{props.label}{props.children}</section>}
export const identity=<T,>(value:T)=>value;
export function localHtml(){function nested(){return renderToString(<Page label="nested"/>)}const arrow=()=>renderToString(<Page label="arrow"/>);void[nested,arrow];return renderToString(<Page label="host"/>)}
`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-host.tsx", Source: source, Target: target, Diagnostics: "syntax"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" {
				t.Fatalf("component association changed: %#v", r.Analysis.Components)
			}
			parsed := parseNormalizationSource(filepath.ToSlash(filepath.Join(t.TempDir(), "ordinary-host.emitted.tsx")), r.Code)
			if len(parsed.Diagnostics()) != 0 {
				t.Fatalf("host/generic output is invalid TSX: %v", parsed.Diagnostics())
			}
			remaining := 0
			walkNode(parsed.AsNode(), func(node *ast.Node) bool {
				if ast.IsJsxElement(node) || ast.IsJsxSelfClosingElement(node) || ast.IsJsxFragment(node) {
					remaining++
				}
				return true
			})
			if strings.Count(r.Code, "<Page label=") != 3 || remaining != 3 || !strings.Contains(r.Code, "function localHtml") || !strings.Contains(r.Code, "function nested") || !strings.Contains(r.Code, "const arrow") || !strings.Contains(r.Code, "identity") {
				t.Fatalf("host/helper or component lowering changed: %s", r.Code)
			}
		})
	}
}

// The initial host bridge is TSX-only; native-selected JSX retains its original lowering.
func TestOrdinaryJSXKeepsLegacyLowering(t *testing.T) {
	source := `import {renderToString} from '@exactjs/ssr';export function Page(props){return()=> <section>{props.label}</section>}export function localHtml(){return renderToString(<Page label="legacy"/>)}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-legacy.jsx", Source: source, Target: target, Diagnostics: "syntax"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" {
				t.Fatal("component association lost", r.Analysis.Components)
			}
			parsed := parseNormalizationSource(filepath.ToSlash(filepath.Join(t.TempDir(), "legacy.emitted.tsx")), r.Code)
			if len(parsed.Diagnostics()) != 0 {
				t.Fatal(parsed.Diagnostics())
			}
			walkNode(parsed.AsNode(), func(node *ast.Node) bool {
				if ast.IsJsxElement(node) || ast.IsJsxSelfClosingElement(node) || ast.IsJsxFragment(node) {
					t.Fatal("legacy JSX was left for unsupported host path")
				}
				return true
			})
			if !strings.Contains(r.Code, "function localHtml") {
				t.Fatal("ordinary export lost")
			}
		})
	}
}
