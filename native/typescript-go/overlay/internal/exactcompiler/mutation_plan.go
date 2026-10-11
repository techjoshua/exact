package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type mutationOperationKind uint8

const (
	mutationRead mutationOperationKind = iota
	mutationAssign
	mutationCompound
	mutationPrefix
	mutationPostfix
	mutationDelete
	mutationCall
)

// mutationOperationPlan selects authored syntax without visiting expressions or querying types.
// Emitters select the receiver and computed key before reads, values or arguments. Compound
// operations read once, logical operations conditionally evaluate the value, and postfix updates
// return the pre-update conversion. Suspension stays inside the original callable.
type mutationOperationPlan struct {
	kind          mutationOperationKind
	target, value *ast.Node
	operator      ast.Kind
}

func planMutationOperation(node *ast.Node) mutationOperationPlan {
	plan := mutationOperationPlan{target: node}
	if node == nil {
		return plan
	}
	switch {
	case ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind):
		binary := node.AsBinaryExpression()
		plan.kind, plan.target, plan.value, plan.operator = mutationCompound, binary.Left, binary.Right, binary.OperatorToken.Kind
		if plan.operator == ast.KindEqualsToken {
			plan.kind = mutationAssign
		}
	case ast.IsPrefixUnaryExpression(node):
		unary := node.AsPrefixUnaryExpression()
		if unary.Operator == ast.KindPlusPlusToken || unary.Operator == ast.KindMinusMinusToken {
			plan.kind, plan.target, plan.operator = mutationPrefix, unary.Operand, unary.Operator
		}
	case ast.IsPostfixUnaryExpression(node):
		unary := node.AsPostfixUnaryExpression()
		if unary.Operator == ast.KindPlusPlusToken || unary.Operator == ast.KindMinusMinusToken {
			plan.kind, plan.target, plan.operator = mutationPostfix, unary.Operand, unary.Operator
		}
	case ast.IsDeleteExpression(node):
		plan.kind, plan.target = mutationDelete, node.AsDeleteExpression().Expression
	case ast.IsCallExpression(node):
		plan.kind, plan.target = mutationCall, node.AsCallExpression().Expression
	}
	return plan
}

// reference returns unvisited receiver/key syntax. A named key is a literal, while a computed
// key requires ToPropertyKey at reference selection. Private and super policy stays in its emitter.
func (plan mutationOperationPlan) reference() (receiver, key *ast.Node, computed bool) {
	target := unwrapSourceCallableReference(plan.target)
	if ast.IsPropertyAccessExpression(target) {
		member := target.AsPropertyAccessExpression()
		return member.Expression, member.Name(), false
	}
	if ast.IsElementAccessExpression(target) {
		member := target.AsElementAccessExpression()
		return member.Expression, member.ArgumentExpression, true
	}
	return nil, nil, false
}

func (plan mutationOperationPlan) compoundOperator() (ast.Kind, bool, bool) {
	operator, valid := compoundStateOperator(plan.operator)
	return operator, valid, valid && (operator == ast.KindAmpersandAmpersandToken || operator == ast.KindBarBarToken || operator == ast.KindQuestionQuestionToken)
}
