package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperCallableSite includes returned closures and local declarations without changing contextual
// callback arguments. Their originals retain lexical captures, while companions select invocation ownership.
func helperCallableSite(node *ast.Node) bool {
	parent := helperCallableParent(node)
	if parent == nil {
		return false
	}
	return ast.IsConditionalExpression(parent) || ast.IsArrayLiteralExpression(parent) || ast.IsBinaryExpression(parent) || ast.IsParameterDeclaration(parent) || ast.IsBindingElement(parent) || ast.IsPropertyDeclaration(parent) || ast.IsPropertyAssignment(parent) || ast.IsVariableDeclaration(parent) || ast.IsReturnStatement(parent) || ast.IsArrowFunction(parent) || ast.IsFunctionDeclaration(node) && (ast.IsSourceFile(parent) || ast.IsBlock(parent))
}

// helperCallableParent retains value-producing sites through erased and grouping wrappers.
func helperCallableParent(node *ast.Node) *ast.Node {
	parent := node.Parent
	for parent != nil && (ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsSatisfiesExpression(parent) || ast.IsNonNullExpression(parent) || parent.Kind == ast.KindTypeAssertionExpression) {
		parent = parent.Parent
	}
	return parent
}

// helperRegistrationFrame keeps a local function's companion in the same hoisted lexical block.
type helperRegistrationFrame struct {
	block      string
	statements []*ast.Node
}

func (lowering *jsxLowering) lowerHelperRegistrationBlock(source *ast.Node, visit func(*ast.Node) *ast.Node) *ast.Node {
	frame := &helperRegistrationFrame{block: nodeSpanKey(source)}
	lowering.helperRegistrationFrames = append(lowering.helperRegistrationFrames, frame)
	defer func() {
		lowering.helperRegistrationFrames = lowering.helperRegistrationFrames[:len(lowering.helperRegistrationFrames)-1]
	}()
	body := visit(source)
	if len(frame.statements) == 0 {
		return body
	}
	statements := append(frame.statements, body.AsBlock().Statements.Nodes...)
	return lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
}

func (lowering *jsxLowering) retainHelperDeclaration(work, companion *ast.Node) {
	registration := lowering.factory.NewExpressionStatement(lowering.helperRegistration(work.Name(), companion, false, "", work, nil))
	if ast.IsSourceFile(work.Parent) {
		lowering.clientDefinitions = append(lowering.clientDefinitions, registration)
		return
	}
	key := nodeSpanKey(work.Parent)
	for index := len(lowering.helperRegistrationFrames) - 1; index >= 0; index-- {
		frame := lowering.helperRegistrationFrames[index]
		if frame.block == key {
			frame.statements = append(frame.statements, registration)
			return
		}
	}
	panic("local helper registration outside its lexical block")
}

// helperInsideComponent leaves setup and render closures with their component-owned lowering.
func (lowering *jsxLowering) helperInsideComponent(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if ast.IsFunctionLike(parent) && lowering.isHelperComponent(parent) {
			return true
		}
	}
	return false
}

// helperNestedCallable retains factory-created values even when their method calls hide effects.
func helperNestedCallable(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if ast.IsFunctionLike(parent) {
			return true
		}
	}
	return false
}

// visitHelperOriginal isolates authored binding temporaries from companion ownership and captures.
func (lowering *jsxLowering) visitHelperOriginal(work *ast.Node) *ast.Node {
	depth, pending := lowering.helperVariantDepth, lowering.pendingStates
	lowering.helperVariantDepth, lowering.pendingStates = 0, nil
	lowering.helperOriginalDepth++
	defer func() {
		lowering.helperVariantDepth, lowering.pendingStates = depth, pending
		lowering.helperOriginalDepth--
	}()
	if !ast.IsFunctionLike(work) || work.Body() == nil {
		return lowering.visitor.VisitEachChild(work)
	}
	frame := &mutationFrame{}
	lowering.mutationFrames = append(lowering.mutationFrames, frame)
	defer func() { lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1] }()
	original := lowering.visitor.VisitEachChild(work)
	if len(frame.declarations) == 0 {
		return original
	}
	if ast.IsFunctionDeclaration(original) || ast.IsFunctionExpression(original) || ast.IsArrowFunction(original) {
		return lowering.finishMutationFrame(original, frame)
	}
	statements := []*ast.Node{lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList(frame.declarations), ast.NodeFlagsLet))}
	statements = append(statements, original.Body().AsBlock().Statements.Nodes...)
	body := lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	if ast.IsMethodDeclaration(original) {
		m := original.AsMethodDeclaration()
		return lowering.factory.UpdateMethodDeclaration(m, m.Modifiers(), m.AsteriskToken, m.Name(), m.PostfixToken, m.TypeParameters, m.Parameters, m.Type, m.FullSignature, body)
	}
	if ast.IsGetAccessorDeclaration(original) {
		m := original.AsGetAccessorDeclaration()
		return lowering.factory.UpdateGetAccessorDeclaration(m, m.Modifiers(), m.Name(), m.TypeParameters, m.Parameters, m.Type, m.FullSignature, body)
	}
	if ast.IsSetAccessorDeclaration(original) {
		m := original.AsSetAccessorDeclaration()
		return lowering.factory.UpdateSetAccessorDeclaration(m, m.Modifiers(), m.Name(), m.TypeParameters, m.Parameters, m.Type, m.FullSignature, body)
	}
	if ast.IsConstructorDeclaration(original) {
		m := original.AsConstructorDeclaration()
		return lowering.factory.UpdateConstructorDeclaration(m, m.Modifiers(), m.TypeParameters, m.Parameters, m.Type, m.FullSignature, body)
	}
	panic("binding temporaries in unsupported helper original")
}

// helperHasBindingDefault retains companions for values created before the authored body executes.
func helperHasBindingDefault(work *ast.Node) bool {
	found := false
	for _, parameter := range work.Parameters() {
		initializer := parameter.AsParameterDeclaration().Initializer
		if initializer != nil {
			walkNode(initializer, func(node *ast.Node) bool {
				found = found || helperBindingReceiver(node) != nil || ast.IsFunctionLike(node)
				return !found
			})
		}
	}
	return found
}
