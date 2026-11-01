package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedBodyPlan retains only detached discovery provenance. A plan by itself
// grants callable construction, never live body entry.
type closedBodyPlan struct {
	recipe     *storageRecipe
	parameters *closedParameterMap
	runtime    map[*ast.Node]bool
}

func (p *closedPrefixBuilder) callBodyRecipe(arrow *ast.Node, mapping *closedParameterMap, captures *closedCallableProof) (*storageRecipe, *closedBodyPlan) {
	child := storageBuilder{discovery: p.discovery, recipe: storageRecipe{body: arrow, callBody: true, locals: len(mapping.declarations), declarations: mapping.declarations}}
	defer func() { p.discovery, p.exhausted = child.discovery, child.exhausted }()
	if !mapping.validProjection() {
		return nil, nil
	}
	x := expressionLowerer{storageBuilder: &child, context: expressionContext{parameters: mapping, runtime: make(map[*ast.Node]bool), captures: captures}}
	narrowGetter := false
	if ast.IsGetAccessorDeclaration(arrow) && len(arrow.Parameters()) == 0 {
		terminal, _ := literalEmptyFinallyTerminal(arrow.Body())
		narrowGetter = terminal != nil
	}
	narrowFunction := strictFunctionNumberThrowFinally(arrow, mapping)
	if ast.IsFunctionExpression(arrow) && !narrowFunction || ast.IsGetAccessorDeclaration(arrow) && !narrowGetter {
		body := arrow.Body()
		if !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 {
			return nil, nil
		}
		terminal := body.AsBlock().Statements.Nodes[0]
		if !ast.IsReturnStatement(terminal) || terminal.Expression() == nil {
			return nil, nil
		}
		operand := terminal.Expression()
		for ast.IsParenthesizedExpression(operand) {
			if !child.discover() {
				return nil, nil
			}
			operand = operand.Expression()
		}
		x.context.receiverBody = true
		if ast.IsPropertyAccessExpression(operand) && !ast.IsOptionalChain(operand) && ast.IsIdentifier(operand.Name()) {
			x.context.receiverMember = operand
		} else if ast.IsGetAccessorDeclaration(arrow) && expressionLiteralNode(operand) {
			x.context.receiverBody = false
		} else if operand.Kind != ast.KindThisKeyword || ast.IsGetAccessorDeclaration(arrow) {
			return nil, nil
		}
	}
	// The erased declaration is structural provenance in both function routes.
	if ast.IsFunctionExpression(arrow) && (!x.mark(mapping.erasedThis) || !x.mark(mapping.erasedThis.Name())) {
		return nil, nil
	}
	for i, parameter := range mapping.declarations {
		if !x.mark(parameter) || !x.mark(parameter.Name()) {
			return nil, nil
		}
		value := child.event(storageEvent{kind: "ReadAcquiredArgument", node: parameter, cell: i})
		if initializer := parameter.Initializer(); initializer != nil {
			body := unwrapSourceCallableReference(arrow.Body())
			slot, mapped := mapping.references[body]
			if mapping.defaultParameter(i) != parameter || !captures.empty || !mapped || slot != len(mapping.declarations)-1 {
				return nil, nil
			}
			selected, ok := child.defaultOperand(initializer, value, &x)
			if !ok {
				return nil, nil
			}
			value = selected.register
		}
		child.event(storageEvent{kind: "InitializeCell", node: parameter, a: value, cell: i})
	}
	ok := false
	if ast.IsBlock(arrow.Body()) {
		if len(captures.captureDeclarations) == 1 {
			ok = x.mark(arrow.Body())
			statements := arrow.Body().AsBlock().Statements.Nodes
			if len(statements) < 1 {
				ok = false
			}
			for i, statement := range statements {
				if !ok || !x.mark(statement) {
					ok = false
					break
				}
				if i == len(statements)-1 && ast.IsReturnStatement(statement) && statement.Expression() != nil {
					v, good := x.value(statement.Expression())
					ok = good
					if ok {
						child.event(storageEvent{kind: "Return", node: statement, a: v})
					}
				} else if i < len(statements)-1 && ast.IsExpressionStatement(statement) && ast.IsBinaryExpression(statement.Expression()) && statement.Expression().AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
					_, ok = x.value(statement.Expression())
				} else {
					ok = false
				}
			}
		} else if x.mark(arrow.Body()) && len(arrow.Body().AsBlock().Statements.Nodes) == 1 && ast.IsReturnStatement(arrow.Body().AsBlock().Statements.Nodes[0]) {
			terminal := arrow.Body().AsBlock().Statements.Nodes[0]
			ok = x.mark(terminal)
			if ok {
				v, good := x.value(terminal.Expression())
				ok = good
				if ok {
					child.event(storageEvent{kind: "Return", node: terminal, a: v})
				}
			}
		} else {
			if narrowFunction || !ast.IsFunctionExpression(arrow) && (!ast.IsGetAccessorDeclaration(arrow) || narrowGetter) {
				ok = compileNarrowFinally(&x, arrow.Body())
			}
		}
	} else {
		v, good := x.value(arrow.Body())
		ok = good
		if ok {
			child.event(storageEvent{kind: "Return", node: arrow.Body(), a: v})
		}
	}
	p.discovery, p.exhausted = child.discovery, child.exhausted
	if !ok || child.exhausted {
		return nil, nil
	}
	r := child.recipe
	return &r, &closedBodyPlan{recipe: &r, parameters: mapping, runtime: x.context.runtime}
}

// literalEmptyFinallyTerminal shares only the syntactic walk. Callable kind,
// formal projection and permitted terminal policies remain with its callers.
// Discovery does not issue a value or grant body entry authority.
func literalEmptyFinallyTerminal(body *ast.Node) (*ast.Node, *ast.Node) {
	if body == nil || !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 {
		return nil, nil
	}
	statement := body.AsBlock().Statements.Nodes[0]
	if !ast.IsTryStatement(statement) {
		return nil, nil
	}
	t := statement.AsTryStatement()
	if t.CatchClause != nil || t.FinallyBlock == nil || !ast.IsBlock(t.FinallyBlock) || len(t.FinallyBlock.AsBlock().Statements.Nodes) != 0 || t.TryBlock == nil || !ast.IsBlock(t.TryBlock) || len(t.TryBlock.AsBlock().Statements.Nodes) != 1 {
		return nil, nil
	}
	terminal := t.TryBlock.AsBlock().Statements.Nodes[0]
	if !ast.IsReturnStatement(terminal) && !ast.IsThrowStatement(terminal) {
		return nil, nil
	}
	value := terminal.Expression()
	for value != nil && ast.IsParenthesizedExpression(value) {
		value = value.Expression()
	}
	if !expressionLiteralNode(value) {
		return nil, nil
	}
	return terminal, value
}

// strictFunctionNumberThrowFinally is the finite ordinary-function policy.
// It adds no normal Return output, receiver read or runtime parameter scope.
func strictFunctionNumberThrowFinally(n *ast.Node, mapping *closedParameterMap) bool {
	if n == nil || !ast.IsFunctionExpression(n) || !closedCallableNode(n) || ast.HasDecorators(n) || mapping == nil || mapping.arrow != n || !mapping.validProjection() || len(mapping.physical) != 1 || mapping.erasedThis == nil || len(mapping.declarations) != 0 || len(mapping.references) != 0 {
		return false
	}
	terminal, value := literalEmptyFinallyTerminal(n.Body())
	return terminal != nil && ast.IsThrowStatement(terminal) && value.Kind == ast.KindNumericLiteral
}
