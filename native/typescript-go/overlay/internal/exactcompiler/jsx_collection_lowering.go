package exactcompiler

import (
	"regexp"

	"github.com/microsoft/typescript-go/internal/ast"
)

type collectionMapPlan struct {
	member      string
	primitive   bool
	keyed       bool
	declarative bool
}

var exactKeyArgument = regexp.MustCompile(
	`@exact\s+key(?:\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*))?`,
)

func (lowering *jsxLowering) lowerAnnotatedMap(node *ast.Node) *ast.Node {
	if lowering.checker == nil || !insideJSXChildExpression(node) {
		return nil
	}
	call := node.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) ||
		call.Expression.AsPropertyAccessExpression().Name().Text() != "map" ||
		call.Arguments == nil ||
		len(call.Arguments.Nodes) != 1 {
		return nil
	}
	plan, planned := lowering.collectionMaps[nodeSpanKey(node)]
	if !planned || plan.declarative {
		return nil
	}
	render := call.Arguments.Nodes[0]
	if (!ast.IsArrowFunction(render) && !ast.IsFunctionExpression(render)) ||
		len(render.Parameters()) != 1 {
		return nil
	}
	collection := call.Expression.AsPropertyAccessExpression().Expression
	if !plan.keyed {
		return nil
	}
	// The authored expression is Array.prototype.map; the component list
	// capability only becomes visible after this lowering creates this.map.
	// Record that semantic decision directly so runtime import selection does
	// not have to rediscover a synthesized node from the original source tree.
	lowering.listCapabilityUsed = true
	item := lowering.factory.NewIdentifier("__exactItem")
	var key *ast.Node = item
	if !plan.primitive {
		key = lowering.factory.NewPropertyAccessExpression(
			item,
			nil,
			lowering.factory.NewIdentifier(plan.member),
			ast.NodeFlagsNone,
		)
	}
	selector := lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewParameterDeclaration(nil, nil, item, nil, nil, nil),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		key,
	)
	emittedCollection := lowering.visitor.VisitNode(collection)
	var provenance *ast.Node
	if ast.IsIdentifier(collection) {
		if _, derived := lowering.derivedBindingAtReference(collection); derived {
			provenance = lowering.derivedCollectionProvenance(collection)
		}
	}
	if provenance == nil {
		provenance = lowering.factory.NewIdentifier("undefined")
	}
	identity := componentMapKeyIdentity(selector)
	var emittedIdentity *ast.Node = lowering.factory.NewIdentifier("undefined")
	if identity != "" {
		emittedIdentity = lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone)
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewThisExpression(),
			nil,
			lowering.factory.NewIdentifier("map"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			emittedCollection,
			selector,
			lowering.visitor.VisitNode(render),
			lowering.factory.NewStringLiteral(
				exactStableID(lowering.sourceFile.FileName(), "list", lowering.nodeIDs[node]),
				ast.TokenFlagsNone,
			),
			provenance,
			emittedIdentity,
		}),
		ast.NodeFlagsNone,
	)
}

// Key inference removes authored list ceremony only for maps that produce JSX
// children. Ordinary data transforms must retain Array.prototype.map semantics.
func insideJSXChildExpression(node *ast.Node) bool {
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsJsxExpression(current) {
			continue
		}
		parent := current.Parent
		return parent != nil && (ast.IsJsxElement(parent) || ast.IsJsxFragment(parent))
	}
	return false
}

func (lowering *jsxLowering) indexCollectionMaps() {
	if lowering.checker == nil {
		return
	}
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) ||
			call.Expression.AsPropertyAccessExpression().Name().Text() != "map" ||
			call.Arguments == nil ||
			len(call.Arguments.Nodes) != 1 {
			return true
		}
		render := call.Arguments.Nodes[0]
		if (!ast.IsArrowFunction(render) && !ast.IsFunctionExpression(render)) ||
			len(render.Parameters()) != 1 {
			return true
		}
		collection := call.Expression.AsPropertyAccessExpression().Expression
		member, primitive, keyed := lowering.safeCollectionKey(collection)
		lowering.collectionMaps[nodeSpanKey(node)] = collectionMapPlan{
			member:      member,
			primitive:   primitive,
			keyed:       keyed,
			declarative: lowering.moduleDeclarativeCollection(node),
		}
		return true
	})
}

func (lowering *jsxLowering) safeCollectionKey(
	collection *ast.Node,
) (member string, primitive bool, keyed bool) {
	defer func() {
		if recover() != nil {
			member, primitive, keyed = "", false, false
		}
	}()
	return lowering.collectionKey(collection)
}

