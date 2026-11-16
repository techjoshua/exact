package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The real native owner supplies an algorithm alternative distinct from the
// older noncallable exposure probe. The prototype input remains a relative role,
// not an invoked formal or a successful returned-object identity.
func TestStagedNativeCreateOriginalSource(t *testing.T) {
	for _, source := range []string{`export function invoke(prototype:object){return Object.create(prototype)}`, `export function invoke(prototype:object){return Object.freeze({prototype})}`} {
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
			facts := installationSourceFacts(query)
			declaration := enclosingCallableNode(call)
			request := sourceStagedNativeRequest{algorithmKind: stagedNativeInputIntent(call.Expression()), call: call, get: call.Expression(), request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "create-source", cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
			work := callableEffectWork{extracting: -1}
			deliveries := 0
			revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(selection sourceStagedNativeSelection, _ func(sourceStagedNativeDescriptorPlan) bool) {
				deliveries++
				if selection.selected.native == nil || !stagedNativeAlgorithmKind(selection.selected.native.kind) || directExposureNative(selection.selected.native.kind) {
					t.Fatal("source algorithm borrowed exposure-only evidence")
				}
			})
			if !installed {
				t.Fatal("source producer refused")
			}
			defer revoke()
			query.receiverCandidates(call, nil)
			if deliveries == 0 {
				t.Fatal("no genuine create algorithm delivered")
			}
			revoke()
			// Algorithm acquisition must not escape into ordinary queries or
			// replace the older direct-exposure consumer's separate category.
			if len(restrictedInvocationArguments(call.AsCallExpression())) == 1 && !ast.IsObjectLiteralExpression(restrictedInvocationArguments(call.AsCallExpression())[0]) {
				ordinary := newSourceDependencyQuery(call, query.owner.checker, query.executable, declaration)
				values := ordinary.receiverCandidates(call, nil)
				for _, value := range values.values {
					if value.native != nil && value.native.kind == sourceNativeObjectCreate {
						t.Fatal("scoped create algorithm leaked into ordinary acquisition")
					}
				}
				probe := newSourceDependencyQuery(call, query.owner.checker, query.executable, declaration)
				probe.probingDirectExposure = true
				exposure := probe.receiverCandidates(call, nil)
				seen := false
				for _, value := range exposure.values {
					if value.native != nil {
						if value.native.kind == sourceNativeObjectCreate {
							t.Fatal("create algorithm replaced exposure-only owner")
						}
						seen = seen || value.native.kind == sourceNativeObjectCreateExposure
					}
				}
				if !seen {
					t.Fatal("existing direct exposure alternative disappeared")
				}
			}
			work.prepareOperationUses(facts, query.executable)
			root := work.operationRecipes[request.request.producer].nativeGet
			algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer]
			if root.kind == sourceNativeObjectCreate && (algorithm.nativeGet == nil || algorithm.nativeGet.prototype == nil || algorithm.nativeGet.prototype.formal != (sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}) || algorithm.nativeGet.prototype.input.expression != restrictedInvocationArguments(call.AsCallExpression())[0]) {
				t.Fatal("declaration-relative prototype input was not consumed by the selected algorithm owner")
			}
			id := work.operationIDs[root.request.producer]
			if id.index == 0 || !work.closedOperationDependencies()[id.index] {
				t.Fatal("independent create Effects did not settle")
			}
			for _, state := range work.operations {
				if len(state.delta.exposures)+len(state.delta.invoked)+len(state.delta.relative) != 0 {
					t.Fatal("create Effects invented result, prototype Get or invocation authority")
				}
			}
			// A cloned graph must reacquire the original Get receipt in its own lifetime.
			var cloned []callableFacts
			for _, fact := range facts {
				cloned = append(cloned, cloneProjectCallableFact(fact))
			}
			next := callableEffectWork{extracting: -1}
			next.prepareOperationUses(cloned, query.executable)
			cloneID := next.operationIDs[root.request.producer]
			if cloneID.index == 0 || !next.closedOperationDependencies()[cloneID.index] {
				for _, state := range next.operations {
					t.Logf("role=%s revision=%d extracted=%t dependencies=%t invalid=%t callee=%+v requested=%t", state.key.selector.field, state.revision, state.delta.extracted, state.dependenciesRegistered, state.invalid, state.nativeCallee, state.calleeSourceRequested)
				}
				t.Fatal("cached native input algorithm disposition was not republished in fresh graph")
			}
			callee := nativeRootDebtRequest(root, "callee-get").producer
			oldReceipt := work.operations[work.operationIDs[callee].index].nativeCallee
			freshReceipt := next.operations[next.operationIDs[callee].index].nativeCallee
			if freshReceipt == nil || freshReceipt == oldReceipt {
				t.Fatal("clone reused original Get receipt")
			}
			next.operationGeneration = &projectGeneration{}
			if next.closedOperationDependencies()[cloneID.index] {
				t.Fatal("expired generation retained native input closure")
			}

		})
	}
}
