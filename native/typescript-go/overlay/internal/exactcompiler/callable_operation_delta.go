package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedOperationCursor is graph-local delivery progress across independent
// atom channels. A disposition revision can advance with all offsets unchanged.
// Offsets never become acquisition, result or publication authority.
type sourceStagedOperationCursor struct {
	exposures, invoked, relative, effects, required, residuals, readWrites int
}

func operationDeltaCursor(delta sourceStagedOperationDelta) sourceStagedOperationCursor {
	return sourceStagedOperationCursor{len(delta.exposures), len(delta.invoked), len(delta.relative), len(delta.effects), len(delta.required), len(delta.residuals), len(delta.readWrites)}
}

func operationDeltaSize(delta sourceStagedOperationDelta) int {
	c := operationDeltaCursor(delta)
	return c.exposures + c.invoked + c.relative + c.effects + c.required + c.residuals + c.readWrites
}

func sameOperationRequest(a, b sourceStagedOperationRequest) bool {
	return a.producer == b.producer && a.consumer == b.consumer && a.edge == b.edge && a.use == b.use && a.cut == b.cut && a.inputs == b.inputs && a.reading == b.reading
}

func sameOperationAlternative(a, b sourceStagedOperationAlternative) bool {
	return a.creating == b.creating && sameOperationEndpoint(a.endpoint, b.endpoint)
}

func sameOperationInvocation(a, b sourceStagedOperationInvocation) bool {
	return a.declaration == b.declaration && a.operation == b.operation && a.inputs == b.inputs && sameOperationAlternative(a.alternative, b.alternative)
}

func sameOperationEffect(a, b EnvironmentEffectSource) bool {
	return a.Environment == b.Environment && a.Description == b.Description && slices.Equal(a.Path, b.Path) && a.Opaque == b.Opaque && a.provenanceIncomplete == b.provenanceIncomplete && a.relativeInput == b.relativeInput && sameRelativeFieldMutation(a.relativeMutation, b.relativeMutation) && sameRelativeCoercion(a.relativeCoercion, b.relativeCoercion) && a.callOrigin == b.callOrigin && a.callForwarded == b.callForwarded && a.fieldOrigin == b.fieldOrigin && a.fieldForwarded == b.fieldForwarded && a.componentReactiveField == b.componentReactiveField && a.descriptorOrigin == b.descriptorOrigin && a.descriptorForwarded == b.descriptorForwarded && a.orderedSetupDescriptor == b.orderedSetupDescriptor
}

func operationPrefix[T any](prefix, all []T, equal func(T, T) bool) bool {
	if len(prefix) > len(all) {
		return false
	}
	for i := range prefix {
		if !equal(prefix[i], all[i]) {
			return false
		}
	}
	return true
}

// operationDeltaPrefix authenticates ordered prefix growth, including private
// causal identities. Same environment bits do not imply the same requirement.
func operationDeltaPrefix(a, b sourceStagedOperationDelta) bool {
	return operationPrefix(a.readWrites, b.readWrites, sameQualifiedReadWrite) && operationPrefix(a.exposures, b.exposures, sameOperationAlternative) && operationPrefix(a.invoked, b.invoked, sameOperationInvocation) && operationPrefix(a.relative, b.relative, func(a, b sourceRelativeInvokedInput) bool { return a == b }) && operationPrefix(a.effects, b.effects, sameOperationEffect) && operationPrefix(a.required, b.required, sameOperationRequest) && operationPrefix(a.residuals, b.residuals, sameOperationResidual)
}

// cloneOperationDelta owns all mutable slices. Bound C edges and AST endpoints
// are already sealed generation-relative descriptions and remain shared.
func cloneOperationDelta(delta sourceStagedOperationDelta) sourceStagedOperationDelta {
	delta.readWrites = cloneQualifiedReadWrites(delta.readWrites)
	delta.exposures = append([]sourceStagedOperationAlternative(nil), delta.exposures...)
	for i := range delta.exposures {
		delta.exposures[i].endpoint = cloneSourceRelativeEndpoint(delta.exposures[i].endpoint)
	}
	delta.invoked = append([]sourceStagedOperationInvocation(nil), delta.invoked...)
	for i := range delta.invoked {
		delta.invoked[i].alternative.endpoint = cloneSourceRelativeEndpoint(delta.invoked[i].alternative.endpoint)
	}
	delta.relative = append([]sourceRelativeInvokedInput(nil), delta.relative...)
	delta.effects = append([]EnvironmentEffectSource(nil), delta.effects...)
	for i := range delta.effects {
		delta.effects[i].Path = append([]string(nil), delta.effects[i].Path...)
		delta.effects[i].relativeMutation = cloneRelativeFieldMutation(delta.effects[i].relativeMutation)
	}
	delta.required = append([]sourceStagedOperationRequest(nil), delta.required...)
	delta.residuals = append([]sourceStagedOperationResidual(nil), delta.residuals...)
	for i := range delta.residuals {
		delta.residuals[i].mutation = cloneRelativeFieldMutation(delta.residuals[i].mutation)
	}
	return delta
}

