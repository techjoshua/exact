package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedNativeSelection is borrowed synchronously from the original native
// selection owner. Constructing this envelope does not authenticate selection.
// Only that owner supplies the already selected alternative, original descriptor
// Get and ordered source endpoints. No sourceValue or acquired state is retained
// by the resulting plan. Independent authored and unknown siblings stay owned by
// selection. DescriptorGet is the algorithm's original descriptor Get occurrence,
// not the callee Get and not a property name invented by this adapter.
type sourceStagedNativeSelection struct {
	argumentSource           *sourceStagedNativeArgumentDescription
	argumentOrder            *sourceStagedNativeArgumentOrder // Actual child Get order, never selection authority.
	selected                 sourceValue
	call, get, descriptorGet *ast.Node
	request                  sourceStagedOperationRequest
	actuals                  []sourceRelativeEndpoint
}

// sourceStagedNativeFieldPrefix transfers immutable source-owner payloads, not
// syntax guesses. The original Has/Get owner alone establishes these atoms at
// its cut, including getter/Proxy alternatives and returned value associations.
// A missing or empty prefix remains pending. In particular it does not establish
// absence, data-only coverage, unknown coverage or completed compiler work.
// Request is the exact already-issued field requirement, including its graph
// use/cut and consumer edge. Matching it checks transport correlation only. It
// cannot authenticate source selection, absence or empty coverage.
// Ownership of the immutable delta's slices transfers to the returned recipe.
// An invocation's nonzero receiver association must remain intact even while
// central refuses acknowledgement until its receiver-aware consumer is connected.
type sourceStagedNativeFieldPrefix struct {
	field         string
	request       sourceStagedOperationRequest
	delta         sourceStagedOperationDelta
	valueExposure []sourceStagedOperationAlternative
}

// sourceStagedNativeDescriptorField separates the independently owned Has/Get
// producer from its issuing dependency. Registration must precede extraction for
// all six fields. A recipe envelope alone supplies no source admission authority.
type sourceStagedNativeDescriptorField struct {
	request sourceStagedOperationRequest
	recipe  sourceStagedOperationRecipe
}

// sourceStagedNativeDescriptorPlan contains conditional relationships only.
// Fields retain their own eager invocation/effect/relative/residual contributions.
// Exposure is a different demand from Effects, even for the same field selector.
// No local prefix or map membership grants normal/NoWrites/output authority.
type sourceStagedNativeDescriptorPlan struct {
	exposure, eager sourceStagedOperationRecipe
	fields          [6]sourceStagedNativeDescriptorField
}

// describeSelectedNativeDescriptor assembles source-owner prefixes without
// reading descriptor syntax or entering acquisition. It cannot establish Has/Get
// disposition, execute getters, infer getter returns or settle absence. Nonzero
// selectors remain inadmissible until central implements the reviewed selected
// native/field authentication handoff. Returned readiness is always withheld.
func describeSelectedNativeDescriptor(selection sourceStagedNativeSelection, prefixes []sourceStagedNativeFieldPrefix) (sourceStagedNativeDescriptorPlan, bool) {
	var plan sourceStagedNativeDescriptorPlan
	request := selection.request
	if selection.selected.native == nil || len(selection.selected.path) != 0 || selection.call == nil || !ast.IsCallExpression(selection.call) || selection.get != selection.call.Expression() || selection.descriptorGet == nil || request.producer.declaration == nil || request.producer.operation != selection.call || request.producer.selector != (sourceStagedOperationSelector{}) || request.producer.kind != relativeDemandEffects || request.consumer != request.producer.declaration || request.use == nil || request.inputs != nil || request.cut.operation != selection.call || len(selection.actuals) != 3 {
		return plan, false
	}
	kind := selection.selected.native.kind
	if kind != sourceNativeObjectDefineProperty && kind != sourceNativeReflectDefineProperty {
		return plan, false
	}
	plan.eager.key = request.producer
	plan.eager.key.selector = sourceStagedOperationSelector{occurrence: selection.get, field: "algorithm"}
	plan.exposure.key = request.producer
	plan.exposure.key.kind = relativeDemandDirectExposure
	plan.exposure.key.selector = sourceStagedOperationSelector{occurrence: selection.descriptorGet, field: "value"}
	for index, field := range reflectiveDescriptorKeys {
		required := request
		required.producer.selector = sourceStagedOperationSelector{occurrence: selection.descriptorGet, field: field}
		plan.fields[index] = sourceStagedNativeDescriptorField{request: required, recipe: sourceStagedOperationRecipe{key: required.producer}}
		plan.eager.delta.required = append(plan.eager.delta.required, required)
	}
	// Prefixes are already owned by the original field producer. Do not infer
	// contributions from literal spelling or flatten getter receivers into bare
	// summary edges. Empty prefixes stay represented by required membership.
	var seen [6]bool
	for _, prefix := range prefixes {
		index := stagedDescriptorFieldIndex(prefix.field)
		if index < 0 || seen[index] || !sameOperationRequest(prefix.request, plan.fields[index].request) || prefix.field != "value" && len(prefix.valueExposure) != 0 {
			return sourceStagedNativeDescriptorPlan{}, false
		}
		seen[index] = true
		delta := prefix.delta
		delta.extracted = false
		plan.fields[index].recipe.delta = delta
		if prefix.field == "value" {
			plan.exposure.delta.exposures = prefix.valueExposure
		}
	}
	// Stored callable exposure is a distinct value-role demand. It is not the
	// native Call's result. No eager field getter return is inferred here.
	request.producer = plan.eager.key
	request.edge += ":algorithm"
	plan.exposure.delta.required = append(plan.exposure.delta.required, request)
	return plan, true
}

