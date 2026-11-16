package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A real original method event supplies the source. A separate original Get
// subscribes to it without replacing the producer's physical cut.
func TestStagedStandardMemberCallReading(t *testing.T) {
	withPrivateWeakMapMethodSource(t, `const table=new WeakMap<object,object>();export function invoke(key:object){table.set(key,{});return table.get(key)}`, func(q *sourceValueQuery, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		restore := registerPendingMemberFacts(q.executable, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		original, ok := work.prepareStagedStandardMemberCall(facts, work.memberNodes[q.effectOwner], call, q.executable)
		if !ok {
			t.Fatal("original source unavailable")
		}
		source := work.operationRecipes[original.producer].memberSource.call.standard[0]
		var parentCall *ast.Node
		walkNode(q.effectOwner.Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "set" {
				parentCall = node
			}
			return true
		})
		parent, ok := work.prepareStagedStandardMemberCall(facts, work.memberNodes[q.effectOwner], parentCall, q.executable)
		if !ok {
			t.Fatal("original parent Get source unavailable")
		}
		parentSource := work.operationRecipes[parent.producer].memberSource.call.standard[0]
		coverage := standardMemberCallRequirements(&parentSource)[4]
		reading := stagedStandardMemberCallReading(original, coverage)
		if !work.acceptedStandardMemberCallReading(reading) {
			t.Fatal("original source subscription refused")
		}
		for _, change := range []func(*sourceStagedOperationRequest){
			func(r *sourceStagedOperationRequest) { r.edge += "wrong" },
			func(r *sourceStagedOperationRequest) { r.cut.initializing = call },
			func(r *sourceStagedOperationRequest) { r.use = call.Expression() },
			func(r *sourceStagedOperationRequest) { r.reading.selector.association = call },
			func(r *sourceStagedOperationRequest) { r.consumer = source.construction.owner },
		} {
			wrong := reading
			change(&wrong)
			count := len(work.operations)
			if _, accepted := work.requireOperation(facts, wrong); accepted || len(work.operations) != count {
				t.Fatal("mismatched subscription admitted")
			}
		}
		id, adopted := work.requireOperation(facts, reading)
		if !adopted {
			t.Fatal("original typed subscription unavailable")
		}
		if _, ready := work.consumeOperation(id, reading); ready {
			t.Fatal("source metadata became delivered disposition")
		}
		work.extractOperation(facts, callableExtractionTask{operation: id}, q.executable)
		delivery, delivered := work.consumeOperation(id, reading)
		if !delivered || !delivery.delta.extracted || len(delivery.delta.required) != len(standardMemberCallRequirements(&source)) {
			t.Fatal("original local disposition not delivered with full source debt")
		}
		if len(facts[work.memberNodes[q.effectOwner]].staged.operationUses) != 0 || len(facts[work.memberNodes[q.effectOwner]].summary.Calls) != 0 {
			t.Fatal("method subscription activated an ordinary Call")
		}
	})
}
