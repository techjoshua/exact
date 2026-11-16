package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedGetterPlan separates the original eager Get from its lazy returned
// callable template. Both are source facts, not successful Get/Call observations.
type sourceStagedGetterPlan struct {
	get, getter, returned *ast.Node
	effects, exposure     sourceStagedOperationRecipe
}

func describeStagedGetter(fact *callableFacts, owner *executableBodyOwner) (sourceStagedGetterPlan, bool) {
	plan := sourceStagedGetterPlan{}
	if owner == nil || owner.values == nil || fact == nil || fact.node == nil || !ast.IsFunctionDeclaration(fact.node) {
		return plan, false
	}
	if len(fact.node.Parameters()) != 0 || fact.node.Body() == nil || !ast.IsBlock(fact.node.Body()) {
		return plan, false
	}
	statements := fact.node.Body().AsBlock().Statements.Nodes
	if len(statements) != 2 || !ast.IsReturnStatement(statements[1]) {
		return plan, false
	}
	get := statements[1].Expression()
	literal, _, ok := stagedLocalMemberReturn(fact, get, get, owner)
	if !ok || len(literal.AsObjectLiteralExpression().Properties.Nodes) != 1 {
		return plan, false
	}
	getter := literal.AsObjectLiteralExpression().Properties.Nodes[0]
	if !ast.IsGetAccessorDeclaration(getter) || getter.Name() == nil || !ast.IsIdentifier(getter.Name()) && !ast.IsStringLiteral(getter.Name()) || getter.Name().Text() != get.AsPropertyAccessExpression().Name().Text() || len(getter.Parameters()) != 0 || getter.Body() == nil || !ast.IsBlock(getter.Body()) {
		return plan, false
	}
	body := getter.Body().AsBlock().Statements.Nodes
	if len(body) == 0 || !ast.IsReturnStatement(body[len(body)-1]) {
		return plan, false
	}
	returned := body[len(body)-1].Expression()
	values, supported := stagedMemberSourceValues(returned, nil, owner)
	if !supported || len(values) != 1 || values[0].kind != relativeEndpointExpression || values[0].expression != returned {
		return plan, false
	}
	for _, statement := range body[:len(body)-1] {
		if !ast.IsExpressionStatement(statement) || !stagedGetterEagerSource(statement.Expression(), owner) {
			return plan, false
		}
	}
	key := sourceStagedOperationKey{declaration: fact.node, operation: get, kind: relativeDemandEffects}
	plan = sourceStagedGetterPlan{get: get, getter: getter, returned: returned}
	plan.effects = sourceStagedOperationRecipe{key: key, getter: getter, delta: sourceStagedOperationDelta{invoked: []sourceStagedOperationInvocation{{declaration: getter, operation: get}}}}
	key.kind = relativeDemandDirectExposure
	endpoint := values[0]
	endpoint.producer = get
	endpoint.get = get
	endpoint.returning = returned
	plan.exposure = sourceStagedOperationRecipe{key: key, getter: getter, delta: sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{{endpoint: endpoint}}}}
	return plan, true
}

// stagedGetterEagerSource admits only the immediate source witness's global Get
// and bodyless ordinary Call. Their existing summaries retain known/unknown
// effects. Receiver/capture, local input and recursive source-body preparation
// are not hidden prerequisites of this getter subset.
func stagedGetterEagerSource(expression *ast.Node, owner *executableBodyOwner) bool {
	if expression == nil {
		return false
	}
	if ast.IsPropertyAccessExpression(expression) && !ast.IsOptionalChain(expression) && ast.IsIdentifier(expression.Expression()) {
		symbol := owner.checker.GetSymbolAtLocation(expression.Expression())
		return symbol != nil && symbol.ValueDeclaration != nil && ast.GetSourceFileOfNode(symbol.ValueDeclaration) != nil && ast.GetSourceFileOfNode(symbol.ValueDeclaration).IsDeclarationFile
	}
	if ast.IsCallExpression(expression) && expression.AsCallExpression().QuestionDotToken == nil && (expression.AsCallExpression().Arguments == nil || len(expression.AsCallExpression().Arguments.Nodes) == 0) && ast.IsIdentifier(expression.Expression()) {
		symbol := owner.checker.GetSymbolAtLocation(expression.Expression())
		return symbol != nil && symbol.ValueDeclaration != nil && ast.IsFunctionDeclaration(symbol.ValueDeclaration) && symbol.ValueDeclaration.Body() == nil && symbol.ValueDeclaration.Parent != nil && ast.IsSourceFile(symbol.ValueDeclaration.Parent)
	}
	return false
}

