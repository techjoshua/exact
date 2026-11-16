package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedReturnedCreation is one immutable const binding's creating edge.
// It does not select a runtime output or activate the returned callable. Separate
// source Calls retain separate edges even when they select the same declaration.
type sourceStagedReturnedCreation struct {
	binding *ast.Node
	recipe  sourceStagedOperationKey
	inputs  *sourceRelativeInputEdge
	uses    []*ast.Node // exact source-issued saved Calls, immutable after local extraction
}

// sourceStagedReturnedInvocation joins actual later invocation to its original
// creating substitution. The summary subscriber consumes captured requirements,
// never the caller's current bindings or an installed creating scope.
type sourceStagedReturnedInvocation struct {
	alternative sourceStagedOperationAlternative
	later       sourceRelativeInvocation
}

func stagedReturnTemplate(declaration *ast.Node, owner *sourceValueOwner) (sourceStagedReturnTemplate, bool) {
	var empty sourceStagedReturnTemplate
	if declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Parent == nil || !ast.IsSourceFile(declaration.Parent) || !ast.IsExternalModule(ast.GetSourceFileOfNode(declaration)) || declaration.Body() == nil || !ast.IsBlock(declaration.Body()) {
		return empty, false
	}
	if async, ordinary := ordinaryResultCategory(declaration); async || !ordinary {
		return empty, false
	}
	statements := declaration.Body().AsBlock().Statements.Nodes
	if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return empty, false
	}
	for _, parameter := range declaration.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return empty, false
		}
	}
	templates := describeStagedReturnTemplates(declaration, owner)
	if len(templates) != 1 || templates[0].unknown || templates[0].callable == nil || len(templates[0].callable.Parameters()) != 0 {
		return empty, false
	}
	template := templates[0]
	if async, ordinary := ordinaryResultCategory(template.callable); async || !ordinary {
		return empty, false
	}
	// Initial actual consumer is one captured zero-argument body Call. Defaults,
	// receiver use, nested bodies and written capture delivery retain their owner.
	body := template.callable.Body()
	if body == nil || !ast.IsCallExpression(body) {
		return empty, false
	}
	demand, ok := describeStagedReturnedCaptureDemand(template, body, owner)
	if !ok || demand.role.binding == nil || !ast.IsParameterDeclaration(demand.role.binding) || enclosingCallableNode(demand.role.binding) != declaration {
		return empty, false
	}
	symbol := owner.checker.GetSymbolAtLocation(body.Expression())
	if symbol == nil || owner.bindingWritten(symbol) {
		return empty, false
	}
	return template, true
}

