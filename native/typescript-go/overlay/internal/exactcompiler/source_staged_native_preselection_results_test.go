package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original native Get can consume a genuinely issued child result before
// its selected parent exists. The used child Effects root remains a selection
// premise. Its descriptive C reading survives independently of strong selection.
func TestStagedNativePreselectionResultOriginalSource(t *testing.T) {
	const source = `function latent(target:Record<PropertyKey,unknown>,key:PropertyKey){target[key]=()=>document.title}const prefix=Object.freeze(Object.defineProperties({},{tag:{value:true}}));function factory(){return prefix}function reference(){return factory()}export function invoke(){return Object.freeze({})}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		var prefix, parent *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && node.Name() != nil && node.Name().Text() == "prefix" {
				prefix = node.Initializer()
			}
			if ast.IsCallExpression(node) && enclosingCallableNode(node) != nil && callableNameText(enclosingCallableNode(node).Name()) == "invoke" {
				parent = node
			}
			return true
		})
		if prefix == nil || parent == nil {
			t.Fatal("original native occurrences")
		}
		child := prefix.AsCallExpression().Arguments.Nodes[0]
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		producer := work.memberNodes[sourceStagedModuleOwner(prefix)]
		if !work.stageNativeInputCall(facts, producer, prefix, owner) {
			t.Fatal("original earlier native producer unavailable")
		}
		work.prepareOperationUses(facts, owner)
		caller := work.memberNodes[enclosingCallableNode(parent)]
		request, owned := sourceStagedOccurrenceRequest(&facts[caller], parent, relativeDemandEffects, "native-preselection-source")
		if !owned {
			t.Fatal("original parent request")
		}
		dataRequest := stagedCallResultRequest(child, facts[producer].node)
		var reading, coverage, used sourceStagedOperationRequest
		var readCut sourceRelativeCut
		for observation := 0; observation < 2; observation++ {
			query := newSourceDependencyQuery(parent, owner.checker, owner, facts[caller].node)
			occurrence := &sourceStagedNativeOccurrence{}
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: parent, get: parent.Expression(), request: request, occurrence: occurrence})
			if !installed {
				t.Fatal("original native Get interval")
			}
			before := query.stagedMember.excludePrivateWriter
			observed := false
			query.stagedMember.excludePrivateWriter = func(write, origin *ast.Node) bool {
				borrow := query.stagedMember
				if !observed && borrow.coverage != nil {
					observed = true
					if observation == 0 {
						if _, exists := work.operationRecipes[request.producer]; exists {
							t.Fatal("source control missed preselection before parent publication")
						}
						copied := *query
						if copied.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
							t.Fatal("copied query borrowed preselection authority")
						}
						cut := query.initializing
						query.initializing = creating
						if query.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
							t.Fatal("wrong physical Get cut borrowed preselection")
						}
						query.initializing = cut
						c := borrow.coverage
						borrow.coverage = nil
						if query.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
							t.Fatal("missing C supplied preselection authority")
						}
						borrow.coverage = c
						generation := work.operationGeneration
						work.operationGeneration = &projectGeneration{}
						if query.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
							t.Fatal("another generation borrowed the source Get")
						}
						work.operationGeneration = generation
						work.operationRecipes[request.producer] = sourceStagedOperationRecipe{key: request.producer}
						if query.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
							t.Fatal("malformed present parent borrowed not-yet-published handling")
						}
						delete(work.operationRecipes, request.producer)
					}
					argument := query.registerWriterInputRequest(prefix)
					if argument == nil || !argument.excludeDiscovery(query, nil) {
						t.Fatal("actual native child failed the original pre-input consumer")
					}
					argument.revoke()
					if len(borrow.selectionRequired) != 1 {
						t.Fatal("used child root not retained")
					}
					current := work.operationRecipes[dataRequest.producer].callResult
					if current == nil {
						t.Fatal("missing original child DATA source")
					}
					if observation == 0 {
						if len(current.readings) != 1 || current.readings[0].reading != request.producer {
							t.Fatal("preselection fabricated a native callee phase")
						}
						reading, coverage, used, readCut = current.readings[0], borrow.coverage.request, borrow.selectionRequired[0], current.readCuts[0]
					} else {
						// A later actual traversal may observe the enclosing Call at
						// a different cut. It must preserve the original Get reading.
						preserved := false
						for index, actual := range current.readings {
							preserved = preserved || sameOperationRequest(actual, reading) && current.readCuts[index] == readCut
						}
						if !preserved || !sameOperationRequest(used, borrow.selectionRequired[0]) {
							t.Fatal("published parent lost the original reading, cut or producer")
						}
					}
				}
				return before(write, origin)
			}
			query.receiverCandidates(parent, nil)
			revoke()
			query.publishDependencyStatistics()
			if query.transferStagedCallReturn(child, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
				t.Fatal("revoked native source interval retained result authority")
			}
			if !observed {
				t.Fatal("actual source Get did not enter the preselection control")
			}
			callee := work.operationRecipes[nativeRootDebtRequest(&sourceStagedNativeGetSource{request: request, get: parent.Expression()}, "callee-get").producer]
			if !validNativeGetRecipe(callee) || occurrence.source == nil || !sameNativeGetSource(occurrence.source, callee.nativeGet) {
				t.Fatal("later original publisher did not retain its native source description")
			}
			if occurrence.callee != nil {
				if occurrence.callee.generation != work.operationGeneration || !validStagedNativeCalleeEffects(*occurrence.callee, callee.nativeGet) {
					t.Fatal("selected callee receipt lost its actual current source authority")
				}
			} else if callee.delta.extracted || work.operationRecipes[request.producer].delta.extracted || callee.nativeGet.calleeEntry != nil {
				t.Fatal("pending source description became completed native selection")
			}
			contains := func(requests []sourceStagedOperationRequest, expected sourceStagedOperationRequest) bool {
				for _, request := range requests {
					if sameOperationRequest(request, expected) {
						return true
					}
				}
				return false
			}
			if !contains(callee.delta.required, used) || !contains(callee.nativeGet.selectionRequired, used) || !contains(work.operationRecipes[coverage.producer].delta.required, reading) {
				t.Fatalf("later native publication lost premises: used=%v C=%v DATA=%v selection=%d sources=%d requirements=%d observation=%d", contains(callee.delta.required, used), contains(callee.delta.required, coverage), contains(work.operationRecipes[coverage.producer].delta.required, reading), len(callee.nativeGet.selectionRequired), len(callee.nativeGet.memberSources), len(callee.delta.required), observation)
			}
			// Source registration may remain pending on its own Get obligations.
			// Its actually used child Effects root is nevertheless mandatory.
			missing := callee
			missing.delta = cloneOperationDelta(callee.delta)
			missing.delta.required = nil
			for _, required := range callee.delta.required {
				if !sameOperationRequest(required, used) {
					missing.delta.required = append(missing.delta.required, required)
				}
			}
			if validNativeGetRecipe(missing) || validOperationEnvelope(missing) {
				t.Fatal("selected Get accepted omission of its consumed child Effects root")
			}
			if _, adopted := work.operationIDs[request.producer]; adopted || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
				t.Fatal("source Get observation activated its parent or a body")
			}
		}
	})
}
