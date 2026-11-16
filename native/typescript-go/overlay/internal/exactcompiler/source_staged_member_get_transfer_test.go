package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The actual native/member owner yields only after publishing the source set.
// This source callback is intentionally not a selected-value/category consumer.
func TestStagedMemberGetTransferOriginalOwner(t *testing.T) {
	for _, mode := range []string{"accept", "refuse", "revoke", "copied-query", "generation"} {
		t.Run(mode, func(t *testing.T) {
			const source = `function latentWriter(target:{freeze?:unknown}){window.name;target.freeze=()=>document.title}export function invoke(){return Object.freeze({})}`
			withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(q)
				work := callableEffectWork{extracting: -1}
				work.indexOperationSources(facts)
				fact := &facts[installationFactIndex(t, facts, q.effectOwner)]
				request, issued := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "original-member-transfer")
				if !issued {
					t.Fatal("original occurrence missing")
				}
				revoke, installed := work.beginStagedMemberWork(q, facts, request)
				if !installed {
					t.Fatal("original source loan missing")
				}
				defer revoke()
				b := q.stagedMember
				count := 0
				var originalGet *sourceGetInputs
				b.transferGet = func(get *sourceGetInputs, origin *ast.Node, projection []string, name string, traversal accessorTraversal, standard *sourceValue) bool {
					count++
					originalGet = get
					if !b.transferringGet || b.transferStandard != standard || !q.liveStagedMemberSource(b, get, b.read) || standard == nil || standard.native == nil || traversal != accessorAcquire || b.coverage == nil || b.coverage.origin != origin {
						t.Fatal("callback lacks original semantic Get/source interval")
					}
					c := work.operationRecipes[b.coverage.request.producer].memberSource
					if c == nil || c.coverage == nil || len(c.coverage.required) == 0 || work.memberCoverageObserved[c.request.producer] != q.owner.generation {
						t.Fatal("source relationships were not published before transfer")
					}
					copy := *q
					if copy.transferStagedMemberGetEffects(origin, projection, name, traversal, standard, get, b.read, &accessorCandidates{}) || q.transferStagedMemberGetEffects(origin, projection, name, traversal, standard, get, b.read, &accessorCandidates{}) {
						t.Fatal("copied issuer or recursive callback accepted")
					}
					switch mode {
					case "refuse":
						return false
					case "revoke":
						revoke()
					case "generation":
						b.generation = &projectGeneration{}
					}
					return true
				}
				issuer := q
				if mode == "copied-query" {
					copy := *q
					issuer = &copy
				}
				result := issuer.receiverCandidates(call, nil)
				if mode == "accept" && (count == 0 || !result.valueIncomplete || len(result.values) != 0) {
					t.Fatal("source transfer supplied selected output or failed to yield")
				}
				if mode == "copied-query" && count != 0 {
					t.Fatal("copied query acquired original transfer callback")
				}
				revoke()
				if b.transferGet != nil || b.transferStandard != nil || b.transferredGet != nil || b.transferringGet || q.takeStagedMemberGetTransfer(originalGet) {
					t.Fatal("source loan retained callback or native-tail rights")
				}
			})
		})
	}
}
