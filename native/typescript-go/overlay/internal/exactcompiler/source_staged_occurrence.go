package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedOccurrenceOwned checks source ownership only. A module initializer
// is an existing fact boundary, including an independently owned declarator.
// Membership in that boundary does not establish reachability, execution,
// selection, input coverage or a normal outcome. Those remain producer facts.
func sourceStagedOccurrenceOwned(operation, declaration *ast.Node) bool {
	if operation == nil || declaration == nil {
		return false
	}
	if ast.IsFunctionLike(declaration) {
		return sourceStagedEvaluationOwner(operation) == declaration
	}
	if !runtimeModuleEvaluation(declaration) || ast.GetSourceFileOfNode(operation) != ast.GetSourceFileOfNode(declaration) {
		return false
	}
	for child, node := operation, operation; node != nil && !ast.IsSourceFile(node); child, node = node, node.Parent {
		if node == declaration {
			return true
		}
		if ast.IsFunctionLike(node) && sourceMemberOperationOwnsChild(node, child) {
			return false // Creating a stored callable does not own its body effects.
		}
	}
	return false
}

// sourceStagedOccurrenceRequest gives all source consumers the same original
// operation/use/cut convention. It does not issue a live query capability or
// register work. Registration must attach the semantic producer and its required
// dependencies before any consumer can yield or suppress legacy acquisition.
func sourceStagedOccurrenceRequest(fact *callableFacts, operation *ast.Node, kind sourceRelativeDemandKind, edge string) (sourceStagedOperationRequest, bool) {
	if fact == nil || fact.sourceFile == nil || edge == "" || !sourceStagedOccurrenceOwned(operation, fact.node) || ast.GetSourceFileOfNode(operation) != fact.sourceFile || kind != relativeDemandEffects && kind != relativeDemandDirectExposure {
		return sourceStagedOperationRequest{}, false
	}
	return sourceStagedOperationRequest{
		producer: sourceStagedOperationKey{declaration: fact.node, operation: operation, kind: kind},
		consumer: fact.node,
		edge:     edge,
		use:      operation,
		cut:      sourceRelativeCut{operation: operation, use: operation, reading: operation},
	}, true
}

// sourceStagedModuleOwner finds the same initializer partition used by
// collectCallableNodes. It names a producer relationship only. In particular a
// captured binding does not execute its initializer again at the later Get.
func sourceStagedModuleOwner(operation *ast.Node) *ast.Node {
	if operation == nil || sourceStagedEvaluationOwner(operation) != nil {
		return nil
	}
	for node := operation; node != nil && !ast.IsSourceFile(node); node = node.Parent {
		if node.Parent == nil || !ast.IsSourceFile(node.Parent) {
			continue
		}
		if !runtimeModuleEvaluation(node) {
			return nil
		}
		if ast.IsVariableStatement(node) {
			list := node.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			if len(list.Declarations.Nodes) > 1 && list.Flags&ast.NodeFlagsUsing == 0 {
				for _, declaration := range list.Declarations.Nodes {
					if nodeInside(operation, declaration) && runtimeModuleEvaluation(declaration) {
						return declaration
					}
				}
				return nil
			}
		}
		return node
	}
	return nil
}

// sourceStagedEvaluationOwner shares the source index's eager-name boundary.
// A method's computed name is evaluated by its surrounding owner, not its body.
func sourceStagedEvaluationOwner(node *ast.Node) *ast.Node {
	for child, parent := node, node.Parent; parent != nil; child, parent = parent, parent.Parent {
		if sourceMemberOperationOwnsChild(parent, child) {
			return parent
		}
	}
	return nil
}
