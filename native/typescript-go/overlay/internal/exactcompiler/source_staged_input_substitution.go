package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedInputSubstitution describes entry-role relationships for one
// original lexical Call. It is deliberately not sourceRelativeInputEdge: no
// synchronous binder delivery, acquired value, default decision, current binding
// state or completed capture activation is claimed. Member/result consumers use
// these relationships only after their own required producers are registered.
type sourceStagedInputSubstitution struct {
	invocation sourceRelativeInvocation
	bindings   sourceRelativeBoundInputs
}

// describeStagedInputSubstitution authenticates a source lexical declaration and
// an ordered direct vector without acquiring its inputs. Source expressions keep
// their original argument observation, not the later member's read cut. Effects
// and result selection remain separate required demands on the existing queue.
func describeStagedInputSubstitution(call, consumer *ast.Node, bodyOwner *executableBodyOwner) (*sourceStagedInputSubstitution, bool) {
	return describeStagedDeclarationInputs(call, consumer, bodyOwner, false)
}

// describeStagedDeclarationEffectsInputs also describes a direct declaration in
// the caller's own lexical activation. Only Effects uses this wider source
// domain: returned DATA, creating inputs and demanded captures keep their own
// producers. In particular this does not reconstruct an enclosing scope.
func describeStagedDeclarationEffectsInputs(call, consumer *ast.Node, bodyOwner *executableBodyOwner) (*sourceStagedInputSubstitution, bool) {
	return describeStagedDeclarationInputs(call, consumer, bodyOwner, true)
}

func describeStagedDeclarationInputs(call, consumer *ast.Node, bodyOwner *executableBodyOwner, nestedEffects bool) (*sourceStagedInputSubstitution, bool) {
	if bodyOwner == nil {
		return nil, false
	}
	owner := bodyOwner.values
	if owner == nil || owner.checker == nil || owner.program == nil || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsIdentifier(call.Expression()) || !sourceStagedOccurrenceOwned(call, consumer) {
		return nil, false
	}
	source := ast.GetSourceFileOfNode(call)
	if source == nil || source.IsDeclarationFile || !ast.IsExternalModule(source) || owner.program.GetSourceFile(source.FileName()) != source {
		return nil, false
	}
	symbol, declaration := stagedLexicalFunctionImplementation(call.Expression(), bodyOwner)
	if symbol == nil || declaration == nil {
		return nil, false
	}
	if !ast.IsFunctionDeclaration(declaration) || declaration.Parent != source.AsNode() && (!nestedEffects || !stagedDeclarationEffectsOwner(declaration, consumer)) || declaration.Body() == nil || !envelopeSynchronousFunction(declaration) {
		return nil, false
	}
	if async, ordinary := ordinaryResultCategory(declaration); async || !ordinary {
		return nil, false
	}
	index := owner.index(source)
	if index.incomplete || index.normalDynamicScope || owner.bindingWritten(symbol) {
		return nil, false
	}
	for _, parameter := range declaration.Parameters() {
		if symbol := owner.checker.GetSymbolAtLocation(parameter.Name()); symbol == nil || owner.bindingWritten(symbol) {
			return nil, false
		}
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return nil, false
		}
	}
	invocation := sourceRelativeInvocation{declaration: declaration, operation: call, use: call, actualsKnown: true, cut: sourceRelativeCut{operation: call, use: call, reading: call}, receiver: sourceRelativeEndpoint{kind: relativeEndpointUndefined}}
	for ordinal, argument := range restrictedInvocationArguments(call.AsCallExpression()) {
		if ast.IsSpreadElement(argument) {
			return nil, false
		}
		endpoint := sourceStagedArgumentEndpoint(argument, call, consumer, owner)
		invocation.actuals = append(invocation.actuals, sourceRelativeActual{expression: argument, endpoint: endpoint, ordinal: ordinal})
	}
	plan := planSourceRelativeInputs(invocation, owner)
	if plan.unsupported != relativeInputsSupported {
		return nil, false
	}
	bindings := sourceRelativeBoundInputs{declaration: declaration, operation: call, use: call, cut: invocation.cut, bindings: plan.bindings}
	return &sourceStagedInputSubstitution{invocation: invocation, bindings: bindings}, true
}

