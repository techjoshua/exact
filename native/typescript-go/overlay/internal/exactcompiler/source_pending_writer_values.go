package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceWriterValue records an original Set's source-only formal substitution.
// The producer function remains conditional. No live input, captured scope,
// current value, normal result or permission to execute a stored callback escapes.
type sourceWriterValue struct {
	producer, operation, write, receiver, donor *ast.Node
}

type sourceWriterGet struct {
	use  *ast.Node
	cuts [4]*ast.Node

	consumer, call, write, origin, receiver *ast.Node
}

// publishSourceSetterWrite consumes the binding produced by the original Set.
// Only module-capture-only functions and a readonly module receiver are detached.
// Factory/this/parameter captures keep their original query-owned mapping.
func (q *sourceValueQuery) publishSourceSetterWrite(node *ast.Node, inputs *sourceValueInputs) {
	if node != nil && node.Parent != nil && ast.IsBinaryExpression(node.Parent) && node.Parent.AsBinaryExpression().Left == node {
		node = node.Parent
	}
	request := q.setterInput
	if !q.dependenciesOnly || q.operation != nil || q.executable == nil || inputs == nil || inputs.declaration == nil || !ast.IsSetAccessorDeclaration(inputs.declaration) || request == nil || enclosingCallableNode(request.target) != q.effectOwner || !ast.IsBinaryExpression(node) || node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return
	}
	if q.effectOwner == nil || (!ast.IsFunctionDeclaration(q.effectOwner) && !ast.IsFunctionExpression(q.effectOwner) && !ast.IsArrowFunction(q.effectOwner)) || len(q.effectOwner.Parameters()) != 0 || enclosingCallableNode(q.effectOwner) != nil || !q.sourceReceiverInputsLive(inputs, inputs.declaration) {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	graph := q.executable.writerInputFacts[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil || graph == nil || !graph.memberCaptureSyntaxOnly(q, q.effectOwner) {
		return
	}
	assignment := node.AsBinaryExpression()
	left, right := unwrapSourceCallableReference(assignment.Left), unwrapSourceCallableReference(assignment.Right)
	if left == nil || !ast.IsPropertyAccessExpression(left) || right == nil || !ast.IsIdentifier(right) {
		return
	}
	receiver := q.writerModuleReceiver(left.Expression())
	if receiver == nil {
		return
	}
	symbol := q.owner.checker.GetSymbolAtLocation(right)
	if symbol == nil {
		return
	}
	for _, value := range inputs.bindings[ast.GetSymbolId(symbol)] {
		if !isWriterInputCallable(value.node) || len(value.path) != 0 || !graph.memberCaptureSyntaxOnly(q, value.node) || !pendingMemberSourceCapture(q, value.capture) {
			continue
		}
		contribution := sourceWriterValue{producer: q.effectOwner, operation: request.operation, write: left, receiver: receiver, donor: value.node}
		if q.executable.writerValues == nil {
			q.executable.writerValues = make(map[sourceWriterValue]struct{})
		}
		if _, exists := q.executable.writerValues[contribution]; !exists {
			q.executable.writerValues[contribution] = struct{}{}
			if publisher.fact.pendingMembers == nil {
				publisher.fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
			}
			publisher.fact.pendingMembers.stats.WriterValuePublications++
		}
	}
}

func (q *sourceValueQuery) writerModuleReceiver(expression *ast.Node) *ast.Node {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != nil || q.owner.bindingWritten(symbol) {
		return nil
	}
	return symbol.ValueDeclaration
}

// pendingWriterGet registers the original Get before a setter's unresolved
// formal can lose its known donor. Fact work later consumes mapped source
// contributions. Registration itself grants no coverage or returned value.
func (q *sourceValueQuery) pendingWriterGet(assignment sourceValueAssignment, origin *ast.Node, bindings sourceValueBindings, get *sourceGetInputs) {
	if !q.dependenciesOnly || q.executable == nil || q.inputs != nil || q.operation != nil || len(bindings) != 0 || len(q.creators) != 0 || get == nil || get.receiver.native == nil || get.receiver.native.kind != sourceNativeWeakMapSourceInstance {
		return
	}
	member := q.protectedMember
	writer := enclosingCallableNode(assignment.left)
	if member == nil || member.Parent == nil || !ast.IsCallExpression(member.Parent) || writer == nil || !ast.IsSetAccessorDeclaration(writer) {
		return
	}
	receiver, _ := accessorReceiver(assignment.left)
	declaration := q.writerModuleReceiver(receiver)
	if declaration == nil || unwrapSourceCallableReference(declaration.Initializer()) != origin {
		return
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact == nil {
		return
	}
	if publisher.fact.pendingMembers == nil {
		publisher.fact.pendingMembers = &sourcePendingMemberLedger{sites: make(map[*ast.Node]*sourcePendingMemberDemand)}
	}
	ledger := publisher.fact.pendingMembers
	if ledger.writerGets == nil {
		ledger.writerGets = make(map[sourceWriterGet]struct{})
	}
	demand := sourceWriterGet{consumer: q.effectOwner, call: member.Parent, write: assignment.left, origin: origin, receiver: declaration, use: q.effectUse(), cuts: [4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}}
	if _, exists := ledger.writerGets[demand]; !exists {
		ledger.writerGets[demand] = struct{}{}
		ledger.stats.WriterValueSubscriptions++
	}
}

// consumeSourceWriterValues runs in the existing effect fixed point before SCC
// discovery. A reached module invocation edge is required. Mere callback exposure
// or a dormant producer cannot activate a donor. Source scopes are never replayed.
func consumeSourceWriterValues(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || len(owner.writerValues) == 0 {
		return
	}
	targets := make(map[*ast.Node]int, len(facts))
	for i := range facts {
		targets[facts[i].node] = i
	}
	for i := range facts {
		fact := &facts[i]
		if fact.pendingMembers == nil {
			continue
		}
		for demand := range fact.pendingMembers.writerGets {
			for contribution := range owner.writerValues {
				if contribution.write != demand.write || contribution.receiver != demand.receiver {
					continue
				}
				reached := false
				for j := range facts {
					caller := &facts[j]
					if !runtimeModuleEvaluation(caller.node) || caller.sourceFile != fact.sourceFile {
						continue
					}
					for _, edge := range caller.summary.Calls {
						// This is an existing invocation/effect edge, not an
						// exposure edge. Higher-order source calls already
						// resolved by that owner need no new callee lookup.
						if index, exists := targets[contribution.producer]; exists {
							reached = reached || edge.Resolved && edge.TargetID == facts[index].summary.ID
						}
					}
				}
				if !reached {
					continue
				}
				bindings := receiverBindingsForCall(demand.call.AsCallExpression(), fact.node, owner.checker)
				part := accessorCandidates{effects: []sourceCallableEffect{{operation: demand.call, declaration: contribution.donor, receivers: &sourceEffectReceivers{owner: fact.node, bindings: bindings}}}}
				before := len(fact.summary.Calls)
				appendAccessorTargets(fact, demand.call, part, targets, fact.sourceFile)
				if len(fact.summary.Calls) != before {
					fact.pendingMembers.stats.WriterValueDeliveries++
				}
			}
		}
	}
}
