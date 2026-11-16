package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// planSourceRelativeInputs adapts authenticated source relationships to formal
// roles without evaluating actuals or installing a query frame. The issuing
// owner supplies actuals after ordinary invocation adaptation. Defaults remain
// with the synchronous binder until it supplies a descriptive disposition.
// A supported result certifies substitution only, never body activation.
func planSourceRelativeInputs(invocation sourceRelativeInvocation, owner *sourceValueOwner) sourceRelativeInputPlan {
	plan := sourceRelativeInputPlan{}
	declaration := invocation.declaration
	if invocation.inputKind != relativeInputInvocation || owner == nil || declaration == nil || !ast.IsFunctionLike(declaration) || invocation.operation == nil || !ast.IsCallExpression(invocation.operation) {
		plan.unsupported = relativeInputsInvalidOwner
		return plan
	}
	// Preserve independently known capture contributions even when another input
	// cannot migrate. No capture value, creator map or scope crosses this seam.
	for _, capture := range invocation.captures {
		if capture.target.kind != relativeRoleCapture || capture.target.declaration != declaration || capture.target.binding == nil {
			plan.unsupported = relativeInputsUnsupportedCapture
			return plan
		}
		if len(capture.sources) == 0 && len(capture.pending) == 0 && !capture.unknown {
			// A request naming a capture is not a delivered value. Undefined
			// has its own endpoint, so an empty request cannot prove no input.
			capture.unknown = true
			plan.unsupported = relativeInputsUnsupportedCapture
		}
		plan.bindings = append(plan.bindings, cloneSourceRelativeBinding(capture))
	}
	if !invocation.actualsKnown {
		plan.unsupported = relativeInputsUnsupportedActual
		return plan
	}
	if ast.IsArrowFunction(declaration) && (invocation.receiver.kind != relativeEndpointRole || invocation.receiver.role.kind != relativeRoleReceiver || !invocation.receiver.role.lexical) {
		plan.unsupported = relativeInputsUnsupportedReceiver
		return plan
	}
	receiver := sourceRelativeRole{kind: relativeRoleReceiver, declaration: declaration, lexical: ast.IsArrowFunction(declaration)}
	plan.bindings = append(plan.bindings, relativeBindingFromEndpoint(receiver, invocation.receiver))
	for _, actual := range invocation.actuals {
		if actual.spread {
			plan.unsupported = relativeInputsUnsupportedActual
			return plan
		}
	}
	position := 0
	for _, parameter := range declaration.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: position}
		position++
		if !ast.IsIdentifier(parameter.Name()) {
			plan.unsupported = relativeInputsUnsupportedActual
			return plan
		}
		if parameter.Initializer() != nil {
			plan.unsupported = relativeInputsUnsupportedDefault
			return plan
		}
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			// The consumer needs an ordered rest-container relation before it can
			// project one element. Flattening these sources would activate siblings.
			plan.unsupported = relativeInputsUnsupportedRest
			return plan
		}
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointUndefined, cut: invocation.cut}
		if role.slot < len(invocation.actuals) {
			actual := invocation.actuals[role.slot]
			if actual.spread {
				plan.unsupported = relativeInputsUnsupportedActual
				return plan
			}
			endpoint = actual.endpoint
		}
		plan.bindings = append(plan.bindings, relativeBindingFromEndpoint(role, endpoint))
	}
	return plan
}

// relativeBindingFromEndpoint keeps unresolved input distinct from an empty
// source set. Pending producers already belong to the central effect owner.
func relativeBindingFromEndpoint(role sourceRelativeRole, endpoint sourceRelativeEndpoint) sourceRelativeBinding {
	binding := sourceRelativeBinding{target: role}
	if endpoint.kind == relativeEndpointUnknown {
		binding.unknown = true
	} else {
		binding.sources = []sourceRelativeEndpoint{cloneSourceRelativeEndpoint(endpoint)}
	}
	return binding
}

// cloneSourceRelativeBinding gives each edge independently owned mutable slices.
// AST identities remain checker-generation owned and carry no issuing authority.
func cloneSourceRelativeBinding(binding sourceRelativeBinding) sourceRelativeBinding {
	binding.sources = cloneSourceRelativeEndpoints(binding.sources)
	binding.pending = cloneSourceRelativeEndpoints(binding.pending)
	return binding
}

func cloneSourceRelativeEndpoints(endpoints []sourceRelativeEndpoint) []sourceRelativeEndpoint {
	if endpoints == nil {
		return nil
	}
	cloned := make([]sourceRelativeEndpoint, len(endpoints))
	for index, endpoint := range endpoints {
		cloned[index] = cloneSourceRelativeEndpoint(endpoint)
	}
	return cloned
}

func cloneSourceRelativeEndpoint(endpoint sourceRelativeEndpoint) sourceRelativeEndpoint {
	endpoint.nativePrimitive = cloneNativePrimitiveResult(endpoint.nativePrimitive)
	endpoint.constructionCallable = cloneConstructionCallableValue(endpoint.constructionCallable)
	endpoint.moduleConstruction = cloneModuleConstructionValue(endpoint.moduleConstruction)
	if endpoint.descriptorView != nil {
		view := projectNativeDescriptorView(*endpoint.descriptorView, nil)
		endpoint.descriptorView = &view
	}
	if endpoint.frameworkView != nil {
		view := projectFrameworkStorageView(*endpoint.frameworkView, nil)
		endpoint.frameworkView = &view
	}
	if endpoint.projection != nil {
		endpoint.projection = append([]string{}, endpoint.projection...)
	}
	return endpoint
}
