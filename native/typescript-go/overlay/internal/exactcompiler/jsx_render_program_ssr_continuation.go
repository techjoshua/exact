package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// directRenderProgramSsrSinkWriter lowers ordered writes into a fallthrough continuation.
// Synchronous writes stay in one invocation. Only pending operations and sink drains allocate
// callbacks. The caller owns output storage, cancellation, and error cleanup. Preparation timing
// is unchanged; both direct-component and generic-operation rendering consume this ABI.
func (lowering *jsxLowering) directRenderProgramSsrSinkWriter(build *renderProgramBuild) *ast.Node {
	plan := lowering.directRenderProgramSsrPlan(build)
	siblings := lowering.prepareSsrSinkSiblings(&plan)
	body := ssrSinkPreparation(plan, siblings)
	frame := lowering.newSsrSinkFrame(plan, body)
	f := lowering.factory
	block := func(statements []*ast.Node) *ast.Node {
		return f.NewBlock(f.NewNodeList(statements), true)
	}
	property := func(receiver *ast.Node, name string) *ast.Node {
		return f.NewPropertyAccessExpression(receiver, nil, f.NewIdentifier(name), ast.NodeFlagsNone)
	}
	call := func(callee *ast.Node, args ...*ast.Node) *ast.Node {
		return f.NewCallExpression(callee, nil, nil, f.NewNodeList(args), ast.NodeFlagsNone)
	}
	number := func(value int) *ast.Node {
		return f.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
	}
	parameters := func(names ...*ast.Node) *ast.NodeList {
		result := make([]*ast.Node, 0, len(names))
		for _, name := range names {
			result = append(result, f.NewParameterDeclaration(nil, nil, name, nil, nil, nil))
		}
		return f.NewNodeList(result)
	}
	stage := frame.stage
	value := frame.value
	clauses := make([]*ast.Node, 0, 2*len(plan.writes)+1)
	for index, write := range plan.writes {
		expression := plan.statements[write.statement].AsExpressionStatement().Expression
		var settled []*ast.Node
		if write.assignsCharacters {
			assignment := expression.AsBinaryExpression()
			settled = append(settled, f.NewExpressionStatement(lowering.binary(assignment.Left, ast.KindEqualsToken, f.NewAsExpression(value, f.NewKeywordTypeNode(ast.KindNumberKeyword)))))
			expression = assignment.Right
		}
		invoke := []*ast.Node{
			f.NewExpressionStatement(lowering.binary(value, ast.KindEqualsToken, expression)),
		}
		if write.maySuspend() {
			invoke = append(invoke, f.NewIfStatement(lowering.binary(value, ast.KindInstanceOfKeyword, property(plan.target, "promise")),
				frame.suspend(value, index*2+1), nil))
		}
		clauses = append(clauses, f.NewCaseOrDefaultClause(ast.KindCaseClause, number(index*2), f.NewNodeList(invoke)))
		drain := f.NewIdentifier("__exactDrain_" + strconv.Itoa(index))
		settled = append(settled,
			f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList([]*ast.Node{
				f.NewVariableDeclaration(drain, nil, nil, call(property(property(plan.output, "sink"), "ready"))),
			}), ast.NodeFlagsConst)),
			f.NewIfStatement(drain, frame.suspend(drain, index*2+2), nil),
		)
		clauses = append(clauses, f.NewCaseOrDefaultClause(ast.KindCaseClause, number(index*2+1), f.NewNodeList(settled)))
	}
	clauses = append(clauses, f.NewCaseOrDefaultClause(ast.KindCaseClause, number(len(plan.writes)*2),
		f.NewNodeList([]*ast.Node{f.NewReturnStatement(plan.output)})))
	if len(plan.writes) == 0 {
		body = append(body, f.NewReturnStatement(plan.output))
	} else if len(plan.writes) == 1 && !plan.writes[0].maySuspend() {
		// A synchronous terminal write needs no continuation state. Its sink may still
		// suspend completion, so keep the final drain before returning caller-owned output.
		drain := f.NewIdentifier("__exactDrain")
		body = append(body, plan.statements[plan.writes[0].statement],
			f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList([]*ast.Node{
				f.NewVariableDeclaration(drain, nil, nil, call(property(property(plan.output, "sink"), "ready"))),
			}), ast.NodeFlagsConst)),
			f.NewIfStatement(drain, f.NewReturnStatement(call(property(drain, "then"), lowering.arrow(plan.output))), nil),
			f.NewReturnStatement(plan.output))
	} else {
		return frame.writer(f.NewSwitchStatement(stage, f.NewCaseBlock(f.NewNodeList(clauses))))
	}
	return f.NewArrowFunction(nil, nil, parameters(plan.target, plan.context, plan.invocation, plan.output), nil, nil,
		f.NewToken(ast.KindEqualsGreaterThanToken), block(body))
}
