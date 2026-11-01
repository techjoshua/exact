package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"strings"
	"testing"
)

// Role witnesses separate the native destination from evaluated receivers, keys and RHS work.
func TestNativePatternReferenceRoles(t *testing.T) {
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/roles.ts", Path: tspath.Path("/roles.ts")}, `[owner.values[0]=(owner.values=next,3)]=input;owner.value=1;[...owner.values]=input;for(owner.value of input){}`, core.ScriptKindTS)
	counts := map[nativeAssignmentRole]int{}
	walkNode(source.AsNode(), func(n *ast.Node) bool {
		role := nativeAssignmentTargetRole(n)
		if ast.IsBinaryExpression(n) && role == nativeAssignmentPattern {
			lowering := &jsxLowering{}
			if lowering.lowerSelectedStateWrite(n, StateWrite{}, nil, false, nil) != nil || len(lowering.mutationFrames) != 0 {
				t.Fatal("native default entered eager selected-write scope")
			}
		}
		counts[role]++
		if nativeAssignmentPatternTarget(n) != (role != nativeAssignmentNone) {
			t.Fatal("changed legacy role projection")
		}
		if ast.IsBinaryExpression(n) {
			b := n.AsBinaryExpression()
			if ast.IsPropertyAccessExpression(b.Left) && role != nativeAssignmentNone {
				t.Fatal("ordinary or RHS assignment became pattern default")
			}
		}
		if ast.IsElementAccessExpression(n) && role != nativeAssignmentPattern {
			t.Fatal("lost actual indexed pattern member")
		}
		if ast.IsPropertyAccessExpression(n) && n.Parent != nil && ast.IsElementAccessExpression(n.Parent) && role != nativeAssignmentNone {
			t.Fatal("receiver is not a destination")
		}
		if ast.IsNumericLiteral(n) && role != nativeAssignmentNone {
			t.Fatal("key or RHS is not a destination")
		}
		return true
	})
	for _, role := range []nativeAssignmentRole{nativeAssignmentNone, nativeAssignmentPattern, nativeAssignmentRest, nativeAssignmentLoop} {
		if counts[role] == 0 {
			t.Fatalf("unexecuted role %v", role)
		}
	}
}

// Plan/type/emission checks require actual targets even without a default binary operation.
func TestNativeHelperPatternReferences(t *testing.T) {
	for _, source := range []string{
		`export function work(owner:{value:number;values:number[]},input:number[]){return ([owner.value,owner.values[0]]=input);}`,
		`export function work(owner:{value:number;values:number[]},input:(number|undefined)[]){return ([owner.value=3,owner.values[0]=0]=input);}`,
		`export function work(owner:{value:number},input:{value?:number}){return ({value:owner.value=3}=input);}`,
		`export function work(owner:{values:number[];replacement:number[]},input:(number|undefined)[]){return ([owner.values[0]=(owner.values=owner.replacement,3)]=input);}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(string(target)+source, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "native-pattern.ts", Target: target, Diagnostics: "semantic", Source: source})
				assertReactiveCompilation(t, response, source)
				var summary *CallableSummary
				for i := range response.Analysis.Callables {
					if response.Analysis.Callables[i].Name == "work" {
						summary = &response.Analysis.Callables[i]
					}
				}
				if summary == nil || len(summary.StateWrites) == 0 {
					t.Fatal("native destinations missing from summary")
				}
				seen := map[string]bool{}
				for _, write := range summary.StateWrites {
					if seen[write.Path] {
						t.Fatal("duplicate write fact")
					}
					seen[write.Path] = true
				}
				parsed := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/emitted.ts", Path: tspath.Path("/emitted.ts")}, response.Code, core.ScriptKindTS)
				setters, entries := 0, 0
				walkNode(parsed.AsNode(), func(n *ast.Node) bool {
					if ast.IsArrowFunction(n) && n.Body() == nil {
						t.Fatal("nil arrow")
					}
					if ast.IsSetAccessorDeclaration(n) {
						setters++
						if len(n.Parameters()) != 1 || n.Parameters()[0].AsParameterDeclaration().Type == nil {
							t.Fatal("missing destination type")
						}
					}
					if ast.IsFunctionDeclaration(n) && n.Name() != nil && strings.HasPrefix(n.Name().Text(), "__exact_owned_") {
						entries++
					}
					return true
				})
				if target == TargetServer {
					if entries != 1 || setters == 0 {
						t.Fatal("missing owned native reference")
					}
				} else if entries != 0 || setters != 0 {
					t.Fatal("client gained private machinery")
				}
			})
		}
	}
}
