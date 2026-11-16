package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A real native Get supplies the parent factory. Extending its descriptive DATA
// debts must preserve each original producer factory in both native validators;
// these descriptions do not publish another Get observation or DATA delivery.
func TestStagedGlobalStoreNativeDataFactories(t *testing.T) {
	const source = `function made(){return {value:undefined}}export function invoke(){const saved=made();saved.value;saved;return Object.freeze({})}`
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call, get, binding, root *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "made" {
				call = n
			}
			if ast.IsPropertyAccessExpression(n) && n.Name().Text() == "value" {
				get = n
			}
			if ast.IsIdentifier(n) && n.Text() == "saved" && n.Parent != nil && ast.IsExpressionStatement(n.Parent) {
				binding = n
			}
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().Name().Text() == "freeze" {
				root = n
			}
			return true
		})
		if call == nil || get == nil || binding == nil || root == nil {
			t.Fatal("original DATA/native operations missing")
		}
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		caller := work.memberNodes[enclosingCallableNode(root)]
		request, ok := sourceStagedOccurrenceRequest(&facts[caller], root, relativeDemandEffects, "global-store-native-data")
		if !ok {
			t.Fatal("original native request")
		}
		query := newSourceDependencyQuery(root, owner.checker, owner, facts[caller].node)
		occurrence := &sourceStagedNativeOccurrence{}
		revoke, installed := query.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: root, get: root.Expression(), request: request, occurrence: occurrence}, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
		if !installed {
			t.Fatal("original native source issuer")
		}
		defer revoke()
		query.receiverCandidates(root, nil)
		if occurrence.source == nil {
			t.Fatal("actual native source absent")
		}
		original := work.operationRecipes[nativeInputInvocationRequest(occurrence.source).producer]
		if !validNativeInputInvocationRecipe(original) || !work.nativeInputInvocationCurrent(original) {
			t.Fatal("actual original Get observation absent")
		}
		for _, row := range []struct {
			name      string
			operation *ast.Node
		}{{"Call", call}, {"Get", get}, {"binding", binding}} {
			t.Run(row.name, func(t *testing.T) {
				next := *original.nativeGet
				reading := stagedResultSourceRequest(row.operation, facts[caller].node, nil)
				reading.consumer, reading.reading, reading.edge = request.consumer, nativeRootDebtRequest(&next, "callee-get").producer, "original-native-data-reading"
				next.callResults = []sourceStagedOperationRequest{reading}
				callee := sourceStagedOperationRecipe{key: reading.reading, nativeGet: &next, delta: sourceStagedOperationDelta{required: nativeInputInvocationGetRequirements(&next)}}
				base := next
				base.inputInvocation = nil
				callee.nativeGet = &base
				invocation := original
				invocation.nativeGet = &next
				invocation.delta = sourceStagedOperationDelta{required: nativeInputInvocationRequirements(&next), extracted: original.delta.extracted}
				if !validNativeSourceDataRequirement(&next, reading) || !validOperationEnvelope(callee) || !validNativeInputInvocationRecipe(invocation) {
					t.Fatal("original DATA factory refused by native callee/input source")
				}
				for _, change := range []struct {
					name   string
					mutate func(*sourceStagedOperationRequest)
				}{
					{"selector", func(r *sourceStagedOperationRequest) { r.producer.selector.field = "arbitrary" }},
					{"body", func(r *sourceStagedOperationRequest) {
						r.producer.selector.field = "get-source:body"
						r.producer.selector.association = root
					}},
					{"operand", func(r *sourceStagedOperationRequest) { r.producer.selector.field = "return-operand" }},
					{"cut", func(r *sourceStagedOperationRequest) { r.cut.initializing = root }},
					{"reading", func(r *sourceStagedOperationRequest) { r.reading = nativeRootDebtRequest(&next, "algorithm").producer }},
					{"key", func(r *sourceStagedOperationRequest) { r.producer.selector.occurrence = root }},
					{"edge", func(r *sourceStagedOperationRequest) { r.edge = "" }},
				} {
					t.Run(change.name, func(t *testing.T) {
						bad := reading
						change.mutate(&bad)
						altered := next
						altered.callResults = []sourceStagedOperationRequest{bad}
						plain := altered
						plain.inputInvocation = nil
						invalidCallee := callee
						invalidCallee.nativeGet = &plain
						invalidCallee.delta = sourceStagedOperationDelta{required: nativeInputInvocationGetRequirements(&plain)}
						invalidInvocation := invocation
						invalidInvocation.nativeGet = &altered
						invalidInvocation.delta.required = nativeInputInvocationRequirements(&altered)
						if validNativeSourceDataRequirement(&altered, bad) || validOperationEnvelope(invalidCallee) || validNativeInputInvocationRecipe(invalidInvocation) {
							t.Fatal("mismatched DATA factory admitted")
						}
					})
				}
				absent := next
				absent.callResults = nil
				if validNativeSourceDataRequirement(&absent, reading) {
					t.Fatal("unregistered native DATA member admitted")
				}
			})
		}
		if len(work.operationIDs) != 0 || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("descriptive validation activated a Call")
		}
	})
}
