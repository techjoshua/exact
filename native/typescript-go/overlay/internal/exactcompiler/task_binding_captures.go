package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskBindingCaptureRead owns every occurrence of one activation snapshot.
// Distinct member paths carry separate values without transferring unrelated props.
type taskBindingCaptureRead struct {
	expression *ast.Node
	readSpans  map[string]struct{}
}

// taskBindingCaptures resolves lexical binding identity before collecting all reads.
// Static member paths share one snapshot. Dynamic selectors retain separate evaluations.
func taskBindingCaptures(work *ast.Node, binding ReactiveBinding, typeChecker *checker.Checker) []taskBindingCaptureRead {
	var result []taskBindingCaptureRead
	byPath := map[string]int{}
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		matches := false
		for _, declaration := range symbol.Declarations {
			if name := declaration.Name(); name != nil && name.Pos() == binding.Start {
				matches = true
				break
			}
		}
		if !matches {
			return true
		}
		capture := node
		for capture.Parent != nil {
			parent := capture.Parent
			// Snapshot the receiver before optional access, preserving the authored
			// chain in task work instead of substituting its partial result.
			if parent.Flags&ast.NodeFlagsOptionalChain != 0 {
				break
			}
			if ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == capture {
				capture = parent
				continue
			}
			if ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == capture {
				capture = parent
				continue
			}
			break
		}
		path, static := taskBindingCapturePath(capture)
		index, exists := byPath[path]
		if !static || !exists {
			index = len(result)
			result = append(result, taskBindingCaptureRead{expression: capture, readSpans: map[string]struct{}{}})
			if static {
				byPath[path] = index
			}
		}
		result[index].readSpans[nodeSpanKey(capture)] = struct{}{}
		return true
	})
	return result
}

// taskBindingCapturePath groups only source selectors whose keys have no evaluation effects.
// The root binding was resolved by the checker. Computed identifiers are deliberately ungrouped.
func taskBindingCapturePath(node *ast.Node) (string, bool) {
	if ast.IsIdentifier(node) {
		return node.Text(), true
	}
	var receiver *ast.Node
	var key string
	var optional bool
	if ast.IsPropertyAccessExpression(node) {
		access := node.AsPropertyAccessExpression()
		receiver, key, optional = access.Expression, access.Name().Text(), access.QuestionDotToken != nil
	} else if ast.IsElementAccessExpression(node) {
		access := node.AsElementAccessExpression()
		if !ast.IsStringLiteral(access.ArgumentExpression) && !ast.IsNumericLiteral(access.ArgumentExpression) {
			return "", false
		}
		receiver, key, optional = access.Expression, access.ArgumentExpression.Text(), access.QuestionDotToken != nil
	} else {
		return "", false
	}
	parent, static := taskBindingCapturePath(receiver)
	return fmt.Sprintf("%s/%t/%q", parent, optional, key), static
}
