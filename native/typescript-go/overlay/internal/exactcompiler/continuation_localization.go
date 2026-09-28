package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// planTaskLocalization identifies work that needs the invoking component's locale policy.
// The snapshot crosses the existing dependency boundary, never the formatter or its owner.
func planTaskLocalization(source *ast.SourceFile, tasks []Task, intl intlOperationPlan) {
	for index := range tasks {
		task := &tasks[index]
		work := nodeAtSpan(source.AsNode(), task.WorkStart, task.WorkLength)
		if work == nil {
			continue
		}
		task.localization = componentUsesProtocolMember(work, "intl")
		walkNode(work, func(node *ast.Node) bool {
			if intl.componentUse(node) {
				task.localization = true
			}
			return true
		})
	}
}

func attachContinuationLocalization(continuations []Continuation, tasks []Task) {
	localized := make(map[string]bool)
	for _, task := range tasks {
		localized[task.ID] = task.localization
	}
	for index := range continuations {
		continuation := &continuations[index]
		if !localized[continuation.TaskID] {
			continue
		}
		continuation.localization = true
		continuation.Activation.Dependencies = append(continuation.Activation.Dependencies, TaskDependency{
			Index: len(continuation.Activation.Dependencies), Source: "derived", Path: "this.intl",
		})
	}
}

// localizedTransportArguments snapshots only the two public strings that affect formatting.
// A missing provider is represented by null, preserving the destination realm's native default.
func (lowering *jsxLowering) localizedTransportArguments(arguments *ast.Node, localized bool) *ast.Node {
	if !localized {
		return arguments
	}
	factory := lowering.factory
	token := factory.NewIdentifier(lowering.names.localizationContext)
	call := func(name string) *ast.Node {
		return factory.NewCallExpression(factory.NewPropertyAccessExpression(factory.NewThisExpression(), nil,
			factory.NewIdentifier(name), ast.NodeFlagsNone), nil, nil, factory.NewNodeList([]*ast.Node{token}), ast.NodeFlagsNone)
	}
	policy := func(name string) *ast.Node {
		return factory.NewPropertyAccessExpression(call("getContext"), nil, factory.NewIdentifier(name), ast.NodeFlagsNone)
	}
	sourceLocale := factory.NewBinaryExpression(nil, policy("sourceLocale"), nil, factory.NewToken(ast.KindQuestionQuestionToken), factory.NewKeywordExpression(ast.KindNullKeyword))
	snapshot := factory.NewConditionalExpression(call("hasContext"), factory.NewToken(ast.KindQuestionToken),
		contractArray(factory, policy("locale"), sourceLocale), factory.NewToken(ast.KindColonToken), factory.NewKeywordExpression(ast.KindNullKeyword))
	return contractArray(factory, factory.NewSpreadElement(arguments), snapshot)
}

// continuationLocalizationOwner exposes exactly the captured localization context. It grants
// no server-context lookup authority and keeps every invocation's policy separate from the pool.
func continuationLocalizationOwner(factory *printer.NodeFactory, activation *ast.Node, index int, localizationContextName string) []*ast.Node {
	dependency := factory.NewElementAccessExpression(factory.NewPropertyAccessExpression(activation, nil,
		factory.NewIdentifier("dependencies"), ast.NodeFlagsNone), nil, contractNumber(factory, index), ast.NodeFlagsNone)
	token := factory.NewIdentifier("token")
	tokenType := factory.NewTypeLiteralNode(factory.NewNodeList([]*ast.Node{
		factory.NewPropertySignatureDeclaration(nil, factory.NewIdentifier("id"), nil, factory.NewKeywordTypeNode(ast.KindSymbolKeyword), nil),
	}))
	parameter := factory.NewParameterDeclaration(nil, nil, token, nil, tokenType, nil)
	identity := factory.NewPropertyAccessExpression(factory.NewIdentifier(localizationContextName), nil, factory.NewIdentifier("id"), ast.NodeFlagsNone)
	allowed := factory.NewBinaryExpression(nil, factory.NewPropertyAccessExpression(token, nil, factory.NewIdentifier("id"), ast.NodeFlagsNone), nil,
		factory.NewToken(ast.KindEqualsEqualsEqualsToken), identity)
	present := factory.NewBinaryExpression(nil, dependency, nil, factory.NewToken(ast.KindExclamationEqualsToken), factory.NewKeywordExpression(ast.KindNullKeyword))
	has := factory.NewBinaryExpression(nil, allowed, nil, factory.NewToken(ast.KindAmpersandAmpersandToken), present)
	arrow := func(body *ast.Node, generic bool) *ast.Node {
		var typeParameters *ast.NodeList
		if generic {
			typeParameters = factory.NewNodeList([]*ast.Node{factory.NewTypeParameterDeclaration(nil, factory.NewIdentifier("T"), factory.NewKeywordTypeNode(ast.KindUnknownKeyword), nil, nil)})
		}
		return factory.NewArrowFunction(nil, typeParameters, factory.NewNodeList([]*ast.Node{parameter}), nil, nil,
			factory.NewToken(ast.KindEqualsGreaterThanToken), body)
	}
	// The transport validates JSON safety. The formatter validates captured locale strings
	// through the same native Intl boundary as authored locale arguments.
	policy := factory.NewAsExpression(dependency, factory.NewArrayTypeNode(factory.NewKeywordTypeNode(ast.KindStringKeyword)))
	read := func(position int) *ast.Node {
		return factory.NewElementAccessExpression(factory.NewParenthesizedExpression(policy), nil, contractNumber(factory, position), ast.NodeFlagsNone)
	}
	value := contractObject(factory, false,
		contractProperty(factory, "locale", read(0)),
		contractProperty(factory, "sourceLocale", factory.NewBinaryExpression(nil, read(1), nil, factory.NewToken(ast.KindQuestionQuestionToken), factory.NewIdentifier("undefined"))),
	)
	body := factory.NewBlock(factory.NewNodeList([]*ast.Node{
		factory.NewIfStatement(factory.NewPrefixUnaryExpression(ast.KindExclamationToken, factory.NewParenthesizedExpression(has)),
			factory.NewThrowStatement(factory.NewNewExpression(factory.NewIdentifier("TypeError"), nil,
				factory.NewNodeList([]*ast.Node{contractString(factory, "Continuation localization context is unavailable")}))), nil),
		factory.NewReturnStatement(factory.NewAsExpression(value, factory.NewTypeReferenceNode(factory.NewIdentifier("T"), nil))),
	}), true)
	return []*ast.Node{
		contractProperty(factory, "hasContext", arrow(has, false)),
		contractProperty(factory, "getContext", arrow(body, true)),
	}
}
