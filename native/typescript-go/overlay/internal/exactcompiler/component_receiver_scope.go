package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// componentStateReceiverScopes distinguishes compiler-owned receivers from ordinary functions,
// object methods and class instances that happen to expose a property named state.
func componentStateReceiverScopes(component *ast.Node, typeChecker *checker.Checker) map[*ast.Node]bool {
	owners := map[*ast.Node]bool{component: true}
	for _, returned := range directCallableReturns(component) {
		value := unwrapRenderExpression(returned)
		if value != nil && ast.IsFunctionExpression(value) {
			owners[value] = true
		}
	}
	sourceFile := ast.GetSourceFileOfNode(component)
	if sourceFile == nil {
		return owners
	}
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	walkNode(component, func(node *ast.Node) bool {
		if node != component && (ast.IsFunctionExpression(node) || ast.IsFunctionDeclaration(node)) && !taskRegistrationInsideNestedFunction(node, component) {
			generated := ast.IsFunctionDeclaration(node) && node.Name() != nil && strings.HasPrefix(node.Name().Text(), "__exactComponentComputation_")
			standalone := ast.IsFunctionDeclaration(node) || node.Parent != nil && ast.IsVariableDeclaration(node.Parent)
			ownThis := false
			for _, parameter := range node.Parameters() {
				if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
					ownThis = true
				}
			}
			// Standalone setup functions without a receiver annotation participate in inferred
			// task ownership. Object members and explicitly typed ordinary receivers do not.
			if _, valid := functionTaskPolicy(node, sourceFile, bindings); valid || generated || standalone && !ownThis {
				owners[node] = true
			}
		}
		return true
	})
	return owners
}

// componentOwnsReceiver follows lexical arrows and stops at the first ordinary receiver scope.
// Class initializers and static blocks establish receivers even without a function boundary.
func componentOwnsReceiver(node *ast.Node, owners map[*ast.Node]bool) bool {
	computedName := false
	for child, current := node, node.Parent; current != nil; child, current = current, current.Parent {
		if owners[current] {
			return true
		}
		if (ast.IsFunctionLike(current) || ast.IsPropertyDeclaration(current)) && current.Name() == child {
			computedName = true
			continue
		}
		if ast.IsClassDeclaration(current) || ast.IsClassExpression(current) {
			if computedName {
				computedName = false
				continue
			}
			return false
		}
		if ast.IsFunctionLike(current) && !ast.IsArrowFunction(current) {
			return false
		}
	}
	return false
}
