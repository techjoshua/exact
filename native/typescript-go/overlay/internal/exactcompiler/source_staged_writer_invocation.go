package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedWriterInvocation belongs to one work graph. Source alternatives
// remain in immutable recipes, while real creating/later B edges and delivery
// status expire with this graph. Body availability alone never closes the Call.
type sourceStagedWriterInvocation struct {
	alternative               sourceStagedOperationAlternative
	declaration               *ast.Node
	edge                      string
	inputs, creating          *sourceRelativeInputEdge
	inputsMapped, transferred bool
}

// sourceStagedWriterSourceInputs retains original binder receipts before a
// consumer adopts a source. It contains neither a query nor an acquired scope.
// Registration cannot invoke bodies. A new work graph must receive original
// input publication again, even when its descriptive projection was cloned.
type sourceStagedWriterSourceInputs struct {
	generation *projectGeneration
	methods    []sourceStagedWriterInvocation
}

func (work *callableEffectWork) recordWriterMethodInputs(facts []callableFacts, source *sourceStagedWriterProjectionSource, q *sourceValueQuery, alternative sourceStagedOperationAlternative, owner *executableBodyOwner) {
	body := alternative.endpoint.expression
	if source == nil || !source.callable || q == nil || body == nil || !ast.IsFunctionLike(body) || body.Body() == nil || len(alternative.endpoint.projection) != 0 {
		return
	}
	packet := work.writerSourceInputs[source.request.producer]
	if packet == nil || packet.generation != source.generation {
		return
	}
	for _, old := range packet.methods {
		if sameOperationAlternative(old.alternative, alternative) {
			return
		}
	}
	target, known := work.memberNodes[body]
	if !known {
		return
	}
	consumer := work.memberNodes[source.request.consumer]
	edge := fmt.Sprintf("%s:invoked:%d:%d", source.request.edge, body.Pos(), len(packet.methods))
	work.requireStagedSummary(facts, consumer, target, edge, source.parent.producer.operation, source.parent.cut)
	requirement := sourceStagedWriterInvocation{alternative: alternative, declaration: body, edge: edge}
	// Original summary membership precedes the real receiver/argument binder.
	inputs, delivered := q.bindStagedWriterMethodInputs(alternative, source.parent.producer.operation)
	requirement.inputs = inputs
	if current := q.stagedWriter.currentInput; current != nil && current.writerInputs != nil {
		requirement.creating = current.writerInputs.edge
	}
	if delivered {
		work.bindWriterCaptureRoles(facts[target], q.stagedWriter.current, requirement.creating, inputs, owner)
		requirement.inputsMapped = writerMethodInputsMapped(facts[target], inputs, owner)
	}
	packet.methods = append(packet.methods, requirement)
}

// adoptWriterSourceInputs transfers graph-local input receipts onto the already
// issued operation. Required membership was registered before the original B.
// It does not reacquire a callee, receiver, argument or creating invocation.
func (work *callableEffectWork) adoptWriterSourceInputs(facts []callableFacts, id sourceStagedOperationID) {
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].writer
	packet := work.writerSourceInputs[state.key]
	if source == nil || !source.callable || packet == nil || packet.generation != source.generation || packet.generation != work.operationGeneration {
		return
	}
	state.writerProjectionSeen = true
	for _, method := range packet.methods {
		present := false
		for _, prior := range state.writerMethods {
			present = present || sameOperationAlternative(prior.alternative, method.alternative)
		}
		if !present {
			state.writerMethods = append(state.writerMethods, method)
		}
	}
}

func (work *callableEffectWork) bindWriterCaptureRoles(body callableFacts, read *sourceStagedWriterRead, creating, inputs *sourceRelativeInputEdge, owner *executableBodyOwner) {
	for _, demand := range body.staged.invoked {
		if demand.role.kind != relativeRoleCapture {
			continue
		}
		binding := sourceRelativeBinding{target: demand.role, unknown: true}
		if formal, ok := fieldGetterCaptureFormal(demand.role, read.region, owner); ok && creating != nil && creating.delivered && creating.request.declaration == read.region && creating.request.operation == read.call {
			plan := substituteSourceRelativeInvokedInput(creating.relative, formal, nil)
			if plan.unsupported == relativeInputsSupported && len(plan.bindings) == 1 {
				binding = cloneSourceRelativeBinding(plan.bindings[0])
				binding.target = demand.role
			}
		}
		inputs.relative.bindings = append(inputs.relative.bindings, binding)
	}
}

