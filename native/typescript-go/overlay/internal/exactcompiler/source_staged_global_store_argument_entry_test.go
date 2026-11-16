package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original dispatcher supplies the module lease. The parent and child
// queries use the actual Get owners; no selected child algorithm or map receipt
// supplies the early ordering interval.
func TestStagedGlobalStoreChildCalleeEntryLifetime(t *testing.T) {
	const source = `const converted=Object.freeze(Object.defineProperties({}, {field:{value:1}}));`
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		var outer, child *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
				switch n.Expression().Name().Text() {
				case "freeze":
					outer = n
				case "defineProperties":
					child = n
				}
			}
			return true
		})
		if outer == nil || child == nil {
			t.Fatal("original parent/child missing")
		}
		task, available := work.nextExtraction()
		if !available || task.operation.index != 0 || facts[task.callable].node != sourceStagedModuleOwner(outer) {
			t.Fatal("original module dispatcher did not issue entry")
		}
		entry := work.beginStagedNativeArgumentEntry(facts, task.callable, outer, owner)
		if entry == nil {
			t.Fatal("actual module entry unavailable")
		}
		defer func() { entry.active = false }()
		parentRequest, owned := stagedNativeInputOccurrenceRequest(&facts[task.callable], outer)
		if !owned {
			t.Fatal("original parent request unavailable")
		}
		parent := &sourceStagedNativeOccurrence{}
		q := newSourceDependencyQuery(outer, owner.checker, owner, facts[task.callable].node)
		revoke, installed := q.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: outer, get: outer.Expression(), request: parentRequest, occurrence: parent})
		if !installed {
			t.Fatal("actual parent Get unavailable")
		}
		q.receiverCandidates(outer, nil)
		revoke()
		if parent.callee == nil || parent.source == nil {
			t.Fatal("original parent Get did not issue a complete receipt")
		}
		if _, adopted := work.requireOperation(facts, parent.source.request); !adopted {
			t.Fatal("original parent Effects root unavailable")
		}
		issuer := entry.childIssuer(parent, child)
		if issuer == nil {
			t.Fatal("actual parent receipt did not describe child entry")
		}
		childRequest, owned := stagedNativeInputOccurrenceRequest(&facts[task.callable], child)
		if !owned {
			t.Fatal("original child request unavailable")
		}
		query := newSourceDependencyQuery(child, owner.checker, owner, facts[task.callable].node)
		request := sourceStagedNativeRequest{argumentIssuer: issuer, call: child, get: child.Expression(), request: childRequest, occurrence: &sourceStagedNativeOccurrence{}}
		revokeChild, installed := query.beginStagedNativeGetSource(&work, facts, request)
		if !installed {
			t.Fatal("actual child Get unavailable")
		}
		defer revokeChild()
		uses, calls := len(facts[task.callable].staged.operationUses), len(facts[task.callable].summary.Calls)
		release := issuer.beginChildCallee(query, request)
		defer release()
		if query.stagedNativeGet.argumentIssuer != issuer {
			t.Fatal("original child query did not bind entry")
		}
		member := query.stagedMember
		finish := member.finish
		observed := false
		member.finish = func(disposition sourceStagedMemberDisposition) bool {
			if !observed && member.get != nil && query.liveStagedMemberSource(member, member.get, member.read) {
				observed = true
				if !query.stagedMapInvocationFollows(outer) {
					t.Fatal("actual child callee phase lost later invocation ordering")
				}
				if query.stagedMapInvocationFollows(child) {
					t.Fatal("child acquisition excluded itself")
				}
				copiedQuery := *query
				if copiedQuery.stagedMapInvocationFollows(outer) {
					t.Fatal("copied query inherited phase")
				}
				copiedIssuer := *issuer
				query.stagedNativeGet.argumentIssuer = &copiedIssuer
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("copied issuer inherited phase")
				}
				query.stagedNativeGet.argumentIssuer = issuer
				savedParent := parent.callee
				parent.callee = nil
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("missing parent proof authorized phase")
				}
				parent.callee = savedParent
				savedCut := issuer.calleeCut
				issuer.calleeCut.returning = child
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("wrong original cut authorized phase")
				}
				issuer.calleeCut = savedCut
				savedRequest := issuer.calleeRequest
				issuer.calleeRequest.cut.reading = outer
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("wrong original request authorized phase")
				}
				issuer.calleeRequest = savedRequest
				savedChild := issuer.child
				issuer.child = outer
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("wrong child authorized phase")
				}
				issuer.child = savedChild
				generation := query.owner.generation
				query.owner.generation = new(projectGeneration)
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("wrong generation authorized phase")
				}
				query.owner.generation = generation
				copiedEntry := *entry
				issuer.entry = &copiedEntry
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("copied entry inherited dispatcher lease")
				}
				issuer.entry = entry
				release()
				if query.stagedMapInvocationFollows(outer) {
					t.Fatal("revoked entry authorized phase")
				}
			}
			return finish(disposition)
		}
		query.receiverCandidates(child, nil)
		if !observed {
			t.Fatal("actual child member owner did not observe phase")
		}
		if query.stagedNativeGet.argumentIssuer != nil || issuer.calleeQuery != nil || issuer.calleeBorrow != nil {
			t.Fatal("source phase retained query/borrow after revoke")
		}
		if len(facts[task.callable].staged.operationUses) != uses || len(facts[task.callable].summary.Calls) != calls {
			t.Fatal("source ordering created ordinary use/body activation")
		}
	})
}