// stageReturnedCreation registers before recursive result recovery, using the
// real synchronous binder at this original source Call. Only lexical identifier
// actuals enter this first route, so it cannot skip argument Get/coercion work.
func (work *callableEffectWork) stageReturnedCreation(facts []callableFacts, caller int, node *ast.Node, nodes map[*ast.Node]int, owner *executableBodyOwner) bool {
	fact := &facts[caller]
	if fact.normalInputs != nil || fact.initializerPlan != nil || !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent == nil || !ast.IsSourceFile(fact.node.Parent) || !ast.IsExternalModule(fact.sourceFile) || node == nil || !ast.IsCallExpression(node) || node.AsCallExpression().QuestionDotToken != nil || !ast.IsIdentifier(node.Expression()) {
		return false
	}
	if async, ordinary := ordinaryResultCategory(fact.node); async || !ordinary {
		return false
	}
	for _, parameter := range fact.node.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return false
		}
	}
	binding := node.Parent
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Initializer() != node || binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 {
		// This is the same reached creating-call owner for an actual argument.
		// Its original binder runs here, before the source-input fallback. An
		// argument consumer later borrows this B and cannot manufacture it.
		outer := node
		for outer.Parent != nil && ast.IsParenthesizedExpression(outer.Parent) {
			outer = outer.Parent
		}
		parent := outer.Parent
		argument := false
		if parent != nil && ast.IsCallExpression(parent) && parent.AsCallExpression().QuestionDotToken == nil {
			for _, actual := range restrictedInvocationArguments(parent.AsCallExpression()) {
				argument = argument || actual == outer
			}
		}
		if !argument {
			return false
		}
		binding = nil
	}
	selected := owner.checker.GetSymbolAtLocation(node.Expression())
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope || selected == nil || len(index.bindings[ast.GetSymbolId(selected)]) != 0 {
		return false
	}
	if binding != nil {
		stored := owner.checker.GetSymbolAtLocation(binding.Name())
		if stored == nil || len(index.bindings[ast.GetSymbolId(stored)]) != 0 {
			return false
		}
	}
	factory, found := nodes[selected.ValueDeclaration]
	if !found || facts[factory].sourceFile != fact.sourceFile {
		return false
	}
	if body, selected := owner.body(node.Expression()); selected && body != facts[factory].node {
		return false
	}
	template, supported := stagedReturnTemplate(facts[factory].node, owner.values)
	if !supported {
		return false
	}
	arguments := restrictedInvocationArguments(node.AsCallExpression())
	if len(arguments) != len(facts[factory].node.Parameters()) {
		return false
	}
	request := sourceRelativeInvocation{declaration: facts[factory].node, operation: node, actualsKnown: true}
	for ordinal, actual := range arguments {
		if !ast.IsIdentifier(actual) {
			return false
		}
		symbol := owner.checker.GetSymbolAtLocation(actual)
		if symbol == nil || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
			return false
		}
		declaration := symbol.ValueDeclaration
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointUnknown}
		if ast.IsParameterDeclaration(declaration) && enclosingCallableNode(declaration) == fact.node {
			for slot, parameter := range fact.node.Parameters() {
				if parameter == declaration {
					endpoint = sourceRelativeEndpoint{kind: relativeEndpointRole, role: sourceRelativeRole{kind: relativeRoleFormal, declaration: fact.node, slot: slot}}
				}
			}
		} else if ast.IsFunctionDeclaration(declaration) && declaration.Body() != nil && declaration.Parent != nil && ast.IsSourceFile(declaration.Parent) && ast.GetSourceFileOfNode(declaration) == fact.sourceFile && !stagedCallbackNeedsReceiver(declaration) {
			if body, selected := owner.body(actual); selected && body != declaration {
				return false
			}
			endpoint = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: declaration}
		} else if !ast.IsFunctionDeclaration(declaration) || declaration.Body() != nil {
			return false
		}
		request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: ordinal, endpoint: endpoint})
	}
	inputs, delivered := bindStagedDeclarationInputs(fact, request, owner)
	if !delivered {
		return false
	}
	value, valid := instantiateStagedReturnTemplate(template, inputs.relative)
	if !valid {
		return false
	}
	// The producer template has no creating frame. Instantiation occurs separately
	// for each issuing subscriber, so a fresh factory Call cannot retarget saved.
	endpoint := value.endpoint
	endpoint.creation = nil
	endpoint.cut = sourceRelativeCut{}
	recipe := sourceStagedOperationRecipe{key: sourceStagedOperationKey{declaration: facts[factory].node, operation: template.returning, kind: relativeDemandDirectExposure}, returning: template.returning, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{{endpoint: endpoint}}}}
	if binding != nil && !work.registerOperationRecipe(facts, recipe) || !work.deferDeclarationCall(facts, caller, factory, inputs.request, inputs) {
		return false
	}
	edge := fmt.Sprintf("%s:call:%d", fact.summary.ID, node.Pos())
	fact.summary.Calls = append(fact.summary.Calls, CallEdge{ID: edge, Name: sourceText(fact.sourceFile, node.Expression()), Resolved: true, TargetID: facts[factory].summary.ID})
	fact.targets = append(fact.targets, factory)
	fact.callExpressions[edge] = node
	fact.callSymbols[edge] = ast.GetSymbolId(selected)
	if binding != nil {
		fact.staged.returnedCreations = append(fact.staged.returnedCreations, sourceStagedReturnedCreation{binding: binding, recipe: recipe.key, inputs: inputs})
	}
	fact.staged.operationSkipped = append(fact.staged.operationSkipped, node)
	return true
}

