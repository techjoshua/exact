package exactcompiler

import (
	"unsafe"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// consumeNativeFreeze owns one actual native integrity event. The outer event
// denotes nonextensibility. Its finite descriptor rows retain their original
// values and captures, with configurable=false and data writable=false implied
// by the native kind, not invented boolean source expressions. No typed-store
// allocation, source-body entry or new object identity is issued here.
func (q *sourceValueQuery) consumeNativeFreeze(site *ast.Node, callee sourceValue, exclusive bool, result *accessorCandidates) {
	slot := q.normalOperation(site, false)
	refuse := func() { result.opaque, result.valueIncomplete = true, true }
	if !exclusive || callee.native == nil || callee.native.referencesIncomplete || slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(q) || slot.authority.generation == nil || !slot.authority.generation.active || slot.entry == nil || !slot.entry.once || q.inputs == nil || q.inputs.operationLifetime == nil || len(slot.actuals) != 1 || site.AsCallExpression().Arguments == nil || len(site.AsCallExpression().Arguments.Nodes) != 1 || slot.actuals[0].node != site.AsCallExpression().Arguments.Nodes[0] {
		refuse()
		return
	}
	actual := slot.actuals[0].observed
	if actual.incomplete || actual.effects != sourceEffectsAccounted || len(actual.values) != 1 {
		refuse()
		return
	}
	target := actual.values[0]
	if target.value.normal != nil {
		if _, ok := q.normalValueScope(target.value, result); !ok {
			refuse()
			return
		}
		target = target.value.normal.observed
	}
	if target.value.acquired != nil {
		target = *target.value.acquired
	}
	if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceObservedValue{}), result, site) {
		return
	}
	// Even an unsupported integrity target has this conditional native Normal
	// identity. Keep its original value beside refusal, never a successful event.
	slot.output = sourceResultObservation{values: []sourceObservedValue{target}, incomplete: true, effects: sourceEffectsRefused}
	value := target.value
	// This first source event admits one actual literal in this creating frame.
	// Proxy, aliased/returned allocations and unrepresented scope transfers stay
	// residual. A declaration or allocation site alone never supplies occurrence.
	if target.inputs != q.inputs || value.node == nil || unwrapSourceCallableReference(slot.actuals[0].node) != value.node || !ast.IsObjectLiteralExpression(value.node) || len(value.path) != 0 || value.normal != nil || value.instance != nil || value.native != nil {
		refuse()
		return
	}
	if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceReflectiveOperation{}), result, site) {
		return
	}
	op := &sourceReflectiveOperation{operation: site, owner: q.operation.owner, frame: q.inputs, native: sourceNativeObjectFreeze, scope: target.scope, targets: slot.output.values, covered: true, normal: true}
	q.preparePropertyReferences(op.owner, result, op)
	if result.opaque {
		refuse()
		return
	}
	members := value.node.AsObjectLiteralExpression().Properties.Nodes
	if !q.descriptorEffectAllocation(len(members), unsafe.Sizeof((*sourceReflectiveOperation)(nil)), result, site) {
		return
	}
	op.nested = make([]*sourceReflectiveOperation, 0, len(members))
	for _, member := range members {
		if !q.charge(result, member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || ast.IsSpreadAssignment(member) {
			op.conversionIncomplete = true
			break
		}
		key := callableNameText(member.Name())
		if key == "" || key == "__proto__" {
			op.conversionIncomplete = true
			break
		}
		var row *sourceReflectiveOperation
		for _, previous := range op.nested {
			if previous.key == key {
				row = previous
				break
			}
		}
		if row == nil {
			if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceReflectiveOperation{})+6*(unsafe.Sizeof(sourcePropertyResult{})+unsafe.Sizeof("")), result, member) {
				op.conversionIncomplete = true
				break
			}
			row = &sourceReflectiveOperation{operation: site, owner: op.owner, frame: op.frame, native: sourceNativeObjectFreeze, key: key, covered: true, normal: true, finalized: true, targets: op.targets, scope: target.scope, fields: make(map[string]sourcePropertyResult)}
			op.nested = append(op.nested, row)
		}
		if ast.IsGetAccessorDeclaration(member) || ast.IsSetAccessorDeclaration(member) {
			field := "get"
			if ast.IsSetAccessorDeclaration(member) {
				field = "set"
			}
			delete(row.fields, "value")
			if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceObservedValue{}), result, member) {
				op.conversionIncomplete = true
				break
			}
			row.fields[field] = sourcePropertyResult{presence: propertyPresent, values: []sourceObservedValue{{value: sourceValue{node: member}, inputs: target.inputs, scope: target.scope}}}
		} else if ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member) || ast.IsMethodDeclaration(member) {
			var observed sourceResultObservation
			if ast.IsMethodDeclaration(member) {
				observed = sourceResultObservation{effects: sourceEffectsAccounted, values: []sourceObservedValue{{value: sourceValue{node: member}, inputs: target.inputs, scope: target.scope}}}
			} else {
				initializer := member.Name()
				if ast.IsPropertyAssignment(member) {
					initializer = member.AsPropertyAssignment().Initializer
				}
				observed = q.normalArgumentObservation(initializer, target.scope.bindings, result)
			}
			if observed.incomplete || observed.effects != sourceEffectsAccounted || len(observed.values) == 0 {
				op.conversionIncomplete = true
				break
			}
			row.fields = map[string]sourcePropertyResult{"value": {presence: propertyPresent, values: observed.values}}
		} else {
			op.conversionIncomplete = true
			break
		}
	}
	if op.conversionIncomplete || result.opaque {
		refuse()
		return
	}
	// Original Call publication retains the original observation, including its
	// scope and occurrence. No argument is reacquired at a later field consumer.
	op.finalized = true
	result.reflective = append(result.reflective, op)
	slot.output.incomplete, slot.output.effects = false, sourceEffectsAccounted
	result.values = append(result.values, value)
}

