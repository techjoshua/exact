package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceReflectiveFieldEffects separates the original Has/Get owner's execution
// accounting from its optional field-value result. This scalar description is
// not an admission ticket, absence proof, normal completion or NoWrites receipt.
// Getter accounting retains the original receiver/binder owner. Until that
// contribution is transported, getter=true cannot settle a staged field debt.
type sourceReflectiveFieldEffects struct {
	has, get sourceEffectAccounting
	getter   bool
	invoked  []sourceStagedOperationInvocation // known actual Get bodies, receiver association remains descriptive
}

// sourceReflectiveFieldRead is local to one original reflective field Get. It
// never enters an operation recipe, normal output, summary or subscriber. Copies
// of sourceGetInputs share only this synchronous observation, not query rights.
type sourceReflectiveFieldRead struct {
	issuer  *sourceValueQuery
	op      *sourceReflectiveOperation
	key     string
	seen    bool
	effects sourceReflectiveFieldEffects
}

// recordReflectiveFieldRead records a selected terminal Get before any optional
// result projection. Data initializers were evaluated by the native Call's eager
// input owner. Reading a selected data property does not evaluate them again.
// Existing value acquisition still runs unchanged and can independently refuse.
func (query *sourceValueQuery) recordReflectiveFieldRead(get *sourceGetInputs, projection []string, name string, mode accessorTraversal, getter *ast.Node, accounting sourceEffectAccounting, result *accessorCandidates) {
	if get == nil || get.fieldEffects == nil || len(projection) != 1 || name != "" || mode != accessorAcquire {
		return
	}
	read := get.fieldEffects
	if read.issuer != query || read.op != get.reflective || read.op == nil || get.operation != read.op.operation || projection[0] != read.key || get.propertyKey != read.key || read.op.frame == nil || query.inputs != read.op.frame || query.operation == nil || query.operation.node != read.op.operation || query.operation.owner != read.op.owner || query.operation.inputs != read.op.frame {
		return
	}
	if !read.seen {
		read.effects.get = sourceEffectsAccounted
	}
	read.seen = true
	read.effects.getter = read.effects.getter || getter != nil
	if getter != nil {
		receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.receiver.node, producer: read.op.operation, get: get.receiver.node, cut: query.relativeInputCut(read.op.operation)}
		read.effects.invoked = append(read.effects.invoked, sourceStagedOperationInvocation{declaration: getter, operation: read.op.operation, alternative: sourceStagedOperationAlternative{endpoint: receiver}})
	}
	if accounting != sourceEffectsAccounted || result.opaque || result.receiverIncomplete {
		read.effects.get = sourceEffectsRefused
	}
}

func (effects sourceReflectiveFieldEffects) merge(other sourceReflectiveFieldEffects) sourceReflectiveFieldEffects {
	if effects.has != sourceEffectsAccounted || other.has != sourceEffectsAccounted {
		effects.has = sourceEffectsUnaccounted
	}
	if effects.get != other.get {
		effects.get = sourceEffectsUnaccounted
	}
	effects.getter = effects.getter || other.getter
	effects.invoked = append(append([]sourceStagedOperationInvocation(nil), effects.invoked...), other.invoked...)
	return effects
}

// reflectiveFieldInput is the existing invocation's actual descriptor input.
// It is used only to keep a terminal field observation distinct from nested Gets.
func reflectiveFieldInput(operation *sourceReflectiveOperation, key string, query *sourceValueQuery) *sourceReflectiveFieldRead {
	if operation == nil || operation.operation == nil || !ast.IsCallExpression(operation.operation) || stagedDescriptorFieldIndex(key) < 0 || query == nil || operation.frame == nil || query.inputs != operation.frame || query.operation == nil || query.operation.node != operation.operation || query.operation.owner != operation.owner || query.operation.inputs != operation.frame {
		return nil
	}
	return &sourceReflectiveFieldRead{issuer: query, op: operation, key: key}
}

// recordReflectiveFieldHas is called by the ordinary own-member selection owner
// before optional inherited value/presence proof. Existing writer/receiver
// uncertainty prevents accounting. No absence or Get result is supplied.
func (query *sourceValueQuery) recordReflectiveFieldHas(get *sourceGetInputs, projection []string, name string, selectedOwn bool, result *accessorCandidates) {
	if !selectedOwn || get == nil || !get.hasOnly || get.fieldEffects == nil || len(projection) != 1 || name != "" || result.opaque || result.receiverIncomplete {
		return
	}
	read := get.fieldEffects
	if read.issuer != query || read.op != get.reflective || read.op == nil || get.operation != read.op.operation || projection[0] != read.key || get.propertyKey != read.key || read.op.frame == nil || query.inputs != read.op.frame || query.operation == nil || query.operation.node != read.op.operation || query.operation.owner != read.op.owner || query.operation.inputs != read.op.frame {
		return
	}
	read.effects.has = sourceEffectsAccounted
}

// pending retains every known getter relationship while withholding aggregate
// accounting after an unknown population or an unfinished source contribution.
func (effects sourceReflectiveFieldEffects) pending() sourceReflectiveFieldEffects {
	effects.has, effects.get = sourceEffectsUnaccounted, sourceEffectsUnaccounted
	return effects
}
