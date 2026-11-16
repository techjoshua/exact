package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

const descriptorStrongAssignmentSource = `export {};
function original(){ return 1 }
function replacement(){ document.title; return 2 }
const target = { value: original };
target.value = replacement;
export function probe(){
  const selected = Object.getOwnPropertyDescriptor(target, 'value')?.value;
  return selected?.();
}`

// This requires a real production collector, actual applied outer reader,
// target C and original receiver/RHS DATA before checking the replacement donor.
// Independent result-record shape/Get debts are not a source-completeness claim.
func withDescriptorStrongAssignment(t *testing.T, inspect func(*projectCallableCollection, callableAnalysis, sourceStagedOperationRecipe)) {
	t.Helper()
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+descriptorStrongAssignmentSource, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		result := collection.resolve(file)
		work := &collection.work
		for _, recipe := range work.operationRecipes {
			if !validDescriptorStrongReaderRecipe(recipe) || !work.descriptorStrongRequiredCurrent(recipe) {
				continue
			}
			d := recipe.memberSource.descriptorStrong
			if !work.descriptorStrongReadingCurrent(recipe.memberSource.request, d.parent, d.cut) || !work.descriptorTargetApplied(d.target) {
				continue
			}
			native := work.operationRecipes[d.view.source.request.producer].nativeGet
			stored, complete := work.descriptorTargetKnownData(native)
			if !complete || stored == nil {
				t.Fatal("strong reader actual receiver/RHS DATA closure UNREACHED")
			}
			found := false
			for _, field := range stored.fields {
				if field.field != descriptorTargetValue {
					continue
				}
				for _, alternative := range field.alternatives {
					callable := alternative.endpoint.expression
					found = found || callable != nil && callable.Name() != nil && callableNameText(callable.Name()) == "replacement"
				}
			}
			if !found {
				t.Fatal("strong reader postcreation replacement donor UNREACHED")
			}
			inspect(collection, result, recipe)
			return
		}
		t.Fatal("original SOURCE strong reader and applied target C positive UNREACHED")
	})
}

func TestDescriptorStrongReaderPostcreationDonor(t *testing.T) {
	withDescriptorStrongAssignment(t, func(_ *projectCallableCollection, result callableAnalysis, _ sourceStagedOperationRecipe) {
		probe := findCallable(t, result.summaries, "probe")
		replacement := findCallable(t, result.summaries, "replacement")
		for _, edge := range probe.Calls {
			if edge.Resolved && edge.TargetID == replacement.ID {
				descriptorContractBrowser(t, result, true)
				return
			}
		}
		t.Fatal("actual alias Call lost the delivered known replacement donor")
	})
}

func TestDescriptorStrongReaderAuthorityBoundaries(t *testing.T) {
	withDescriptorStrongAssignment(t, func(collection *projectCallableCollection, _ callableAnalysis, recipe sourceStagedOperationRecipe) {
		work := &collection.work
		d := recipe.memberSource.descriptorStrong
		wrongCut := d.cut
		wrongCut.use = d.parent.producer.declaration
		if work.descriptorStrongReadingCurrent(recipe.memberSource.request, d.parent, wrongCut) {
			t.Fatal("foreign cut supplied strong reader authority")
		}
		wrongParent := d.parent
		wrongParent.edge += ":foreign"
		if work.descriptorStrongReadingCurrent(recipe.memberSource.request, wrongParent, d.cut) {
			t.Fatal("foreign parent supplied strong reader authority")
		}
		copyWork := *work
		if copyWork.descriptorStrongReadingCurrent(recipe.memberSource.request, d.parent, d.cut) {
			t.Fatal("copied work supplied original applied reader authority")
		}
		cloned := cloneCallableExtraction(sourceCallableExtractionFact{operationRecipes: []sourceStagedOperationRecipe{recipe}})
		copyReader := cloned.operationRecipes[0].memberSource.descriptorStrong
		if copyReader == d || !sameDescriptorStrongReader(copyReader, d) {
			t.Fatal("clone lost detached strong reader description")
		}
		facts := make([]callableFacts, len(collection.facts))
		for i, fact := range collection.facts {
			facts[i] = cloneProjectCallableFact(fact)
		}
		fresh := newCallableEffectWork(facts)
		if fresh.descriptorStrongReadingCurrent(recipe.memberSource.request, d.parent, d.cut) {
			t.Fatal("cloned descriptions inherited strong reader currentness")
		}
	})
}
