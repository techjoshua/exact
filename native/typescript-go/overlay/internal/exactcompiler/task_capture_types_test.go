package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestPortableTaskCaptureTypeScopes(t *testing.T) {
	factory := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	reference := func(name string) *ast.Node {
		return factory.NewTypeReferenceNode(factory.NewIdentifier(name), nil)
	}
	callable := func(constraint, result *ast.Node) *ast.Node {
		parameter := factory.NewTypeParameterDeclaration(nil, factory.NewIdentifier("T"), constraint, nil, nil)
		return factory.NewFunctionTypeNode(factory.NewNodeList([]*ast.Node{parameter}), nil, result)
	}
	local := callable(nil, reference("T"))
	for _, candidate := range []struct {
		name     string
		typeNode *ast.Node
		portable bool
	}{
		{"primitive", factory.NewKeywordTypeNode(ast.KindStringKeyword), true},
		{"enclosing name", reference("T"), false},
		{"callable parameter", local, true},
		{"source-owned constraint", callable(reference("Source"), reference("T")), false},
		{"source-owned return", callable(nil, reference("Source")), false},
		{"sibling scope", factory.NewUnionTypeNode(factory.NewNodeList([]*ast.Node{local, reference("T")})), false},
		{"value query", factory.NewTypeQueryNode(factory.NewIdentifier("value"), nil), false},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			if portableTaskCaptureType(candidate.typeNode) != candidate.portable {
				t.Fatal("capture annotation escaped its lexical ownership")
			}
		})
	}
}

