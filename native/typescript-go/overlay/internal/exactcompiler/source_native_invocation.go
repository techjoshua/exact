package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// consumeNativeInvocation routes an already selected standard alternative to its
// existing algorithm owner. Coverage describes the acquired alternative set,
// not builtin implementation integrity. Each consumer retains its actual-input,
// normal-completion, storage and descriptor requirements. Unknown siblings stay
// on the enclosing invocation and are never discharged by this dispatch.
func (query *sourceValueQuery) consumeNativeInvocation(node *ast.Node, value sourceValue, bindings sourceValueBindings, consumer sourceInvocationConsumer, complete, exclusive, covered bool, result *accessorCandidates) {
	// Exposure-only kinds never own an invocation algorithm or receipt.
	if directExposureNative(value.native.kind) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	if value.native.kind == sourceNativeArrayPush {
		if consumer.arrayPush != nil {
			query.withActiveInvocation(node, func() { consumer.arrayPush(node, value, bindings, result) })
		} else {
			result.valueIncomplete = true
		}
		return
	}
	if query.reflectiveCopyInvocation(node, value.native.kind) {
		query.publishReflectiveCopyTarget(node, value.native.kind, bindings, consumer.sourceReturn, result)
		return
	}
	if value.native.kind == sourceNativeObjectFreeze {
		if query.dependenciesOnly {
			query.sourceFreezeRelationship(node, value, bindings, complete, consumer.sourceReturn, result)
			return
		}
		query.consumeNativeFreeze(node, value, exclusive, result)
		return
	}
	if value.native.kind == sourceNativeReflectGet {
		if !query.dependenciesOnly {
			result.opaque, result.valueIncomplete = true, true
			return
		}
		if consumer.sourceReturn != nil || consumer.native != nil {
			query.sourceReflectGetRelationship(node, value, bindings, complete, consumer.sourceReturn, result)
		}
		return
	}
	if value.native.kind == sourceNativeObjectGetOwnPropertyDescriptor {
		query.withActiveInvocation(node, func() {
			revoke, _ := query.beginDescriptorSourcePhases(node, value)
			defer revoke()
			query.descriptorInvocationEffects(node, value, bindings, result, consumer.descriptorData)
		})
		return
	}
	if reflectiveNative(value.native.kind) {
		var operation *sourceReflectiveOperation
		query.withActiveInvocation(node, func() {
			operation = query.acquireReflectiveOperation(node, value, bindings, covered, result)
			operation.calleeExclusive = exclusive
			result.reflective = append(result.reflective, operation)
			if consumer.reflective != nil {
				consumer.reflective(operation, result)
			} else {
				result.valueIncomplete = true
			}
		})
		// A successful Object.defineProperty returns its original target. Project
		// after acquisition so a subsequent Get can observe this writer.
		if query.dependenciesOnly && consumer.sourceReturn != nil && value.native.kind == sourceNativeObjectDefineProperty {
			projection := query.reflectiveCopy
			// The selected reflected read can keep a getter's source effects from
			// this native alternative even when its independent siblings remain open.
			if projection != nil && projection.issuer == query && projection.createdGetter != nil && projection.createdGetter.creation == node && (exclusive || projection.createdGetter.reflected != nil) {
				getter := projection.createdGetter
				for _, target := range operation.targets {
					if target.value.node == getter.receiver && len(target.value.path) == 0 {
						if ast.IsCallExpression(getter.receiver) {
							query.sourceDefinedCreateTargetRead(getter, target.scope, result)
						} else {
							query.sourceCreatedGetterRead(getter, bindings, result)
						}
						break
					}
				}
			}
			for _, target := range operation.targets {
				term := target.value
				if term.capture == nil {
					term.capture = &target.scope
				}
				consumer.sourceReturn(term, target.scope.bindings)
			}
		}
		return
	}

	query.withActiveInvocation(node, func() {
		receipt := query.acquireNativeInputs(node, value, bindings, covered, result)
		result.nativeCalls = append(result.nativeCalls, receipt)
		if consumer.native != nil {
			consumer.native(receipt, result)
		} else {
			result.opaque = true
		}
	})
	return
}
