package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Graph identity precedes the authentic selected event; actual IDs and pending
// evidence remain separate. These controls use the production source owner and
// full current source facts, never assigned epochs, ACKs or semantic receipts.
func TestStagedNativeEpochBeforeSelectedAdmission(t *testing.T) {
	withReflectiveRelevanceSource(t, nativeWriterInertModuleSource, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "defineProperties" {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("original module DefineProperties absent")
		}
		work := registerCallableEffectWork(facts)
		consumer, owned := work.memberNodes[sourceStagedModuleOwner(call)]
		if !owned {
			t.Fatal("canonical original module owner absent")
		}
		original, described := stagedNativeInputOccurrenceRequest(&facts[consumer], call)
		if !described {
			t.Fatal("original occurrence description absent")
		}
		request := sourceStagedNativeRequest{request: original, call: call, get: call.Expression(), algorithmKind: sourceNativeObjectDefineProperties}
		queued := len(work.extractionQueue)
		query := newSourceDependencyQuery(call, owner.checker, owner, facts[consumer].node)
		bad := request
		bad.request.cut.reading = call.Expression()
		if revoke, accepted := query.beginStagedNativeGetSource(&work, facts, bad); accepted {
			revoke()
			t.Fatal("wrong-cut source interval accepted")
		}
		if work.operationEpoch != nil || len(work.operationIDs) != 0 || len(work.operations) != 0 || len(work.extractionQueue) != queued {
			t.Fatal("refused interval allocated graph identity or operation work")
		}
		revoke, accepted := query.beginStagedNativeGetSource(&work, facts, request)
		if !accepted {
			t.Fatal("valid original source interval refused")
		}
		defer revoke()
		borrow := query.stagedNativeGet
		epoch := work.operationEpoch
		if epoch == nil || borrow == nil || borrow.sourceEpoch != epoch || len(work.operationIDs) != 0 || len(work.operations) != 1 || len(work.extractionQueue) != queued || len(work.entryLawReceipts) != 0 {
			t.Fatal("identity setup issued real work/evidence or failed to reach original borrow")
		}
		copied := *query
		copied.receiverCandidates(call, nil)
		if len(work.operationIDs) != 0 || len(work.operations) != 1 || len(work.extractionQueue) != queued || len(work.entryLawReceipts) != 0 {
			t.Fatal("copied query acquired source admission or adoption")
		}
		revoke()
		if borrow.issuer != nil || borrow.sourceWork != nil || borrow.eagerAdmission != nil || query.stagedNativeGet != nil {
			t.Fatal("revoked interval retained its live issuer/admission")
		}

		// The production helper creates the actual occurrence and runs its real
		// selected callback/finish. It does not adopt an ordinary consumer here.
		// Use another pristine work so this very event must initialize identity.
		previousEpoch := epoch
		work = registerCallableEffectWork(facts)
		if work.operationEpoch != nil || len(work.operationIDs) != 0 {
			t.Fatal("new source work already had an epoch or adopted IDs")
		}
		occurrence, visited := work.observeSelectedNativeGetSource(facts, consumer, request, owner)
		if !visited || occurrence == nil || occurrence.source == nil || occurrence.callee == nil || occurrence.eagerIssuer != occurrence || occurrence.eagerWitness == nil {
			t.Fatal("genuine early selected input/complete Get event UNREACHED")
		}
		epoch = work.operationEpoch
		if epoch == nil || epoch == previousEpoch {
			t.Fatal("first genuine source event did not create its own graph identity")
		}
		witness := occurrence.eagerWitness
		law, described := nativeEagerReceiptRequest(occurrence.source)
		receipt := work.entryLawReceipts[law.producer]
		if !described || receipt == nil || receipt.nativeEager != witness || witness.issuer != witness || witness.epoch != epoch || witness.admitted || witness.delivered || !witness.needsSourceAdmission {
			t.Fatal("early original event lost its pending identity or gained current delivery")
		}
		if len(work.operationIDs) != 0 || len(work.operations) != 1 || len(work.extractionQueue) != queued || work.nativeEagerWitnessCurrent(occurrence.source) {
			t.Fatal("pre-adoption observation issued an operation or current capability")
		}
		if !work.adoptNativeInputOccurrence(facts, occurrence) || work.operationEpoch != epoch || len(work.operationIDs) == 0 {
			t.Fatal("genuine adoption did not retain the original source epoch")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if fresh.operationEpoch != nil || len(fresh.operationIDs) != 0 || len(fresh.entryLawReceipts) != 0 {
			t.Fatal("clone inherited graph identity, operation IDs or live receipts")
		}
		freshQuery := newSourceDependencyQuery(call, owner.checker, owner, clones[consumer].node)
		closeFresh, accepted := freshQuery.beginStagedNativeGetSource(&fresh, clones, request)
		if !accepted {
			t.Fatal("clone's original source interval refused")
		}
		defer closeFresh()
		if fresh.operationEpoch == nil || fresh.operationEpoch == epoch || len(fresh.operationIDs) != 0 || len(fresh.operations) != 1 || fresh.nativeEagerWitnessCurrent(occurrence.source) || fresh.adoptNativeInputOccurrence(clones, occurrence) {
			t.Fatal("fresh graph borrowed old epoch/evidence or foreign occurrence adoption")
		}
	})
}