func (lowering *jsxLowering) collectionKey(
	collection *ast.Node,
) (string, bool, bool) {
	if ast.IsIdentifier(collection) {
		if symbol := lowering.checker.GetSymbolAtLocation(collection); symbol != nil {
			for _, declaration := range symbol.Declarations {
				if !ast.IsVariableDeclaration(declaration) {
					continue
				}
				declarationSource := ast.GetSourceFileOfNode(declaration)
				if declarationSource == nil {
					continue
				}
				text := sourceText(declarationSource, declaration)
				if match := exactKeyArgument.FindStringSubmatch(text); match != nil &&
					match[1] != "" {
					return match[1], false, true
				}
			}
		}
	}
	valueType := lowering.checker.GetTypeAtLocation(collection)
	elementType := lowering.checker.GetElementTypeOfArrayType(valueType)
	if elementType == nil {
		return "", false, false
	}
	switch lowering.checker.TypeToString(elementType) {
	case "string", "number", "boolean", "bigint", "symbol":
		return "", true, true
	}
	for _, property := range lowering.checker.GetPropertiesOfType(elementType) {
		for _, declaration := range property.Declarations {
			declarationSource := ast.GetSourceFileOfNode(declaration)
			if declarationSource == nil {
				continue
			}
			start := declaration.Pos()
			end := declaration.End()
			if start < 0 || end > len(declarationSource.Text()) || start >= end {
				continue
			}
			if exactKeyArgument.MatchString(
				declarationSource.Text()[start:end],
			) {
				return ast.SymbolName(property), false, true
			}
		}
	}
	return "", false, false
}

func isComponentMapCall(node *ast.Node) bool {
	if !ast.IsCallExpression(node) ||
		!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
		return false
	}
	member := node.AsCallExpression().Expression.AsPropertyAccessExpression()
	return member.Expression != nil &&
		member.Expression.Kind == ast.KindThisKeyword &&
		member.Name().Text() == "map"
}

func (lowering *jsxLowering) moduleDeclarativeCollection(
	expression *ast.Node,
) bool {
	if lowering.checker == nil || !ast.IsCallExpression(expression) {
		return false
	}
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) ||
		call.Expression.AsPropertyAccessExpression().Name().Text() != "map" {
		return false
	}
	receiver := call.Expression.AsPropertyAccessExpression().Expression
	if !ast.IsIdentifier(receiver) || ast.NodeIsSynthesized(receiver) {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(receiver)
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = lowering.checker.GetAliasedSymbol(symbol)
	}
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		statement := declaration.Parent.Parent
		if statement != nil && statement.Parent != nil && ast.IsSourceFile(statement.Parent) {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) lowerComponentMapCall(node *ast.Node) *ast.Node {
	call := node.AsCallExpression()
	arguments := callArguments(node)
	if len(arguments) < 3 {
		return lowering.visitor.VisitEachChild(node)
	}
	collection := arguments[0]
	var provenance *ast.Node
	emittedCollection := lowering.visitor.VisitNode(collection)
	if ast.IsIdentifier(collection) {
		if _, derived := lowering.derivedBindingAtReference(collection); derived {
			emittedCollection = lowering.factory.NewIdentifier(collection.Text())
			provenance = lowering.derivedCollectionProvenance(collection)
		}
	}
	emitted := []*ast.Node{
		emittedCollection,
		lowering.visitor.VisitNode(arguments[1]),
		lowering.visitor.VisitNode(arguments[2]),
	}
	for _, argument := range arguments[3:] {
		emitted = append(emitted, lowering.visitor.VisitNode(argument))
	}
	if len(emitted) < 4 {
		emitted = append(
			emitted,
			lowering.factory.NewStringLiteral(
				exactStableID(
					lowering.sourceFile.FileName(),
					"list",
					lowering.nodeIDs[node],
				),
				ast.TokenFlagsNone,
			),
		)
	}
	if len(emitted) < 5 {
		if provenance == nil {
			provenance = lowering.factory.NewIdentifier("undefined")
		}
		emitted = append(emitted, provenance)
	}
	if len(emitted) < 6 {
		identity := componentMapKeyIdentity(arguments[1])
		if identity == "" {
			emitted = append(
				emitted,
				lowering.factory.NewIdentifier("undefined"),
			)
		} else {
			emitted = append(
				emitted,
				lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone),
			)
		}
	}
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(call.Expression),
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList(emitted),
		call.Flags,
	)
}

func (lowering *jsxLowering) derivedCollectionProvenance(
	reference *ast.Node,
) *ast.Node {
	symbol := lowering.checker.GetSymbolAtLocation(reference)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		if initializer == nil || !ast.IsCallExpression(initializer) {
			continue
		}
		call := initializer.AsCallExpression()
		if ast.IsPropertyAccessExpression(call.Expression) {
			return lowering.visitor.VisitNode(
				call.Expression.AsPropertyAccessExpression().Expression,
			)
		}
	}
	return nil
}

func componentMapKeyIdentity(key *ast.Node) string {
	if (!ast.IsArrowFunction(key) && !ast.IsFunctionExpression(key)) ||
		len(key.Parameters()) != 1 {
		return ""
	}
	parameter := key.Parameters()[0].Name()
	body := key.Body()
	if ast.IsBlock(body) {
		return ""
	}
	if !ast.IsIdentifier(parameter) ||
		!ast.IsPropertyAccessExpression(body) {
		return ""
	}
	member := body.AsPropertyAccessExpression()
	if !ast.IsIdentifier(member.Expression) ||
		member.Expression.Text() != parameter.Text() {
		return ""
	}
	return "member:" + member.Name().Text()
}