// nativeFreezeFor is read-only access to an earlier actual event in this live
// frame. Both the receiver's original observation and the operation population
// must match. Same-AST allocations in another invocation cannot use this event.
func (q *sourceValueQuery) nativeFreezeFor(get *sourceGetInputs, origin *ast.Node, at *ast.Node, result *accessorCandidates) *sourceReflectiveOperation {
	if get == nil || get.operation == nil || at == nil {
		return nil
	}
	view := q.propertyView()
	if view == nil || view.state == sourcePropertyDisposed {
		return nil
	}
	receiver := get.receiver
	var original *sourceObservedValue
	if receiver.normal != nil {
		original = &receiver.normal.observed
	}
	if receiver.acquired != nil {
		original = receiver.acquired
	}
	if original == nil {
		return nil
	}
	if original.value.acquired != nil {
		original = original.value.acquired
	}
	for _, op := range view.operations {
		if !q.charge(result, at) {
			return nil
		}
		if op.native != sourceNativeObjectFreeze || !op.finalized || !op.covered || op.conversionIncomplete || op.residualMutation || op.referencesIncomplete || len(op.targets) != 1 || op.frame == nil || op.frame.operationLifetime == nil || op.frame.properties != view {
			continue
		}
		slot := op.frame.operations[op.operation]
		if slot == nil || slot.state != sourceOperationConsumed || !slot.authority.valid(q) || slot.authority.generation == nil || !slot.authority.generation.active || slot.population != op.frame.population || slot.entry == nil || !slot.entry.once || slot.output.effects != sourceEffectsAccounted {
			continue
		}
		target := op.targets[0]
		if target.inputs != original.inputs || target.inputs != op.frame || target.value.node != origin || original.value.node != origin || len(target.value.path) != 0 || len(original.value.path) != 0 {
			continue
		}
		index := q.owner.index(ast.GetSourceFileOfNode(at))
		before, after := index.normalOccurrences[op.operation], index.normalOccurrences[at]
		if before == nil || after == nil || before.region != after.region || before.node == after.node || before.ordinal > after.ordinal || before.ordinal == after.ordinal && op.operation.End() > at.Pos() {
			continue
		}
		return op
	}
	return nil
}

// frozenOwnGet preserves the installed getter and value, without invoking any
// getter during Freeze. Unknown/missing own rows still use the prototype owner.
func (q *sourceValueQuery) frozenOwnGet(origin *ast.Node, projection []string, name string, mode accessorTraversal, get *sourceGetInputs, original *sourceObservedValue, result *accessorCandidates) bool {
	if get == nil || mode&accessorReachable != 0 {
		return false
	}
	key := name
	if len(projection) == 1 && key == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return false
	}
	if key == "" {
		return false
	}
	proof := get
	if original != nil && original.inputs == q.inputs && original.value.node == origin {
		copy := *get
		copy.receiver.acquired = original
		proof = &copy
	}
	op := q.nativeFreezeFor(proof, origin, get.operation, result)
	if op == nil {
		return false
	}
	// Mutations use the same event as reads. Keep uncertain completion rather
	// than publishing a successful Put/Delete or a synthetic TypeError value.
	if mode&accessorSet != 0 || mode&accessorNoGet != 0 {
		var selected *sourceReflectiveOperation
		for _, row := range op.nested {
			if row.key == key {
				selected = row
			}
		}
		outer := q.envelopeOuterExpression(get.operation, result)
		deleting := outer != nil && outer.Parent != nil && ast.IsDeleteExpression(outer.Parent)
		if deleting || selected == nil || selected.fields["set"].presence != propertyPresent {
			// A compound accessor mutation still performs its genuine Get
			// before the blocked Set. Plain assignment/Delete do not read it.
			if !deleting && mode&accessorNoGet == 0 && selected != nil && (q.operation == nil || !q.operation.outputOnly) {
				for _, value := range selected.fields["get"].values {
					q.executeGetEffects(value.value.node, get, value.scope, result)
				}
			}
			result.opaque, result.valueIncomplete = true, true
			return true
		}
		return false // The existing supplied-value setter owner keeps authority.
	}
	for _, row := range op.nested {
		if row.key == key {
			if getter := row.fields["get"]; getter.presence == propertyPresent {
				// Match the ordinary source getter's effects-only domain. A
				// missing scalar return does not make its known body effects opaque.
				// Output-only inspection cannot start that body a second time.
				if q.operation != nil && q.operation.outputOnly {
					result.valueIncomplete = true
				} else {
					for _, value := range getter.values {
						q.executeGetEffects(value.value.node, get, value.scope, result)
					}
				}
			} else if row.fields["value"].presence == propertyPresent {
				q.convertedPropertyGet(row, get, result)
			} else {
				result.values = append(result.values, sourceValue{undefined: true})
			}
			result.ownOperation = true
			return true
		}
	}
	return false
}
