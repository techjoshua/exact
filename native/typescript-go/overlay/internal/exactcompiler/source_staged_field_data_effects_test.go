package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Reading a stored data slot does not evaluate its creating expression again.
// Its original eager effects and a demanded output have independent owners.
func TestStagedFieldDataEffectsDoNotAcquireOutput(t *testing.T) {
	const source = `function factory(){window.name;return ()=>document.title}const descriptor={value:factory()};export function invoke(){return Object.defineProperty({},'run',descriptor)}`
	withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
		var receiver *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && callableNameText(node.Name()) == "descriptor" {
				receiver = node.Initializer()
			}
			return true
		})
		if receiver == nil {
			t.Fatal("missing original descriptor")
		}
		observation := &sourceStagedFieldObservation{phase: stagedFieldObservationGet}
		borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call), observation: observation}
		query.stagedFieldGet = borrow
		defer func() { query.stagedFieldGet = nil; borrow.issuer = nil }()
		get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", stagedEffects: borrow}
		preparation := &sourceStagedNativeGetBorrow{}
		query.stagedNativeGet = preparation
		result := query.accessorsAtGet(receiver, []string{"value"}, "", accessorAcquire, nil, nil, get, get.receiver)
		query.stagedNativeGet = nil
		if !observation.getSeen || observation.effects.get != sourceEffectsAccounted {
			t.Fatal("original terminal data Get was not accounted")
		}
		if preparation.legacyPrepared || len(result.values) != 0 || !result.valueIncomplete {
			t.Fatalf("Effects data read acquired output: prepared=%t values=%d incomplete=%t", preparation.legacyPrepared, len(result.values), result.valueIncomplete)
		}
		// No source may infer a complete callable set from this Effects observation.
		if len(observation.effects.invoked) != 0 {
			t.Fatal("stored callback became an invoked getter")
		}
		copied := *query
		if copied.stagedFieldDataEffectsOnly(get, []string{"value"}, "", accessorAcquire) || query.stagedFieldDataEffectsOnly(get, []string{"value", "child"}, "", accessorAcquire) {
			t.Fatal("copied issuer or member projection inherited the Effects-only terminal read")
		}
		query.stagedFieldGet = nil
		ordinary := query.accessorsAtGet(receiver, []string{"value"}, "", accessorAcquire, nil, nil, nil, get.receiver)
		if len(ordinary.values) == 0 {
			t.Fatal("independent value consumer lost its original acquisition")
		}
	})
}