// sourceStagedGetterUse owns the real creating binder edge and later saved Call.
// The producer's original Get cut remains separate from both source occurrences.
type sourceStagedGetterUse struct {
	plan           sourceStagedGetterPlan
	factory        int
	creating, call *ast.Node
	inputs         *sourceRelativeInputEdge
}

func describeStagedGetterUse(fact *callableFacts, creating *ast.Node, facts []callableFacts, nodes map[*ast.Node]int, owner *executableBodyOwner) (sourceStagedGetterUse, bool) {
	use := sourceStagedGetterUse{}
	if owner == nil || owner.values == nil || fact.normalInputs != nil || fact.initializerPlan != nil || !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent == nil || !ast.IsSourceFile(fact.node.Parent) || !ast.IsExternalModule(fact.sourceFile) || len(fact.node.Parameters()) != 0 || fact.node.Body() == nil || !ast.IsBlock(fact.node.Body()) || creating == nil || !ast.IsCallExpression(creating) {
		return use, false
	}
	if async, ordinary := ordinaryResultCategory(fact.node); async || !ordinary {
		return use, false
	}
	statements := fact.node.Body().AsBlock().Statements.Nodes
	if len(statements) != 2 || !ast.IsVariableStatement(statements[0]) || !ast.IsReturnStatement(statements[1]) {
		return use, false
	}
	list := statements[0].AsVariableStatement().DeclarationList
	if list.Flags&ast.NodeFlagsConst == 0 || len(list.AsVariableDeclarationList().Declarations.Nodes) != 1 {
		return use, false
	}
	saved := list.AsVariableDeclarationList().Declarations.Nodes[0]
	call := statements[1].Expression()
	if saved.Name() == nil || !ast.IsIdentifier(saved.Name()) || saved.Initializer() != creating || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 || !ast.IsIdentifier(call.Expression()) {
		return use, false
	}
	invocation := creating.AsCallExpression()
	if invocation.QuestionDotToken != nil || invocation.Arguments != nil && len(invocation.Arguments.Nodes) != 0 || !ast.IsIdentifier(invocation.Expression) {
		return use, false
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope {
		return use, false
	}
	symbol := owner.checker.GetSymbolAtLocation(invocation.Expression)
	stored := owner.checker.GetSymbolAtLocation(call.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || stored == nil || stored.ValueDeclaration != saved || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 || len(index.bindings[ast.GetSymbolId(stored)]) != 0 {
		return use, false
	}
	factory, found := nodes[symbol.ValueDeclaration]
	if !found || facts[factory].sourceFile != fact.sourceFile {
		return use, false
	}
	if selected, owned := owner.body(invocation.Expression); owned && selected != facts[factory].node {
		return use, false
	}
	plan, supported := describeStagedGetter(&facts[factory], owner)
	if !supported {
		return use, false
	}
	request := sourceRelativeInvocation{declaration: facts[factory].node, operation: creating, use: creating, actualsKnown: true, cut: sourceRelativeCut{operation: creating, use: creating, reading: creating}}
	inputs, delivered := bindStagedDeclarationInputs(fact, request, owner)
	if !delivered {
		return use, false
	}
	return sourceStagedGetterUse{plan: plan, factory: factory, creating: creating, call: call, inputs: inputs}, true
}

func validGetterCreatingAssociation(request sourceStagedOperationRequest, consumer callableFacts) bool {
	edge := request.inputs
	if edge == nil || !edge.delivered || edge.request.declaration != request.producer.declaration || !edge.request.actualsKnown || len(edge.request.actuals) != 0 || len(edge.request.declaration.Parameters()) != 0 || edge.request.operation == nil || enclosingCallableNode(edge.request.operation) != consumer.node || edge.request.use != nil || edge.request.cut != (sourceRelativeCut{operation: edge.request.operation, reading: edge.request.operation}) || edge.bound.declaration != edge.request.declaration || edge.bound.operation != edge.request.operation || edge.bound.use != edge.request.use || edge.bound.cut != edge.request.cut || edge.relative.unsupported != relativeInputsSupported || edge.relative.declaration != edge.request.declaration || edge.relative.operation != edge.request.operation || edge.relative.use != edge.request.use || edge.relative.cut != edge.request.cut {
		return false
	}
	if request.use == nil || !ast.IsCallExpression(request.use) || request.use.AsCallExpression().QuestionDotToken != nil || request.use.AsCallExpression().Arguments != nil && len(request.use.AsCallExpression().Arguments.Nodes) != 0 || !ast.IsIdentifier(request.use.Expression()) {
		return false
	}
	return ast.GetSourceFileOfNode(edge.request.operation) == consumer.sourceFile && enclosingCallableNode(request.use) == consumer.node
}
