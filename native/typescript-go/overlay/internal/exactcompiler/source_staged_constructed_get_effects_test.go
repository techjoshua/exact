package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This is a Get observation, before any method invocation. Its event retains
// original source dependencies and cannot publish a selected callable/result.
func TestStagedConstructedGetEffectsOriginalSource(t *testing.T) {
	const source = `function factory(){return 0}function dormant(){return document.title}export function invoke(){const map=new WeakMap<object,object>();factory();return map.get}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		var site, get *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			if ast.IsPropertyAccessExpression(node) && callableNameText(node.Name()) == "get" {
				get = node
			}
			return true
		})
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		if !work.prepareStagedConstructionSource(facts, site, owner) {
			t.Fatal("original construction source missing")
		}
		caller := work.memberNodes[enclosingCallableNode(get)]
		request, ok := stagedMemberGetSourceRequest(&facts[caller], get)
		if !ok {
			t.Fatal("original Get request missing")
		}
		q := newSourceDependencyQuery(get, owner.checker, owner, facts[caller].node)
		revoke, installed := work.beginStagedMemberWork(q, facts, request)
		if !installed {
			t.Fatal("original Get source loan missing")
		}
		defer revoke()
		b := q.stagedMember
		observations := 0
		var observed *sourceGetInputs
		b.constructedGetEffects = func(origin *ast.Node, actual *sourceGetInputs, cut *sourceMemberWriterReadCut, mode accessorTraversal, standard *sourceValue, accounted bool, result *accessorCandidates) bool {
			observations++
			if b.constructedGetEvent != actual || b.constructedGetStandard != standard || !q.liveStagedMemberSource(b, actual, cut) || actual.operation != get || origin != site || !accounted || mode != accessorAcquire || b.coverage == nil {
				t.Fatal("Get law lost original event/source correlation")
			}
			observed = actual
			copied := *actual
			if q.stagedConstructedGetLookup(&copied, standard, mode) || q.stagedConstructedGetLookup(actual, standard, accessorSet|accessorNoGet) {
				t.Fatal("copied/reentrant/Set event gained Get authority")
			}
			return true
		}
		receiver, key := accessorReceiver(get)
		q.protectedMember = get
		result := q.accessorsAtGetOutput(receiver, []string{key}, "", accessorAcquire, nil, nil, nil, nil, sourceGetReferenceFor(get, receiver, []string{key}, "", accessorAcquire))
		if observations != 1 || observed == nil || !result.valueIncomplete || len(result.values) != 0 {
			t.Fatal("Get source observation was absent, replayed or supplied selected output", observations)
		}
		if b.constructedGetEvent != nil || b.constructedGetStandard != nil || b.transferredGet != nil {
			t.Fatal("scoped event/outer transfer survived original Get")
		}
		if len(work.operationIDs) != 0 || len(facts[caller].summary.Calls) != 0 || len(facts[caller].staged.operationUses) != 0 {
			t.Fatal("property read activated method/body or ordinary work")
		}
		revoke()
		if q.stagedConstructedGetLookup(observed, &sourceValue{}, accessorAcquire) {
			t.Fatal("revoked Get source retained authority")
		}
	})
}
