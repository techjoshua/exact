package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type renderHelperCallbackUse struct {
	event bool
	eager bool
	other bool
}

// planRenderHelperTaskCallbacks records server erasure only for inline task
// callbacks whose checked helper receives them solely for intrinsic events.
// The call, other arguments, helper body and continuation work remain intact.
func planRenderHelperTaskCallbacks(
	renders []componentRender,
	tasks []Task,
	owner *sourceValueOwner,
) (map[*ast.Node]struct{}, []Diagnostic) {
	var projected map[*ast.Node]struct{}
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
		return nil, nil
	}
	c := owner.checker
	usesByHelper := make(map[*ast.Node][]renderHelperCallbackUse)
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
				uses = renderHelperCallbackUses(helper, call.AsCallExpression().Expression, owner)
				usesByHelper[helper] = uses
			}
			if i >= len(uses) {
				continue
			}
			use := uses[i]
			if use.eager {
				diagnostics = append(diagnostics, renderDiagnostic(invocation,
					"render functions may not invoke a task through a helper callback. Invoke the task during component setup or from an event handler"))
			}
			if use.event && !use.eager && !use.other {
				if projected == nil {
					projected = make(map[*ast.Node]struct{})
				}
				projected[callback] = struct{}{}
			}
		}
	}
	return projected, diagnostics
}

// Only explicit formal references can prove an event-only argument. Indirect
// access through arguments or direct eval leaves the entire helper unproved.
func renderHelperCallbackUses(helper, callee *ast.Node, owner *sourceValueOwner) []renderHelperCallbackUse {
	c := owner.checker
	symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(callee), c)
	if symbol == nil || owner.bindingWritten(symbol) || usesForeignJSXRuntime(ast.GetSourceFileOfNode(helper)) {
		return nil
	}
	params := helper.Parameters()
	uses := make([]renderHelperCallbackUse, len(params))
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
	opaque := false
	walkNode(helper, func(node *ast.Node) bool {
		if opaque || ast.IsTypeNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		if node.Text() == "arguments" || node.Text() == "eval" {
			opaque = true
			return false
		}
		binding := c.GetSymbolAtLocation(node)
		if ast.IsShorthandPropertyAssignment(node.Parent) {
			binding = c.GetShorthandAssignmentValueSymbol(node.Parent)
		}
		if binding == nil {
			return true
		}
		if i, found := indexes[ast.GetSymbolId(binding)]; found {
			parent := node.Parent
			scope := enclosingCallableNode(node)
			switch {
			case intrinsicEventValue(node) || (scope != nil &&
				(ast.IsArrowFunction(scope) || ast.IsFunctionExpression(scope)) && intrinsicEventValue(scope)):
				uses[i].event = true
			case ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == node &&
				scope == helper:
				uses[i].eager = true
			default:
				uses[i].other = true
			}
		}
		return true
	})
	if opaque {
		return nil
	}
	return uses
}

// intrinsicEventValue recognizes whole expressions omitted by server JSX
// lowering, including an ordinary function that will run only on dispatch.
func intrinsicEventValue(node *ast.Node) bool {
	expression := node.Parent
	for expression != nil && ast.IsParenthesizedExpression(expression) {
		expression = expression.Parent
	}
	if expression == nil || !ast.IsJsxExpression(expression) || !ast.IsJsxAttribute(expression.Parent) {
		return false
	}
	attribute := expression.Parent.AsJsxAttribute()
	opening := attribute.Parent.Parent
	tag := opening.TagName()
	return tag != nil && ast.IsIdentifier(tag) && jsxIntrinsic(tag.Text()) &&
		jsxEventAttribute(jsxAttributeText(attribute.Name()))
}
