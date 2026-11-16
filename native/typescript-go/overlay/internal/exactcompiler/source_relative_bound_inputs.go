package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// describeSourceRelativeBoundInputs is consumed synchronously at the original
// binder cut. It copies descriptive relationships only, never the input frame,
// creator/binding maps, acquired scopes or execution receipts. A residual cannot
// manufacture a pending producer. The central effect owner registers those.
func describeSourceRelativeBoundInputs(query *sourceValueQuery, inputs *sourceValueInputs, request sourceRelativeInvocation) sourceRelativeBoundInputs {
	out := sourceRelativeBoundInputs{inputKind: request.inputKind, declaration: request.declaration, operation: request.operation, use: request.use, cut: request.cut}
	if query == nil || query.owner == nil || query.owner.checker == nil || inputs == nil || inputs.declaration != request.declaration || inputs.invocation != request.operation || request.inputKind != relativeInputInvocation || request.declaration == nil {
		out.unsupported = relativeInputsInvalidOwner
		return out
	}
	return describeSourceRelativeInstalledBindings(query, inputs, request)
}

// describeSourceRelativeGetBoundInputs is a separate zero-actual SOURCE Get
// entry. The ordinary Call guard above stays exact; no invocation is forged.
func describeSourceRelativeGetBoundInputs(query *sourceValueQuery, inputs *sourceValueInputs, request sourceRelativeInvocation, get *sourceGetInputs) sourceRelativeBoundInputs {
	out := sourceRelativeBoundInputs{inputKind: request.inputKind, declaration: request.declaration, operation: request.operation, use: request.use, cut: request.cut}
	if query == nil || query.owner == nil || inputs == nil || get == nil || (!query.liveImplicitSourceInputs(request.declaration, request.operation, &request) && !query.liveInstalledGetterMutationInputs(request, inputs)) || request.inputKind != relativeInputSourceGetter || inputs.invocation != nil || inputs.get == nil || inputs.get.operation != get.operation || get.operation != request.operation || inputs.declaration != request.declaration || len(request.actuals) != 0 || !request.actualsKnown {
		out.unsupported = relativeInputsInvalidOwner
		return out
	}
	return describeSourceRelativeInstalledBindings(query, inputs, request)
}

