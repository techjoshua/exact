package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Per-file collection has an outer registry, while project resolution starts
// from cloned facts after it expires. Both entries must use the actual resolving
// facts, then restore the exact prior registry/publishers without lending rights.
func TestStagedGlobalStoreResolutionRegistryLifetime(t *testing.T) {
	const source = `export const first=Symbol.for('first');export const second=Symbol.for('second');function writer(target:Record<string,unknown>){target['for']=()=>document.title}`
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		analysis := collectCallableEffects(file, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
		if len(analysis.pending) != 0 || len(analysis.facts) == 0 {
			t.Fatal("original per-file source unresolved", analysis.pending)
		}
		if len(owner.writerInputFacts) != 0 || len(owner.pendingMemberPublishers) != 0 {
			t.Fatal("per-file registry escaped collection")
		}
		original := stagedReturnSourceFacts(file)
		var restoreOuter func()
		defer func() {
			if restoreOuter != nil {
				restoreOuter()
			}
		}()
		outerGraphs := make(map[*ast.Node]*sourceWriterInputGraph)
		outerPublishers := make(map[*ast.Node]*sourcePendingMemberPublisher)
		var expired *sourceWriterInputRequest
		var query *sourceValueQuery
		for round := 0; round < 2; round++ {
			if round == 1 {
				restoreOuter = registerWriterInputFacts(owner, original)
				for i := range original {
					n := original[i].node
					outerGraphs[n] = owner.writerInputFacts[n]
					outerPublishers[n] = owner.pendingMemberPublishers[n]
				}
			}

			fresh := make([]callableFacts, len(analysis.facts))
			for i := range fresh {
				fresh[i] = cloneProjectCallableFact(analysis.facts[i])
			}
			work := callableEffectWork{extracting: -1}
			if pending := resolveCallableEffectsWithWork(fresh, owner, &work); len(pending) != 0 {
				t.Fatal("cloned project source unresolved", pending)
			}
			observed := 0
			for _, state := range work.operations {
				recipe := work.operationRecipes[state.key]
				if recipe.nativeGet != nil && state.key == nativeRootDebtRequest(recipe.nativeGet, "callee-get").producer {
					if state.invalid || state.nativeCallee == nil || state.nativeCallee.generation != owner.values.generation {
						t.Fatal("current project registry did not serve original native Get")
					}
					for _, r := range recipe.nativeGet.callResults {
						if r.producer.selector.field == "get-source:value" {
							t.Fatal("known external callee fell into returned-DATA recovery")
						}
					}
					observed++
				}
			}
			if observed != 2 {
				t.Fatal("original module native source observations missing", observed)
			}
			for n, g := range outerGraphs {
				if owner.writerInputFacts[n] != g || owner.pendingMemberPublishers[n] != outerPublishers[n] || !outerPublishers[n].live {
					t.Fatal("nested resolution did not restore original registry")
				}
			}
		}
		var call *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if call == nil && ast.IsCallExpression(n) {
				call = n
			}
			return true
		})
		query = newSourceDependencyQuery(call, owner.checker, owner, sourceStagedModuleOwner(call))
		expired = query.registerWriterInputRequest(call)
		if expired == nil || !expired.excludeDiscovery(query, nil) {
			t.Fatal("restored original registry not usable")
		}
		copied := *query
		if expired.excludeDiscovery(&copied, nil) {
			t.Fatal("copied query borrowed restored registry request")
		}
		expired.revoke()
		if expired.excludeDiscovery(query, nil) {
			t.Fatal("expired request borrowed current registry")
		}
		restoreOuter()
		restoreOuter = nil
		if len(owner.writerInputFacts) != 0 || len(owner.pendingMemberPublishers) != 0 {
			t.Fatal("outer registry escaped original lifetime")
		}
		empty := callableEffectWork{extracting: -1}
		resolveCallableEffectsWithWork(nil, nil, &empty)
	})
}
