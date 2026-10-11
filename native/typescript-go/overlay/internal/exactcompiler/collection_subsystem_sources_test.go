package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Native witnesses pair keyed source planning with emitted semantics across both artifacts.
func TestCollectionSubsystemKeyedSources(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, expression string
		native           bool
	}{
		{"direct", `rows.map(row=><li key={row.id}>{row.label}</li>)`, true},
		{"indexed", `rows['map'](row=><li key={row.id}>{row.label}</li>)`, true},
		{"template-indexed", "rows[`map`](row=><li key={row.id}>{row.label}</li>)", true},
		{"wrapped-member", `(rows.map)(row=><li key={row.id}>{row.label}</li>)`, true},
		{"asserted-member", `(rows.map as typeof rows.map)(row=><li key={row.id}>{row.label}</li>)`, true},
		{"satisfied-member", `(rows.map satisfies typeof rows.map)(row=><li key={row.id}>{row.label}</li>)`, true},
		{"non-null-member", `(rows.map)!(row=><li key={row.id}>{row.label}</li>)`, true},
		{"wrapped-callback", `rows.map((row=><li key={row.id}>{row.label}</li>))`, true},
		{"non-null-callback", `rows.map(((row:Row)=><li key={row.id}>{row.label}</li>)!)`, true},
		{"function-callback", `rows.map(function(row){return <li key={row.id}>{row.label}</li>})`, true},
		{"block-callback", `rows.map(row=>{return <li key={row.id}>{row.label}</li>})`, true},
		{"nullable-returns", `rows.map(row=>{if(row.label)return <li key={row.id}>{row.label}</li>;return null})`, true},
		{"destructured-callback", `rows.map(({id,label})=><li>{label}</li>)`, true},
		{"renamed-destructuring", `rows.map(({id:identity,label:text})=><li>{text}</li>)`, true},
		{"default-destructuring", `rows.map(({id,label="fallback"}={id:"empty",label:""})=><li>{label}</li>)`, true},
		{"rest-destructuring", `rows.map(({id,...rest})=><li>{rest.label}</li>)`, true},
		{"default-identifier", `rows.map((row={id:"empty",label:""})=><li>{row.label}</li>)`, true},
		{"typed-destructuring", `rows.map(({id,label}:Row)=><li>{label}</li>)`, true},
		{"readonly-array", `rows.map(row=><li key={row.id}>{row.label}</li>)`, true},
		{"primitive-key", `props.names.map(name=><li>{name}</li>)`, true},
		{"custom-method", `custom.map(row=><li key={row.id}>{row.label}</li>)`, false},
		{"indexed-custom-method", `custom['map'](row=><li key={row.id}>{row.label}</li>)`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				custom := ""
				if !c.native {
					custom = `const custom={map(callback:(row:Row)=>unknown){return props.rows.slice().reverse().map(row=><li key={row.id}>{row.label}</li>)}};`
				}
				view := "Row[]"
				if c.name == "readonly-array" {
					view = "readonly Row[]"
				}
				source := `interface Row{/** @exact key */ id:string;label:string}export function Lists(props:{rows:` + view + `;names:string[]}){const rows=props.rows;` + custom + `return()=> <ul>{` + c.expression + `}</ul>}`
				response := collectionCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("lost portable collection source: %#v %#v", collectionDiagnosticDetails(response.Diagnostics), len(response.Analysis.Components))
				}
				if c.native && !strings.Contains(response.Code, ".id") && c.name != "primitive-key" {
					t.Fatalf("lost inferred or explicit key proof: %s", response.Code)
				}
				if !c.native && (!strings.Contains(response.Code, "__exactKeyedChild") || strings.Contains(response.Code, "__exactMapKeyedChildren(this, custom") || strings.Contains(response.Code, "this.map(custom")) {
					t.Fatalf("custom method lost its own call semantics: %s", response.Code)
				}
			})
		}
	}
}

