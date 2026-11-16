package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These controls demand the actual native Get DATA role without reaching any
// Set. Local result completeness stays separate from writer/input closure and
// the ordinary aggregate Effects root required by the generic result reader.
func TestStagedConstructedResultOriginalData(t *testing.T) {
	for _, row := range []struct {
		name, body, extra string
		complete, broad   bool
	}{
		{"literal", `table.set(key,()=>document.title)`, "", true, false},
		{"formal", `table.set(key,value)`, "", true, false},
		{"empty private source", `void key;void value`, "", true, false},
		{"unrelated dynamic writer", `table.set(key,()=>document.title)`, `export function unrelated(target:Record<string,unknown>,name:string,value:unknown){target[name]=value}`, true, true},
		{"pending Call output", `table.set(key,produce())`, `function produce(){window.name;return{}}`, false, false},
		{"pending Get output", `table.set(key,window.name)`, "", false, false},
		{"unprovided capture", `function write(){table.set(key,value)}write()`, "", false, false},
		{"own method replacement", `table.set(key,()=>document.title)`, `table.get=(_key:object)=>document.title;`, false, false},
		{"receiver escape", `table.set(key,()=>document.title)`, `declare function expose(value:object):void;expose(table);`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `const table=new WeakMap<object,unknown>();` + row.extra + `function put(key:object,value:unknown){` + row.body + `}function factory(key:object){return table.get(key)}export function invoke(key:object,value:unknown){put(key,value);return factory(key)}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
				file := ast.GetSourceFileOfNode(creating)
				var site, read *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						site = node
					}
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
						_, name := accessorReceiver(node.Expression())
						if name == "get" {
							read = node
						}
					}
					return true
				})
				if site == nil || read == nil {
					t.Fatal("original construction/Get missing")
				}
				facts := stagedReturnSourceFacts(file)
				restore := registerPendingMemberFacts(owner, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				visitImplicitAccessors(site, owner.checker, nil, owner, sourceStagedModuleOwner(site), nil, func(accessorCandidates) {})
				caller := work.memberNodes[enclosingCallableNode(read)]
				root, represented := work.prepareConstructedResultSource(facts, caller, read, owner)
				if !represented {
					t.Fatal("original native Get branch unavailable")
				}
				member := work.operationRecipes[root.producer].constructed
				role := constructedMemberRequest(member, "member-result")
				id, required := work.requireOperation(facts, role)
				if !required {
					t.Fatal("actual DATA role demand refused")
				}
				work.prepareConstructedMemberResults(facts, owner)
				recipe := work.operationRecipes[role.producer]
				proof := recipe.constructedDisposition
				if !validConstructedMemberRecipe(recipe) || proof == nil || recipe.delta.extracted != row.complete || proof.resultComplete != row.complete {
					t.Fatal("conditional source result completeness differs", recipe.delta.extracted, row.complete)
				}
				if len(recipe.delta.exposures) == 0 || !sameOperationAlternative(recipe.delta.exposures[0], constructedResultUndefined(member)) || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
					t.Fatal("native result lost conditional undefined or activated data")
				}
				if row.broad && (len(member.writers) == 0 || !work.constructedUsesCovered(facts, member, owner) || len(work.operationRecipes[constructedMemberRequest(member, "own-writers").producer].writerRequired) != 0) {
					t.Fatal("unrelated broad writer control did not exercise positive private-use coverage")
				}
				for _, writer := range proof.resultSources {
					for _, debt := range []sourceStagedOperationRequest{constructedMemberRequest(&writer, "own-writers"), constructedMemberRequest(&writer, "eager-inputs"), constructedPayloadRequest(member, &writer)} {
						present := false
						for _, retained := range recipe.delta.required {
							present = present || sameOperationRequest(retained, debt)
						}
						if !present {
							t.Fatal("native result dropped an original Set DATA prerequisite", debt.producer.selector.field)
						}
					}
					if _, adopted := work.operationIDs[writer.request.producer]; adopted {
						t.Fatal("result discovery activated an indexed Set")
					}
				}
				if row.name == "formal" {
					if len(recipe.delta.exposures) != 2 || len(proof.resultSources) != 1 {
						t.Fatal("original formal DATA alternative missing")
					}
					value := recipe.delta.exposures[1].endpoint
					writer := proof.resultSources[0]
					if value.kind != relativeEndpointRole || value.role.kind != relativeRoleFormal || value.role.declaration != writer.request.consumer || value.producer != writer.request.producer.operation || value.cut != writer.actuals[1].endpoint.cut || value.creation != nil {
						t.Fatal("writer formal was substituted at its reader")
					}
				}
				work.prepareOperationUses(facts, owner)
				state := &work.operations[id.index]
				subscriber := state.subscribers[sourceStagedOperationConsumer{role.consumer, role.edge}]
				if state.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || len(subscriber.constructed) != len(recipe.delta.exposures) {
					t.Fatal("actual DATA role prefix was not delivered", state.revision, subscriber)
				}
				if work.closedOperationDependencies()[id.index] {
					t.Fatal("local DATA covered unprovided original writer/input closure")
				}
				for _, fact := range facts {
					if len(fact.staged.constructedOccurrences)+len(fact.staged.operationUses)+len(fact.summary.DirectEffectSources)+len(fact.summary.EffectSources) != 0 {
						t.Fatal("passive result preparation enrolled or invoked source work")
					}
				}
				cloned := cloneConstructedDisposition(proof)
				cloned.resultValues[0].endpoint.producer = site
				if proof.resultValues[0].endpoint.producer != read || sameOperationAlternative(cloned.resultValues[0], proof.resultValues[0]) {
					t.Fatal("result snapshot borrowed cloned endpoint storage")
				}
				bad := recipe
				bad.constructedDisposition = cloned
				if validConstructedMemberRecipe(bad) {
					t.Fatal("wrong original result cut/source admitted")
				}
			})
		})
	}
}