func operationDeltaTail(delta sourceStagedOperationDelta, c sourceStagedOperationCursor) sourceStagedOperationDelta {
	delta.exposures = delta.exposures[c.exposures:]
	delta.invoked = delta.invoked[c.invoked:]
	delta.relative = delta.relative[c.relative:]
	delta.effects = delta.effects[c.effects:]
	delta.required = delta.required[c.required:]
	delta.residuals = delta.residuals[c.residuals:]
	delta.readWrites = delta.readWrites[c.readWrites:]
	return delta
}

// validOperationEnvelope validates only already registered source atoms. It
// neither selects a callee nor brands a native alternative. Strong origins may
// not be smuggled through the plain environment-effects channel. Current eager
// subrequirements must issue to the producer's own declaration, at exact cuts.
func validOperationEnvelope(recipe sourceStagedOperationRecipe) bool {
	key := recipe.key
	if len(recipe.delta.readWrites) != 0 && recipe.assignment == nil {
		return false
	}
	if len(recipe.fieldMutationLinks) != 0 && recipe.mutationData == nil {
		return false
	}
	if recipe.mutationData != nil {
		return validFieldMutationDataRecipe(recipe)
	}
	if recipe.installedMutationRHS != nil {
		return validInstalledMutationRHSRecipe(recipe)
	}
	if recipe.installedCall != nil {
		return validInstalledCallPhase(recipe)
	}
	if recipe.installedMember != nil {
		return validInstalledMemberRecipe(recipe)
	}
	if recipe.descriptorTarget != nil {
		return validDescriptorTargetRecipe(recipe)
	}
	if recipe.descriptorSource != nil {
		return validDescriptorSourceRecipe(recipe)
	}
	if recipe.frameworkEffects != nil {
		return validStagedFrameworkEffectsRecipe(recipe)
	}
	if recipe.moduleArgument != nil {
		return validStagedModuleArgumentRecipe(recipe)
	}
	if recipe.nativeGet != nil && recipe.nativeGet.inputInvocation != nil {
		return validNativeInputInvocationRecipe(recipe)
	}
	if recipe.declarationCall != nil {
		return validStagedDeclarationCallEffectsRecipe(recipe)
	}
	if recipe.entryLaw != nil {
		return validStagedEntryLawRecipe(recipe)
	}
	if recipe.constructionEffects != nil {
		return validStagedConstructionEffectsRecipe(recipe)
	}
	if recipe.assignment != nil {
		return validStagedAssignmentRecipe(recipe)
	}
	if recipe.hasInstance != nil {
		return validStagedHasInstanceRecipe(recipe)
	}
	if recipe.callResult != nil {
		return validStagedCallResultRecipe(recipe)
	}
	if recipe.memberSource != nil {
		return validStagedMemberRecipe(recipe)
	}
	if recipe.mapEntry != nil {
		return validStagedMapEntryRecipe(recipe)
	}
	if recipe.writer != nil {
		return validStagedWriterRecipe(recipe)
	}
	for index, required := range recipe.writerRequired {
		if !validWriterRHSRequirement(key, required) {
			return false
		}
		for _, previous := range recipe.writerRequired[:index] {
			if sameOperationRequest(previous, required) {
				return false
			}
		}
		found := false
		for _, dependency := range recipe.delta.required {
			found = found || sameOperationRequest(required, dependency)
		}
		if !found {
			return false
		}
	}
	if recipe.constructed != nil {
		return validConstructedMemberRecipe(recipe)
	}
	if len(recipe.fieldForwards) != 0 && (recipe.nativeGet == nil || key.kind != relativeDemandDirectExposure) {
		return false
	}
	if recipe.nativeGet != nil && !validNativeGetRecipe(recipe) {
		return false
	}
	if key.declaration == nil || key.operation == nil {
		return false
	}
	if operationDeltaSize(recipe.delta) == 0 && !validNativeGetRecipe(recipe) {
		return false
	}
	for _, invoked := range recipe.delta.invoked {
		if invoked.declaration == nil || !ast.IsFunctionLike(invoked.declaration) || invoked.operation == nil || !sourceStagedOccurrenceOwned(invoked.operation, key.declaration) {
			return false
		}
	}
	for _, effect := range recipe.delta.effects {
		if effect.relativeCoercion != nil && !validStagedCoercionEffect(recipe, effect) {
			return false
		}
		if !validOperationEnvironmentEffect(effect) {
			return false
		}
	}
	for _, demand := range recipe.delta.relative {
		if demand.kind != relativeDemandEffects || demand.origin == nil || !ast.IsCallExpression(demand.origin) || enclosingCallableNode(demand.origin) != key.declaration || demand.cut.operation != demand.origin || demand.cut.reading != demand.origin || !validOperationRelativeRole(demand.role, key.declaration) {
			return false
		}
	}
	for _, residual := range recipe.delta.residuals {
		if residual.operation == nil || !sourceStagedOccurrenceOwned(residual.operation, key.declaration) || residual.role.kind != relativeRoleUnknown && !validOperationRelativeRole(residual.role, key.declaration) {
			return false
		}
	}
	for _, required := range recipe.delta.required {
		allowed := required.producer.kind == relativeDemandEffects
		// The selected descriptor algorithm owns these exact operand DATA
		// memberships; ordinary ownership and input-edge guards still apply.
		allowed = allowed || validDescriptorAlgorithmInputRequirement(recipe, required)
		consumerOwned := required.consumer == key.declaration
		if validNativeInputBindingPhase(recipe) {
			allowed = allowed || sameOperationRequest(required, recipe.nativeGet.input.bindingData)
			// The initializer keeps its own source owner and physical Call cut.
			// Only the exact second child validated by this typed phase may
			// cross that owner boundary; DATA remains on the original reader.
			if len(recipe.delta.required) == 2 && sameOperationRequest(required, recipe.delta.required[1]) {
				consumerOwned = true
			}
		}
		if recipe.constructionEffects != nil {
			// Original module predecessors retain their own declaration and
			// cut. The live construction receipt validates the exact snapshot.
			consumerOwned = consumerOwned || validStagedConstructionRequired(required)
		}
		if recipe.nativeGet != nil && recipe.key == nativeRootDebtRequest(recipe.nativeGet, "callee-get").producer {
			allowed = allowed || validNativeSourceDataRequirement(recipe.nativeGet, required)
			for _, source := range recipe.nativeGet.selectionRequired {
				if sameOperationRequest(source, required) {
					// Same-owner used premises retain ordinary ownership. Only
					// cross-owner module entry tickets need the module exception.
					consumerOwned = consumerOwned || validStagedModuleEntryRequirement(required)
				}
			}
		}
		for _, writer := range recipe.writerRequired {
			allowed = allowed || sameOperationRequest(writer, required) && validWriterRHSRequirement(key, writer)
		}
		if required.producer.kind == relativeDemandDirectExposure && recipe.nativeGet != nil && key.kind == relativeDemandDirectExposure {
			parent, sourceRole := fieldSourceParent(required)
			expected := recipe.nativeGet.request
			expected.producer = key
			allowed = sourceRole && sameOperationRequest(parent, expected)
			for _, forward := range recipe.fieldForwards {
				allowed = allowed || validStagedFieldForward(recipe, forward) && sameOperationRequest(required, forward.request)
			}
		}
		if required.producer.kind == relativeDemandDirectExposure && recipe.nativeGet != nil {
			parent := recipe.nativeGet.request
			parent.producer = key
			if key == nativeRootDebtRequest(recipe.nativeGet, "eager-inputs").producer {
				parent = nativeRootDebtRequest(recipe.nativeGet, "eager-inputs")
			}
			allowed = allowed || validStagedDescriptorReceiverRequirement(recipe.nativeGet, parent, required)
		}
		allowed = allowed || validFieldMutationRequirement(recipe, required)
		if !allowed || !consumerOwned || required.inputs != nil {
			return false
		}
	}
	return true
}

// validOperationEnvironmentEffect keeps direct donors separate from unresolved
// binding/field/call protocols, which require their own typed consumers.
func validOperationEnvironmentEffect(effect EnvironmentEffectSource) bool {
	return effect.Environment != "" && effect.Description != "" && effect.relativeInput == nil && effect.relativeMutation == nil && effect.callOrigin == nil && effect.fieldOrigin == nil && effect.descriptorOrigin == nil && !effect.callForwarded && !effect.fieldForwarded && !effect.componentReactiveField && !effect.descriptorForwarded
}

func validOperationRelativeRole(role sourceRelativeRole, declaration *ast.Node) bool {
	if declaration == nil || !ast.IsFunctionLike(declaration) || role.kind != relativeRoleFormal || role.declaration != declaration || role.slot < 0 || role.binding != nil || role.lexical {
		return false
	}
	slot := 0
	for _, parameter := range declaration.Parameters() {
		if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		if slot == role.slot {
			return true
		}
		slot++
	}
	return false
}
