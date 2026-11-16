package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original collector issues both native occurrences. Source-set membership
// must consume their actual semantic roles, without invoking another body or
// paying a callee Get with its later Call's argument/invocation contribution.
func TestStagedMemberProtocolOriginalNativeSources(t *testing.T) {
	for sourceIndex, source := range []string{
		`export function invoke(){Symbol.for('key');return Object.freeze({})}`,
		`const key=Symbol.for('key');export function invoke(){return Object.freeze({})}`,
		`declare function foreign():void;export function invoke(){foreign();Symbol.for('key');return Object.freeze({})}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
			var facts []callableFacts
			for _, analysis := range q.executable.project.callableCache.bySource {
				for _, fact := range analysis.facts {
					facts = append(facts, cloneProjectCallableFact(fact))
				}
			}
			work := newCallableEffectWork(facts)
			work.operationGeneration = q.owner.generation
			work.indexOperationSources(facts)
			var request sourceStagedNativeRequest
			for _, recipe := range work.operationRecipes {
				if recipe.nativeGet != nil && recipe.nativeGet.request.producer.operation == call {
					source := recipe.nativeGet
					request = sourceStagedNativeRequest{call: call, get: source.get, request: source.request, algorithmKind: source.kind}
					break
				}
			}
			revoke, installed := q.beginStagedNativeGetSource(&work, facts, request)
			if !installed {
				t.Fatal("original reader source loan")
			}
			q.receiverCandidates(call, nil)
			sources := append([]sourceStagedOperationRequest(nil), q.stagedNativeGet.memberSources...)
			revoke()
			if len(sources) == 0 {
				t.Fatal("reader source requirements missing")
			}
			for _, source := range sources {
				if !work.registerOperationUse(facts, sourceStagedOperationUse{request: source}) {
					t.Fatal("original reader did not adopt its source set")
				}
			}
			work.prepareOperationUses(facts, q.executable)
			for _, source := range sources {
				id := work.operationIDs[source.producer]
				if !work.closedOperationDependencies()[id.index] {
					t.Fatalf("original adopted source parent remains pending: %s", source.edge)
				}
			}

			connectedCall, connectedGet := false, false
			for _, recipe := range work.operationRecipes {
				s := recipe.memberSource
				if s == nil || s.protocolSource == nil {
					continue
				}
				if s.protocolSource.external != nil {
					if !validStagedMemberExternalRecipe(recipe) {
						t.Fatal("invalid external source terminal")
					}
					continue
				}
				if !validStagedMemberProtocolRecipe(recipe) || !recipe.delta.extracted || len(recipe.delta.required) != 1 {
					t.Fatal("invalid original source connection")
				}
				child := recipe.delta.required[0]
				if ast.IsCallExpression(s.candidate.operation) {
					connectedCall = true
					if child.producer.operation != s.candidate.operation || child.producer.selector != (sourceStagedOperationSelector{}) {
						t.Fatal("Call source retargeted")
					}
				} else {
					connectedGet = true
					if child.producer.selector.field != "callee-get" || !ast.IsCallExpression(child.use) || child.use.Expression() != s.candidate.operation {
						t.Fatal("callee Get used whole invocation")
					}
				}
				clone := cloneStagedMemberSource(s)
				clone.protocolSource.required.edge += "changed"
				if clone.protocolSource == s.protocolSource || clone.protocolSource.required.edge == s.protocolSource.required.edge {
					t.Fatal("cloned dependency aliases source")
				}
			}
			if sourceIndex == 2 {
				unknown := false
				for _, fact := range facts {
					if fact.summary.Name == "invoke" {
						for _, effect := range fact.summary.EffectSources {
							unknown = unknown || effect.Environment == "unknown"
						}
					}
				}
				if !unknown {
					t.Fatal("explicit external runtime unknown was dropped")
				}
			}
			if !connectedCall || !connectedGet {
				t.Fatalf("original protocol sources disconnected: call=%v Get=%v", connectedCall, connectedGet)
			}
		})
	}
}

func TestStagedMemberProtocolPublicNativeSources(t *testing.T) {
	for _, source := range []string{
		`export function invoke(){Symbol.for('key');return Object.freeze({})}`,
		`const key=Symbol.for('key');export function invoke(){return Object.freeze({})}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/member-protocol-public.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "invoke")
			for _, effect := range summary.EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("source extraction invoked a body", effect)
				}
			}
			settled := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name == "invoke" {
					settled = fact.staged.settled && !fact.staged.operationsPending
				}
			}
			if !settled {
				t.Fatal("ordinary member parents did not settle")
			}
		}
	}
}

func TestStagedMemberExternalGetOriginalOwner(t *testing.T) {
	withHasInstanceSource(t, `export function invoke(){return ({get dormant(){return window.name},callback:()=>document.title}) instanceof WeakMap}`, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		var get *ast.Node
		walkNode(operation, func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "window" {
				get = node
			}
			return true
		})
		if get == nil {
			t.Fatal("original library Get")
		}
		consumer := installationFactIndex(t, facts, enclosingCallableNode(get))
		request, ok := sourceStagedOccurrenceRequest(&facts[consumer], get, relativeDemandEffects, "library-get-source")
		if !ok {
			t.Fatal("original library Get request")
		}
		work := newCallableEffectWork(facts)
		work.operationGeneration = q.owner.generation
		work.indexOperationSources(facts)
		if prior := work.operationRecipes[request.producer]; prior.memberSource != nil && prior.memberSource.protocolSource != nil && prior.memberSource.protocolSource.get != nil {
			request = prior.memberSource.request
		}
		query := newSourceDependencyQuery(get, q.owner.checker, q.executable, facts[consumer].node)
		revoke, installed := work.beginStagedMemberWork(query, facts, request)
		if !installed {
			t.Fatal("original library Get loan")
		}
		query.evaluatedSourceAccessors(get, nil)
		observed := query.stagedMember.externalGet
		copied := *query
		if work.publishStagedMemberExternalGet(facts, &copied) {
			t.Fatal("copied query published source receipt")
		}
		revoke()
		recipe := work.operationRecipes[request.producer]
		if observed == nil || recipe.memberSource == nil || recipe.memberSource.protocolSource == nil || recipe.memberSource.protocolSource.get == nil {
			t.Fatal("original library terminal not published")
		}
		bad := recipe
		bad.memberSource = cloneStagedMemberSource(recipe.memberSource)
		bad.memberSource.protocolSource.get.cut.reading = operation
		if validStagedMemberProtocolRecipe(bad) {
			t.Fatal("wrong physical Get cut accepted")
		}
		fresh := newCallableEffectWork(facts)
		fresh.operationGeneration = q.owner.generation
		fresh.indexOperationSources(facts)
		id, accepted := fresh.requireOperation(facts, recipe.memberSource.request)
		if !accepted || fresh.closedOperationDependencies()[id.index] || fresh.operations[id.index].memberCoverageObserved {
			t.Fatal("cached library description issued a fresh receipt")
		}
		if work.publishStagedMemberExternalGet(facts, query) {
			t.Fatal("revoked Get retained publication authority")
		}

	})
}
