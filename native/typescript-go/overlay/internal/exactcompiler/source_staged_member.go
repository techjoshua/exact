package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberPlan is a sealed declaration-relative source recipe. The
// initial domain is one unescaped local data literal, a single direct return
// Call, and conditional capture-free callables/formals. Other member domains
// retain their existing owner. Validation never acquires current values.
type sourceStagedMemberPlan struct {
	request sourceStagedOperationRequest
	call    *ast.Node
	values  []sourceRelativeEndpoint
}

func describeStagedMemberCall(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) (sourceStagedMemberPlan, bool) {
	plan := sourceStagedMemberPlan{}
	if call == nil || !ast.IsCallExpression(call) {
		return plan, false
	}
	expression := call.AsCallExpression()
	if expression.QuestionDotToken != nil || expression.Arguments != nil && len(expression.Arguments.Nodes) != 0 || expression.Expression == nil || !ast.IsPropertyAccessExpression(expression.Expression) || ast.IsOptionalChain(expression.Expression) {
		return plan, false
	}
	get := expression.Expression
	literal, roles, supported := stagedLocalMemberReturn(fact, call, get, owner)
	if !supported {
		return plan, false
	}
	member := get.AsPropertyAccessExpression()
	cut := sourceRelativeCut{operation: get, use: get, reading: get}
	plan.request = sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: fact.node, operation: get, kind: relativeDemandDirectExposure}, consumer: fact.node, use: call, cut: cut}
	plan.call = call
	seen := make(map[string]bool)
	for _, property := range literal.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || !ast.IsIdentifier(property.Name()) && !ast.IsStringLiteral(property.Name()) {
			return sourceStagedMemberPlan{}, false
		}
		key := property.Name().Text()
		if key == "__proto__" || seen[key] {
			return sourceStagedMemberPlan{}, false
		}
		seen[key] = true
		values, supported := stagedMemberSourceValues(property.AsPropertyAssignment().Initializer, roles, owner)
		if !supported {
			return sourceStagedMemberPlan{}, false
		}
		if key == member.Name().Text() {
			plan.values = values
		}
	}
	if len(plan.values) == 0 {
		return sourceStagedMemberPlan{}, false
	}
	return plan, true
}

// stagedMemberSourceValues projects syntax alternatives only. The containing
// literal cannot escape before its single Get. No selected callback captures a
// local activation, and unresolved formals remain relative invocation demands.
func stagedMemberSourceValues(node *ast.Node, roles map[ast.SymbolId]sourceRelativeRole, owner *executableBodyOwner) ([]sourceRelativeEndpoint, bool) {
	if node == nil {
		return nil, false
	}
	if ast.IsConditionalExpression(node) {
		conditional := node.AsConditionalExpression()
		condition := conditional.Condition
		if condition == nil || !ast.IsIdentifier(condition) {
			return nil, false
		}
		symbol := owner.checker.GetSymbolAtLocation(condition)
		if symbol == nil || roles[ast.GetSymbolId(symbol)].kind != relativeRoleFormal {
			return nil, false
		}
		left, ok := stagedMemberSourceValues(conditional.WhenTrue, roles, owner)
		if !ok {
			return nil, false
		}
		right, ok := stagedMemberSourceValues(conditional.WhenFalse, roles, owner)
		return append(left, right...), ok
	}
	if ast.IsIdentifier(node) {
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol != nil {
			if role, ok := roles[ast.GetSymbolId(symbol)]; ok {
				return []sourceRelativeEndpoint{{kind: relativeEndpointRole, role: role}}, true
			}
		}
		return nil, false
	}
	if !ast.IsArrowFunction(node) && !ast.IsFunctionExpression(node) || len(node.Parameters()) != 0 {
		return nil, false
	}
	if async, ordinary := ordinaryResultCategory(node); async || !ordinary {
		return nil, false
	}
	if body, selected := owner.body(node); selected && body != node {
		return nil, false
	}
	free := false
	walkNode(node.Body(), func(reference *ast.Node) bool {
		if reference.Kind == ast.KindThisKeyword || reference.Kind == ast.KindSuperKeyword || ast.IsMetaProperty(reference) || ast.IsFunctionLike(reference) {
			free = true
			return false
		}
		if ast.IsIdentifier(reference) && !ast.IsDeclarationName(reference) && !isStaticPropertyName(reference) {
			symbol := owner.checker.GetSymbolAtLocation(reference)
			if symbol == nil || symbol.ValueDeclaration == nil || !ast.GetSourceFileOfNode(symbol.ValueDeclaration).IsDeclarationFile {
				free = true
			}
		}
		return true
	})
	if free {
		return nil, false
	}
	return []sourceRelativeEndpoint{{kind: relativeEndpointExpression, expression: node}}, true
}

