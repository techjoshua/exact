package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
)

// componentChildren lowers authored children as finalized component-ABI inputs. Unlike an
// intrinsic child range, a component child is delivered through the receiving artifact's prop
// receipt. Keeping a parent-owned live range here would hide keyed identity from transparent
// components and allow a retained outgoing generation to observe values from its replacement.
func (lowering *jsxLowering) componentChildren(children *ast.NodeList) []*ast.Node {
	return lowering.componentChildrenMode(children, false)
}

func (lowering *jsxLowering) componentChildrenMode(children *ast.NodeList, observeTextSpreads bool) []*ast.Node {
	if children == nil {
		return nil
	}
	// Public composition retains intrinsic structure. Fixed declarations can carry a lazy view
	// beside a render program; other children keep their directly inspectable representation.
	previousFallback := lowering.renderProgramFallback
	lowering.renderProgramFallback = true
	defer func() { lowering.renderProgramFallback = previousFallback }()
	result := []*ast.Node{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				result = append(
					result,
					lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone),
				)
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			emitted := lowering.visitor.VisitNode(expression)
			// Reuse the existing reactive-expression eligibility boundary. Module-local and
			// ordinary invocation operands without a component capture stay eager in
			// declarative output. A child reader must not introduce a new authored call.
			if lowering.target == TargetClient && !observeTextSpreads &&
				!(lowering.declarativeRenderDepth > 0 && !lowering.hasReactiveComponentCapture(expression)) {
				closure := lowering.reactiveClosure(expression)
				if closure == nil {
					closure = lowering.arrow(emitted)
				}
				result = append(result, lowering.call(lowering.names.componentPropExpression, []*ast.Node{closure}))
			} else if observeTextSpreads {
				result = append(result, lowering.reactiveExpression(expression, emitted))
			} else {
				result = append(result, emitted)
			}
		default:
			if !previousFallback {
				if program := lowering.lowerComposableIntrinsicChild(child); program != nil {
					result = append(result, program)
					continue
				}
			}
			emitted := lowering.visitor.VisitNode(child)
			if observeTextSpreads && textHostChildHasIntrinsicSpread(child) {
				// Text presentation owns this observation. Rebuild copied property bags under
				// that observation so reconciled keys remain visible in serialized markup.
				emitted = lowering.reactiveExpression(child, emitted)
			}
			result = append(result, emitted)
		}
	}
	return result
}

// componentInputRecipeCall preserves eager invocation operands and captures fixed sibling
// handles once. Only the receiving acquisition reads marked compiler operands. Indexed closure
// proof is decided before adding this recipe, including the closed zero-dependency case.
func (lowering *jsxLowering) componentInputRecipeCall(node *ast.Node, closed bool) *ast.Node {
	if !ast.IsCallExpression(node) {
		return node
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.Arguments == nil {
		return node
	}
	if call.Expression.Text() == lowering.names.componentReceiptUpdate {
		args := append([]*ast.Node(nil), call.Arguments.Nodes...)
		args[0] = lowering.componentInputRecipeCall(args[0], closed)
		return lowering.call(lowering.names.componentReceiptUpdate, args)
	}
	if call.Expression.Text() != lowering.names.componentReceipt || len(call.Arguments.Nodes) <= 2 {
		return node
	}
	f := lowering.factory
	values := f.NewArrayLiteralExpression(f.NewNodeList(call.Arguments.Nodes[2:]), false)
	var recipe *ast.Node
	if closed || lowering.target == TargetServer {
		recipe = f.NewObjectLiteralExpression(f.NewNodeList([]*ast.Node{
			lowering.property(f.NewIdentifier("kind"), f.NewStringLiteral("eager", ast.TokenFlagsNone)),
			lowering.property(f.NewIdentifier("values"), values),
		}), false)
	} else {
		captured := f.NewUniqueName("__exactChildInputs")
		childType := f.NewImportTypeNode(false, f.NewLiteralTypeNode(f.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone)), nil, f.NewIdentifier("Child"), nil)
		capturedValues := append([]*ast.Node(nil), call.Arguments.Nodes[2:]...)
		acquiredValues := make([]*ast.Node, len(capturedValues))
		for index, value := range capturedValues {
			read := f.NewElementAccessExpression(captured, nil, f.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone), ast.NodeFlagsNone)
			if ast.IsCallExpression(value) {
				marked := value.AsCallExpression()
				if ast.IsIdentifier(marked.Expression) && marked.Expression.Text() == lowering.names.componentPropExpression &&
					marked.Arguments != nil && len(marked.Arguments.Nodes) == 1 {
					// The existing marked compiler demand becomes this occurrence's reader, rather
					// than a supplier-scoped cached cell. Capturing the closure does not run it.
					capturedValues[index] = marked.Arguments.Nodes[0]
					functionType := f.NewFunctionTypeNode(nil, nil, childType)
					read = f.NewCallExpression(f.NewParenthesizedExpression(f.NewAsExpression(read, functionType)), nil, nil, nil, ast.NodeFlagsNone)
				} else {
					read = f.NewAsExpression(read, childType)
				}
			} else {
				read = f.NewAsExpression(read, childType)
			}
			acquiredValues[index] = read
		}
		values = f.NewArrayLiteralExpression(f.NewNodeList(capturedValues), false)
		acquired := f.NewArrayLiteralExpression(f.NewNodeList(acquiredValues), false)
		body := f.NewObjectLiteralExpression(f.NewNodeList([]*ast.Node{
			lowering.property(f.NewIdentifier("kind"), f.NewStringLiteral("reader", ast.TokenFlagsNone)),
			lowering.property(f.NewIdentifier("read"), lowering.arrow(acquired)),
		}), false)
		recipeType := f.NewImportTypeNode(false, f.NewLiteralTypeNode(f.NewStringLiteral("@exactjs/core/runtime/component-operations", ast.TokenFlagsNone)), nil, f.NewIdentifier("ExactComponentChildrenInput"), nil)
		capture := f.NewArrowFunction(nil, nil, f.NewNodeList([]*ast.Node{
			f.NewParameterDeclaration(nil, nil, captured, nil, f.NewArrayTypeNode(f.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil),
		}), recipeType, nil, f.NewToken(ast.KindEqualsGreaterThanToken), f.NewParenthesizedExpression(body))
		recipe = f.NewCallExpression(f.NewParenthesizedExpression(capture), nil, nil, f.NewNodeList([]*ast.Node{values}), ast.NodeFlagsNone)
	}
	return lowering.call(lowering.names.componentReceipt, []*ast.Node{call.Arguments.Nodes[0], call.Arguments.Nodes[1], recipe})
}
