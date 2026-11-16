package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Selection and complete accounting originate in the existing original Get
// owner. Supplied negative events isolate refusal without manufacturing a seed.
func TestStagedNativeTargetEffectsOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		want         bool
	}{
		{"genuine", `export function invoke(){return Object.defineProperty(Object.prototype,'value',{value:1})}`, true},
		{"ordinary target", `const other={prototype:{}};export function invoke(){return Object.defineProperty(other.prototype,'value',{value:1})}`, false},
		{"shadow root", `const Object={prototype:{}};export function invoke(){return Reflect.defineProperty(Object.prototype,'value',{value:1})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(parent *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(parent)
				work := callableEffectWork{extracting: -1}
				registerInstallationSource(t, &work, facts, parent, call)
				algorithm := installationSourceRequest(call).request.producer
				algorithm.selector = sourceStagedOperationSelector{occurrence: call.Expression(), field: "algorithm"}
				source := work.operationRecipes[algorithm].nativeGet
				if source == nil || source.standard.root == nil || source.standard.prototype == nil {
					t.Fatal("actual algorithm owner did not supply standard premise")
				}
				target := restrictedInvocationArguments(call.AsCallExpression())[0]
				query := newSourceDependencyQuery(target, parent.owner.checker, parent.executable, enclosingCallableNode(call))
				defer query.publishDependencyStatistics()
				query.probingStagedTarget = true
				result := query.accessors(target, nil, "", accessorAcquire, nil, nil)
				selected := sourceValue{}
				for _, value := range result.values {
					if value.native != nil && value.native.kind == sourceNativeObjectPrototype {
						selected = value
						break
					}
				}
				cut := query.relativeInputCut(target)
				proof, admitted := describeStagedNativeTargetEffects(source, selected, &result, cut, query.owner.generation)
				if admitted != row.want {
					t.Fatalf("target description=%t want=%t valid=%t node=%t acquired=%t refs=%t cut=%#v result opaque/value/receiver/field/own=%t/%t/%t/%t/%t values=%d protocols then/nativeDesc/write/owned/get/claims=%d/%d/%d/%d/%d/%d", admitted, row.want, validStagedNativeTargetEffects(sourceStagedNativeTargetEffects{request: nativeEagerTargetRequest(source), cut: cut, target: target, generation: query.owner.generation}, source), selected.node == source.standard.prototype, selected.native != nil && selected.native.acquired == target.Expression(), selected.native != nil && selected.native.referencesIncomplete, cut, result.opaque, result.valueIncomplete, result.receiverIncomplete, result.fieldReceiverIncomplete, result.ownOperation, len(result.values), len(result.thenReferences), len(result.nativeDescriptorEffects), len(result.writeOutcomes), len(result.owned), len(result.ownedGets), len(result.ownedClaims))
				}
				if !admitted {
					return
				}
				for _, component := range result.nativeDescriptorEffects {
					if component.verdict != sourceWriteTop {
						t.Fatal("source-only descriptor premise promoted to NoWrites")
					}
				}
				for _, mode := range []string{"other-kind", "other-root"} {
					wrong := result
					wrong.nativeDescriptorEffects = append([]sourceNativeDescriptorEffect(nil), result.nativeDescriptorEffects...)
					component := sourceNativeDescriptorEffect{kind: sourceStandardObjectEntry, acquired: target.Expression(), verdict: sourceWriteNoWrites}
					if mode == "other-kind" {
						component.kind = sourceStandardObjectFreeze
					} else {
						component.acquired = call
					}
					wrong.nativeDescriptorEffects = append(wrong.nativeDescriptorEffects, component)
					if _, accepted := describeStagedNativeTargetEffects(source, selected, &wrong, cut, query.owner.generation); accepted {
						t.Fatal("unrelated descriptor component discharged target Effects")
					}
				}
				expected := source.request
				expected.producer.selector = sourceStagedOperationSelector{occurrence: target, field: "eager-target"}
				expected.edge += ":eager-target"
				if !validStagedNativeTargetEffects(proof, source) || !sameOperationRequest(proof.request, expected) || proof.target != target || proof.cut != (sourceRelativeCut{operation: target, reading: target}) || proof.generation != query.owner.generation {
					t.Fatal("original graph request/live target cut/generation lost")
				}
				for _, mode := range []string{"opaque", "value", "receiver", "field-receiver", "own-operation", "effect", "unknown-sibling", "path", "incomplete-reference"} {
					wrong := result
					wrong.values = append([]sourceValue(nil), result.values...)
					switch mode {
					case "opaque":
						wrong.opaque = true
					case "value":
						wrong.valueIncomplete = true
					case "receiver":
						wrong.receiverIncomplete = true
					case "field-receiver":
						wrong.fieldReceiverIncomplete = true
					case "own-operation":
						wrong.ownOperation = true
					case "effect":
						wrong.environmentEffects = []EnvironmentEffectSource{{Environment: "unknown"}}
					case "unknown-sibling":
						wrong.values = append(wrong.values, sourceValue{})
					case "path":
						wrong.values[0].path = []string{"value"}
					case "incomplete-reference":
						copy := *wrong.values[0].native
						copy.referencesIncomplete = true
						wrong.values[0].native = &copy
					}
					if _, accepted := describeStagedNativeTargetEffects(source, selected, &wrong, cut, query.owner.generation); accepted {
						t.Fatalf("unaccounted %s target accepted", mode)
					}
				}
				for _, mode := range []string{"cut", "target", "request", "generation", "missing-standard"} {
					wrong := proof
					other := *source
					switch mode {
					case "cut":
						wrong.cut.initializing = target
					case "target":
						wrong.target = call.Expression()
					case "request":
						wrong.request.cut = proof.cut
					case "generation":
						wrong.generation = nil
					case "missing-standard":
						other.standard = sourceDemandStandardPremises{}
					}
					if validStagedNativeTargetEffects(wrong, &other) {
						t.Fatalf("mismatched %s proof accepted", mode)
					}
				}
				acquired := selected
				native := *selected.native
				native.acquired = call.Expression()
				acquired.native = &native
				if _, accepted := describeStagedNativeTargetEffects(source, acquired, &result, cut, query.owner.generation); accepted {
					t.Fatal("another acquired root inherited target accounting")
				}
				// Prototype provenance grants no trusted lookup on authored object fields.
				get := &sourceGetInputs{receiver: selected, propertyKey: "value"}
				if standardNativeLookup(get) {
					t.Fatal("prototype seed granted arbitrary standard member lookup")
				}
			})
		})
	}
}
