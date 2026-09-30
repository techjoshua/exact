package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// invokedTaskCapture carries an authored read across the transport without copying unrelated props.
// State and context have their own transport contracts and are deliberately excluded here.
type invokedTaskCapture struct {
	expression *ast.Node
	source     string
	path       string
}

func invokedTaskCaptures(task Task, source *ast.SourceFile, bindings []ReactiveBinding, typeChecker *checker.Checker) []invokedTaskCapture {
	work := nodeAtSpan(source.AsNode(), task.WorkStart, task.WorkLength)
	if work == nil {
		return nil
	}
	byStart := map[int]ReactiveBinding{}
	for _, binding := range bindings {
		if binding.Component == task.Component && (binding.Provenance == "props" || binding.Provenance == "derived") {
			byStart[binding.Start] = binding
		}
	}
	excluded := taskCaptureRanges(work, task.ArgumentCount)
	var result []invokedTaskCapture
	walkNode(work, func(node *ast.Node) bool {
		if spanInsideTaskCapture(node.Pos(), node.End(), excluded) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		for _, declaration := range symbol.Declarations {
			name := declaration.Name()
			if name == nil {
				continue
			}
			binding, exists := byStart[name.Pos()]
			if !exists || (name.Pos() >= work.Pos() && name.End() <= work.End()) {
				continue
			}
			capture := node
			for capture.Parent != nil {
				parent := capture.Parent
				if !ast.IsPropertyAccessExpression(parent) || parent.AsPropertyAccessExpression().Expression != capture {
					break
				}
				// A method needs its receiver. Capture the receiver and leave the call on the server.
				if parent.Parent != nil && ast.IsCallExpression(parent.Parent) && parent.Parent.AsCallExpression().Expression == parent {
					break
				}
				capture = parent
			}
			result = append(result, invokedTaskCapture{expression: capture, source: binding.Provenance, path: sourceText(source, capture)})
			break
		}
		return true
	})
	return result
}

// Capture substitution crosses nested function scopes because lexical ownership was resolved
// during analysis. Executor rewriting can then preserve those functions' independent this binding.
func projectInvokedTaskCaptures(factory *printer.NodeFactory, work *ast.Node, continuation Continuation, activation *ast.Node) *ast.Node {
	if len(continuation.captures) == 0 {
		return work
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		for index, capture := range continuation.captures {
			if node.Pos() == capture.expression.Pos() && node.End() == capture.expression.End() {
				return factory.NewElementAccessExpression(
					factory.NewPropertyAccessExpression(activation, nil, factory.NewIdentifier("dependencies"), ast.NodeFlagsNone), nil,
					contractNumber(factory, len(continuation.Invocation.Arguments)+index), ast.NodeFlagsNone)
			}
		}
		return visitor.VisitEachChild(node)
	}, &factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(work)
}
