package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperFactoryHome retains a fresh closure's lexical class independently of its later receiver.
type helperFactoryHome struct {
	class  *ast.Node
	static bool
}

func (lowering *jsxLowering) captureFactoryHelperHome(work *ast.Node) {
	if !ast.IsArrowFunction(work) || !helperHasLexicalSuper(work) || work.Parent == nil || ast.IsPropertyDeclaration(work.Parent) {
		return
	}
	static := false
	for parent := work.Parent; parent != nil; parent = parent.Parent {
		if ast.IsClassLike(parent) {
			plan := lowering.helperClasses[nodeSpanKey(parent)]
			if plan == nil {
				return
			}
			if plan.lexicalName == nil {
				plan.lexicalName = parent.Name()
				if plan.lexicalName == nil {
					name, known := helperInferredClassName(parent)
					if known {
						plan.lexicalName = lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactFactoryClass"))
						plan.restoreName = &name
					} else if plan.fieldHome == nil {
						plan.fieldHome = lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactFactoryHome"))
						lowering.clientDefinitions = append(lowering.clientDefinitions, lowering.helperConstant(plan.fieldHome, lowering.call("Symbol", nil)))
					}
				}
			}
			lowering.helperFactoryHomes[nodeSpanKey(work)] = helperFactoryHome{class: parent, static: static}
			return
		}
		if ast.IsFunctionLike(parent) && !ast.IsArrowFunction(parent) {
			if !(ast.IsMethodDeclaration(parent) || ast.IsGetAccessorDeclaration(parent) || ast.IsSetAccessorDeclaration(parent) || ast.IsConstructorDeclaration(parent)) {
				return
			}
			static = helperStaticMember(parent)
		}
	}
}

func (lowering *jsxLowering) factoryHelperHome(work *ast.Node) *ast.Node {
	home, exists := lowering.helperFactoryHomes[nodeSpanKey(work)]
	if !exists {
		return nil
	}
	plan := lowering.helperClasses[nodeSpanKey(home.class)]
	if plan.lexicalName == nil {
		selected := lowering.factory.NewElementAccessExpression(lowering.factory.NewKeywordExpression(ast.KindThisKeyword), nil, plan.fieldHome, ast.NodeFlagsNone)
		return lowering.factory.NewCallExpression(selected, lowering.factory.NewToken(ast.KindQuestionDotToken), nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsOptionalChain)
	}
	if home.static {
		return plan.lexicalName
	}
	return lowering.factory.NewPropertyAccessExpression(plan.lexicalName, nil, lowering.factory.NewIdentifier("prototype"), ast.NodeFlagsNone)
}

func (lowering *jsxLowering) helperClassName(source *ast.Node, plan *taskHelperClass) *ast.Node {
	if plan.lexicalName != nil {
		return plan.lexicalName
	}
	return source.Name()
}

// restoreHelperClassName preserves authored inference when a hidden lexical class binding is required.
func (lowering *jsxLowering) restoreHelperClassName(name string) *ast.Node {
	properties := []*ast.Node{lowering.factory.NewPropertyAssignment(nil, lowering.factory.NewIdentifier("value"), nil, nil, lowering.factory.NewStringLiteral(name, ast.TokenFlagsNone)), lowering.factory.NewPropertyAssignment(nil, lowering.factory.NewIdentifier("configurable"), nil, nil, lowering.factory.NewTrueExpression())}
	return lowering.factory.NewExpressionStatement(lowering.call("Object.defineProperty", []*ast.Node{lowering.factory.NewKeywordExpression(ast.KindThisKeyword), lowering.factory.NewStringLiteral("name", ast.TokenFlagsNone), lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)}))
}

// helperInferredClassName retains syntax-owned names without replaying dynamic property keys.
func helperInferredClassName(class *ast.Node) (string, bool) {
	if class.Modifiers() != nil {
		for _, modifier := range class.Modifiers().Nodes {
			if modifier.Kind == ast.KindDefaultKeyword {
				return "default", true
			}
		}
	}
	parent := class.Parent
	if parent == nil {
		return "", true
	}
	if ast.IsVariableDeclaration(parent) || ast.IsParameterDeclaration(parent) || ast.IsPropertyAssignment(parent) || ast.IsPropertyDeclaration(parent) {
		name := parent.Name()
		if name != nil && (ast.IsIdentifier(name) || ast.IsStringLiteral(name)) {
			return name.Text(), true
		}
		return "", false
	}
	if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		left := parent.AsBinaryExpression().Left
		if ast.IsIdentifier(left) {
			return left.Text(), true
		}
	}
	return "", true
}