func stagedDescriptorFieldIndex(field string) int {
	for index, candidate := range reflectiveDescriptorKeys {
		if field == candidate {
			return index
		}
	}
	return -1
}

// consumeStagedNativeDescriptorAlgorithm routes a synchronously supplied selected
// alternative into the central member owner's scoped admission callback. It does
// not recognize a callee, acquire a query lease or restore an observation cut.
// Admission must be consumed here, never retained in a recipe, fact or queue.
// Successful admission is not field disposition or transfer ACK, and cannot pay
// the independent callee-get or eager-inputs debts. Central owns authentication,
// atomic six-field registration and revocation immediately after this returns.
func consumeStagedNativeDescriptorAlgorithm(selection sourceStagedNativeSelection, admit func(sourceStagedNativeDescriptorPlan) bool) {
	if admit == nil {
		return
	}
	plan, supported := describeSelectedNativeDescriptor(selection, nil)
	if supported {
		admit(plan)
	}
}

// beginStagedNativeDescriptorAlgorithm retains the narrow independent selection
// seam. It is not the actual live member-owner route: that owner temporarily
// changes initializing/protectedMember and calls the pure consumer directly.
// The strict beginStagedNativeSelection guards remain unchanged. Neither its
// callback nor a selected sourceValue may survive this stack-scoped lease.
func beginStagedNativeDescriptorAlgorithm(query *sourceValueQuery, request sourceStagedNativeRequest, publish func(sourceStagedNativeSelection, sourceStagedOperationRequest, sourceStagedNativeDescriptorPlan)) (func(), bool) {
	if publish == nil {
		return func() {}, false
	}
	return query.beginStagedNativeSelection(request, func(selection sourceStagedNativeSelection) {
		consumeStagedNativeDescriptorAlgorithm(selection, func(plan sourceStagedNativeDescriptorPlan) bool {
			algorithm := selection.request
			algorithm.producer = plan.eager.key
			algorithm.edge += ":algorithm"
			publish(selection, algorithm, plan)
			return false // This independent seam performs no central source admission.
		})
	})
}

// beginStagedNativeDescriptorSource installs the descriptor consumer directly on
// the original member owner. That owner registers its three independent debts
// before delivering a selected alternative and a scoped admission callback.
// This route deliberately does not enter the stricter independent selection
// lease or restore the member owner's temporary cuts. Registration of an empty
// field envelope grants neither field disposition nor closure of the root debts.
func beginStagedNativeDescriptorSource(query *sourceValueQuery, work *callableEffectWork, facts []callableFacts, request sourceStagedNativeRequest) (func(), bool) {
	return query.beginStagedNativeGetSource(work, facts, request, consumeStagedNativeDescriptorAlgorithm)
}