// stageSourceDeclarationCall issues an Effects edge at the original occurrence.
// Child evaluation stays on the original collector. Entry associations use M03's
// source planner and do not acquire Call output or manufacture binder delivery.
// The already-covered terminal B path retains its existing owner until its
// additional receiver/default/capture consumers are consolidated.
func (work *callableEffectWork) stageSourceDeclarationCall(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) bool {
	fact := &facts[caller]
	outer := call
	for outer.Parent != nil && unwrapSourceCallableReference(outer.Parent) == call {
		outer = outer.Parent
	}
	if parent := outer.Parent; parent != nil {
		if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return false
		}
		if ast.IsTemplateSpan(parent) || ast.IsPrefixUnaryExpression(parent) && parent.AsPrefixUnaryExpression().Operator != ast.KindExclamationToken {
			return false
		}
	}
	if fact.normalInputs != nil || fact.initializerPlan != nil || owner == nil || owner.values == nil {
		return false
	}
	if _, old := stageDeclarationCall(fact, call, owner.checker, owner); old == stagedCallSupported {
		return false
	}
	source, ok := describeStagedDeclarationEffectsInputs(call, fact.node, owner)
	if ok && localArrayGetterInputMayWrite(source, fact.node, owner.values) {
		return false
	}
	if !ok {
		// An ordinary Effects request can forward source roles, but cannot
		// take over the original binder needed by a lexical default.
		if work.purpose == callableMayEffects {
			return false
		}
		// A nonterminal lexical default Call needs the same original B as a
		// terminal Call. Neither the passive planner nor its result reader may
		// select defaults or bind on the collector's behalf.
		invocation, gap := describeStagedDeclarationInvocation(fact, call, owner.checker, owner)
		if gap != stagedCallSupported || !stagedLexicalDefaultDeclaration(invocation.declaration, owner.values) {
			return false
		}
		target, found := work.memberNodes[invocation.declaration]
		if !found {
			return false
		}
		edge, delivered := bindStagedDeclarationInputs(fact, invocation, owner)
		return delivered && work.deferDeclarationCall(facts, caller, target, edge.request, edge)
	}
	target, found := work.memberNodes[source.invocation.declaration]
	if !found || !work.deferDeclarationCall(facts, caller, target, source.invocation, nil) {
		return false
	}
	facts[caller].staged.calls[len(facts[caller].staged.calls)-1].sourceInputs = source
	return true
}

// prepareSourceInputProjection registers a non-Get DATA reading lent by this
// graph's exact source-input or delivered-B association. It does not wait for
// DATA or claim that the binder ran. The typed use retains required closure.
func (work *callableEffectWork) prepareSourceInputProjection(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint, owner *executableBodyOwner) bool {
	reading, registered := work.prepareStagedInputCallResult(facts, caller, call, endpoint, owner)
	return registered && work.registerOperationUse(facts, sourceStagedOperationUse{request: reading})
}

type sourceProjectedInput struct {
	alternatives []sourceStagedOperationAlternative
	pending      bool
	owned        bool
}

// requireSourceInputProjection consumes the existing subscriber's cumulative
// DATA prefix. Known alternatives are usable before independent producer work
// closes. The typed operation use preserves that work through normal queue and
// publication ownership. Cursor delivery is never consumed a second time here.
func (work *callableEffectWork) requireSourceInputProjection(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint, owner *executableBodyOwner) sourceProjectedInput {
	reading, registered := work.prepareStagedInputCallResult(facts, caller, call, endpoint, owner)
	if !registered || !work.registerOperationUse(facts, sourceStagedOperationUse{request: reading}) {
		work.retainSourceInputProjectionGap(facts, caller, call, endpoint)
		return sourceProjectedInput{pending: true}
	}
	// Forwarded formal demands can first reach this producer during the relative
	// phase. Drain only the existing guarded operation owner, never bind/replay an
	// argument or execute the factory from this consumer.
	work.prepareOperationUses(facts, owner)
	delivery, available := work.stagedInputCallResultData(facts, reading)
	if !available {
		return sourceProjectedInput{pending: true, owned: true}
	}
	return sourceProjectedInput{alternatives: delivery.delta.exposures, pending: !delivery.delta.extracted, owned: true}
}

// retainSourceInputProjectionGap records a genuinely unmigrated input/result
// protocol. A source unknown is not invented from unavailable DATA or captures.
// This debt is deliberately not discharged by the callee's Effects summary.
func (work *callableEffectWork) retainSourceInputProjectionGap(facts []callableFacts, caller int, call sourceStagedDeclarationCall, endpoint sourceRelativeEndpoint) {
	producer := caller
	if endpoint.expression != nil {
		declaration := enclosingCallableNode(endpoint.expression)
		if index, found := work.memberNodes[declaration]; found {
			producer = index
		}
	}
	edge := fmt.Sprintf("%s:input-projection:%d:%p", facts[caller].summary.ID, call.invocation.operation.Pos(), endpoint.expression)
	work.requireStagedSummary(facts, caller, producer, edge, call.invocation.operation, endpoint.cut)
	work.stagedRequired[sourceStagedDependencyKey{caller, edge}].projectionPending = true
}