// Eager render callbacks cannot hide state writes behind equivalent member or callable syntax.
func TestCollectionSubsystemRenderEffects(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, method := range []string{"map", "reduce", "reduceRight", "filter", "find", "findIndex", "every", "some", "flatMap", "forEach", "sort", "toSorted"} {
		for _, shape := range []string{"direct", "indexed", "wrapped-member", "wrapped-callback"} {
			member := `[1].` + method
			if shape == "indexed" {
				member = `[1]['` + method + `']`
			} else if shape == "wrapped-member" {
				member = `(` + member + `)`
			}
			callback := `row=>{this.state.count++;return row}`
			if shape == "wrapped-callback" {
				callback = `(` + callback + `)`
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(method+"/"+shape+"/"+string(target), func(t *testing.T) {
					source := `export function Lists(){this.state.count=0;return()=> <p>{` + member + `(` + callback + `)}</p>}`
					response := collectionCompileSource(t, root, config, source, target)
					if !hasDiagnosticCode(response.Diagnostics, "EXACT_RENDER") {
						t.Fatalf("eager state write was accepted: %#v", response.Diagnostics)
					}
				})
			}
		}
	}
	// The same writes remain valid in event callbacks, which execute under interaction ownership.
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run("event-control/"+string(target), func(t *testing.T) {
			response := collectionCompileSource(t, root, config, `export function Lists(){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>}`, target)
			if hasDiagnosticCode(response.Diagnostics, "EXACT_RENDER") {
				t.Fatalf("event write acquired eager render ownership: %#v", response.Diagnostics)
			}
		})
	}
}

// The fixture owns real framework and library resolution without requiring generated package files.
func collectionSourceFixture(t *testing.T) (string, string) {
	t.Helper()
	root, err := os.MkdirTemp(".", ".collection-source-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true}}`), 0600); err != nil {
		t.Fatal(err)
	}
	return root, config
}

func collectionCompileSource(t *testing.T, root, config, source string, target Target) Response {
	t.Helper()
	entry := filepath.Join(root, "Lists.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	return response
}

func collectionDiagnosticDetails(diagnostics []Diagnostic) []string {
	result := make([]string, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		result = append(result, diagnostic.Code+": "+diagnostic.Message)
	}
	return result
}

// Literal field names are values, while inferred primitive keys must satisfy the provider signature.
func TestCollectionSubsystemKeyTypes(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, field := range []string{"id-key", "🍎", "0", "quote\"key", "slash\\key"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(field+"/"+string(target), func(t *testing.T) {
				source := `interface Row{/** @exact key */ ` + strconv.Quote(field) + `:string;label:string}export function Lists(props:{rows:Row[]}){return()=> <ul>{props.rows.map(row=><li>{row.label}</li>)}</ul>}`
				response := collectionCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 {
					t.Fatalf("literal key rejected: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
				parsed := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/generated.ts", Path: tspath.Path("/generated.ts")}, response.Code, core.ScriptKindTS)
				found := false
				walkNode(parsed.AsNode(), func(node *ast.Node) bool {
					if ast.IsElementAccessExpression(node) {
						key := node.AsElementAccessExpression().ArgumentExpression
						if ast.IsStringLiteral(key) && key.Text() == field {
							found = true
						}
					}
					return true
				})
				if !found {
					t.Fatalf("literal field lost indexed key emission for %s", field)
				}
			})
		}
	}
	for _, c := range []struct {
		valueType string
		keyed     bool
	}{{"string", true}, {"number", true}, {"'a'|'b'", true}, {"1|2", true}, {"string|number", true}, {"boolean", false}, {"bigint", false}, {"symbol", false}, {"unknown", false}} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.valueType+"/"+string(target), func(t *testing.T) {
				response := collectionCompileSource(t, root, config, `export function Lists(props:{rows:(`+c.valueType+`)[]}){return()=> <ul>{props.rows.map(row=><li>{String(row)}</li>)}</ul>}`, target)
				if len(response.Diagnostics) != 0 {
					t.Fatalf("primitive map rejected: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
				keyed := strings.Contains(response.Code, "__exactMapKeyedChildren") || strings.Contains(response.Code, "__exactKeyedChild")
				if keyed != c.keyed {
					t.Fatalf("key type %s inferred=%v, expected=%v", c.valueType, keyed, c.keyed)
				}
			})
		}
	}
}