// The original binder wrappers authenticate their distinct Call/Get interval.
// This shared reducer copies the already-installed SOURCE bindings only.
func describeSourceRelativeInstalledBindings(query *sourceValueQuery, inputs *sourceValueInputs, request sourceRelativeInvocation) sourceRelativeBoundInputs {
	out := sourceRelativeBoundInputs{inputKind: request.inputKind, declaration: request.declaration, operation: request.operation, use: request.use, cut: request.cut}
	appendBinding := func(role sourceRelativeRole, values []sourceValue) {
		binding, gap := describeRelativeBoundValues(values, role, request.cut)
		out.bindings = append(out.bindings, binding)
		if out.unsupported == relativeInputsSupported {
			out.unsupported = gap
		}
	}
	receiver := sourceRelativeRole{kind: relativeRoleReceiver, declaration: request.declaration, lexical: ast.IsArrowFunction(request.declaration)}
	appendBinding(receiver, inputs.bindings[0])
	position := 0
	for _, parameter := range request.declaration.Parameters() {
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		role := sourceRelativeRole{kind: relativeRoleFormal, declaration: request.declaration, slot: position}
		position++
		if initializer := parameter.Initializer(); initializer != nil {
			selection := relativeDefaultUnclassified
			if entry, present := inputs.defaults[initializer]; present {
				if entry.bindings == nil {
					selection = relativeDefaultBypassed
				} else if entry.conditional {
					selection = relativeDefaultConditional
				} else {
					selection = relativeDefaultRequired
				}
			}
			out.defaults = append(out.defaults, sourceRelativeDefaultInput{formal: role, initializer: initializer, selection: selection, cut: request.cut})
			if selection == relativeDefaultUnclassified {
				out.unsupported = relativeInputsUnsupportedDefault
			}
		}
		if !ast.IsIdentifier(parameter.Name()) {
			out.unsupported = relativeInputsUnsupportedActual
			continue
		}
		symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name())
		if symbol == nil {
			out.unsupported = relativeInputsUnsupportedActual
			continue
		}
		values, present := inputs.bindings[ast.GetSymbolId(symbol)]
		if parameter.AsParameterDeclaration().DotDotDotToken == nil {
			appendBinding(role, values)
			continue
		}
		rest := sourceRelativeRestInput{formal: role, cut: request.cut, unknownTail: !request.actualsKnown}
		uncertain := !request.actualsKnown
		for _, actual := range request.actuals {
			if actual.spread && actual.ordinal < role.slot {
				uncertain = true
				rest.unknownTail = true
			}
		}
		if !present || len(values) != 1 || values[0].rest == nil {
			out.unsupported = relativeInputsUnsupportedRest
			rest.unknownTail = true
		} else {
			for index, group := range values[0].rest {
				for _, actual := range request.actuals {
					if actual.spread && actual.ordinal <= role.slot+index {
						uncertain = true
						rest.unknownTail = true
					}
				}
				for _, value := range group {
					if value.node != nil && ast.IsSpreadElement(value.node) {
						uncertain = true
						rest.unknownTail = true
					}
				}
				binding, gap := describeRelativeBoundValues(group, role, request.cut)
				if out.unsupported == relativeInputsSupported {
					out.unsupported = gap
				}
				rest.slots = append(rest.slots, sourceRelativeRestSlot{position: index, unknownPosition: uncertain, binding: binding})
			}
		}
		out.rest = append(out.rest, rest)
	}
	// Only requested lexical bindings are detached. Enumerating every captured
	// symbol would confuse incidental scope storage with summary requirements.
	for _, capture := range request.captures {
		role := capture.target
		if role.kind != relativeRoleCapture || role.declaration != request.declaration || role.binding == nil {
			out.unsupported = relativeInputsUnsupportedCapture
			continue
		}
		name := role.binding.Name()
		if name == nil || !ast.IsIdentifier(name) {
			out.unsupported = relativeInputsUnsupportedCapture
			continue
		}
		symbol := query.owner.checker.GetSymbolAtLocation(name)
		if symbol == nil {
			out.unsupported = relativeInputsUnsupportedCapture
			continue
		}
		if query.owner.bindingWritten(symbol) {
			// Raw capture entries precede completed-activation writes. The later
			// live-read owner must settle this relative obligation. Resolving it
			// here would recursively prepare writers before effect publication.
			out.unsupported = relativeInputsUnsupportedCapture
			creation := query.creators[enclosingCallableNode(role.binding)]
			out.bindings = append(out.bindings, sourceRelativeBinding{target: role, sources: []sourceRelativeEndpoint{{kind: relativeEndpointRole, role: role, creation: creation.invocation, returning: creation.returning, cut: request.cut}}})
			continue
		}
		appendBinding(role, inputs.bindings[ast.GetSymbolId(symbol)])
		// The selected original scope is still installed while this callback
		// runs. Copy its creating occurrence, never the creator map itself.
		creation := query.creators[enclosingCallableNode(role.binding)]
		binding := &out.bindings[len(out.bindings)-1]
		for index := range binding.sources {
			endpoint := &binding.sources[index]
			if endpoint.creation == nil {
				endpoint.creation, endpoint.returning = creation.invocation, creation.returning
			}
		}
	}
	return out
}

