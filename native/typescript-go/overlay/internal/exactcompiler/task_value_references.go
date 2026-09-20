package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// referencedFunctionTask discovers setup-owned policy functions passed as values, including
// shorthand properties. The durable task binding must exist even when no local call is visible.
// Ordinary call targets stay with activation analysis so setup-only readiness is unchanged.
func referencedFunctionTask(
	node *ast.Node,
	component componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	bindings externalImportBindings,
) (*ast.Node, []string, bool) {
	if !ast.IsIdentifier(node) || ast.IsPartOfTypeNode(node) {
		return nil, nil, false
	}
	shorthand := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent)
	if !shorthand && (ast.IsDeclarationName(node) || isStaticPropertyName(node)) {
		return nil, nil, false
	}
	if functionTaskCallTarget(node) {
		return nil, nil, false
	}
	symbol := typeChecker.GetSymbolAtLocation(node)
	if shorthand {
		symbol = typeChecker.GetShorthandAssignmentValueSymbol(node.Parent)
	}
	symbol = resolvedCallableSymbol(symbol, typeChecker)
	if symbol == nil {
		return nil, nil, false
	}
	for _, declaration := range symbol.Declarations {
		work := declaration
		if ast.IsVariableDeclaration(work) {
			work = work.AsVariableDeclaration().Initializer
		}
		if work == nil || !isCallableNode(work) || work.Body() == nil || work == component.node {
			continue
		}
		owner := work.Parent
		for owner != nil && !isCallableNode(owner) {
			owner = owner.Parent
		}
		if owner != component.node {
			continue
		}
		if facets, explicit := functionTaskPolicy(work, sourceFile, bindings); explicit {
			return work, facets, true
		}
	}
	return nil, nil, false
}

// Parentheses and type assertions do not turn a direct activation into a callback value.
func functionTaskCallTarget(node *ast.Node) bool {
	current := node
	for current.Parent != nil {
		parent := current.Parent
		if ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) ||
			ast.IsNonNullExpression(parent) || ast.IsSatisfiesExpression(parent) {
			current = parent
			continue
		}
		if ast.IsPropertyAccessExpression(parent) {
			member := parent.AsPropertyAccessExpression()
			if member.Expression == current && member.Name() != nil &&
				(member.Name().Text() == "call" || member.Name().Text() == "apply") {
				current = parent
				continue
			}
		}
		return ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == current
	}
	return false
}
