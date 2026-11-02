package exactcompiler

import (
	"slices"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Nested consumers charge only newly selected ledgers. Finish owns the entry
// snapshot even when the dispatcher selects different pending work afterward.
func TestNormalWorkNestedLedgerOwnership(t *testing.T) {
	outer, prefix, inner, later := &sourceNormalOperation{remaining: 80}, &sourceNormalOperation{remaining: 60}, &sourceNormalOperation{remaining: 50}, &sourceNormalOperation{remaining: 90}
	dispatcher := &sourceNormalDispatcher{pending: []*sourceNormalOperation{outer, outer}}
	query := &sourceValueQuery{owner: newSourceValueOwner(nil), remaining: 100, inputs: &sourceValueInputs{dispatcher: dispatcher}, argumentPrefix: &sourceArgumentPrefix{operation: prefix, prior: &sourceArgumentPrefix{operation: outer}}}
	result := accessorCandidates{}
	first := query.normalWork(&result, nil)
	if query.remaining != 58 || query.owner.work != 2 || len(query.workLedgers) != 2 {
		t.Fatal("entry ledger selection or charge changed")
	}
	dispatcher.pending = []*sourceNormalOperation{outer, prefix, inner}
	second := query.normalWork(&result, nil)
	if query.remaining != 49 || query.owner.work != 3 || len(query.workLedgers) != 3 {
		t.Fatal("nested work charged enclosing ledgers twice")
	}
	query.charge(&result, nil)
	query.charge(&result, nil)
	second.finish(&result)
	if inner.remaining != 47 || outer.remaining != 80 || prefix.remaining != 60 || len(query.workLedgers) != 2 || !query.workLedgers[outer] || !query.workLedgers[prefix] {
		t.Fatal("nested finish debited or released another interval")
	}
	dispatcher.pending = []*sourceNormalOperation{later}
	first.finish(&result)
	if outer.remaining != 67 || prefix.remaining != 47 || later.remaining != 90 || query.remaining != 47 || query.owner.work != 5 || query.workLedgers != nil {
		t.Fatal("finish lost the entry snapshot or prior nil state")
	}
}

func TestNormalWorkPriorMapRestoration(t *testing.T) {
	for _, priorNil := range []bool{false, true} {
		query := &sourceValueQuery{owner: newSourceValueOwner(nil), remaining: 100}
		if !priorNil {
			query.workLedgers = make(map[*sourceNormalOperation]bool)
		}
		alias := query.workLedgers
		result := accessorCandidates{}
		work := query.normalWork(&result, nil)
		query.charge(&result, nil)
		work.finish(&result)
		if (query.workLedgers == nil) != priorNil {
			t.Fatal("finish changed the prior empty-map state")
		}
		if !priorNil {
			sentinel := &sourceNormalOperation{}
			alias[sentinel] = true
			if !query.workLedgers[sentinel] {
				t.Fatal("finish replaced the prior map")
			}
		}
	}
	owned := &sourceNormalOperation{remaining: 4}
	alias := map[*sourceNormalOperation]bool{owned: true}
	query := &sourceValueQuery{owner: newSourceValueOwner(nil), remaining: 100, workLedgers: alias, inputs: &sourceValueInputs{dispatcher: &sourceNormalDispatcher{pending: []*sourceNormalOperation{owned}}}}
	result := accessorCandidates{}
	work := query.normalWork(&result, nil)
	if query.remaining != 100 || query.owner.work != 0 {
		t.Fatal("borrowed ledger changed entry accounting")
	}
	query.charge(&result, nil)
	work.finish(&result)
	if owned.remaining != 4 || !query.workLedgers[owned] || !alias[owned] {
		t.Fatal("borrowed ledger ownership was released or debited")
	}
}

// Deferred cleanup preserves partial result effects and debits work exactly once
// through ordinary completion, refusal and panic. Negative spent remains opaque.
func TestNormalWorkExitEffects(t *testing.T) {
	for _, exit := range []string{"return", "refusal", "panic", "negative spent"} {
		t.Run(exit, func(t *testing.T) {
			node := &ast.Node{}
			ledger := &sourceNormalOperation{remaining: 80}
			query := &sourceValueQuery{owner: newSourceValueOwner(nil), remaining: 100, inputs: &sourceValueInputs{dispatcher: &sourceNormalDispatcher{pending: []*sourceNormalOperation{ledger}}}}
			result := accessorCandidates{values: []sourceValue{{node: node}}}
			if exit == "negative spent" {
				result.ownedComponents = &sourceCandidateComponents{}
			}
			sentinel := &struct{}{}
			func() {
				defer func() {
					caught := recover()
					if exit == "panic" && caught != sentinel {
						t.Fatalf("panic=%v", caught)
					}
					if exit != "panic" && caught != nil {
						panic(caught)
					}
				}()
				defer query.normalWork(&result, node).finish(&result)
				if exit == "negative spent" {
					query.remaining = 85
					return
				}
				query.charge(&result, node)
				query.charge(&result, node)
				result.ownedLocalCauses = append(result.ownedLocalCauses, "body")
				if exit == "refusal" {
					result.opaque = true
					return
				}
				if exit == "panic" {
					panic(sentinel)
				}
			}()
			if query.workLedgers != nil || len(result.values) != 1 || result.values[0].node != node {
				t.Fatal("cleanup lost ledger or result ownership")
			}
			if exit == "negative spent" {
				if ledger.remaining != 0 || !result.opaque || !slices.Contains(result.ownedLocalCauses, "normal work negative spent") {
					t.Fatal("negative-spent effects were lost")
				}
				refs := candidateContributionReferences(result)
				if len(refs) != 1 || !refs[0].delta.opaque || refs[0].delta.cause != node || !slices.Contains(refs[0].delta.ownedLocalCauses, "normal work negative spent") {
					t.Fatal("negative-spent publication evidence was lost")
				}
			} else if ledger.remaining != 77 || query.owner.work != 3 || !slices.Contains(result.ownedLocalCauses, "body") || result.opaque != (exit == "refusal") {
				t.Fatal("exit changed result effects or debited work more than once")
			}
		})
	}
}