// describeRelativeBoundValues preserves donor order and independent uncertainty.
// Special normal/native values remain unmigrated until their existing owners
// supply descriptive relationships. No receipt is weakened to a raw expression.
func describeRelativeBoundValues(values []sourceValue, role sourceRelativeRole, cut sourceRelativeCut) (sourceRelativeBinding, sourceRelativeInputGap) {
	binding := sourceRelativeBinding{target: role, unknown: len(values) == 0}
	gap := relativeInputsSupported
	for _, value := range values {
		if value.constructionCallable != nil {
			if !constructionMarkerCarrier(value) || value.constructionView != nil {
				binding.unknown = true
				gap = relativeInputsUnsupportedActual
				continue
			}
			binding.sources = append(binding.sources, sourceRelativeEndpoint{kind: relativeEndpointConstructionCallable, constructionCallable: cloneConstructionCallableValue(value.constructionCallable), projection: append([]string(nil), value.path...), cut: cut})
			continue
		}
		if value.constructionView != nil {
			if !constructionMarkerCarrier(value) || value.constructionCallable != nil {
				binding.unknown = true
				gap = relativeInputsUnsupportedActual
				continue
			}
			copy := cloneSourceRelativeEndpoint(*value.constructionView)
			copy.projection = append(copy.projection, value.path...)
			binding.sources = append(binding.sources, copy)
			continue
		}
		if value.descriptorView != nil {
			if value.frameworkView != nil || value.node != nil || value.instance != nil || value.ownedGetRow != nil || value.initializerUse != nil || value.adapter != nil || value.acquired != nil || value.entrySlot != nil || value.bound != nil || value.normal != nil || value.awaited != nil || value.native != nil || value.number != (numberPayload{}) || value.rest != nil || value.copied != nil || value.undefined {
				binding.unknown, gap = true, relativeInputsUnsupportedActual
				continue
			}
			view := projectNativeDescriptorView(*value.descriptorView, value.path)
			binding.sources = append(binding.sources, sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: view.source.request.use, cut: cut, descriptorView: &view})
			continue
		}
		if value.frameworkView != nil {
			// A view description cannot launder another acquired/normal carrier.
			if value.node != nil || value.instance != nil || value.ownedGetRow != nil || value.initializerUse != nil || value.adapter != nil || value.acquired != nil || value.entrySlot != nil || value.bound != nil || value.normal != nil || value.awaited != nil || value.native != nil || value.rest != nil || value.copied != nil || value.undefined {
				binding.unknown = true
				gap = relativeInputsUnsupportedActual
				continue
			}
			view := projectFrameworkStorageView(*value.frameworkView, value.path)
			binding.sources = append(binding.sources, sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: cut, frameworkView: &view})
			continue
		}
		if value.freezeLexical != nil || value.instance != nil || value.ownedGetRow != nil || value.initializerUse != nil || value.adapter != nil || value.acquired != nil || value.entrySlot != nil || value.bound != nil || value.normal != nil || value.awaited != nil || value.native != nil || value.rest != nil || value.copied != nil {
			binding.unknown = true
			gap = relativeInputsUnsupportedActual
			continue
		}
		endpoint := sourceRelativeEndpoint{expression: value.node, projection: append([]string(nil), value.path...), cut: cut}
		if value.undefined {
			endpoint.kind = relativeEndpointUndefined
		} else if value.node == nil {
			binding.unknown = true
			continue
		} else {
			endpoint.kind = relativeEndpointExpression
		}
		if value.capture != nil && value.node != nil {
			for lexical := enclosingCallableNode(value.node.Parent); lexical != nil; lexical = enclosingCallableNode(lexical.Parent) {
				if creation, present := value.capture.creators[lexical]; present {
					endpoint.creation = creation.invocation
					endpoint.returning = creation.returning
					break
				}
			}
			// A captured local callable needs its original creation association. Missing
			// descriptive association stays an explicit gap rather than merging scopes.
			if endpoint.creation == nil && enclosingCallableNode(value.node.Parent) != nil {
				binding.unknown = true
				gap = relativeInputsUnsupportedCapture
			}
		}
		binding.sources = append(binding.sources, endpoint)
	}
	return binding, gap
}
