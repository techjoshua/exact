package exactcompiler

import (
	"reflect"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Invocation callbacks receive the complete accumulated record and retain every
// update, including full header replacement and partial effects before a panic.
func TestAccessorInvocationResultTransfer(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "analyze", ID: "/virtual/invoke-result.ts", Source: `export function selected(value='safe'){return value}`, Diagnostics: "semantic"}
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	var body *ast.Node
	for _, project := range session.projects {
		if source := project.program.GetSourceFile(request.ID); source != nil {
			walkNode(source.AsNode(), func(node *ast.Node) bool {
				if ast.IsFunctionDeclaration(node) {
					body = node
					return false
				}
				return true
			})
		}
	}
	if body == nil {
		t.Fatal("missing callable source")
	}
	for _, panicAfter := range []bool{false, true} {
		t.Run(map[bool]string{false: "return", true: "panic"}[panicAfter], func(t *testing.T) {
			previousReturn := &ast.Node{}
			query := &sourceValueQuery{owner: newSourceValueOwner(nil), returning: previousReturn}
			bindings := sourceValueBindings{1: {{node: body}}}
			initial := accessorCandidates{opaque: true, valueIncomplete: true, ownedLocalCauses: []string{"before"}, values: []sourceValue{{node: body}}, callableScopes: map[int]acquiredCallableScope{0: {bindings: bindings}}}
			incoming := initial
			incoming.declarations = []*ast.Node{body}
			wanted := incoming
			wanted.opaque = false
			wanted.values = []sourceValue{{undefined: true}}
			wanted.effects = []sourceCallableEffect{{operation: body, declaration: body}}
			wanted.ownedLocalCauses = []string{"before", "callback"}
			result := initial
			calls := 0
			sentinel := &struct{}{}
			func() {
				defer func() {
					caught := recover()
					if panicAfter && caught != sentinel {
						t.Fatalf("panic=%v", caught)
					}
					if !panicAfter && caught != nil {
						panic(caught)
					}
				}()
				if !query.visitSourceCallableInvocation(body, nil, accessorInvoke, bindings, &result, func(selected *ast.Node, captures sourceValueBindings, r *accessorCandidates) {
					calls++
					if selected != body || query.returning != nil || !reflect.DeepEqual(captures, bindings) || !reflect.DeepEqual(*r, incoming) {
						t.Fatal("callback lost current inputs or accumulated facts")
					}
					captures[2] = captures[1]
					*r = wanted
					if panicAfter {
						panic(sentinel)
					}
				}) {
					t.Fatal("source invocation not selected")
				}
			}()
			if calls != 1 || !reflect.DeepEqual(result, wanted) || len(bindings) != 2 {
				t.Fatal("callback result or input effects lost")
			}
			if !panicAfter && query.returning != previousReturn {
				t.Fatal("return occurrence was not restored")
			}
		})
	}
}

// Result threading must preserve the existing prefix proof's selected source
// assignment and actual implicit-method inputs. Refused startup contributes no
// replacement or normal output authority.
func TestNumericPrefixBorrowedResult(t *testing.T) {
	for _, refused := range []bool{false, true} {
		t.Run(map[bool]string{false: "completed", true: "opaque prefix"}[refused], func(t *testing.T) {
			source := `const foreign={valueOf(){globalThis.Number=(()=>0) as unknown as NumberConstructor;return 0}};function activate(){+foreign}activate();export const selected=Number;`
			if refused {
				source = `declare function opaque():void;opaque();` + source
			}
			session := NewSession()
			request := Request{Kind: "analyze", ID: "/virtual/numeric-prefix-result.ts", Source: source, Diagnostics: "semantic"}
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			for _, project := range session.projects {
				file := project.program.GetSourceFile(request.ID)
				if file == nil {
					continue
				}
				var read, method, origin, activation *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && node.Name().Text() == "selected" {
						read = node.Initializer()
					}
					if ast.IsVariableDeclaration(node) && node.Name().Text() == "foreign" {
						origin = node.Initializer()
					}
					if ast.IsMethodDeclaration(node) {
						method = node
					}
					if ast.IsPrefixUnaryExpression(node) {
						activation = node
					}
					return true
				})
				if read == nil || method == nil || origin == nil || activation == nil {
					t.Fatal("missing numeric prefix source")
				}
				owner := project.callableCache.owner
				query := newSourceDependencyQuery(read, owner.values.checker, owner, nil)
				marker := &ast.Node{}
				seed := &sourceValueInputs{}
				result := accessorCandidates{producers: []*ast.Node{marker}, inputs: []*sourceValueInputs{seed}, values: []sourceValue{{node: marker}}}
				values, proved := query.numericBindingReplacement(owner.values.checker.GetSymbolAtLocation(read), read, nil, &result)
				if proved == refused {
					t.Fatalf("proof=%v want %v", proved, !refused)
				}
				if len(result.values) != 1 || result.values[0].node != marker || result.inputs[0] != seed || result.producers[0] != marker || len(result.normalCalls) != 0 || len(result.nativeCalls) != 0 {
					t.Fatal("prefix replaced accumulated facts or added normal output authority")
				}
				if refused {
					if len(values) != 0 || len(result.inputs) != 1 || len(result.producers) != 1 {
						t.Fatal("refusal published replacement facts")
					}
				} else {
					if len(values) != 1 || !ast.IsArrowFunction(unwrapSourceCallableReference(values[0].node)) || len(result.inputs) != 2 || len(result.producers) != 2 {
						t.Fatal("completed proof lost the source replacement")
					}
					inputs := result.inputs[1]
					if inputs.declaration != method || inputs.invocation != activation || inputs.implicit == nil || inputs.implicit.operation != activation || inputs.implicit.receiver != origin || len(inputs.bindings[0]) != 1 || inputs.bindings[0][0].node != origin {
						t.Fatal("implicit method inputs changed")
					}
				}
				return
			}
			t.Fatal("missing numeric prefix project")
		})
	}
}
