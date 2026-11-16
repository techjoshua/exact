package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The unchanged native collector fixture supplies the actual authored getter,
// standard read, canonical BODY/input transfer and final installed DATA use.
// No unrelated project-pending-zero assertion is needed for this local law.
func TestTrustedStandardReadMutationProductionEntry(t *testing.T) {
	const source = "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){return document.title}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		collection.resolve(file)
		work := &collection.work
		var evidence *sourceRelativeFieldMutation
		actual := false
		for _, recipe := range work.operationRecipes {
			s := recipe.mutationData
			if s == nil || s.external == nil || s.external.standardRead != standardPropertyReadDocumentTitle {
				continue
			}
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				continue
			}
			state := &work.operations[id.index]
			if state.invalid || !state.delta.extracted || state.revision == 0 || !work.fieldMutationDataCurrent(recipe) {
				continue
			}
			var mutation *sourceRelativeFieldMutation
			for _, residual := range state.delta.residuals {
				if residual.mutation != nil && residual.mutation.standardReadEmpty {
					mutation = residual.mutation
				}
			}
			if mutation == nil || !work.externalFieldMutationSourceCurrent(mutation) || work.standardPropertyReadMutationDisposition(s.external, s.externalSource) != standardPropertyReadEmpty {
				continue
			}
			stored, installed := false, false
			for _, subscriber := range state.subscribers {
				if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !work.validFieldMutationDataReading(recipe, subscriber.request) {
					continue
				}
				stored = stored || sameOperationRequest(subscriber.request, s.request)
				installed = installed || subscriber.request.inputs != nil
			}
			if !stored || !installed {
				continue
			}
			if len(state.delta.exposures)+len(state.delta.invoked)+len(state.delta.relative)+len(state.delta.effects) != 0 || !operationContainsRequest(state.delta.required, s.externalSource) {
				t.Fatal("standard read acquired a Value/BODY/call atom or lost its original SOURCE debt")
			}
			actual, evidence = true, cloneRelativeFieldMutation(mutation)
			break
		}
		if !actual || evidence == nil {
			t.Fatal("ENTRY_EXPERIMENT: actual standard read empty mutation DATA/current/default and installed APPLIED UNREACHED")
		}
		browser := false
		for _, fact := range collection.facts {
			for _, effect := range fact.summary.DirectEffectSources {
				browser = browser || effect.Environment == "browser"
				if effect.Description == "external getter mutation alternative" {
					t.Fatal("trusted standard read retained an arbitrary external-mutation terminal")
				}
			}
		}
		if !browser {
			t.Fatal("authored getter activation lost the known browser donor")
		}
		if copy := cloneRelativeFieldMutation(evidence); copy == evidence || copy.external == evidence.external || !sameRelativeFieldMutation(copy, evidence) {
			t.Fatal("mutation description clone aliases or changes the standard read contract")
		}
		wrong := cloneRelativeFieldMutation(evidence)
		wrong.external.standardRead = standardPropertyReadUnmodeled
		if validRelativeFieldMutationShape(wrong) || work.externalFieldMutationSourceCurrent(wrong) {
			t.Fatal("unmodeled external read borrowed the empty mutation law")
		}
		wrong = cloneRelativeFieldMutation(evidence)
		wrong.external.generation = &projectGeneration{}
		if work.externalFieldMutationSourceCurrent(wrong) {
			t.Fatal("foreign generation borrowed the original standard read")
		}
		wrong = cloneRelativeFieldMutation(evidence)
		wrong.external.cut.invoking = wrong.external.operation
		if work.externalFieldMutationSourceCurrent(wrong) {
			t.Fatal("different original cut borrowed standard read currency")
		}
		// A fresh graph can copy the description but not the original Get or ACK.
		collection.close()
		fresh := beginProjectCallableCollection(cache, cache.owner)
		defer fresh.close()
		if fresh.work.externalFieldMutationSourceCurrent(evidence) {
			t.Fatal("fresh graph inherited original standard-read authority")
		}
	})
}

// These are classification controls, not graph publication or full native
// behavioral acceptance. A checked Document type alone never selects a read.
func TestTrustedStandardReadClassificationBoundaries(t *testing.T) {
	for _, fixture := range []struct {
		name, source string
		want         sourceStandardPropertyReadKind
	}{
		{"global", `export{};export function probe(){return document.title}`, standardPropertyReadDocumentTitle},
		{"typed-parameter", `export{};export function probe(document:Document){return document.title}`, standardPropertyReadUnmodeled},
		{"authored-getter", `export{};const document={get title(){return 'authored'}};export function probe(){return document.title}`, standardPropertyReadUnmodeled},
		{"ambient-holder", `export{};declare const holder:Document;export function probe(){return holder.title}`, standardPropertyReadUnmodeled},
		{"alias", `export{};const alias=document;export function probe(){return alias.title}`, standardPropertyReadUnmodeled},
		{"other-platform-read", `export{};export function probe(){return document.body}`, standardPropertyReadUnmodeled},
	} {
		if !t.Run(fixture.name, func(t *testing.T) {
			withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+fixture.source, func(owner *executableBodyOwner, file *ast.SourceFile) {
				var read *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsPropertyAccessExpression(node) {
						read = node
					}
					return true
				})
				if read == nil {
					t.Fatal("classification read missing")
				}
				q := newSourceDependencyQuery(read, owner.checker, owner, enclosingCallableNode(read))
				defer q.publishDependencyStatistics()
				got := q.standardPropertyReadContract(read, read.Expression(), owner.checker.GetSymbolAtLocation(read.Expression()), owner.checker.GetSymbolAtLocation(read))
				if got != fixture.want {
					t.Fatalf("contract=%d want=%d", got, fixture.want)
				}
			})
		}) {
			return
		}
	}
}