// This is capability completion, not source admission. Every known body keeps
// its required summary even when receiver/default/rest/capture work is open.
func writerMethodInputsMapped(body callableFacts, inputs *sourceRelativeInputEdge, owner *executableBodyOwner) bool {
	if inputs == nil || !inputs.delivered || inputs.relative.unsupported != relativeInputsSupported {
		return false
	}
	mapped := true
	walkNode(body.node.Body(), func(node *ast.Node) bool {
		if node != body.node.Body() && ast.IsFunctionLike(node) {
			return false
		}
		if node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword {
			mapped = false
			return false
		}
		if !ast.IsIdentifier(node) || isStaticPropertyName(node) || ast.IsDeclarationName(node) {
			return mapped
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil {
			return mapped
		}
		declaration := symbol.ValueDeclaration
		file := ast.GetSourceFileOfNode(declaration)
		ambient := ast.IsFunctionDeclaration(declaration) && declaration.Body() == nil && declaration.Parent != nil && ast.IsSourceFile(declaration.Parent)
		if enclosingCallableNode(declaration) != body.node && file != nil && !file.IsDeclarationFile && !ambient {
			role := sourceRelativeRole{kind: relativeRoleCapture, declaration: body.node, binding: declaration}
			plan := substituteSourceRelativeInvokedInput(inputs.relative, role, nil)
			mapped = plan.unsupported == relativeInputsSupported && len(plan.bindings) == 1
			for _, binding := range plan.bindings {
				mapped = mapped && !binding.unknown && len(binding.pending) == 0
				for _, endpoint := range binding.sources {
					mapped = mapped && len(endpoint.projection) == 0 && (endpoint.kind == relativeEndpointUndefined || endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal || endpoint.kind == relativeEndpointExpression && endpoint.creation == nil && endpoint.returning == nil && isWriterInputCallable(endpoint.expression))
				}
			}
		}
		return mapped
	})
	// Eager Get/Call argument protocols have independent producers. The current
	// original binder does not turn an unresolved output into body reachability.
	for _, actual := range inputs.request.actuals {
		if actual.endpoint.kind == relativeEndpointResult || actual.spread {
			return false
		}
	}
	return mapped
}

func (work *callableEffectWork) deliverWriterMethods(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	state := &work.operations[id.index]
	source := work.operationRecipes[state.key].writer
	if source == nil || !source.callable {
		return
	}
	if parent := work.operationRecipes[source.parent.producer].constructed; parent != nil {
		// DATA dependencies may adopt this role before the original Call is
		// reached. Only its ordinary source wrapper can activate method bodies.
		reached := false
		for _, use := range facts[work.memberNodes[source.request.consumer]].staged.operationUses {
			reached = reached || sameOperationRequest(use.request, parent.request)
		}
		if !reached {
			return
		}
	}
	for index := range state.writerMethods {
		method := &state.writerMethods[index]
		target, known := work.memberNodes[method.declaration]
		if !known || method.transferred || !method.inputsMapped || !facts[target].staged.ready {
			continue
		}
		consumer := work.memberNodes[source.request.consumer]
		work.operationInvocationOnEdge(facts, consumer, target, source.parent.producer.operation, source.parent.cut, method.edge)
		method.transferred = true
	}
}

func (work *callableEffectWork) writerProjectionInvocationsCovered(state *sourceStagedOperationState) bool {
	if !state.writerProjectionSeen {
		return false
	}
	for _, alternative := range state.delta.exposures {
		found := false
		for _, method := range state.writerMethods {
			found = found || sameOperationAlternative(method.alternative, alternative) && method.inputsMapped && method.transferred
		}
		if !found {
			return false
		}
	}
	return true
}
