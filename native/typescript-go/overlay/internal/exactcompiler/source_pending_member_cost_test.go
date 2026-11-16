package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source-edge deduplication preserves alternative order and consumes each donor delivery once.
func TestPendingMemberDeliveryTailAndNoopRevision(t *testing.T) {
	withWriterInputGraph(t, pendingMemberSource, func(q *sourceValueQuery, call *ast.Node, _ *sourceWriterInputGraph) {
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		q.initializing, q.pendingMemberRequest = call, r
		q.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
		q.pendingMemberRequest = nil
		if r.member.phase != memberAcknowledged || len(r.member.values) == 0 {
			t.Fatal("missing real source donor transfer")
		}
		ledger := r.member.publisher.fact.pendingMembers
		facts := []callableFacts{*r.member.publisher.fact, {node: r.member.values[0].node}}
		work := newCallableEffectWork(facts)
		delivered := ledger.stats.NewDonorDeliveries
		for i := 0; i < 16; i++ {
			if work.refreshPendingMembers(facts, 0) {
				t.Fatal("unchanged revision refreshed")
			}
		}
		ledger.revision++ // a distinct relative obligation, with no new donor
		if !work.refreshPendingMembers(facts, 0) || ledger.stats.NewDonorDeliveries != delivered || ledger.stats.RefreshNoops < 16 || len(work.memberCallers[1]) != 1 {
			t.Fatal("revision replayed accumulated donors", ledger.stats)
		}
		clone := clonePendingMemberLedger(ledger)
		clone.newDonors[0] = nil
		if ledger.newDonors[0] == nil {
			t.Fatal("delivery cursor backing escaped clone")
		}
	})
}
