package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These original-collector controls require complete indexed replacement
// coverage and an actual current external SOURCE classified AuthoredOrUnmodeled.
// If an authored inner Get owns the path without an external arm, this stronger
// classification entry remains UNREACHED; pending/no-Empty alone cannot pass.
func TestTrustedStandardReadAuthoredReplacementConsumer(t *testing.T) {
	for _, row := range []struct{ name, replacement string }{
		{"own-descriptor", "Object.defineProperty(document,'title',{configurable:true,get:function(){return document.body?.id}});"},
		{"prototype", "Object.setPrototypeOf(document,{get title(){return document.body?.id}});"},
	} {
		if !t.Run(row.name, func(t *testing.T) {
			source := "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){" + row.replacement + "Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
			withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
				var originalGet, replacement, supplier *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsPropertyAccessExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "document" && node.Name().Text() == "title" {
						originalGet = node
					}
					if ast.IsCallExpression(node) {
						arguments := restrictedInvocationArguments(node.AsCallExpression())
						if len(arguments) > 0 && ast.IsIdentifier(arguments[0]) && arguments[0].Text() == "document" {
							replacement = node
						}
					}
					if ast.IsPropertyAccessExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "document" && node.Name().Text() == "body" {
						supplier = enclosingCallableNode(node)
					}
					return true
				})
				if originalGet == nil || replacement == nil || supplier == nil {
					t.Fatal("authored replacement fixture or original Get missing")
				}
				cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
				collection := beginProjectCallableCollection(cache, cache.owner)
				defer collection.close()
				collection.collect()
				collection.resolve(file)
				work := &collection.work
				indexed, body, knownSupplier := false, false, false
				completeIndexed := make(map[sourceStagedOperationKey]sourceStagedOperationRequest)
				evaluatedAuthored := false
				// Observe only the original Get's published coverage and authentic
				// indexed operation. No candidate, request or graph state is created.
				for _, coverage := range work.operationRecipes {
					c := coverage.memberSource
					if c == nil || c.coverage == nil || c.parent.producer.operation != originalGet || c.generation != work.operationGeneration || !validStagedMemberCoverageRecipe(coverage) || work.memberCoverageObserved[coverage.key] != work.operationGeneration {
						continue
					}
					for _, required := range coverage.delta.required {
						candidate := work.operationRecipes[required.producer].memberSource
						if candidate != nil && candidate.generation == work.operationGeneration && candidate.candidate.operation == replacement && sameOperationRequest(candidate.parent, c.parent) && sameOperationRequest(candidate.request, required) {
							indexed = true
							if coverage.delta.extracted {
								completeIndexed[coverage.key] = c.request
							}
						}
					}
				}
				for _, state := range work.operations {
					for _, getter := range state.getters {
						if getter.declaration != enclosingCallableNode(originalGet) || getter.installed == nil || getter.inputs == nil || !getter.inputs.delivered || !getter.bodyReady || !getter.bodyTransferred {
							continue
						}
						consumer, caller := work.memberNodes[getter.demand.request.consumer]
						producer, known := work.memberNodes[getter.declaration]
						if !caller || !known || producer < 0 || producer >= len(work.stagedRevisions) {
							continue
						}
						d := work.stagedRequired[sourceStagedDependencyKey{consumer, getter.edge}]
						body = body || d != nil && !d.invalid && !d.projectionPending && d.consumed == work.stagedRevisions[producer]
					}
				}
				if id, known := work.memberNodes[supplier]; known && id >= 0 && id < len(collection.facts) {
					for _, effect := range collection.facts[id].summary.DirectEffectSources {
						knownSupplier = knownSupplier || effect.Environment == "browser"
					}
				}
				if !indexed || !body || !knownSupplier {
					t.Fatalf("ENTRY_EXPERIMENT_UNREACHED: original Get indexed replacement=%v installed BODY/input=%v known authored browser supplier=%v", indexed, body, knownSupplier)
				}
				for _, recipe := range work.operationRecipes {
					s := recipe.mutationData
					if s == nil || s.external == nil || s.external.operation != originalGet {
						continue
					}
					// Evaluate the existing no-Empty postcondition exactly once per
					// actual external mutation description, then qualify its owner.
					disposition := work.standardPropertyReadMutationDisposition(s.external, s.externalSource)
					if disposition == standardPropertyReadEmpty {
						t.Fatal("indexed authored replacement acquired the standard-read Empty disposition")
					}
					if disposition != standardPropertyReadAuthoredOrUnmodeled || !validStandardPropertyReadDescription(s.external) {
						continue
					}
					external := work.operationRecipes[s.externalSource.producer]
					if !validStagedMemberExternalGetRecipe(external) || external.memberSource.generation != work.operationGeneration || external.memberSource.protocolSource.get == nil || *external.memberSource.protocolSource.get != *s.external || !sameOperationRequest(external.memberSource.request, s.externalSource) || work.memberCoverageObserved[external.key] != work.operationGeneration {
						continue
					}
					// This exact current SOURCE must name the complete original
					// coverage that actually indexed this row's replacement AST.
					coverage := external.memberSource.protocolSource.required
					observed, complete := completeIndexed[coverage.producer]
					if !complete || !sameOperationRequest(observed, coverage) {
						continue
					}
					evaluatedAuthored = true
				}
				for _, state := range work.operations {
					for _, residual := range state.delta.residuals {
						m := residual.mutation
						if m == nil || m.external == nil || m.external.operation != originalGet || !m.standardReadEmpty {
							continue
						}
						for _, subscriber := range state.subscribers {
							if subscriber != nil && !subscriber.blocked && state.revision != 0 && subscriber.applied == state.revision {
								t.Fatal("authored replacement borrowed APPLIED standard-read Empty DATA")
							}
						}
					}
				}
				t.Log("bounded no-Empty outcome: original Get indexed replacement, installed BODY/input and known authored browser supplier; no Empty disposition or APPLIED Empty DATA")
				if len(completeIndexed) == 0 || !evaluatedAuthored {
					t.Fatalf("STRONG_REPLACEMENT_ENTRY_UNREACHED: complete indexed canonical coverage=%v evaluated current external AuthoredOrUnmodeled=%v; pending or an authored-only path does not qualify this external classification control", len(completeIndexed) != 0, evaluatedAuthored)
				}
				t.Log("qualified complete indexed replacement coverage and evaluated current external AuthoredOrUnmodeled SOURCE")
				// The known supplier above is registered source work. This test
				// does not claim it executed, returned or was the selected getter.
			})
		}) {
			return
		}
	}
}
