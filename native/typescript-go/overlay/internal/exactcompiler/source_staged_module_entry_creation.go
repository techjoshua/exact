package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedModuleIntrinsicEntry accounts for one original event's local intrinsic
// no-user-entry law. Every child event and selected import still needs its own
// semantic owner. This neither admits a module prefix nor authenticates the
// event, population, program or generation. No body or root is interpreted.
func stagedModuleIntrinsicEntry(event sourceNormalDemand) (accounted bool, admitted bool) {
	node := event.node
	if node == nil {
		return false, false
	}
	payloads := 0
	if event.fold != nil {
		payloads++
		if event.fold.node != node {
			return false, false
		}
	}
	if event.phase != nil {
		payloads++
		if event.phase.node != node {
			return false, false
		}
	}
	if event.operand != nil {
		payloads++
		if event.operand.node != node {
			return false, false
		}
	}
	if payloads > 1 {
		return false, false
	}
	if event.fold != nil && event.fold.kind == sourceNormalEnter {
		return true, true
	}
	if event.phase != nil {
		if (event.phase.role == sourceNormalAdmit || event.phase.role == sourceNormalSelect) && stagedModuleSimpleBinding(node) {
			return true, true
		}
		return false, false
	}
	if event.operand != nil {
		if stagedModuleSimpleBinding(node) && !event.operand.pattern && !event.operand.await && !event.operand.get {
			return true, true
		}
		return false, false
	}
	if sourceNormalStructural(node) {
		return true, true
	}
	if event.fold != nil && event.fold.kind == sourceNormalErased {
		return false, false
	}
	if stagedModuleSimpleBinding(node) {
		return true, true
	}
	if ast.IsFunctionDeclaration(node) || ast.IsFunctionExpression(node) || ast.IsArrowFunction(node) || ast.IsMethodDeclaration(node) || ast.IsGetAccessorDeclaration(node) || ast.IsSetAccessorDeclaration(node) {
		// Names (including computed names) are independently visited children.
		// Actual decorator application has its own executable source event.
		if len(sourceDefinitionDecorators(node)) != 0 {
			return false, false
		}
		return true, true
	}
	if ast.IsClassDeclaration(node) || ast.IsClassExpression(node) {
		if sourceInertClassCreation(node) {
			return true, true
		}
		return false, false
	}
	if ast.IsPropertyAssignment(node) {
		if node.Parent == nil || !ast.IsObjectLiteralExpression(node.Parent) || node.Name() == nil || ast.IsComputedPropertyName(node.Name()) || callableNameText(node.Name()) == "__proto__" {
			return false, false
		}
		return true, true
	}
	switch node.Kind {
	case ast.KindSourceFile, ast.KindBlock, ast.KindEmptyStatement, ast.KindExpressionStatement,
		ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindTypeAssertionExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression,
		ast.KindObjectLiteralExpression:
		return true, true
	case ast.KindVariableDeclarationList:
		if node.Flags&ast.NodeFlagsUsing != 0 {
			return false, false
		}
		// The list only groups declarations. Each binding's own event is required.
		return true, true
	case ast.KindVariableStatement:
		list := node.AsVariableStatement().DeclarationList
		if list == nil || list.Flags&ast.NodeFlagsUsing != 0 {
			return false, false
		}
		return true, true
	}
	// This shared proof supplies construction-only semantics. It does not grant
	// a binding read, operation result, NoWrites, output or module readiness.
	if !ast.IsIdentifier(node) && sourceInertValueCreation(node) {
		return true, true
	}
	return false, false
}

func stagedModuleSimpleBinding(node *ast.Node) bool {
	return ast.IsVariableDeclaration(node) && node.Name() != nil && ast.IsIdentifier(node.Name()) && node.Parent != nil && ast.IsVariableDeclarationList(node.Parent) && node.Parent.Flags&ast.NodeFlagsUsing == 0 && sourceStagedModuleOwner(node) != nil
}
