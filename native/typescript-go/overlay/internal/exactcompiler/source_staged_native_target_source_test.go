package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original target acquisition owns the proof, not a target expression's
// spelling or TypeScript type. This also protects authored same-name receivers.
func TestStagedNativeTargetOriginalSource(t *testing.T) {
	for _, row := range []struct {
		source   string
		standard bool
	}{
		{stagedReturnedInstalledWitness, true},
		{`const Object={prototype:{},defineProperty:globalThis.Object.defineProperty};export function invoke(){return Object.defineProperty(Object.prototype,'run',{})}`, false},
	} {
		withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
			var writer *ast.Node
			walkNode(enclosingCallableNode(call).Body(), func(node *ast.Node) bool {
				if writer == nil && ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
					writer = node
				}
				return !ast.IsFunctionLike(node)
			})
			target := restrictedInvocationArguments(writer.AsCallExpression())[0]
			query.probingStagedTarget = true
			result := query.accessors(target, nil, "", accessorAcquire, nil, nil)
			known := false
			for _, value := range result.values {
				known = known || value.native != nil && value.native.kind == sourceNativeObjectPrototype
			}
			if known != row.standard {
				t.Fatalf("actual target standard=%t want=%t", known, row.standard)
			}
			if row.standard && (result.opaque || result.valueIncomplete || result.receiverIncomplete || result.fieldReceiverIncomplete || result.ownOperation || len(result.effects)+len(result.environmentEffects)+len(result.contextEffects) != 0) {
				t.Fatalf("actual target effects pending: %#v", result)
			}
		})
	}
}

func TestStagedNativeTargetRequiredSource(t *testing.T) {
	withSourceCalleeWriteQuery(t, stagedReturnedInstalledWitness, func(query *sourceValueQuery, reader *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		var writer *ast.Node
		walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
			if writer == nil && ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
				writer = node
			}
			return !ast.IsFunctionLike(node)
		})
		registerInstallationSource(t, &work, facts, query, writer)
		work.prepareOperationUses(facts, query.executable)
		source := work.operationRecipes[installationSourceRequest(writer).request.producer].nativeGet
		request := nativeEagerTargetRequest(source)
		id, ok := work.operationIDs[request.producer]
		if !ok {
			t.Fatal("target request not registered before eager extraction")
		}
		state := work.operations[id.index]
		if state.nativeTarget == nil || state.nativeTarget.generation != query.owner.generation || !state.delta.extracted || !work.closedOperationDependencies()[id.index] {
			t.Fatalf("target original owner did not settle its independent Get: %#v", state.nativeTarget)
		}
	})
}

func TestStagedNativeTargetModeBoundary(t *testing.T) {
	withSourceCalleeWriteQuery(t, stagedReturnedInstalledWitness, func(parent *sourceValueQuery, call *ast.Node) {
		var target *ast.Node
		walkNode(enclosingCallableNode(call).Body(), func(node *ast.Node) bool {
			if target == nil && ast.IsPropertyAccessExpression(node) && callableNameText(node.Name()) == "prototype" {
				target = node
			}
			return !ast.IsFunctionLike(node)
		})
		if target == nil {
			t.Fatal("missing target")
		}
		for _, mode := range []string{"ordinary-source", "normal-frame", "normal-operation"} {
			query := newSourceDependencyQuery(target, parent.owner.checker, parent.executable, enclosingCallableNode(call))
			query.probingStagedTarget = mode != "ordinary-source"
			if mode == "normal-frame" {
				query.inputs = &sourceValueInputs{}
			}
			if mode == "normal-operation" {
				query.operation = &sourceOperationContext{}
			}
			if query.stagedTargetAcquisition() {
				t.Fatal("target-Effects domain leaked into ordinary or normal acquisition")
			}
			if mode == "ordinary-source" {
				result := query.accessors(target, nil, "", accessorAcquire, nil, nil)
				for _, value := range result.values {
					if value.native != nil && value.native.kind == sourceNativeObjectPrototype {
						t.Fatal("normal source target branded by the opt-in effect seam")
					}
				}
			}
			query.publishDependencyStatistics()
		}
	})
}
