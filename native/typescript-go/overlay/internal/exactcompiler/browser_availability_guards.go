package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// browserGlobalReferenceIsGuarded recognizes the ordinary universal-runtime pattern where a
// browser global is read only after a typeof availability test. The guard itself is safe in every
// JavaScript runtime, and the guarded branch cannot execute on a server where the global is absent.
// Treating either reference as an unconditional browser effect would incorrectly project the
// complete callable out of an otherwise valid server artifact.
func browserGlobalReferenceIsGuarded(node *ast.Node, name string, callable *ast.Node) bool {
	operand := node
	for operand.Parent != nil && unwrapSourceCallableReference(operand.Parent) == node {
		operand = operand.Parent
	}
	if operand.Parent != nil && ast.IsTypeOfExpression(operand.Parent) {
		return true
	}
	for current := node; current != nil && current != callable; current = current.Parent {
		parent := current.Parent
		if parent == nil {
			break
		}
		switch {
		case ast.IsBlock(parent):
			if browserAvailableAfterExit(parent.AsBlock().Statements, current, name) {
				return true
			}
		case ast.IsSourceFile(parent):
			if browserAvailableAfterExit(parent.AsSourceFile().Statements, current, name) {
				return true
			}
		case ast.IsConditionalExpression(parent):
			conditional := parent.AsConditionalExpression()
			availableWhenTrue, recognized := browserAvailabilityGuard(conditional.Condition, name)
			if recognized && ((nodeInside(current, conditional.WhenTrue) && availableWhenTrue) ||
				(nodeInside(current, conditional.WhenFalse) && !availableWhenTrue)) {
				return true
			}
		case ast.IsIfStatement(parent):
			statement := parent.AsIfStatement()
			availableWhenTrue, recognized := browserAvailabilityGuard(statement.Expression, name)
			if recognized && ((nodeInside(current, statement.ThenStatement) && availableWhenTrue) ||
				(statement.ElseStatement != nil && nodeInside(current, statement.ElseStatement) &&
					!availableWhenTrue)) {
				return true
			}
		case ast.IsBinaryExpression(parent):
			binary := parent.AsBinaryExpression()
			if !nodeInside(current, binary.Right) {
				continue
			}
			availableWhenTrue, recognized := browserAvailabilityGuard(binary.Left, name)
			if !recognized {
				continue
			}
			if (binary.OperatorToken.Kind == ast.KindAmpersandAmpersandToken && availableWhenTrue) ||
				(binary.OperatorToken.Kind == ast.KindBarBarToken && !availableWhenTrue) {
				return true
			}
		}
	}
	return false
}

func browserAvailabilityGuard(node *ast.Node, name string) (bool, bool) {
	for node != nil && ast.IsParenthesizedExpression(node) {
		node = node.AsParenthesizedExpression().Expression
	}
	if node == nil || !ast.IsBinaryExpression(node) {
		return false, false
	}
	binary := node.AsBinaryExpression()
	left, right := binary.Left, binary.Right
	if !browserTypeofUndefinedComparison(left, right, name) &&
		!browserTypeofUndefinedComparison(right, left, name) {
		return false, false
	}
	switch binary.OperatorToken.Kind {
	case ast.KindExclamationEqualsToken, ast.KindExclamationEqualsEqualsToken:
		return true, true
	case ast.KindEqualsEqualsToken, ast.KindEqualsEqualsEqualsToken:
		return false, true
	default:
		return false, false
	}
}

func browserTypeofUndefinedComparison(typeOf *ast.Node, undefined *ast.Node, name string) bool {
	for typeOf != nil && ast.IsParenthesizedExpression(typeOf) {
		typeOf = typeOf.AsParenthesizedExpression().Expression
	}
	for undefined != nil && ast.IsParenthesizedExpression(undefined) {
		undefined = undefined.AsParenthesizedExpression().Expression
	}
	if typeOf == nil || undefined == nil || !ast.IsTypeOfExpression(typeOf) ||
		!ast.IsStringLiteral(undefined) || undefined.Text() != "undefined" {
		return false
	}
	expression := unwrapSourceCallableReference(typeOf.AsTypeOfExpression().Expression)
	return expression != nil && ast.IsIdentifier(expression) && expression.Text() == name
}

// browserAvailableAfterExit recognizes guards whose unavailable branch exits before the read.
// Only sibling statements preceding the read can dominate it. A return inside a nested callable
// or a conditional branch without its own terminal alternative does not prove an exit.
func browserAvailableAfterExit(statements *ast.NodeList, current *ast.Node, name string) bool {
	if statements == nil {
		return false
	}
	for _, candidate := range statements.Nodes {
		if candidate.Pos() >= current.Pos() {
			break
		}
		if !ast.IsIfStatement(candidate) {
			continue
		}
		guard := candidate.AsIfStatement()
		availableWhenTrue, recognized := browserAvailabilityGuard(guard.Expression, name)
		if !recognized {
			continue
		}
		if !availableWhenTrue && browserAvailabilityBranchExits(guard.ThenStatement) ||
			availableWhenTrue && browserAvailabilityBranchExits(guard.ElseStatement) {
			return true
		}
	}
	return false
}

// browserAvailabilityBranchExits proves that every path leaving a guard branch skips later siblings.
// Loops, switches, and nested function declarations remain conservative rather than treating an
// inner return, break, or continue as an exit from the enclosing callable.
func browserAvailabilityBranchExits(node *ast.Node) bool {
	if node == nil {
		return false
	}
	if ast.IsReturnStatement(node) || ast.IsThrowStatement(node) {
		return true
	}
	if ast.IsBlock(node) {
		statements := node.AsBlock().Statements
		return statements != nil && len(statements.Nodes) > 0 &&
			browserAvailabilityBranchExits(statements.Nodes[len(statements.Nodes)-1])
	}
	if ast.IsIfStatement(node) {
		statement := node.AsIfStatement()
		return browserAvailabilityBranchExits(statement.ThenStatement) &&
			browserAvailabilityBranchExits(statement.ElseStatement)
	}
	return false
}
