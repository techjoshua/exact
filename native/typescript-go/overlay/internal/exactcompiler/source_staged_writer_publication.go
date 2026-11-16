package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedWriterRead is issued by the original member owner after its
// reachability, ordering, creating-input and receiver checks. It represents a
// MAY write at this read, not a performed replacement or current property value.
// RHS and creating bindings are detached. A missing binding remains required
// source work, independently of any known RHS relationships.
type sourceStagedWriterRead struct {
	write, region, call, origin, get *ast.Node
	readCut, observation             sourceRelativeCut
	value                            sourceRelativeEndpoint
	invocation                       sourceRelativeInvocation
	bound                            sourceRelativeBoundInputs
	rhs                              sourceRelativeInputPlan
	projection                       []string
	certain, unordered, incomplete   bool
}

// sourceStagedWriterBorrow belongs to one synchronous original source demand.
// The callback can register detached obligations, never retain the query/Get or
// binding maps. Returning true takes ownership of this RHS projection only.
// Aggregate writer inventory, other alternatives and normal values stay owned
// by their existing consumers.
type sourceStagedWriterBorrow struct {
	issuer            *sourceValueQuery
	owner             *sourceValueOwner
	generation        *projectGeneration
	use               *ast.Node
	consumer          *ast.Node
	publish           func(sourceStagedWriterRead) bool
	current           *sourceStagedWriterRead // exact live owner publication, never graph-retained
	publishing        bool
	get               *sourceGetInputs
	read              *sourceMemberWriterReadCut
	projecting        *sourceStagedWriterInputProjection // scoped value producer only
	projectedScopes   []sourceStagedWriterCallableScope  // original acquired alternatives, never graph state
	consumeProjection func(sourceStagedWriterProjection) bool
	currentProjection *sourceStagedWriterProjection
	currentInput      *sourceMemberWriterInput // live owner input only, cleared before publication interval ends
	methodReceiver    *sourceStagedWriterMethodReceiver
}

func (q *sourceValueQuery) beginStagedWriterSource(publish func(sourceStagedWriterRead) bool) (func(), bool) {
	if q == nil || q.owner == nil || q.owner.program == nil || q.owner.generation == nil || q.owner.checker == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || q.reading == nil || publish == nil {
		return func() {}, false
	}
	file := ast.GetSourceFileOfNode(q.reading)
	if file == nil || q.owner.program.GetSourceFile(file.FileName()) != file {
		return func() {}, false
	}
	prior := q.stagedWriter
	borrow := &sourceStagedWriterBorrow{issuer: q, owner: q.owner, generation: q.owner.generation, use: q.reading, consumer: q.effectOwner, publish: publish}
	q.stagedWriter = borrow
	return func() {
		if borrow.issuer == nil {
			return
		}
		if q.stagedWriter == borrow {
			q.stagedWriter = prior
		}
		borrow.issuer, borrow.publish, borrow.get, borrow.read, borrow.current = nil, nil, nil, nil, nil
		borrow.projecting, borrow.projectedScopes, borrow.currentProjection, borrow.currentInput, borrow.methodReceiver, borrow.consumeProjection = nil, nil, nil, nil, nil, nil
	}, true
}

func (q *sourceValueQuery) liveStagedWriterSource(borrow *sourceStagedWriterBorrow, cut *sourceMemberWriterReadCut) bool {
	return q != nil && borrow != nil && q.stagedWriter == borrow && borrow.issuer == q && borrow.owner == q.owner && q.owner != nil && borrow.generation == q.owner.generation && borrow.publish != nil && q.dependenciesOnly && q.inputs == nil && q.operation == nil && borrow.consumer == q.effectOwner && cut != nil && cut.use == borrow.use && q.reading == cut.use
}

// enterStagedWriterGet is lent only by the original member owner. Callback
// metadata cannot manufacture the issued Get pointer or its current read scope.
func (q *sourceValueQuery) enterStagedWriterGet(get *sourceGetInputs, cut *sourceMemberWriterReadCut) func() {
	borrow := q.stagedWriter
	if !q.liveStagedWriterSource(borrow, cut) || get == nil {
		return func() {}
	}
	previousGet, previousRead := borrow.get, borrow.read
	borrow.get, borrow.read = get, cut
	return func() {
		if borrow.issuer == nil {
			borrow.get, borrow.read = nil, nil
		} else {
			borrow.get, borrow.read = previousGet, previousRead
		}
	}
}

