package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The conditional standard entry must reach the original source consumer before
// global-property acquisition recurses. It supplies no complete Get, ordinary
// use, invocation, normal output or pristine-global premise.
func TestStagedStandardEntryOriginalEarlyRoute(t *testing.T) {
	for _, prefix := range []string{"", `Object.defineProperties({}, {tag:{value:true}});`} {
		withReflectiveRelevanceSource(t, prefix+`export function invoke(prototype:object|null){return Object.create(prototype)}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
			call := standardEntryRoutingCall(t, file)
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			restore := registerWriterInputFacts(owner, facts)
			defer restore()
			caller := work.memberNodes[enclosingCallableNode(call)]
			request, ok := sourceStagedOccurrenceRequest(&facts[caller], call, relativeDemandEffects, "early-standard-entry")
			if !ok {
				t.Fatal("original source request unavailable")
			}
			observe := func(facts []callableFacts, work *callableEffectWork, reissued bool) {
				query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
				occurrence := &sourceStagedNativeOccurrence{}
				count := 0
				var entry *sourceValue
				revoke, installed := query.beginStagedNativeGetSource(work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectCreate, call: call, get: call.Expression(), request: request, occurrence: occurrence}, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
					count++
					if count != 1 {
						return // The stronger original owner may also revisit its standard branch.
					}
					receiver, name := accessorReceiver(call.Expression())
					borrow := query.stagedNativeGet
					if query.active[receiver] || len(borrow.memberSources) != 0 || occurrence.callee != nil || name != "create" || query.reading != call || query.protectedMember != call.Expression() {
						t.Fatal("source publication followed recursive global acquisition or a complete Get")
					}
					if selection.call != call || selection.get != call.Expression() || !sameOperationRequest(selection.request, request) || selection.selected.native == nil || selection.selected.native.kind != sourceNativeObjectCreate || len(selection.actuals) != 1 || selection.actuals[0].expression != restrictedInvocationArguments(call.AsCallExpression())[0] {
						t.Fatal("early source lost original operation/member/input association")
					}
					source := work.operationRecipes[request.producer].nativeGet
					if source == nil || !validNativeGetRecipe(work.operationRecipes[request.producer]) || len(work.operationIDs) != 0 || len(facts[caller].staged.operationUses)+len(facts[caller].staged.calls)+len(facts[caller].summary.Calls) != 0 {
						t.Fatal("conditional source acquired ordinary execution authority")
					}
					if !reissued && work.operationRecipes[nativeRootDebtRequest(source, "callee-get").producer].delta.extracted {
						t.Fatal("early conditional branch completed callee selection")
					}
					entry, _ = query.nativePromiseEntry(call.Expression(), receiver, []string{"create"})
					if entry == nil || entry.native == nil || entry.native.kind != sourceNativeObjectConstructor {
						t.Fatal("original binder-owned conditional entry unavailable")
					}
					copied := *query
					part := accessorCandidates{}
					copied.publishStagedNativeEntrySource(*entry, nil, &part)
					priorOwner := query.owner
					query.owner = nil
					query.publishStagedNativeEntrySource(*entry, nil, &part)
					query.owner = priorOwner
					query.stagedNativeGet = nil
					query.publishStagedNativeEntrySource(*entry, nil, &part)
					query.stagedNativeGet = borrow
					reading := query.reading
					query.reading = call.Expression()
					query.publishStagedNativeEntrySource(*entry, nil, &part)
					query.reading = reading
					generation := borrow.generation
					borrow.generation = new(projectGeneration)
					query.publishStagedNativeEntrySource(*entry, nil, &part)
					borrow.generation = generation
					query.owner.generation = nil
					query.publishStagedNativeEntrySource(*entry, nil, &part)
					query.owner.generation = generation
					if count != 1 || len(part.values) != 0 {
						t.Fatal("copied/missing owner, cut or generation issued source authority")
					}
				})
				if !installed {
					t.Fatal("original native source loan unavailable")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				if count == 0 || entry == nil {
					t.Fatal("original conditional event never reached its consumer")
				}
				revoke()
				before := count
				query.publishStagedNativeEntrySource(*entry, nil, &accessorCandidates{})
				if count != before {
					t.Fatal("revoked entry borrower issued source")
				}
			}
			observe(facts, &work, false)
			cloned := make([]callableFacts, len(facts))
			for i := range facts {
				cloned[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(cloned)
			if len(fresh.memberCoverageObserved) != 0 {
				t.Fatal("cloned descriptions inherited live source observations")
			}
			restoreClone := registerWriterInputFacts(owner, cloned)
			defer restoreClone()
			observe(cloned, &fresh, true)
		})
	}
}

// Actual authored receiver alternatives cannot borrow the standard global's
// early route merely from the property name or TypeScript signature.
func TestStagedStandardEntryAuthoredAlternatives(t *testing.T) {
	for _, source := range []string{
		`const Object={create(prototype:object|null){document.title;return {prototype}}};export function invoke(prototype:object|null){return Object.create(prototype)}`,
		`const holder={create:Object.create};holder.create=function authored(prototype:object|null){document.title;return {prototype}};export function invoke(prototype:object|null){return holder.create(prototype)}`,
		`const holder={get create(){document.title;return Object.create}};export function invoke(prototype:object|null){return holder.create(prototype)}`,
		`declare const choose:boolean;declare const other:{create:(prototype:object|null)=>object};const holder=choose?Object:other;export function invoke(prototype:object|null){return holder.create(prototype)}`,
	} {
		withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
			call := standardEntryRoutingCall(t, file)
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			restore := registerWriterInputFacts(owner, facts)
			defer restore()
			caller := work.memberNodes[enclosingCallableNode(call)]
			request, ok := sourceStagedOccurrenceRequest(&facts[caller], call, relativeDemandEffects, "authored-standard-entry")
			if !ok {
				t.Fatal("original source request unavailable")
			}
			query := newSourceDependencyQuery(call, owner.checker, owner, facts[caller].node)
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectCreate, call: call, get: call.Expression(), request: request, occurrence: &sourceStagedNativeOccurrence{}}, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {
				t.Fatal("authored/mixed receiver borrowed binder-owned standard route")
			})
			if !installed {
				t.Fatal("original observation loan unavailable")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
		})
	}
}

func standardEntryRoutingCall(t *testing.T, file *ast.SourceFile) *ast.Node {
	t.Helper()
	var call *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "create" {
			region := enclosingCallableNode(node)
			if region != nil && region.Name() != nil && region.Name().Text() == "invoke" {
				call = node
			}
		}
		return true
	})
	if call == nil {
		t.Fatal("original Create Call missing")
	}
	return call
}
