package exactcompiler

// publishStagedWriterCreatingInputs is called by the original binder after
// installing all parameters. It subscribes to that same binding event, without
// replaying argument acquisition. The edge carries descriptions only. The
// selected source/activation owner must still correlate it to an actual writer.
func (q *sourceValueQuery) publishStagedWriterCreatingInputs(inputs *sourceValueInputs) {
	if q.stagedWriter == nil || q.stagedWriter.issuer != q || q.stagedWriter.owner != q.owner || q.stagedWriter.generation != q.owner.generation || inputs.writerInvocation == nil || q.relativeInputBinding != inputs || q.stagedWriter.methodReceiver != nil {
		return
	}
	request := cloneStagedWriterInvocation(*inputs.writerInvocation)
	if request.cut != q.relativeInputCut(request.operation) {
		return
	}
	edge := &sourceRelativeInputEdge{}
	revoke, installed := q.beginSourceRelativeInputRequest(request, edge)
	if !installed {
		return
	}
	defer revoke()
	q.publishSourceRelativeBoundInputs(inputs)
	if edge.delivered {
		inputs.writerEdge = edge
	}
}

// publishSourceRelativeBoundInputs belongs to this original binding event. A
// copied request or detached input description cannot invoke the consumer.
func (q *sourceValueQuery) publishSourceRelativeBoundInputs(inputs *sourceValueInputs) {
	if q.relativeInputBinding != inputs {
		return
	}
	if request := q.relativeInputRequest; request != nil && q.relativeInputIssuer == q && q.relativeInputConsumer != nil && request.declaration == inputs.declaration && request.operation == inputs.invocation {
		q.relativeInputConsumer(describeSourceRelativeBoundInputs(q, inputs, *request))
	}
}

// publishOriginalSourceInputs is the original binder's synchronous publication
// interval. All supplied/default inputs are already installed; this performs no
// acquisition or binding. Ordinary and native-protocol binders use one owner.
func (q *sourceValueQuery) publishOriginalSourceInputs(inputs *sourceValueInputs) {
	previous := q.relativeInputBinding
	q.relativeInputBinding = inputs
	defer func() { q.relativeInputBinding = previous }()
	q.publishSourceRelativeBoundInputs(inputs)
	q.publishStagedWriterCreatingInputs(inputs)
}
