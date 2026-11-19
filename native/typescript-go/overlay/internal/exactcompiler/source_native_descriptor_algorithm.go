package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// descriptorInvocationEffects belongs to the original selected Object Call.
// Arguments are acquired in supplied order before native conversion. The input
// relationships, possible protocol bodies and Throw are separate from returned
// descriptor membership; this path cannot publish an ordinary result receipt.
func (q *sourceValueQuery) descriptorInvocationEffects(call *ast.Node, callee sourceValue, bindings sourceValueBindings, result *accessorCandidates) {
	if !q.dependenciesOnly || q.operation != nil || callee.native == nil || callee.native.kind != sourceNativeObjectGetOwnPropertyDescriptor || callee.native.referencesIncomplete || callee.node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(callee.node)) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 2 || ast.IsSpreadElement(actuals[0]) || ast.IsSpreadElement(actuals[1]) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	var values [2][]sourceValue
	for i, actual := range actuals {
		part := accessorCandidates{}
		var admitted bool
		values[i], admitted = q.actualArgumentValues(call, actual, &part)
		if !admitted {
			values[i] = q.originsAt(actual, q.boundInputAcquisition(actual, call), bindings, &part)
		}
		// Target acquisition above is unchanged. Only a raw conditional key can
		// need its source alternatives before their separate implicit Gets.
		if i == 1 && !admitted {
			expression := unwrapSourceCallableReference(actual)
			unacquired := expression != nil && ast.IsConditionalExpression(expression) &&
				len(values[i]) == 1 && values[i][0].node == expression &&
				len(values[i][0].path) == 0 && values[i][0].normal == nil &&
				values[i][0].acquired == nil
			if unacquired {
				selected := q.accessorsAtGetOutput(nil, nil, "", accessorAcquire, bindings, nil, nil, nil, nil, values[i]...)
				for index := range selected.values {
					if scope, ok := selected.callableScopes[index]; ok {
						selected.values[index].capture = &scope
					}
				}
				// The values remain private protocol operands, never Call results.
				values[i] = selected.values
				q.publishDescriptorMayEffects(selected, &part)
			}
		}
		mergeAccessorCandidates(result, part)
	}
	q.publishDescriptorMutationSource(call)
	// A genuinely selected builtin permits Proxy/coercion/Throw alternatives.
	// This residual does not replace any source flags, donors or pending input.
	effect := environmentSource("unknown", "Object.getOwnPropertyDescriptor conversion, Proxy descriptor normalization or invariant may execute user code or throw", "descriptor retrieval")
	effect.Opaque = true
	effect.callOrigin = &sourceCallOutcome{declaration: q.effectOwner, operation: call, phase: sourceDescriptorRetrievalEffects}
	result.environmentEffects = append(result.environmentEffects, effect)
	key := &sourceReflectiveOperation{operation: call, scope: q.acquireCallableScope(bindings, result)}
	for _, value := range values[1] {
		scope := key.scope
		if value.capture != nil {
			scope = *value.capture
		}
		key.keys = append(key.keys, sourceObservedValue{value: value, scope: scope})
	}
	// A source symbol/primitive key has no coercion body. The shared coercion
	// owner retains known callable hooks beside unresolved primitive outcomes.
	// The original selected algorithm may already own actual APPLIED primitive
	// SOURCE branches for this key. They account only the object-coercion
	// component; original argument acquisition and all Symbol Call/input Effects
	// remain unchanged above and in the required graph. Unsupported siblings
	// keep the existing source Get/call donor path and compiler pending.
	if !q.descriptorPrimitiveKeyOwned(call) {
		q.sourcePropertyKeyEffects(key, result)
	}
	for _, value := range values[0] {
		q.withProxySourceScope(value, bindings, func(scope sourceValueBindings) {
			if value.node != nil && len(value.path) == 0 && ast.IsNewExpression(value.node) {
				q.descriptorProxyEffects(call, value.node, scope, result)
			}
		})
	}
	result.valueIncomplete = true // Conditional source operator, never normal B.
}

