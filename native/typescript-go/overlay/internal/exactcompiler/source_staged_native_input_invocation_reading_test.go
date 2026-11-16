package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A reader subscribes to an original observed algorithm, retaining its physical
// Get cut and full Call debt separately from the reader's contextual C.
func TestStagedFreezeInputInvocationReading(t *testing.T) {
	withReflectiveRelevanceSource(t, `export function invoke(){Object.freeze({});return Object.freeze({})}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		var calls []*ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				calls = append(calls, node)
			}
			return true
		})
		if len(calls) != 2 {
			t.Fatal("original Calls missing")
		}
		caller := work.memberNodes[enclosingCallableNode(calls[0])]
		first, supported := work.describeNativeInputOccurrence(facts, caller, calls[0], owner)
		if !supported {
			t.Fatal("original producer unavailable")
		}
		second, supported := work.describeNativeInputOccurrence(facts, caller, calls[1], owner)
		if !supported {
			t.Fatal("original reader source unavailable")
		}
		role := nativeInputInvocationRequest(first.source)
		recipe := work.operationRecipes[role.producer]
		secondRecipe := work.operationRecipes[nativeInputInvocationRequest(second.source).producer]
		if !work.nativeInputInvocationCurrent(recipe) || len(secondRecipe.nativeGet.memberSources) == 0 {
			t.Fatal("current source observations missing")
		}
		coverage := secondRecipe.nativeGet.memberSources[0]
		reading := nativeInputInvocationReading(role, coverage)
		if !work.acceptedNativeInputInvocationReading(reading) {
			t.Fatal("authentic original reader refused")
		}
		for _, change := range []func(*sourceStagedOperationRequest){
			func(r *sourceStagedOperationRequest) { r.edge += "wrong" },
			func(r *sourceStagedOperationRequest) { r.cut.initializing = calls[0] },
			func(r *sourceStagedOperationRequest) { r.use = calls[1] },
			func(r *sourceStagedOperationRequest) { r.reading.selector.association = calls[0] },
		} {
			wrong := reading
			change(&wrong)
			count := len(work.operations)
			if _, accepted := work.requireOperation(facts, wrong); accepted || len(work.operations) != count {
				t.Fatal("mismatched reader gained admission")
			}
		}
		id, adopted := work.requireOperation(facts, reading)
		if !adopted {
			t.Fatal("exact contextual reader unavailable")
		}
		if _, delivered := work.consumeOperation(id, reading); delivered {
			t.Fatal("description became delivery")
		}
		work.extractOperation(facts, callableExtractionTask{operation: id}, owner)
		delivery, delivered := work.consumeOperation(id, reading)
		if !delivered || !delivery.delta.extracted {
			t.Fatal("original local law was not delivered")
		}
		for _, expected := range nativeInputInvocationRequirements(recipe.nativeGet) {
			found := false
			for _, actual := range delivery.delta.required {
				found = found || sameOperationRequest(expected, actual)
			}
			if !found {
				t.Fatal("reader lost actual full source requirement")
			}
		}
		if len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("reader activated an ordinary Call")
		}
		assertNativeInputCloneNeedsFreshObservation(t, &work, facts, reading, owner)
	})
}