// stagedCallbackNeedsReceiver withholds migration of a supplied callback that
// observes its dynamic receiver. This keeps the original binder/effect consumer
// until operation receiver-role transport is connected, rather than approving
// a method Call using a detached formal-only substitution.
func stagedCallbackNeedsReceiver(declaration *ast.Node) bool {
	needed := false
	for _, parameter := range declaration.Parameters() {
		needed = needed || parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this"
	}
	walkNode(declaration.Body(), func(node *ast.Node) bool {
		needed = needed || node.Kind == ast.KindThisKeyword || node.Kind == ast.KindSuperKeyword
		return !needed
	})
	return needed
}

// stagedLocalMemberReturn authenticates the shared unescaped literal and its
// original sole return use. These are source/module/write checks, not a runtime
// object identity, descriptor or readonly certificate.
func stagedLocalMemberReturn(fact *callableFacts, returned, get *ast.Node, owner *executableBodyOwner) (*ast.Node, map[ast.SymbolId]sourceRelativeRole, bool) {
	if owner == nil || owner.values == nil || fact.normalInputs != nil || fact.initializerPlan != nil || !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent == nil || !ast.IsSourceFile(fact.node.Parent) || !ast.IsExternalModule(fact.sourceFile) {
		return nil, nil, false
	}
	if async, ordinary := ordinaryResultCategory(fact.node); async || !ordinary || fact.node.Body() == nil || !ast.IsBlock(fact.node.Body()) {
		return nil, nil, false
	}
	if get == nil || !ast.IsPropertyAccessExpression(get) || ast.IsOptionalChain(get) || !ast.IsIdentifier(get.Expression()) {
		return nil, nil, false
	}
	statements := fact.node.Body().AsBlock().Statements.Nodes
	if len(statements) != 2 || !ast.IsVariableStatement(statements[0]) || !ast.IsReturnStatement(statements[1]) || statements[1].Expression() != returned {
		return nil, nil, false
	}
	list := statements[0].AsVariableStatement().DeclarationList
	if list.Flags&ast.NodeFlagsConst == 0 || len(list.AsVariableDeclarationList().Declarations.Nodes) != 1 {
		return nil, nil, false
	}
	declaration := list.AsVariableDeclarationList().Declarations.Nodes[0]
	if declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) || declaration.Initializer() == nil || !ast.IsObjectLiteralExpression(declaration.Initializer()) {
		return nil, nil, false
	}
	if _, selected := owner.body(get); selected {
		return nil, nil, false
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope {
		return nil, nil, false
	}
	symbol := owner.checker.GetSymbolAtLocation(get.Expression())
	if symbol == nil || symbol.ValueDeclaration != declaration || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return nil, nil, false
	}
	var roles map[ast.SymbolId]sourceRelativeRole
	if len(fact.node.Parameters()) != 0 {
		roles = make(map[ast.SymbolId]sourceRelativeRole)
	}
	for slot, parameter := range fact.node.Parameters() {
		if parameter.Name() == nil || !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return nil, nil, false
		}
		bound := owner.checker.GetSymbolAtLocation(parameter.Name())
		if bound == nil || len(index.bindings[ast.GetSymbolId(bound)]) != 0 {
			return nil, nil, false
		}
		roles[ast.GetSymbolId(bound)] = sourceRelativeRole{kind: relativeRoleFormal, declaration: fact.node, slot: slot}
	}
	return declaration.Initializer(), roles, true
}