// The reduced source retains the reported finally receiver and library reference.
// The portable control also requires concrete executable temporary annotations.
func TestScratchReceiverTypeFactControls(t *testing.T) {
	fixtures := []struct {
		name, source string
		portable     bool
	}{
		{"cleanup-library", `import {TaskContext,type Component} from '@exactjs/core';


/** Exercises cancellation in finalization and non-assignment state writes. */
export function CleanupProbe(
	this: Component<{ count: number; items: string[]; rows: Map<string, string> }>,
	props: { mode: string }
) {
	this.state.count = 0;
	this.state.items = [];
	this.state.rows = new Map();
	// The compiler consumes this policy parameter even when the task body does not read it.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const run = async (text: string, task: TaskContext = TaskContext.client().latest()) => {
		try {
			await navigator.clipboard.writeText(text);
		} finally {
			if (props.mode === 'increment') this.state.count++;
			if (props.mode === 'alias') {
				const state = this.state;
				state.count++;
			}
			if (props.mode === 'return') return (this.state.count += 1);
			if (props.mode === 'expression') {
				const changed = (this.state.count += 1);
				void changed;
			}
			if (props.mode === 'array') this.state.items.push(text);
			if (props.mode === 'map') this.state.rows.set(text, text);
		}
	};
	return () => (
		<section>
			<button onClick={() => run('first')}>First</button>
			<button onClick={() => run('second')}>Second</button>
			<output>
				{this.state.count}:{this.state.items.length}:{this.state.rows.size}
			</output>
		</section>
	);
}`, false},
		{"portable", `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>,props:{mode:string}){this.state.count=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{try{await Promise.resolve();}finally{if(props.mode==='increment')this.state.count++;const state=this.state;state['count']+=1;}};return()=> <button onClick={()=>run()}>{this.state.count}</button>;}`, true},
	}
	for _, fixture := range fixtures {
		for _, invalid := range []bool{false, true} {
			source := fixture.source
			if invalid {
				source = strings.Replace(source, "this.state.count++", "this.state.count = 'bad'", 1)
			}
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				t.Run(fmt.Sprintf("%s/invalid=%t/%s", fixture.name, invalid, target), func(t *testing.T) {
					kind := "compile"
					if target == TargetDefault {
						kind = "check"
					}
					response := NewSession().Execute(Request{ID: "receiver-fact.tsx", Kind: kind, Target: target, Diagnostics: "semantic", ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
					if response.Error != "" || hasDiagnosticCode(response.Diagnostics, "TS2322") != invalid || (!invalid && len(response.Diagnostics) != 0) {
						t.Fatalf("authored constraint changed: %s %#v", response.Error, response.Diagnostics)
					}
					if !invalid && target == TargetClient {
						if !strings.Contains(response.Code, "__exactMutation_") {
							t.Fatal("receiver temporary path did not emit")
						}
						if fixture.portable {
							parsed := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/emitted.ts", Path: tspath.Path("/emitted.ts")}, response.Code, core.ScriptKindTS)
							typedReceiver, typedValue := false, false
							walkNode(parsed.AsNode(), func(node *ast.Node) bool {
								if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && strings.HasPrefix(node.Name().Text(), "__exactMutation_") {
									annotation := node.AsVariableDeclaration().Type
									if annotation != nil {
										typedValue = typedValue || annotation.Kind == ast.KindNumberKeyword
										if ast.IsTypeLiteralNode(annotation) {
											walkNode(annotation, func(member *ast.Node) bool {
												if ast.IsPropertySignatureDeclaration(member) && member.Name().Text() == "count" && member.Type() != nil && member.Type().Kind == ast.KindNumberKeyword {
													typedReceiver = true
												}
												return true
											})
										}
									}
								}
								return true
							})
							if !typedReceiver || !typedValue {
								t.Fatalf("portable receiver/value annotations erased: %s", response.Code)
							}
						}
					}
				})
			}
		}
	}
}

// Module value certificates retain both sides of a computed mutation's type
// relationship. A private island parameter must not capture the authored key.
func TestTaskCaptureModuleSymbolRelationship(t *testing.T) {
	for _, key := range []string{"key", "props"} {
		source := strings.ReplaceAll(`import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[key]+=1;};return()=> <button onClick={()=>run()}/>;}`, "key", key)
		for _, invalid := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/invalid=%t", key, invalid), func(t *testing.T) {
				authored := source
				if invalid {
					authored = strings.Replace(authored, "+=1", "='bad'", 1)
				}
				response := NewSession().Execute(Request{ID: "module-symbol-receiver.tsx", Kind: "compile", Target: TargetClient, Diagnostics: "semantic", ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: authored})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if invalid {
					if !hasDiagnosticCode(response.Diagnostics, "TS2322") {
						t.Fatalf("lost authored value constraint: %#v", response.Diagnostics)
					}
					return
				}
				if len(response.Diagnostics) != 0 {
					t.Fatalf("module symbol relationship rejected: %#v", response.Diagnostics)
				}
				parsed := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/emitted.ts", Path: tspath.Path("/emitted.ts")}, response.Code, core.ScriptKindTS)
				annotations := map[string]*ast.Node{}
				walkNode(parsed.AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) {
						annotations[node.Name().Text()] = node.AsVariableDeclaration().Type
					}
					return true
				})
				acquired := 0
				receivers := 0
				walkNode(parsed.AsNode(), func(node *ast.Node) bool {
					if !ast.IsBinaryExpression(node) {
						return true
					}
					assignment := node.AsBinaryExpression()
					if assignment.OperatorToken.Kind == ast.KindEqualsToken && ast.IsIdentifier(assignment.Left) && strings.HasPrefix(assignment.Left.Text(), "__exactMutation_") && ast.IsPropertyAccessExpression(assignment.Right) && assignment.Right.AsPropertyAccessExpression().Name().Text() == "state" {
						receivers++
						annotation := annotations[assignment.Left.Text()]
						matched := false
						if annotation != nil && ast.IsTypeLiteralNode(annotation) {
							walkNode(annotation, func(member *ast.Node) bool {
								if ast.IsPropertySignatureDeclaration(member) && ast.IsComputedPropertyName(member.Name()) && member.Type() != nil && member.Type().Kind == ast.KindNumberKeyword {
									expression := member.Name().AsComputedPropertyName().Expression
									matched = matched || ast.IsIdentifier(expression) && expression.Text() == key
								}
								return true
							})
						}
						if !matched {
							t.Error("receiver acquisition lost its computed symbol member")
						}
					}
					if assignment.OperatorToken.Kind != ast.KindEqualsToken || !ast.IsIdentifier(assignment.Left) || !ast.IsIdentifier(assignment.Right) || assignment.Right.Text() != key || !strings.HasPrefix(assignment.Left.Text(), "__exactMutation_") {
						return true
					}
					acquired++
					annotation := annotations[assignment.Left.Text()]
					if annotation == nil || !ast.IsTypeQueryNode(annotation) || annotation.AsTypeQueryNode().ExprName.Text() != key {
						t.Errorf("raw key acquisition lost its module value type")
					}
					return true
				})
				if acquired == 0 || receivers == 0 {
					t.Fatal("no raw computed-key acquisition exercised")
				}
			})
		}
	}
}
