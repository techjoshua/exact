package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// helperObjectCapture retains construction-local keys without retaining a creator transaction.
type helperObjectCapture struct {
	name, initializer, typeNode *ast.Node
	suspends                    bool
}

func helperObjectRequiresCapture(source *ast.Node, typeChecker *checker.Checker) bool {
	for _, member := range source.AsObjectLiteralExpression().Properties.Nodes {
		if _, valid := objectHelperMemberKey(member, typeChecker); !valid {
			return true
		}
	}
	return false
}

func helperObjectMemberKind(member *ast.Node) string {
	if ast.IsGetAccessorDeclaration(member) {
		return "get"
	}
	if ast.IsSetAccessorDeclaration(member) {
		return "set"
	}
	return "value"
}

// prepareHelperObjectCapture leaves statically provable objects on their existing fast path.
func (lowering *jsxLowering) prepareHelperObjectCapture(source *ast.Node) *helperObjectCapture {
	if !helperObjectRequiresCapture(source, lowering.checker) {
		return nil
	}
	if lowering.helperObjectRegistryName == "" {
		lowering.helperObjectRegistryName = lowering.uniqueMutationName("__exactCreateHelperObject")
		lowering.helperObjectTypeName = lowering.uniqueMutationName("__exactHelperObjectCapture")
	}
	definitions := []*ast.Node{}
	for _, member := range source.AsObjectLiteralExpression().Properties.Nodes {
		key, valid := objectHelperMemberKey(member, lowering.checker)
		prototype := valid && key == "__proto__" && ast.IsPropertyAssignment(member) && !ast.IsComputedPropertyName(member.Name())
		var definition *ast.Node
		if valid && !prototype {
			definition = lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone), lowering.factory.NewStringLiteral(helperObjectMemberKind(member), ast.TokenFlagsNone)}), false)
		} else {
			definition = lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone))
		}
		definitions = append(definitions, definition)
	}
	capture := &helperObjectCapture{
		name:        lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactObjectCapture")),
		typeNode:    lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier(lowering.helperObjectTypeName), nil),
		initializer: lowering.call(lowering.helperObjectRegistryName, []*ast.Node{lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(definitions), false)}),
	}
	var inspect func(*ast.Node)
	inspect = func(node *ast.Node) {
		walkNode(node, func(child *ast.Node) bool {
			if ast.IsFunctionLike(child) {
				if ast.IsComputedPropertyName(child.Name()) {
					inspect(child.Name().AsComputedPropertyName().Expression)
				}
				return false
			}
			if ast.IsAwaitExpression(child) || ast.IsYieldExpression(child) {
				capture.suspends = true
			}
			return true
		})
	}
	inspect(source)
	if capture.suspends {
		declaration := lowering.factory.NewVariableDeclaration(capture.name, nil, capture.typeNode, nil)
		if len(lowering.mutationFrames) != 0 {
			frame := lowering.mutationFrames[len(lowering.mutationFrames)-1]
			frame.declarations = append(frame.declarations, declaration)
		} else {
			lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{declaration}), ast.NodeFlagsLet)))
		}
	}
	return capture
}

func (lowering *jsxLowering) captureHelperObjectMember(capture *helperObjectCapture, index int, source *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	position := lowering.factory.NewNumericLiteral(fmt.Sprint(index), ast.TokenFlagsNone)
	if ast.IsSpreadAssignment(source) {
		spread := visitor.VisitNode(source).AsSpreadAssignment()
		return lowering.factory.UpdateSpreadAssignment(spread, lowering.helperContextCall(capture.name, "spread", []*ast.Node{position, spread.Expression}))
	}
	_, known := objectHelperMemberKey(source, lowering.checker)
	var name *ast.Node
	prepared := source
	if !known {
		expression := source.Name()
		if ast.IsComputedPropertyName(expression) {
			expression = expression.AsComputedPropertyName().Expression
		}
		key := lowering.helperContextCall(capture.name, "key", []*ast.Node{position, visitor.VisitNode(expression), lowering.factory.NewStringLiteral(helperObjectMemberKind(source), ast.TokenFlagsNone)})
		if typeNode := lowering.helperObjectKeyTypes[nodeSpanKey(expression)]; typeNode != nil {
			key = lowering.factory.NewAsExpression(key, typeNode)
		}
		name = lowering.factory.NewComputedPropertyName(key)
		// Key work executes in the creation context. Method bodies remain ordinary originals.
		prepared = lowering.helperObjectMemberName(source, lowering.factory.NewIdentifier("__exactUnvisitedKey"))
	}
	var original *ast.Node
	if ast.IsMethodDeclaration(source) || ast.IsGetAccessorDeclaration(source) || ast.IsSetAccessorDeclaration(source) {
		original = lowering.visitHelperOriginal(prepared)
	} else {
		original = visitor.VisitNode(prepared)
	}
	if name != nil {
		original = lowering.helperObjectMemberName(original, name)
	}
	return original
}

func (lowering *jsxLowering) helperObjectMemberName(node, name *ast.Node) *ast.Node {
	if ast.IsPropertyAssignment(node) {
		m := node.AsPropertyAssignment()
		return lowering.factory.UpdatePropertyAssignment(m, m.Modifiers(), name, m.PostfixToken, m.Type, m.Initializer)
	}
	if ast.IsMethodDeclaration(node) {
		m := node.AsMethodDeclaration()
		return lowering.factory.UpdateMethodDeclaration(m, m.Modifiers(), m.AsteriskToken, name, m.PostfixToken, m.TypeParameters, m.Parameters, m.Type, m.FullSignature, m.Body)
	}
	if ast.IsGetAccessorDeclaration(node) {
		m := node.AsGetAccessorDeclaration()
		return lowering.factory.UpdateGetAccessorDeclaration(m, m.Modifiers(), name, m.TypeParameters, m.Parameters, m.Type, m.FullSignature, m.Body)
	}
	m := node.AsSetAccessorDeclaration()
	return lowering.factory.UpdateSetAccessorDeclaration(m, m.Modifiers(), name, m.TypeParameters, m.Parameters, m.Type, m.FullSignature, m.Body)
}

// finishHelperObjectCapture gives synchronous construction its own lexical capture. Native await
// and yield remain in the authored executor, using invocation-local selections instead of a thunk.
func (lowering *jsxLowering) finishHelperObjectCapture(capture *helperObjectCapture, object, original, typeNode *ast.Node, statements []*ast.Node) *ast.Node {
	captureParameter := lowering.factory.NewParameterDeclaration(nil, nil, capture.name, nil, capture.typeNode, nil)
	parameters := []*ast.Node{captureParameter}
	arguments := []*ast.Node{capture.initializer}
	if capture.suspends {
		parameters = []*ast.Node{lowering.factory.NewParameterDeclaration(nil, nil, object, nil, typeNode, nil), captureParameter}
		arguments = []*ast.Node{original, capture.name}
	} else {
		declaration := lowering.factory.NewVariableDeclaration(object, nil, nil, original)
		statements = append([]*ast.Node{lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{declaration}), ast.NodeFlagsConst))}, statements...)
	}
	register := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList(parameters), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))
	call := lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(register), nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
	if capture.suspends {
		return lowering.mutationSequence([]*ast.Node{lowering.binary(capture.name, ast.KindEqualsToken, capture.initializer), call})
	}
	return call
}
