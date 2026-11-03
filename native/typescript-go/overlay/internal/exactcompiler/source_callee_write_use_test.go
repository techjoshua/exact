package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Borrow admission uses original cuts and source mapping only to preserve the
// existing negative availability interval. It supplies no positive write fact.
func TestSourceCalleeWriteBorrowLifetime(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		body := enclosingCallableNode(call)
		captured := &acquiredCallableScope{bindings: sourceValueBindings{2: {{node: body}}}}
		bindings := sourceValueBindings{1: {{node: call, capture: captured}}}
		release := q.beginCalleeAcquisition(call, bindings)
		if release == nil {
			t.Fatal("source pending interval not issued")
		}
		released := false
		defer func() {
			if !released {
				release()
			}
		}()
		borrow := q.calleeWriteBorrow(call, bindings)
		if !borrow.live(q) {
			t.Fatal("original pending header not associated")
		}
		otherQuery := *q
		if borrow.live(&otherQuery) || otherQuery.calleeWriteBorrow(call, bindings).header != nil {
			t.Fatal("query copy borrowed issuing interval")
		}
		q.initializing = call
		if q.calleeWriteBorrow(call, bindings).header != nil {
			t.Fatal("changed cuts issued association")
		}
		q.initializing = nil
		captured.bindings[2] = []sourceValue{{node: call}}
		if q.calleeWriteBorrow(call, bindings).header != nil {
			t.Fatal("independent captured mapping borrowed original interval")
		}
		captured.bindings[2] = []sourceValue{{node: body}}
		wrong := borrow
		wrong.call = body
		if wrong.live(q) {
			t.Fatal("wrong issuer retained interval")
		}
		view := q.receiverWriteCandidates(call, bindings)
		if len(view.dependencies) == 0 || !view.dependencies[0].live(q) || len(view.dependencies[0].borrows) != 1 {
			t.Fatal("canonical interval association lost during changed receiver cuts")
		}
		if q.calleeWriteUse != nil {
			t.Fatal("receiver use leaked after traversal")
		}
		release()
		released = true
		if borrow.live(q) || view.dependencies[0].live(q) {
			t.Fatal("canonical release left a usable association")
		}
		// The same source Call can issue a later interval with other inputs.
		// An old header does not inherit that new interval's lifetime.
		captured.bindings[2] = []sourceValue{{node: call}}
		releaseNext := q.beginCalleeAcquisition(call, bindings)
		if releaseNext == nil {
			t.Fatal("independent source interval not issued")
		}
		defer releaseNext()
		if borrow.live(q) || !q.calleeWriteBorrow(call, bindings).live(q) {
			t.Fatal("independent interval lifetimes merged")
		}
	})
}

func TestSourceCalleeWriteAccountingIsAdvisory(t *testing.T) {
	q := &sourceValueQuery{owner: newSourceValueOwner(nil)}
	q.receiverWriteCandidates(nil, nil)
	q.calleeWriteBorrow(nil, nil)
	q.definitionWriteInventoryContext()
	q.inventoryLookupUnknown()
	if q.estimatedCost != 0 || q.owner.estimatedCostMaximum != 0 {
		t.Fatal("normal path paid source inspection hook cost")
	}
	q.dependenciesOnly = true
	q.remaining = 0
	if !q.definitionWriteInventoryContext() || q.estimatedCost == 0 || q.remaining != 0 {
		t.Fatal("source accounting became admission fuel or was not recorded")
	}
}
