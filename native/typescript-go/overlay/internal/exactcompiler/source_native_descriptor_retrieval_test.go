package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The first demand is a real memberWriterInputs call with no borrowed member or
// native interval. It must register pending work before collection, then consume
// a genuinely published Get through the ordinary queue and first resolution.
func TestDescriptorRetrievalRawPublisherSource(t *testing.T) {
	const source = `/// <reference lib="esnext" />
const box={value:''};function writer(){box.value=document.title}
export function probe(){Object.getOwnPropertyDescriptor(writer,'name');return box.value}`
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		owner, work, facts := cache.owner, &collection.work, collection.facts
		var reader, writer, call, read, left *ast.Node
		for _, fact := range facts {
			if ast.IsFunctionDeclaration(fact.node) && fact.node.Name() != nil {
				if fact.node.Name().Text() == "probe" {
					reader = fact.node
				}
				if fact.node.Name().Text() == "writer" {
					writer = fact.node
				}
			}
		}
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && descriptorRetrievalIntent(n) {
				call = n
			}
			if ast.IsPropertyAccessExpression(n) && n.Name().Text() == "value" {
				if enclosingCallableNode(n) == reader {
					read = n
				}
				if enclosingCallableNode(n) == writer {
					left = n
				}
			}
			return true
		})
		if reader == nil || writer == nil || call == nil || read == nil || left == nil {
			t.Fatal("actual original source association absent")
		}
		demand := func() ([]sourceMemberWriterInput, accessorCandidates) {
			q := newSourceDependencyQuery(read, owner.checker, owner, reader)
			if q.stagedMember != nil || q.stagedNativeGet != nil {
				t.Fatal("raw source entry borrowed an unrelated owner")
			}
			result := accessorCandidates{}
			cut := q.memberWriterReadCut(nil, nil, &result)
			inputs := q.memberWriterInputs(left, nil, &result, cut)
			return inputs, result
		}
		_, pending := demand()
		original, _ := stagedNativeInputOccurrenceRequest(&facts[work.memberNodes[reader]], call)
		request := descriptorSourceRequest(original)
		id, registered := work.operationIDs[request.producer]
		if !registered || !validDescriptorSourceRecipe(work.operationRecipes[request.producer]) {
			t.Fatal("raw actual publisher registrar UNREACHED")
		}
		if !pending.valueIncomplete || work.operations[id.index].delta.extracted || work.currentNativeCalleeEffects(&sourceStagedNativeGetSource{request: original, get: call.Expression()}) != nil {
			t.Fatal("registration manufactured selected/current source")
		}
		collection.collect()
		resolved := collection.resolve(file)
		if len(resolved.pending) != 0 {
			t.Fatalf("original source still pending; later delivery/scopes UNREACHED: %#v", resolved.pending)
		}
		recipe := work.operationRecipes[request.producer]
		if !work.descriptorCalleeSourceCurrent(recipe) || !work.operations[id.index].delta.extracted {
			t.Fatal("genuine selected event/current delivery UNREACHED")
		}
		subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if subscriber == nil || subscriber.blocked || subscriber.applied != work.operations[id.index].revision {
			t.Fatal("original source delivery was not APPLIED")
		}
		// A fresh real source demand retains the authored argument's creating scope.
		// No original query, revoked ticket or cached scope is replayed.
		inputs, _ := demand()
		if len(inputs) == 0 {
			t.Fatal("callee-only accounting erased the actual writer argument scope")
		}
		for _, input := range inputs {
			if input.call != nil {
				t.Fatal("descriptor lookup invoked the stored writer body")
			}
		}
	})
}