// sourceProjectedCallableInputsMapped admits the body-only invocation domain.
// DATA creation does not supply receiver, default/rest or captured inputs. Those
// roles need their own real source association before this consumer can invoke.
func sourceProjectedCallableInputsMapped(declaration *ast.Node, owner *executableBodyOwner) bool {
	if declaration == nil || !isWriterInputCallable(declaration) || declaration.Body() == nil || len(declaration.Parameters()) != 0 {
		return false
	}
	async, ordinary := ordinaryResultCategory(declaration)
	return !async && ordinary && stagedFieldGetterInputsMapped(declaration, nil, owner)
}

// sourceProjectedReturnedInvocation keeps the factory's delivered creating edge
// separate from the actual invoked-formal Call. It validates only the existing
// captured-input domain; no later binder, receiver or completed local is supplied.
func sourceProjectedReturnedInvocation(alternative sourceStagedOperationAlternative, invoked sourceRelativeInvokedInput, demands []sourceRelativeInvokedInput, owner *executableBodyOwner) (sourceStagedReturnedInvocation, bool) {
	var out sourceStagedReturnedInvocation
	literal, operation := alternative.endpoint.expression, invoked.origin
	if owner == nil || owner.values == nil || literal == nil || !isWriterInputCallable(literal) || literal.Body() == nil || len(literal.Parameters()) != 0 || operation == nil || !ast.IsCallExpression(operation) || operation.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(operation.AsCallExpression())) != 0 || invoked.kind != relativeDemandEffects || invoked.cut.operation != operation {
		return out, false
	}
	if async, ordinary := ordinaryResultCategory(literal); async || !ordinary {
		return out, false
	}
	later := sourceRelativeInvocation{declaration: literal, operation: operation, use: invoked.cut.use, actualsKnown: true, cut: invoked.cut}
	captured := false
	for _, demand := range demands {
		if demand.role.kind != relativeRoleCapture {
			continue
		}
		captured = true
		plan := planStagedReturnedCaptureInvocation(alternative, demand, later, owner.values)
		if plan.unsupported != relativeInputsSupported {
			return out, false
		}
		for _, binding := range plan.bindings {
			if len(binding.pending) != 0 {
				return out, false
			}
		}
	}
	if !captured {
		return out, false
	}
	return sourceStagedReturnedInvocation{alternative: alternative, later: later}, true
}

// stagedDeclarationEffectsOwner admits module definitions and definitions owned
// by this original caller activation. A saved or cross-activation closure needs
// its independent creating/capture relationship; a source Call cannot supply it.
func stagedDeclarationEffectsOwner(declaration, caller *ast.Node) bool {
	if declaration == nil || caller == nil || declaration.Parent == nil || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(caller) {
		return false
	}
	return ast.IsSourceFile(declaration.Parent) || enclosingCallableNode(declaration.Parent) == caller
}

// A concrete local array with an earlier authored indexed getter can publish
// writes during the declaration Call. Keep that Call with the ordinary source
// walk so a subsequent constructor Set can use the same Get's writer input.
func localArrayGetterInputMayWrite(source *sourceStagedInputSubstitution, caller *ast.Node, owner *sourceValueOwner) bool {
	invocation := source.invocation
	index := owner.index(ast.GetSourceFileOfNode(invocation.operation))
	for _, actual := range invocation.actuals {
		argument := unwrapSourceCallableReference(actual.expression)
		if argument == nil || !ast.IsIdentifier(argument) {
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(argument)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != caller {
			continue
		}
		origin := unwrapSourceCallableReference(symbol.ValueDeclaration.Initializer())
		if origin == nil || !ast.IsArrayLiteralExpression(origin) {
			continue
		}
		for _, site := range index.originCalls[origin] {
			if site.End() > invocation.operation.Pos() || enclosingCallableNode(site) != caller {
				continue
			}
			call := site.AsCallExpression()
			if !reflectiveDescriptorCall(call, owner.checker) {
				continue
			}
			if _, indexed := sourceArrayIndex(sourceLiteralMemberName(call.Arguments.Nodes[1])); !indexed {
				continue
			}
			descriptor := unwrapSourceCallableReference(call.Arguments.Nodes[2])
			if descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) {
				continue
			}
			for _, member := range descriptor.AsObjectLiteralExpression().Properties.Nodes {
				if (ast.IsMethodDeclaration(member) || ast.IsPropertyAssignment(member)) && member.Name() != nil && callableNameText(member.Name()) == "get" {
					return true
				}
			}
		}
	}
	return false
}