func (work *callableEffectWork) stageReturnedSavedCall(facts []callableFacts, consumer int, node *ast.Node, owner *executableBodyOwner) bool {
	fact := &facts[consumer]
	if len(fact.staged.returnedCreations) == 0 || node == nil || !ast.IsCallExpression(node) || node.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(node.AsCallExpression())) != 0 || !ast.IsIdentifier(node.Expression()) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(node.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
		return false
	}
	for index := range fact.staged.returnedCreations {
		creation := &fact.staged.returnedCreations[index]
		if creation.binding != symbol.ValueDeclaration {
			continue
		}
		original := creation.recipe.operation
		request := sourceStagedOperationRequest{producer: creation.recipe, consumer: fact.node, edge: fmt.Sprintf("%s:returned-exposure:%d", fact.summary.ID, node.Pos()), use: node, cut: sourceRelativeCut{operation: original, use: original, reading: original}, inputs: creation.inputs}
		before := len(creation.uses)
		creation.uses = append(creation.uses, node)
		if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request, call: node}) {
			creation.uses = creation.uses[:before]
			return false
		}
		fact.staged.operationSkipped = append(fact.staged.operationSkipped, node)
		return true
	}
	return false
}

func validReturnedCreatingAssociation(request sourceStagedOperationRequest, consumer callableFacts) bool {
	edge := request.inputs
	if edge == nil || !edge.delivered || !edge.request.actualsKnown || edge.request.use != nil || edge.request.cut != (sourceRelativeCut{operation: edge.request.operation, reading: edge.request.operation}) || edge.request.declaration != request.producer.declaration || edge.request.operation == nil || enclosingCallableNode(edge.request.operation) != consumer.node || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) || !sameSourceRelativeInputEnvelope(edge.request, edge.relative) || edge.bound.unsupported != relativeInputsSupported || edge.relative.unsupported != relativeInputsSupported {
		return false
	}
	for _, creation := range consumer.staged.returnedCreations {
		if creation.recipe == request.producer && creation.inputs == edge && creation.binding != nil && creation.binding.Initializer() == edge.request.operation && request.use != nil && ast.IsCallExpression(request.use) && enclosingCallableNode(request.use) == consumer.node {
			for _, use := range creation.uses {
				if use == request.use {
					return true
				}
			}
		}
	}
	return false
}

// stageReturnedCaptureBodyDemand records only the actual inner Call's relative
// input requirement. It does not invoke the closure during factory extraction.
func stageReturnedCaptureBodyDemand(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) (sourceRelativeInvokedInput, bool) {
	if fact.normalInputs != nil || fact.initializerPlan != nil || fact.node == nil || !ast.IsArrowFunction(fact.node) {
		return sourceRelativeInvokedInput{}, false
	}
	creator := enclosingCallableNode(fact.node.Parent)
	template, ok := stagedReturnTemplate(creator, owner.values)
	if !ok || template.callable != fact.node {
		return sourceRelativeInvokedInput{}, false
	}
	return describeStagedReturnedCaptureDemand(template, node, owner.values)
}

func (work *callableEffectWork) registerReturnedInvocation(facts []callableFacts, consumer int, alternative sourceStagedOperationAlternative, call *ast.Node, owner *executableBodyOwner) bool {
	endpoint := alternative.endpoint
	producer, found := work.memberNodes[endpoint.expression]
	if !found || alternative.creating == nil || len(endpoint.expression.Parameters()) != 0 {
		return false
	}
	later := sourceRelativeInvocation{declaration: endpoint.expression, operation: call, actualsKnown: true, cut: sourceRelativeCut{operation: call, reading: call}}
	// The source body is already locally extracted by the same canonical queue.
	// Validate each demanded capture before acknowledging exposure consumption.
	captured := false
	for _, demand := range facts[producer].staged.invoked {
		if demand.role.kind == relativeRoleCapture {
			captured = true
			plan := planStagedReturnedCaptureInvocation(alternative, demand, later, owner.values)
			if plan.unsupported != relativeInputsSupported {
				return false
			}
			for _, binding := range plan.bindings {
				if len(binding.pending) != 0 {
					return false
				}
			}
		}
	}
	if !captured {
		return false
	}
	for _, prior := range facts[consumer].staged.returnedInvocations {
		if prior.later.operation == call {
			if !sameOperationAlternative(prior.alternative, alternative) {
				return false
			}
			// A cloned source association is descriptive. Its required summary
			// membership belongs to this graph and must be registered again.
			work.operationInvocation(facts, consumer, producer, call, later.cut)
			return true
		}
	}
	facts[consumer].staged.returnedInvocations = append(facts[consumer].staged.returnedInvocations, sourceStagedReturnedInvocation{alternative: alternative, later: later})
	work.operationInvocation(facts, consumer, producer, call, later.cut)
	return true
}
