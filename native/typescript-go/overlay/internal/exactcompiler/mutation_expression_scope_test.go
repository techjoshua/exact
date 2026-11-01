package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"strings"
	"testing"
)

// Refusal must leave native parameter assignments and their visitable children intact.
func TestMutationInitializerArtifacts(t *testing.T) {
	cases := []struct {
		name, source string
		owned        bool
	}{
		{"reported", `const Number=(a=0,b=(a=1))=>a;const obj={item:{value:"safe"}};if(Number())obj.item={get value(){return document.title}};export const value=obj.item.value;export const stable="safe";`, true},
		{"neutral", `const work=(a=0,b=(a=1))=>a;export const value=work();`, true},
		{"read", `const work=(a=0,b=a)=>b;export const value=work();`, false},
		{"body", `const work=(a=0,b=0)=>{a=1;return a};export const value=work();`, true},
		{"member", `const work=(a={value:0},b=(a.value=1))=>a.value;export const value=work();`, true},
		{"nested", `const work=(a={value:0},b=0,c=(b=(a.value=1)))=>a.value+b;export const value=work();`, true},
		{"order", `export const work=(owner:{child:{value:number};trace:string},value=(owner.child["value"]=(owner.trace+="R",1)))=>value;`, true},
	}
	for _, c := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "initializer.ts", Target: target, Source: c.source})
				assertReactiveCompilation(t, response, c.source)
				parsed := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/generated.ts", Path: tspath.Path("/generated.ts")}, response.Code, core.ScriptKindTS)
				owned := 0
				walkNode(parsed.AsNode(), func(n *ast.Node) bool {
					if ast.IsArrowFunction(n) && n.Body() == nil {
						t.Fatal("nil arrow body")
					}
					if ast.IsFunctionDeclaration(n) && n.Name() != nil && strings.HasPrefix(n.Name().Text(), "__exact_owned_") {
						owned++
					}
					return true
				})
				want := 0
				if target == TargetServer && c.owned {
					want = 1
				}
				if owned != want {
					t.Fatalf("owned entries=%d want %d", owned, want)
				}
				if c.name == "nested" && target == TargetServer {
					fencedChild := false
					walkNode(parsed.AsNode(), func(n *ast.Node) bool {
						if !ast.IsBinaryExpression(n) {
							return true
						}
						assignment := n.AsBinaryExpression()
						if assignment.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(assignment.Left) || assignment.Left.Text() != "b" {
							return true
						}
						fence, write := false, false
						walkNode(assignment.Right, func(child *ast.Node) bool {
							if ast.IsIdentifier(child) {
								fence = fence || child.Text() == "__exactTaskMutation"
								write = write || child.Text() == "__exactWrite"
							}
							return true
						})
						fencedChild = fencedChild || (fence && write)
						return true
					})
					if !fencedChild {
						t.Fatal("lost native outer assignment or nested fenced lowering")
					}
				}
			})
		}
	}
}

// Exercise the lowering owner itself, including its local-frame recursion and restoration.
func TestMutationExpressionScope(t *testing.T) {
	for _, c := range []struct {
		name, source      string
		kind              ast.Kind
		frames            int
		matching, lowered bool
	}{
		{"read", `function f(a=0,b=a){}`, ast.KindIdentifier, 0, false, false},
		{"bare", `function f(a=0,b=(a=1)){}`, ast.KindBinaryExpression, 0, false, false},
		{"bare enclosing", `function f(a=0,b=(a=1)){}`, ast.KindBinaryExpression, 1, false, false},
		{"member local", `function f(a={value:0},b=(a.value=1)){}`, ast.KindBinaryExpression, 0, false, true},
		{"member enclosing", `function f(a={value:0},b=(a.value=1)){}`, ast.KindBinaryExpression, 1, false, true},
		{"member matching", `function f(a={value:0},b=(a.value=1)){}`, ast.KindBinaryExpression, 1, true, true},
		{"body no frame", `function f(a:{value:number}){a.value=1}`, ast.KindBinaryExpression, 0, false, false},
		{"body frame", `function f(a:{value:number}){a.value=1}`, ast.KindBinaryExpression, 1, false, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/input.ts", Path: tspath.Path("/input.ts")}, c.source, core.ScriptKindTS)
			var selected *ast.Node
			walkNode(source.AsNode(), func(n *ast.Node) bool {
				if n.Kind == c.kind {
					selected = n
				}
				return true
			})
			if selected == nil {
				t.Fatal("missing source node")
			}
			context := printer.NewEmitContext()
			lowering := &jsxLowering{sourceFile: source, factory: context.Factory, target: TargetServer}
			lowering.names.write = "write"
			lowering.visitor = ast.NewNodeVisitor(func(n *ast.Node) *ast.Node { return n }, &context.Factory.NodeFactory, ast.NodeVisitorHooks{})
			var outer *mutationFrame
			if c.frames > 0 {
				outer = &mutationFrame{}
				if c.matching {
					outer.work = selected
				}
				lowering.mutationFrames = append(lowering.mutationFrames, outer)
			}
			result := lowering.lowerSelectedStateWrite(selected, StateWrite{Start: selected.Pos(), Length: selected.End() - selected.Pos(), Operation: "assignment"}, nil, false, nil)
			if (result != nil) != c.lowered {
				t.Fatalf("lowered=%v want %v", result != nil, c.lowered)
			}
			if len(lowering.mutationFrames) != c.frames {
				t.Fatal("leaked initializer frame")
			}
			if outer != nil && !c.matching && strings.Contains(c.name, "enclosing") && len(outer.declarations) != 0 {
				t.Fatal("initializer temporaries escaped to enclosing frame")
			}
			if result != nil {
				walkNode(result, func(n *ast.Node) bool {
					if ast.IsArrowFunction(n) && n.Body() == nil {
						t.Fatal("nil synthetic body")
					}
					return true
				})
			}
			if !c.lowered && (lowering.mutationNames != nil || len(lowering.mutationFrames) > c.frames) {
				t.Fatal("refusal allocated lowering state")
			}
		})
	}
}
