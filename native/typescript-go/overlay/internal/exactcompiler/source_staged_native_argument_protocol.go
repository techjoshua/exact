package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeArgumentProtocol retains an original input association.
// The native eager producer owns its coercion Effects; this description supplies
// no selected Call, input value, no-user-entry law or current observation stamp.
type sourceStagedNativeArgumentProtocol struct {
	root       sourceStagedOperationRequest
	input      sourceStagedNativeInputPlan
	generation *projectGeneration
}

func cloneStagedNativeArgumentProtocol(source *sourceStagedNativeArgumentProtocol) *sourceStagedNativeArgumentProtocol {
	if source == nil {
		return nil
	}
	copy := *source
	copy.input.input = cloneSourceRelativeEndpoint(source.input.input)
	return &copy
}

func sameStagedNativeArgumentProtocol(a, b *sourceStagedNativeArgumentProtocol) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && sameOperationRequest(a.root, b.root) && a.input.kind == b.input.kind && sameOperationRequest(a.input.request, b.input.request) && sameOperationEndpoint(a.input.input, b.input.input)
}

// validStagedNativeArgumentProtocol checks transport after the issuing owner has
// authenticated the native source. Producer and reader keep distinct full cuts.
func validStagedNativeArgumentProtocol(source *sourceStagedMemberSource) bool {
	if source == nil || source.protocolSource == nil {
		return false
	}
	p := source.protocolSource
	a := p.nativeArgument
	if a == nil || a.generation == nil || a.generation != source.generation || p.selfRead || p.setEffects || p.get != nil || p.evaluation != nil || p.external != nil || !validStagedMemberParent(a.root) || a.root.producer.selector != (sourceStagedOperationSelector{}) || !ast.IsCallExpression(a.root.use) || a.root.producer.operation != a.root.use || a.root.consumer != source.candidate.region || a.input.kind != sourceNativeSymbolFor || !ast.IsTemplateExpression(source.candidate.operation) {
		return false
	}
	original := sourceStagedNativeGetSource{request: a.root, get: a.root.use.Expression(), kind: sourceNativeSymbolFor}
	return validStagedNativeInputPlan(a.input, &original) && a.input.input.expression == source.candidate.operation && sameOperationRequest(p.required, nativeRootDebtRequest(&original, "eager-inputs"))
}

// stagedNativeArgumentProtocolProducer accepts only an already issued complete
// eager description. Every nonprimitive interpolation keeps its original formal
// coercion; an empty or partial list cannot account for a template's protocols.
func stagedNativeArgumentProtocolProducer(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.kind != sourceNativeSymbolFor || source.input == nil || !source.inputEffects || !validNativeGetRecipe(recipe) || !validStagedNativeInputPlan(*source.input, source) || recipe.key != nativeRootDebtRequest(source, "eager-inputs").producer || !ast.IsTemplateExpression(source.input.input.expression) {
		return false
	}
	count := 0
	for _, span := range source.input.input.expression.AsTemplateExpression().TemplateSpans.Nodes {
		value := span.AsTemplateSpan().Expression
		if sourcePrimitiveValue(value) {
			continue
		}
		if !ast.IsIdentifier(value) {
			return false
		}
		found := false
		for i, demand := range source.coercions {
			if demand.expression != value {
				continue
			}
			if found || demand.role.kind != relativeRoleFormal || demand.role.declaration != source.request.consumer || !validOperationRelativeRole(demand.role, source.request.consumer) || i >= len(recipe.delta.effects) || !validStagedCoercionEffect(recipe, recipe.delta.effects[i]) {
				return false
			}
			found = true
		}
		if !found {
			return false
		}
		count++
	}
	return count == len(source.coercions)
}

// indexStagedNativeArgumentProtocol shares the existing semantic source index.
// It indexes a description, never discovers a producer from a template's parent.
// Actual native input publication calls it again after its eager refinement so
// previously described Get and Set consumers can attach the same source.
func (work *callableEffectWork) indexStagedNativeArgumentProtocol(recipe sourceStagedOperationRecipe) {
	if !stagedNativeArgumentProtocolProducer(recipe) {
		return
	}
	work.recordStagedMemberProtocolSource(recipe.nativeGet.input.input.expression, nativeRootDebtRequest(recipe.nativeGet, "eager-inputs"))
}

func (work *callableEffectWork) attachStagedNativeArgumentProtocol(source *sourceStagedMemberSource, required sourceStagedOperationRequest) (*sourceStagedNativeArgumentProtocol, bool) {
	producer, issued := work.operationRecipes[required.producer]
	if !issued || !stagedNativeArgumentProtocolProducer(producer) || !sameOperationRequest(required, nativeRootDebtRequest(producer.nativeGet, "eager-inputs")) || source.generation != work.operationGeneration || source.candidate.operation != producer.nativeGet.input.input.expression || source.candidate.region != producer.nativeGet.request.consumer {
		return nil, false
	}
	input := *producer.nativeGet.input
	input.input = cloneSourceRelativeEndpoint(input.input)
	return &sourceStagedNativeArgumentProtocol{root: producer.nativeGet.request, input: input, generation: source.generation}, true
}
