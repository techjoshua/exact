package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceTaskEffectsReference describes an original task callee, not acquired
// closure DATA. Only the owning collector can turn it into an Effects decision.
// It carries no actual inputs, creating B, result, receipt or invocation frame.
type sourceTaskEffectsReference struct {
	component, call, read, binding, task *ast.Node
	generation                           *projectGeneration
}

type sourceTaskEffectsOutcome uint8

const (
	sourceTaskEffectsUnowned sourceTaskEffectsOutcome = iota
	sourceTaskEffectsOwned
)

// describeTaskEffectsReference recognizes an unused, zero-actual task call in
// its original component activation. Only task arrows share that lexical this. The sole parameter must be the existing
// authenticated erased policy. Ordinary defaults and closure values stay owned
// by their original consumers, even when their syntax resembles a task.
func describeTaskEffectsReference(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) (sourceTaskEffectsReference, bool) {
	var out sourceTaskEffectsReference
	if fact == nil || fact.sourceFile == nil || owner == nil || owner.values == nil || owner.values.program == nil || owner.checker == nil || owner.values.checker != owner.checker || owner.values.generation == nil || fact.normalInputs != nil || fact.initializerPlan != nil || call == nil || !ast.IsCallExpression(call) || !sourceStagedOccurrenceOwned(call, fact.node) || call.AsCallExpression().QuestionDotToken != nil || call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 {
		return out, false
	}
	bindings, component := owner.values.components[fact.node]
	if !component || bindings.checker != owner.checker || owner.values.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile || ast.GetSourceFileOfNode(call) != fact.sourceFile {
		return out, false
	}
	outer := call
	for outer.Parent != nil && ast.IsParenthesizedExpression(outer.Parent) {
		outer = outer.Parent
	}
	if outer.Parent == nil || !ast.IsExpressionStatement(outer.Parent) {
		return out, false
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope {
		return out, false
	}
	read := call.Expression()
	if !ast.IsIdentifier(read) {
		return out, false
	}
	symbol := owner.checker.GetSymbolAtLocation(read)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || len(symbol.Declarations) != 1 || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
		return out, false
	}
	binding := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(binding) || binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Initializer() == nil || binding.End() > call.Pos() || enclosingCallableNode(binding) != fact.node || !sourceStagedOccurrenceOwned(binding, fact.node) {
		return out, false
	}
	task := binding.Initializer()
	if !ast.IsArrowFunction(task) || task.Body() == nil || enclosingCallableNode(task.Parent) != fact.node || len(task.Parameters()) != 1 {
		return out, false
	}
	policy := task.Parameters()[0]
	if policy.Name() == nil || !ast.IsIdentifier(policy.Name()) || policy.AsParameterDeclaration().DotDotDotToken != nil || owner.values.erasedTaskPolicyParameter(task) != policy {
		return out, false
	}
	if _, selected := owner.body(read); selected {
		return out, false
	}
	return sourceTaskEffectsReference{component: fact.node, call: call, read: read, binding: binding, task: task, generation: owner.values.generation}, true
}

func taskReferenceEffectsEdge(fact *callableFacts, call *ast.Node) string {
	return fmt.Sprintf("%s:task-effects:%d", fact.summary.ID, call.Pos())
}

// ownTaskReferenceEffects issues only an original Call's canonical MAY Effects
// dependency. The task body, capture Gets and unknown contributions keep their
// own extraction and publication obligations. No closure DATA is completed.
func (work *callableEffectWork) ownTaskReferenceEffects(facts []callableFacts, caller int, reference sourceTaskEffectsReference, owner *executableBodyOwner) sourceTaskEffectsOutcome {
	if work == nil || caller < 0 || caller >= len(facts) || work.extracting != caller {
		return sourceTaskEffectsUnowned
	}
	fact := &facts[caller]
	current, valid := describeTaskEffectsReference(fact, reference.call, owner)
	if !valid || current != reference {
		return sourceTaskEffectsUnowned
	}
	publisher := owner.pendingMemberPublishers[fact.node]
	target, known := work.memberNodes[reference.task]
	if publisher == nil || !publisher.live || publisher.fact != fact || !known || target < 0 || target >= len(facts) || facts[target].node != reference.task {
		return sourceTaskEffectsUnowned
	}
	bodyPublisher := owner.pendingMemberPublishers[reference.task]
	if bodyPublisher == nil || !bodyPublisher.live || bodyPublisher.fact != &facts[target] {
		return sourceTaskEffectsUnowned
	}
	edge := taskReferenceEffectsEdge(fact, reference.call)
	work.operationInvocationOnEdge(facts, caller, target, reference.call, sourceRelativeCut{operation: reference.call, reading: reference.call}, edge)
	if fact.fieldEdgeOperations == nil {
		fact.fieldEdgeOperations = make(map[string]*ast.Node)
	}
	fact.fieldEdgeOperations[edge] = reference.call
	if fact.callExpressions == nil {
		fact.callExpressions = make(map[string]*ast.Node)
	}
	fact.callExpressions[edge] = reference.read
	return sourceTaskEffectsOwned
}

// prepareTaskReferenceEffects rebuilds required summary memberships after graph
// cloning. Existing source edges describe the decision; current owners recheck
// it before any revision can satisfy publication. No queued query or frame is
// retained and an expired association remains an invalid required dependency.
func (work *callableEffectWork) prepareTaskReferenceEffects(facts []callableFacts, owner *executableBodyOwner) {
	work.indexCallableFactNodes(facts)
	for caller := range facts {
		fact := &facts[caller]
		for _, edge := range fact.summary.Calls {
			if !strings.HasPrefix(edge.ID, fact.summary.ID+":task-effects:") {
				continue
			}
			call := fact.fieldEdgeOperations[edge.ID]
			reference, valid := describeTaskEffectsReference(fact, call, owner)
			target, known := work.memberNodes[reference.task]
			var publisher, bodyPublisher *sourcePendingMemberPublisher
			if owner != nil {
				publisher = owner.pendingMemberPublishers[fact.node]
				bodyPublisher = owner.pendingMemberPublishers[reference.task]
			}
			valid = valid && publisher != nil && publisher.live && publisher.fact == fact && known && target >= 0 && target < len(facts) && bodyPublisher != nil && bodyPublisher.live && bodyPublisher.fact == &facts[target] && edge.Resolved && edge.TargetID == facts[target].summary.ID && edge.ID == taskReferenceEffectsEdge(fact, call)
			if !valid {
				target = caller
			}
			work.requireStagedSummary(facts, caller, target, edge.ID, call, sourceRelativeCut{operation: call, reading: call})
			if !valid {
				work.stagedRequired[sourceStagedDependencyKey{caller, edge.ID}].invalid = true
			}
		}
	}
}
