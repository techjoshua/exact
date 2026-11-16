package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Real source selection and the original binder supply associations. Return
// branches remain conditional source descriptions, never normal output proof.
func TestStagedCallReturnSourcesOriginalAssociations(t *testing.T) {
	const fixture = `function factory(value:unknown){if(value)return()=>window.name;return value}export function invoke(value:unknown){return factory(value)}`
	for _, delivered := range []bool{false, true} {
		withSourceCalleeWriteQuery(t, fixture, func(query *sourceValueQuery, operation *ast.Node) {
			association := returnSourceAssociation(t, query, operation, delivered)
			plan, valid := describeStagedCallReturnSources(association, query.executable)
			if !valid || plan.call.inputs != association.inputs || plan.call.sourceInputs != association.sourceInputs || plan.operation != operation || plan.declaration != association.invocation.declaration || len(plan.branches) != 2 {
				t.Fatal("original association/pointer identity or return inventory lost")
			}
			cut := association.invocation.cut
			if delivered {
				cut = association.inputs.relative.cut
			}
			if plan.branches[0].pending || !ast.IsArrowFunction(plan.branches[0].endpoint.expression) || plan.branches[1].endpoint.kind != relativeEndpointRole || plan.branches[1].endpoint.role.kind != relativeRoleFormal || plan.branches[1].endpoint.role.slot != 0 {
				t.Fatal("known dormant literal/formal data role lost")
			}
			for _, branch := range plan.branches {
				if branch.endpoint.producer != plan.declaration || branch.endpoint.creation != operation || branch.endpoint.returning != branch.returning || branch.endpoint.cut != cut {
					t.Fatal("creating Call/return/association cut retargeted")
				}
			}
			original := association.invocation.actuals[0].expression
			plan.call.invocation.actuals[0].expression = operation
			if association.invocation.actuals[0].expression != original {
				t.Fatal("invocation slice borrowed")
			}
			wrong := association
			wrong.invocation.actuals = append([]sourceRelativeActual(nil), association.invocation.actuals...)
			wrong.invocation.actuals[0].expression = operation
			if _, valid := describeStagedCallReturnSources(wrong, query.executable); valid {
				t.Fatal("wrong vector admitted")
			}
			wrong = association
			wrong.invocation.cut.reading = nil
			if _, valid := describeStagedCallReturnSources(wrong, query.executable); valid {
				t.Fatal("wrong original graph cut admitted")
			}
			wrong = association
			wrong.inputs = nil
			wrong.sourceInputs = nil
			if _, valid := describeStagedCallReturnSources(wrong, query.executable); valid {
				t.Fatal("missing association manufactured creating inputs")
			}
		})
	}
}

func returnSourceAssociation(t *testing.T, query *sourceValueQuery, operation *ast.Node, delivered bool) sourceStagedDeclarationCall {
	t.Helper()
	if delivered {
		facts := installationSourceFacts(query)
		fact := &facts[installationFactIndex(t, facts, enclosingCallableNode(operation))]
		invocation, gap := describeStagedDeclarationInvocation(fact, operation, query.owner.checker, query.executable)
		if gap != stagedCallSupported {
			t.Fatal("original declaration selection unavailable")
		}
		inputs, ok := bindStagedDeclarationInputs(fact, invocation, query.executable)
		if !ok {
			t.Fatal("original B unavailable")
		}
		return sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: invocation, inputs: inputs}
	}
	source, ok := describeStagedInputSubstitution(operation, enclosingCallableNode(operation), query.executable)
	if !ok {
		t.Fatal("original sourceInputs unavailable")
	}
	return sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: source.invocation, sourceInputs: source}
}

func TestStagedCallReturnSourcesPendingAndEmpty(t *testing.T) {
	for _, row := range []struct {
		name, source string
		kind         sourceRelativeEndpointKind
		pending      bool
		branches     int
	}{
		{"local", `function factory(value:unknown){const local=value;return local}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"written formal", `function factory(value:unknown){value=1;return value}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"captured callable", `function factory(value:unknown){return()=>value}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"raw native result", `function factory(value:unknown){return Object.freeze({value})}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"raw Get", `function factory(value:unknown){return window.name}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"conditional", `function factory(value:unknown){return value?1:2}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, true, 1},
		{"bare", `function factory(value:unknown){return}export function invoke(value:unknown){return factory(value)}`, relativeEndpointUndefined, false, 1},
		{"known beside unknown", `declare const foreign:unknown;function factory(value:unknown){if(value)return()=>window.name;return foreign}export function invoke(value:unknown){return factory(value)}`, relativeEndpointExpression, false, 2},
		{"no return", `function factory(value:unknown){}export function invoke(value:unknown){return factory(value)}`, relativeEndpointUnknown, false, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, operation *ast.Node) {
				// The source association domain itself refuses a written callee formal.
				// Obtain a real selected invocation only where the existing owner admits it.
				if row.name == "written formal" {
					if _, ok := describeStagedInputSubstitution(operation, enclosingCallableNode(operation), query.executable); ok {
						t.Fatal("written formal unexpectedly acquired entry association")
					}
					return
				}
				association := returnSourceAssociation(t, query, operation, false)
				plan, valid := describeStagedCallReturnSources(association, query.executable)
				if !valid || len(plan.branches) != row.branches {
					t.Fatal("known/unsupported original return sources dropped")
				}
				if row.branches == 0 {
					return
				}
				branch := plan.branches[0]
				if row.name == "known beside unknown" && (!plan.branches[1].pending || plan.branches[1].binding == nil) {
					t.Fatal("unknown source sibling lost beside dormant literal")
				}
				if branch.endpoint.kind != row.kind || branch.pending != row.pending {
					t.Fatalf("branch=%+v", branch)
				}
				if row.name == "local" && branch.binding == nil {
					t.Fatal("local checker binding lost")
				}
				if row.name == "captured callable" && len(branch.captures) != 1 {
					t.Fatal("original template capture relationship lost")
				}
				if row.name == "bare" && branch.endpoint.expression != nil {
					t.Fatal("bare return invented an expression")
				}
			})
		})
	}
}

func TestStagedCallReturnSourcesDistinctCreatingCalls(t *testing.T) {
	withSourceCalleeWriteQuery(t, `function factory(value:unknown){return()=>window.name}export function invoke(value:unknown){factory(value);return factory(value)}`, func(query *sourceValueQuery, last *ast.Node) {
		var calls []*ast.Node
		walkNode(enclosingCallableNode(last).Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "factory" {
				calls = append(calls, node)
			}
			return true
		})
		if len(calls) != 2 {
			t.Fatal("original creating Calls missing")
		}
		first, ok := describeStagedCallReturnSources(returnSourceAssociation(t, query, calls[0], false), query.executable)
		second, other := describeStagedCallReturnSources(returnSourceAssociation(t, query, calls[1], false), query.executable)
		if !ok || !other || first.branches[0].endpoint.creation == second.branches[0].endpoint.creation || first.branches[0].endpoint.cut == second.branches[0].endpoint.cut {
			t.Fatal("distinct creating associations collapsed")
		}
	})
}
