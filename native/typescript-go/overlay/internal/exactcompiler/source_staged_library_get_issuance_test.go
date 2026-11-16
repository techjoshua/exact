package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Cached original candidate descriptions request fresh semantic issuance here.
// Neither a library member's type nor a captured receiver supplies that owner.
func TestStagedLibraryGetIssuanceOriginalReceiverAndDormancy(t *testing.T) {
	for _, row := range []struct {
		name, prefix string
		admitted     bool
	}{
		{"original library", `function donor(){return document.title}`, true},
		{"shadow", `const document={title:'local'};function donor(){return document.title}`, false},
		{"typed fake", `const fake={} as Document;function donor(){return fake.title}`, false},
		{"captured formal", `function factory(document:Document){return function donor(){return document.title}}`, false},
		{"saved library", `const saved=document;function donor(){return saved.title}`, false},
		{"written entry", `document={} as Document;function donor(){return document.title}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.prefix + `export function invoke(){const target={slot:0};target.slot=1;return 2}`
			withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
				work := newCallableEffectWork(facts)
				work.operationGeneration = q.owner.generation
				work.indexOperationSources(facts)
				var get *ast.Node
				walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(node *ast.Node) bool {
					if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "title" {
						get = node
					}
					return true
				})
				var candidate *sourceStagedMemberCandidate
				for _, recipe := range work.operationRecipes {
					if s := recipe.memberSource; s != nil && s.candidate.protocol && s.candidate.operation == get && recipe.key.selector != (sourceStagedOperationSelector{}) {
						copy := s.candidate
						candidate = &copy
						break
					}
				}
				if get == nil || candidate == nil {
					t.Fatal("original source owner did not enumerate the dormant Get candidate")
				}
				consumer := installationFactIndex(t, facts, candidate.region)
				request, valid := stagedMemberGetSourceRequest(&facts[consumer], get)
				if !valid || work.memberCoverageObserved[request.producer] != nil {
					t.Fatal("fresh graph did not retain only descriptive source membership")
				}
				work.issueStagedLibraryGetSource(facts, *candidate, q.executable)
				recipe := work.operationRecipes[request.producer]
				observed := work.memberCoverageObserved[request.producer] == q.owner.generation
				if observed != row.admitted {
					t.Fatal("original library receiver issuance disagrees with actual source", observed)
				}
				if row.admitted {
					if !validStagedMemberExternalGetRecipe(recipe) || !work.passiveMemberSourceReady(recipe) || len(recipe.delta.required) != 1 || recipe.delta.required[0].producer.selector.field != "member-source-set" {
						t.Fatal("original Get lost its separate writer/source coverage requirement")
					}
					if _, adopted := work.operationIDs[request.producer]; adopted {
						t.Fatal("dormant source issuance adopted an operation")
					}
				}
				donorBrowser := false
				for _, fact := range facts {
					if fact.node == candidate.region {
						for _, effect := range fact.summary.EffectSources {
							donorBrowser = donorBrowser || effect.Environment == "browser"
						}
					}
					if fact.summary.Name == "invoke" {
						for _, effect := range fact.summary.DirectEffectSources {
							if effect.Environment == "browser" {
								t.Fatal("source Get issuance invoked a dormant browser donor")
							}
						}
						for _, call := range fact.staged.calls {
							if call.invocation.declaration == candidate.region {
								t.Fatal("source Get issuance manufactured a donor input association")
							}
						}
					}
				}
				if row.admitted && !donorBrowser {
					t.Fatal("original browser donor summary was lost")
				}
			})
		})
	}
}
