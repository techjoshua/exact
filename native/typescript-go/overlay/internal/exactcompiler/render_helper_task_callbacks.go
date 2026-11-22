package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// renderHelperTaskCallbackDiagnostics reports a checked eager call in the render
// phase. Task placement and event registration do not depend on this proof.
func renderHelperTaskCallbackDiagnostics(
	renders []componentRender,
	tasks []Task,
	owner *sourceValueOwner,
) []Diagnostic {
	var diagnostics []Diagnostic
	var taskCalls map[int]struct{}
	for _, task := range tasks {
		if task.Invoked && (task.Placement == "server" || task.Placement == "isomorphic") {
			if taskCalls == nil {
				taskCalls = make(map[int]struct{})
			}
			taskCalls[task.Start] = struct{}{}
		}
	}
	if len(taskCalls) == 0 {
		return nil
	}
	c := owner.checker
	usesByHelper := make(map[*ast.Node][]bool)
	for _, render := range renders {
		call := unwrapRenderExpression(render.callable.Body())
		if call == nil || !ast.IsCallExpression(call) || !ast.IsIdentifier(call.AsCallExpression().Expression) {
			continue
		}
		args := callArguments(call)
		if slices.ContainsFunc(args, ast.IsSpreadElement) {
			continue
		}
		for i, arg := range args {
			callback := unwrapRenderExpression(arg)
			if !ast.IsArrowFunction(callback) && !ast.IsFunctionExpression(callback) {
				continue
			}
			var invocation *ast.Node
			walkCallable(callback, func(node *ast.Node) bool {
				if ast.IsCallExpression(node) {
					if _, task := taskCalls[node.Pos()]; task {
						invocation = node
					}
				}
				return invocation == nil
			})
			if invocation == nil {
				continue
			}
			helper := compilerOwnedRenderHelper(call, c)
			if helper == nil {
				break
			}
			uses, known := usesByHelper[helper]
			if !known {
				uses = renderHelperEagerCallbacks(helper, call.AsCallExpression().Expression, owner)
				usesByHelper[helper] = uses
			}
			if i >= len(uses) {
				continue
			}
			if uses[i] {
				diagnostics = append(diagnostics, renderDiagnostic(invocation,
					"render functions may not invoke a task through a helper callback. Invoke the task during component setup or from an event handler"))
			}
		}
	}
	return diagnostics
}

// renderHelperEagerCallbacks recognizes direct calls to checked parameter bindings
// in the helper body. A nested function runs in a separate phase.
func renderHelperEagerCallbacks(helper, callee *ast.Node, owner *sourceValueOwner) []bool {
	c := owner.checker
	symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(callee), c)
	if symbol == nil || owner.bindingWritten(symbol) || usesForeignJSXRuntime(ast.GetSourceFileOfNode(helper)) {
		return nil
	}
	params := helper.Parameters()
	uses := make([]bool, len(params))
	indexes := make(map[ast.SymbolId]int, len(params))
	for i, param := range params {
		name := param.Name()
		if name != nil && ast.IsIdentifier(name) && name.Text() == "this" {
			// TypeScript's explicit receiver is absent from the argument list.
			return nil
		}
		if name != nil && ast.IsIdentifier(name) && param.AsParameterDeclaration().DotDotDotToken == nil {
			if binding := c.GetSymbolAtLocation(name); binding != nil {
				indexes[ast.GetSymbolId(binding)] = i
			}
		}
	}
	walkCallable(helper, func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		callee := node.AsCallExpression().Expression
		if ast.IsIdentifier(callee) {
			if symbol := c.GetSymbolAtLocation(callee); symbol != nil {
				if i, found := indexes[ast.GetSymbolId(symbol)]; found {
					uses[i] = true
				}
			}
		}
		return true
	})
	return uses
}
