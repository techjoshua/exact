package exactcompiler

// substituteSourceRelativeInvokedInput selects the substitution for an actual
// invoked-role obligation. Possessing an argument or default result does not
// issue this demand. The caller validates the envelope and owns all effect work,
// producer registration and publication. This helper schedules and executes none.
// Projections and binding slices returned here are independently owned.
func substituteSourceRelativeInvokedInput(bound sourceRelativeBoundInputs, role sourceRelativeRole, projection []string) sourceRelativeInputPlan {
	plan := sourceRelativeInputPlan{unsupported: bound.unsupported}
	if bound.declaration == nil || role.declaration != bound.declaration || role.kind == relativeRoleUnknown {
		plan.unsupported = relativeInputsInvalidOwner
		return plan
	}
	for _, rest := range bound.rest {
		if rest.formal == role {
			return substituteSourceRelativeRestInput(rest, projection, plan.unsupported)
		}
	}
	return substituteSourceRelativeRoleBindings(bound, role, projection)
}

// substituteSourceRelativeRoleBindings only composes source bindings. It does
// not invoke an input or classify runtime unknown. The invocation caller owns
// its existing rest-container policy; other consumers retain their own gaps.
func substituteSourceRelativeRoleBindings(bound sourceRelativeBoundInputs, role sourceRelativeRole, projection []string) sourceRelativeInputPlan {
	plan := sourceRelativeInputPlan{unsupported: bound.unsupported}
	if bound.declaration == nil || role.declaration != bound.declaration || role.kind == relativeRoleUnknown {
		plan.unsupported = relativeInputsInvalidOwner
		return plan
	}
	for _, binding := range bound.bindings {
		if binding.target == role {
			binding = cloneSourceRelativeBinding(binding)
			if len(binding.sources) == 0 && len(binding.pending) == 0 && !binding.unknown {
				binding.unknown = true
				plan.unsupported = relativeRoleInputGap(role)
			}
			projectRelativeBinding(&binding, projection)
			plan.bindings = append(plan.bindings, binding)
		}
	}
	if len(plan.bindings) == 0 {
		// Missing delivery is an explicit transfer gap. Only the central owner can
		// associate it with a registered pending producer and subscriber.
		plan.bindings = []sourceRelativeBinding{{target: role, unknown: true}}
		plan.unsupported = relativeRoleInputGap(role)
	}
	return plan
}

func substituteSourceRelativeRestInput(rest sourceRelativeRestInput, projection []string, gap sourceRelativeInputGap) sourceRelativeInputPlan {
	plan := sourceRelativeInputPlan{unsupported: gap}
	binding := sourceRelativeBinding{target: rest.formal}
	if len(projection) == 0 {
		// Invoking the rest container does not invoke its stored callbacks.
		plan.unsupported = relativeInputsUnsupportedRest
		plan.bindings = []sourceRelativeBinding{{target: rest.formal, unknown: true}}
		return plan
	}
	index, finite := sourceArrayIndex(projection[0])
	if !finite {
		plan.unsupported = relativeInputsUnsupportedRest
		plan.bindings = []sourceRelativeBinding{{target: rest.formal, unknown: true}}
		return plan
	}
	boundary := 0
	uncertain := false
	for _, slot := range rest.slots {
		if slot.unknownPosition {
			boundary = slot.position
			uncertain = true
			break
		}
		if slot.position >= boundary {
			boundary = slot.position + 1
		}
	}
	matched := false
	for _, slot := range rest.slots {
		selected := !slot.unknownPosition && slot.position >= 0 && uint64(slot.position) == index
		selected = selected || slot.unknownPosition && boundary >= 0 && index >= uint64(boundary)
		if !selected {
			continue
		}
		matched = true
		donor := cloneSourceRelativeBinding(slot.binding)
		binding.sources = append(binding.sources, donor.sources...)
		binding.pending = append(binding.pending, donor.pending...)
		binding.unknown = binding.unknown || donor.unknown
	}
	// An unknown tail affects only positions beyond the exact prefix. Retain
	// represented later donors in source order, without inventing exact indices.
	binding.unknown = binding.unknown || (rest.unknownTail || uncertain) && boundary >= 0 && index >= uint64(boundary)
	if !matched && !binding.unknown {
		binding.sources = []sourceRelativeEndpoint{{kind: relativeEndpointUndefined, cut: rest.cut}}
	}
	projectRelativeBinding(&binding, projection[1:])
	plan.bindings = []sourceRelativeBinding{binding}
	return plan
}

func projectRelativeBinding(binding *sourceRelativeBinding, projection []string) {
	for index := range binding.sources {
		binding.sources[index].projection = append(binding.sources[index].projection, projection...)
	}
	for index := range binding.pending {
		binding.pending[index].projection = append(binding.pending[index].projection, projection...)
	}
}

func relativeRoleInputGap(role sourceRelativeRole) sourceRelativeInputGap {
	switch role.kind {
	case relativeRoleCapture:
		return relativeInputsUnsupportedCapture
	case relativeRoleReceiver:
		return relativeInputsUnsupportedReceiver
	default:
		return relativeInputsUnsupportedActual
	}
}
