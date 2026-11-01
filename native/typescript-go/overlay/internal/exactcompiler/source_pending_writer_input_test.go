package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This negative fence cannot travel with a query copy or another input frame,
// and it never changes projection/declaration recursion state or effect opacity.
func TestPendingWriterInputIdentityAndLifetime(t *testing.T) {
	session := NewSession()
	id := "/virtual/pending-writer-lifetime.ts"
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `function read(){return 1}read();read();`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	var calls []*ast.Node
	for _, project := range session.projects {
		walkNode(project.program.GetSourceFile(id).AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				calls = append(calls, node)
			}
			return true
		})
	}
	if len(calls) != 2 {
		t.Fatal("two actual source calls required")
	}
	owner := newSourceValueOwner(nil)
	inputs := &sourceValueInputs{}
	otherInputs := &sourceValueInputs{}
	query := sourceValueQuery{owner: owner, inputs: inputs, active: map[*ast.Node]bool{calls[0]: false, calls[1]: true}}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	var expired *sourcePendingWriterInput
	query.withPendingWriterInput(calls[0], &result, func() {
		expired = query.pendingWriterInput
		if !query.pendingWriterInputExcluded(calls[0], &result) || query.pendingWriterInputExcluded(calls[1], &result) {
			t.Fatal("wrong exact candidate association")
		}
		copied := query
		if copied.pendingWriterInputExcluded(calls[0], &result) {
			t.Fatal("copied query inherited fence")
		}
		query.inputs = otherInputs
		if query.pendingWriterInputExcluded(calls[0], &result) {
			t.Fatal("other frame inherited fence")
		}
		query.inputs = nil
		if query.pendingWriterInputExcluded(calls[0], &result) {
			t.Fatal("missing frame inherited installed fence")
		}
		query.inputs = inputs
		query.withPendingWriterInput(calls[1], &result, func() {
			if !query.pendingWriterInputExcluded(calls[0], &result) || !query.pendingWriterInputExcluded(calls[1], &result) {
				t.Fatal("nested matching lost original pending candidate")
			}
		})
		if query.pendingWriterInput != expired || !query.pendingWriterInputExcluded(calls[0], &result) {
			t.Fatal("nested scope did not restore prior fence")
		}
		if query.active[calls[0]] || !query.active[calls[1]] || len(query.active) != 2 {
			t.Fatal("projection recursion markers changed")
		}
	})
	if query.pendingWriterInput != nil || expired == nil || expired.active || expired.owner != nil || expired.call != nil || expired.inputs != nil || expired.prior != nil {
		t.Fatal("expired borrow retained state")
	}
	query.pendingWriterInput = expired
	if query.pendingWriterInputExcluded(calls[0], &result) {
		t.Fatal("expired borrow remained usable")
	}
	query.pendingWriterInput = nil
	if !result.opaque || !result.valueIncomplete {
		t.Fatal("negative fence erased unknown effects or value uncertainty")
	}
	if owner.work == 0 || query.facts < 2 {
		t.Fatal("matching allocation/traversal unaccounted")
	}
}

// Panic unwinding expires the inner borrow and restores the original scope,
// without mutating the preexisting genuine recursion marker.
func TestPendingWriterInputUnwind(t *testing.T) {
	query := sourceValueQuery{owner: newSourceValueOwner(nil), inputs: &sourceValueInputs{}}
	result := accessorCandidates{}
	prior := &sourcePendingWriterInput{owner: &query, active: true}
	query.pendingWriterInput = prior
	var expired *sourcePendingWriterInput
	func() {
		defer func() {
			if recover() != "matching stopped" {
				t.Fatal("expected matching panic")
			}
		}()
		query.withPendingWriterInput(nil, &result, func() { expired = query.pendingWriterInput; panic("matching stopped") })
	}()
	if query.pendingWriterInput != prior || expired == nil || expired.active || expired.owner != nil || expired.inputs != nil || expired.prior != nil {
		t.Fatal("panic retained borrowed matching state")
	}
}