// localDescriptorValueCallback contributes the function in a fresh own data
// property only when the returned descriptor's value is actually called.
// A descriptor lookup alone never invokes the stored function or a target getter.
func (q *sourceValueQuery) localDescriptorValueCallback(member *ast.Node) *ast.Node {
	receiver, field := sourceLiteralMemberReference(member)
	if field != "value" || q.owner.program == nil {
		return nil
	}
	outer := enclosingCallableNode(member)
	// These two single-use local consts carry the original object and the
	// returned descriptor between their creation and use without an alias.
	initializer := func(ref *ast.Node) *ast.Node {
		if ref == nil || !ast.IsIdentifier(ref) {
			return nil
		}
		symbol := q.owner.checker.GetSymbolAtLocation(ref)
		if symbol == nil || !localConstructionBinding(symbol.ValueDeclaration, outer, q.owner) {
			return nil
		}
		index := q.owner.index(ast.GetSourceFileOfNode(ref))
		uses := index.privateUses
		if uses == nil || !uses.complete || len(uses.unresolved[ref.Text()]) != 0 {
			return nil
		}
		refs := uses.uses[ast.GetSymbolId(symbol)]
		if len(refs) != 1 || refs[0].node != ref || refs[0].region != outer || symbol.ValueDeclaration.End() > ref.Pos() {
			return nil
		}
		return unwrapSourceCallableReference(symbol.ValueDeclaration.Initializer())
	}
	retrieval := initializer(receiver)
	if retrieval == nil || !ast.IsCallExpression(retrieval) {
		return nil
	}
	call := retrieval.AsCallExpression()
	root, method := sourceLiteralMemberReference(call.Expression)
	if method != "getOwnPropertyDescriptor" || root == nil || !ast.IsIdentifier(root) || root.Text() != "Object" ||
		!standardLibraryValue(root, q.owner.checker) || standardLibraryCallOwner(call, q.owner.checker) != "ObjectConstructor" ||
		call.Arguments == nil || len(call.Arguments.Nodes) != 2 {
		return nil
	}
	key := unwrapSourceCallableReference(call.Arguments.Nodes[1])
	if key == nil || !ast.IsStringLiteralLike(key) || key.Text() == "__proto__" {
		return nil
	}
	target := initializer(call.Arguments.Nodes[0])
	if target == nil || !ast.IsObjectLiteralExpression(target) {
		return nil
	}
	var body *ast.Node
	for _, property := range target.AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || ast.IsSpreadAssignment(property) {
			return nil
		}
		if callableNameText(property.Name()) == key.Text() {
			body = nil // A later own property replaces an earlier one.
			if ast.IsPropertyAssignment(property) {
				value := unwrapSourceCallableReference(property.Initializer())
				if value != nil && ast.IsArrowFunction(value) {
					body = value
				}
			}
		}
	}
	return body
}

// descriptorProxyEffects preserves the native two-argument trap protocol. The
// target's stored getter is not read. A trap return instead undergoes the real
// ordered ToPropertyDescriptor Has/Get/validation owner, including its getters.
func (q *sourceValueQuery) descriptorProxyEffects(call, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	q.descriptorProxyProtocolEffects(call, site, bindings, "getOwnPropertyDescriptor", true, result)
}

// descriptorProxyProtocolEffects consumes a possible source protocol body with
// the actual native vector. Has supplies two actuals; Get supplies three. Only
// the descriptor trap's return enters ToPropertyDescriptor, never Has/Get values.
func (q *sourceValueQuery) descriptorProxyProtocolEffects(call, site *ast.Node, bindings sourceValueBindings, trapName string, normalize bool, result *accessorCandidates) {
	arguments, possible := q.sourceProxyInputs(site, bindings)
	if !possible || q.active[site] {
		return
	}
	q.active[site] = true
	defer delete(q.active, site)
	for _, handler := range arguments[1] {
		q.withProxySourceScope(handler, bindings, func(scope sourceValueBindings) {
			part := q.accessors(handler.node, append(append([]string(nil), handler.path...), trapName), "", accessorAcquire, scope, nil)
			q.publishDescriptorMayEffects(part, result)
			for _, trap := range part.values {
				body := trap.node
				if body == nil || !ast.IsFunctionLike(body) || body.Body() == nil || len(trap.path) != 0 {
					continue // Runtime alternative remains additive; not body discovery.
				}
				q.withProxySourceScope(trap, scope, func(captures sourceValueBindings) {
					effects := accessorCandidates{}
					var inputs *sourceValueInputs
					if trapName == "get" {
						inputs = q.bindProxyTrapInputs(body, handler, arguments[0], captures, &effects, true)
						inputs.invocation = call
					} else {
						inputs = q.bindProxyDescriptorInputs(call, body, handler, arguments[0], captures, &effects)
					}
					supplied := 2
					if trapName == "get" {
						supplied = 3
					}
					q.publishProxySourceInputs(call, site, handler, inputs, supplied)
					effects.retainCallableEffect(call, body)
					q.consumeSourceBodyEffects(call, body, inputs.bindings, inputs, nil, &effects)
					if normalize {
						// Reuse this installed two-actual binder, not the authored Object
						// receiver or a second acquisition of its original actuals.
						q.projectSelectedSourceReturns(body, call, inputs.bindings, inputs, &effects, func(value sourceValue, source sourceValueBindings) {
							if !value.undefined {
								q.normalizeDescriptorSourceFields(call, value, source, &effects)
							}
						}, func() { effects.valueIncomplete = true })
					}
					q.publishDescriptorMayEffects(effects, result)
				})
			}
		})
	}
}

