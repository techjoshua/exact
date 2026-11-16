package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original fixed-field driver must deliver a distinct source interval for
// every Has/Get. Finite extraction keeps the unprovided writer input required
// and never activates the stored callback or borrows a module enum exclusion.
func TestStagedFieldMemberSourcesOriginalHasAndGet(t *testing.T) {
	const source = `declare function foreign():void;function latent(target:PropertyDescriptor){window.name;foreign();target.value=()=>document.title}export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`
	withSourceCalleeWriteQueryStatus(t, source, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		registerInstallationSource(t, &work, facts, query, call)
		work.prepareOperationUses(facts, query.executable)
		seen := make(map[sourceStagedOperationKey]bool)
		phases := make(map[string]map[sourceStagedFieldObservationPhase]bool)
		writer := false
		for _, recipe := range work.operationRecipes {
			member := recipe.memberSource
			if member == nil {
				continue
			}
			field, phase, contextual := stagedFieldMemberParent(member.parent)
			if !contextual || field.producer.operation != call {
				continue
			}
			if member.moduleExcluded != nil {
				t.Fatal("function field source borrowed an initial module/enum exclusion")
			}
			writer = writer || member.writeEffects && plainStagedAssignment(member.candidate.operation)
			if member.coverage == nil {
				continue
			}
			coverage := member.coverage
			if seen[recipe.key] || !validStagedMemberCoverageRecipe(recipe) || !coverage.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration || len(coverage.required) == 0 {
				t.Fatal("original field source interval was aliased, missing or unrepresented")
			}
			seen[recipe.key] = true
			if phases[field.producer.selector.field] == nil {
				phases[field.producer.selector.field] = make(map[sourceStagedFieldObservationPhase]bool)
			}
			phases[field.producer.selector.field][phase] = true
		}
		for _, field := range reflectiveDescriptorKeys {
			if !phases[field][stagedFieldObservationHas] || !phases[field][stagedFieldObservationGet] {
				t.Fatal("fixed-field Has/Get source consumer omitted its original phase", field)
			}
			key := storedValueForwardingFieldKey(call, field, relativeDemandEffects)
			id := work.operationIDs[key]
			if id.index == 0 || work.operations[id.index].fieldDisposition == nil || len(work.operations[id.index].fieldDisposition.invoked) != 0 {
				t.Fatal("source handoff lost field delivery or activated stored data")
			}
		}
		if !writer || len(seen) != 2*len(reflectiveDescriptorKeys) {
			t.Fatal("field contexts lost an original writer or shared a source-set key")
		}
	}, true)
}