// publishStagedWriterSource is called only by memberValuesAtGet, before RHS
// recovery. The original owner supplies receiver match and replacement/order
// disposition. Callback acceptance cannot erase opacity or settle the selected
// Get. A copied query or a revoked/nested loan cannot skip legacy recovery.
func (q *sourceValueQuery) publishStagedWriterSource(get *sourceGetInputs, cut *sourceMemberWriterReadCut, assignment sourceValueAssignment, input sourceMemberWriterInput, origin *ast.Node, projection []string, certain, unordered bool, retain ...func(sourceValue)) bool {
	borrow := q.stagedWriter
	if !q.liveStagedWriterSource(borrow, cut) || borrow.publishing || get == nil || borrow.get != get || borrow.read != cut || assignment.left == nil || assignment.right == nil || origin == nil {
		return false
	}
	write := assignment.left.Parent
	if write == nil || !ast.IsBinaryExpression(write) || write.AsBinaryExpression().Left != assignment.left || write.AsBinaryExpression().Right != assignment.right || write.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return false
	}
	observation := q.relativeInputCut(get.operation)
	read := sourceRelativeCut{operation: cut.operation, use: cut.use, reading: cut.use}
	receipt := sourceStagedWriterRead{write: write, region: enclosingCallableNode(write), call: input.call, origin: origin, get: cut.operation, readCut: read, observation: observation, certain: certain, unordered: unordered, incomplete: input.incomplete, projection: append([]string(nil), projection...)}
	receipt.value = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: assignment.right, producer: write, get: assignment.left, creation: input.call, cut: observation}
	if input.writerInputs != nil {
		receipt.invocation = cloneStagedWriterInvocation(input.writerInputs.invocation)
		receipt.bound = cloneSourceRelativeBoundInputs(input.writerInputs.bound)
	}
	receipt.rhs = describeStagedWriterStoredRHS(assignment.right, receipt.region, receipt.bound, q.owner)
	borrow.publishing = true
	borrow.current = &receipt
	borrow.currentInput = &input
	defer func() {
		borrow.publishing, borrow.current, borrow.currentInput, borrow.currentProjection, borrow.projectedScopes = false, nil, nil, nil, nil
	}()
	accepted := borrow.publish(cloneStagedWriterRead(receipt))
	if !q.liveStagedWriterSource(borrow, cut) || q.relativeInputCut(get.operation) != observation || borrow.get != get || borrow.read != cut {
		return false
	}
	if borrow.consumeProjection != nil {
		// A passive registered source may retain input delivery before adoption.
		// Only an owning consumer can replace the original RHS result path.
		var prefix []func(sourceValue)
		if accepted {
			prefix = retain
		}
		projection := produceStagedWriterProjection(q, assignment, input, prefix...)
		if q.liveStagedWriterSource(borrow, cut) && borrow.current == &receipt {
			borrow.currentProjection = &projection
			borrow.consumeProjection(projection)
			borrow.currentProjection = nil
		}
	}
	return accepted
}

// sourceStagedWriterInputs is detached only after the original binder has
// projected its already-acquired actuals at their creating Call. It never keeps
// sourceValueInputs, acquired scopes or the original bindings map.
type sourceStagedWriterInputs struct {
	edge *sourceRelativeInputEdge // real original binder event, never retained on a source recipe

	invocation sourceRelativeInvocation
	bound      sourceRelativeBoundInputs
}

func cloneStagedWriterInvocation(invocation sourceRelativeInvocation) sourceRelativeInvocation {
	invocation.actuals = append([]sourceRelativeActual(nil), invocation.actuals...)
	for index := range invocation.actuals {
		invocation.actuals[index].endpoint = cloneSourceRelativeEndpoint(invocation.actuals[index].endpoint)
	}
	invocation.receiver = cloneSourceRelativeEndpoint(invocation.receiver)
	invocation.captures = append([]sourceRelativeBinding(nil), invocation.captures...)
	for index := range invocation.captures {
		invocation.captures[index] = cloneSourceRelativeBinding(invocation.captures[index])
	}
	return invocation
}

func cloneStagedWriterRead(read sourceStagedWriterRead) sourceStagedWriterRead {
	read.value = cloneSourceRelativeEndpoint(read.value)
	read.projection = append([]string(nil), read.projection...)
	read.invocation = cloneStagedWriterInvocation(read.invocation)
	read.bound = cloneSourceRelativeBoundInputs(read.bound)
	read.rhs.bindings = append([]sourceRelativeBinding(nil), read.rhs.bindings...)
	for i := range read.rhs.bindings {
		read.rhs.bindings[i] = cloneSourceRelativeBinding(read.rhs.bindings[i])
	}
	return read
}