// publishDescriptorMayEffects retains structured source obligations as well as
// known effects. The generic construction inventory deliberately drops those
// records and therefore cannot account this original Call. No candidate value,
// normal output or installed frame becomes a returned descriptor alternative.
func (q *sourceValueQuery) publishDescriptorMayEffects(part accessorCandidates, result *accessorCandidates) {
	payload := candidatePublisherPayload(part)
	// These are direct original algorithm field phases, not body-call rows.
	// Preserve their exact typed dependencies through this Effects-only publisher.
	payload.fieldOutcomes = append([]sourceFieldOutcome(nil), part.fieldOutcomes...)
	payload.installedMemberPending = append([]sourceInstalledMemberPending(nil), part.installedMemberPending...)
	payload.inputs = append([]*sourceValueInputs(nil), part.inputs...)
	payload.ordinaryBodies = append(payload.ordinaryBodies, part.ordinaryBodies...)
	payload.producers = append(payload.producers, part.producers...)
	payload.ownedGets = append(payload.ownedGets, part.ownedGets...)
	payload.normalCalls = append(payload.normalCalls, part.normalCalls...)
	payload.nativeCalls = append(payload.nativeCalls, part.nativeCalls...)
	payload.reflective = append(payload.reflective, part.reflective...)
	mergeAccessorCandidates(result, payload)
}

// normalizeDescriptorSourceFields owns source-only ToPropertyDescriptor MAY.
// It deliberately does not call acquireRequiredPropertyAt: that owner requires
// a real normal inspection/frame. Field presence/value validity remains unknown
// here; validation and invariant Throw stay in the original native runtime MAY.
// Each ordered Has and Get retains its own known source obligations/donors.
func (q *sourceValueQuery) normalizeDescriptorSourceFields(call *ast.Node, descriptor sourceValue, bindings sourceValueBindings, result *accessorCandidates) {
	part := accessorCandidates{}
	values := q.originsAt(descriptor.node, q.boundInputAcquisition(descriptor.node, call), bindings, &part)
	q.publishDescriptorMayEffects(part, result)
	for _, value := range values {
		if value.node == nil || value.native != nil || value.normal != nil || value.descriptorView != nil || value.frameworkView != nil {
			result.valueIncomplete = true
			continue
		}
		q.withProxySourceScope(value, bindings, func(scope sourceValueBindings) {
			for _, key := range reflectiveDescriptorKeys {
				if !q.charge(result, call) {
					return
				}
				if ast.IsNewExpression(value.node) && len(value.path) == 0 {
					// Proxy Has is distinct from Get. Both possible trap bodies retain
					// their real protocol binders; no selected trap normal output follows.
					q.descriptorProxyProtocolEffects(call, value.node, scope, "has", false, result)
					q.descriptorProxyProtocolEffects(call, value.node, scope, "get", false, result)
					result.valueIncomplete = true
					continue
				}
				get := &sourceGetInputs{operation: call, receiver: value, propertyKey: key, hasOnly: true}
				path := append(append([]string(nil), value.path...), key)
				has := q.descriptorSourceFieldPhase(value, path, scope, get, installedMemberHas)
				q.publishDescriptorMayEffects(has, result)
				get.hasOnly = false
				acquired := q.descriptorSourceFieldPhase(value, path, scope, get, installedMemberAcquire)
				q.publishDescriptorMayEffects(acquired, result)
			}
		})
	}
}

// descriptorSourceFieldPhase surrounds exactly one original ToPropertyDescriptor
// Has/Acquire. The selected algorithm issuer and installed trap binder remain
// live together. Its real return/use cut is preserved, never normalized to Call.
func (q *sourceValueQuery) descriptorSourceFieldPhase(value sourceValue, path []string, bindings sourceValueBindings, get *sourceGetInputs, phase sourceInstalledMemberPhase) accessorCandidates {
	mode, supported := installedMemberTraversal(phase)
	if !supported || get == nil {
		return accessorCandidates{opaque: true, valueIncomplete: true}
	}
	prefix := accessorCandidates{}
	cut := &sourceMemberWriterReadCut{operation: get.operation, use: q.reading, scope: q.acquireCallableScope(bindings, &prefix)}
	revoke := func() {}
	installed := false
	if issuer := q.installedMemberNativePhase; issuer != nil {
		bound, gap := describeRelativeBoundValues([]sourceValue{value}, sourceRelativeRole{}, q.relativeInputCut(get.operation))
		if gap == relativeInputsSupported && !bound.unknown && len(bound.pending) == 0 && len(bound.sources) == 1 {
			_, revoke, installed = q.beginInstalledMemberWorkPhase(issuer.algorithm, get, cut, phase, get.propertyKey, bound.sources[0])
		}
	}
	defer revoke()
	result := q.accessorsAtGet(value.node, path, "", mode, bindings, nil, get)
	mergeAccessorCandidates(&result, prefix)
	if !installed {
		// Keep known donors, but no missing original phase becomes a runtime
		// unknown, a completed source inventory or an implicit normal frame.
		result.opaque = true
	}
	return result
}
