package exactcompiler

import (
	"regexp"

	"github.com/microsoft/typescript-go/internal/ast"
)

type collectionMapPlan struct {
	member      string
	primitive   bool
	keyed       bool
	explicitKey *ast.Node
	declarative bool
	renderChild bool
}

var exactKeyArgument = regexp.MustCompile(
	`@exact\s+key(?:\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*))?`,
)

func (lowering *jsxLowering) lowerAnnotatedMap(node *ast.Node) *ast.Node {
	if lowering.checker == nil {
		return nil
	}
	plan, planned := lowering.collectionMaps[nodeSpanKey(node)]
	// Materializing a compiler-proven derived value clones its sole render expression into the
	// retained binding closure. Synthesized parent links no longer lead back to authored JSX, so
	// retain the source classification recorded before lowering rather than losing keyed identity.
	if !insideJSXChildExpression(node) && (!planned || !plan.renderChild) {
		return nil
	}
	call := node.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) ||
		call.Expression.AsPropertyAccessExpression().Name().Text() != "map" ||
		call.Arguments == nil ||
		len(call.Arguments.Nodes) != 1 {
		return nil
	}
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
	if lowering.renderProgramListDepth > 0 && lowering.directRenderProgramKeyedMap(node) {
		if emitted := lowering.lowerRenderProgramKeyedMap(node, plan); emitted != nil {
			return emitted
		}
	}
	// The authored expression is Array.prototype.map; the component list
	// capability only becomes visible after this lowering creates this.map.
	// Record that semantic decision directly so runtime import selection does
	// not have to rediscover a synthesized node from the original source tree.
	if lowering.target != TargetServer || !lowering.directServerFrameComponent(node) {
		lowering.listCapabilityUsed = true
		lowering.markComponentListCapability(node)
	}
	item := lowering.factory.NewIdentifier("__exactItem")
	if plan.explicitKey != nil && ast.IsIdentifier(render.Parameters()[0].Name()) {
		item = render.Parameters()[0].Name()
	}
	key := lowering.collectionMapKeyExpression(plan, item)
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
	if ast.IsIdentifier(collection) && ast.GetSourceFileOfNode(collection) != nil {
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

// markComponentListCapability records the durable controller selected by one lowered list site.
// Direct server frames use their request-local fallback operation and intentionally omit this ABI.
func (lowering *jsxLowering) markComponentListCapability(node *ast.Node) {
	owner := ""
	ownerWidth := int(^uint(0) >> 1)
	for name, component := range lowering.components {
		if node.Pos() < component.Start || node.End() > component.Start+component.Length ||
			component.Length >= ownerWidth {
			continue
		}
		owner = name
		ownerWidth = component.Length
	}
	if owner != "" {
		component := lowering.components[owner]
		component.Lists = true
		lowering.components[owner] = component
	}
}

func (lowering *jsxLowering) directRenderProgramKeyedMap(node *ast.Node) bool {
	if lowering.target == TargetDefault || !ast.IsCallExpression(node) {
		return false
	}
	plan, planned := lowering.collectionMaps[nodeSpanKey(node)]
	if !planned || !plan.keyed || plan.declarative {
		return false
	}
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return false
	}
	render := call.Arguments.Nodes[0]
	return ast.IsArrowFunction(render) && len(render.Parameters()) == 1 &&
		!ast.IsBlock(render.AsArrowFunction().Body) && ast.IsIdentifier(render.Parameters()[0].Name())
}

// lowerRenderProgramKeyedMap makes compiler-owned structural slots publish keyed child operations
// directly. The generated component therefore owns collection evaluation and identity wiring;
// the universal component list controller remains available only to non-program fallbacks.
func (lowering *jsxLowering) lowerRenderProgramKeyedMap(
	node *ast.Node,
	plan collectionMapPlan,
) *ast.Node {
	call := node.AsCallExpression()
	render := call.Arguments.Nodes[0]
	if !ast.IsArrowFunction(render) || ast.IsBlock(render.AsArrowFunction().Body) {
		return nil
	}
	parameter := render.Parameters()[0].Name()
	if !ast.IsIdentifier(parameter) {
		return nil
	}
	key := lowering.collectionMapKeyExpression(plan, parameter)
	if _, componentOwned := lowering.componentContaining(node); lowering.target == TargetClient &&
		componentOwned {
		lowering.listCapabilityUsed = true
		lowering.markComponentListCapability(node)
		selector := lowering.factory.NewArrowFunction(
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewParameterDeclaration(nil, nil, parameter, nil, nil, nil),
			}),
			nil,
			nil,
			lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
			key,
		)
		collection := call.Expression.AsPropertyAccessExpression().Expression
		var provenance *ast.Node = lowering.factory.NewIdentifier("undefined")
		if ast.IsIdentifier(collection) && ast.GetSourceFileOfNode(collection) != nil {
			if _, derived := lowering.derivedBindingAtReference(collection); derived {
				provenance = lowering.derivedCollectionProvenance(collection)
			}
		}
		identity := componentMapKeyIdentity(selector)
		var emittedIdentity *ast.Node = lowering.factory.NewIdentifier("undefined")
		if identity != "" {
			emittedIdentity = lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone)
		}
		return lowering.call(lowering.names.mapKeyedChildren, []*ast.Node{
			lowering.factory.NewThisExpression(),
			lowering.visitor.VisitNode(collection),
			selector,
			lowering.visitor.VisitNode(render),
			lowering.factory.NewStringLiteral(
				exactStableID(lowering.sourceFile.FileName(), "list", lowering.nodeIDs[node]),
				ast.TokenFlagsNone,
			),
			provenance,
			emittedIdentity,
		})
	}
	body := lowering.call(lowering.names.keyedChild, []*ast.Node{
		lowering.visitor.VisitNode(render.AsArrowFunction().Body),
		key,
	})
	arrow := render.AsArrowFunction()
	emittedRender := lowering.factory.UpdateArrowFunction(
		arrow,
		arrow.Modifiers(),
		arrow.TypeParameters,
		arrow.Parameters,
		arrow.Type,
		arrow.FullSignature,
		arrow.EqualsGreaterThanToken,
		body,
	)
	expression := call.Expression.AsPropertyAccessExpression()
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.visitor.VisitNode(expression.Expression),
			expression.QuestionDotToken,
			expression.Name(),
			expression.Flags,
		),
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList([]*ast.Node{emittedRender}),
		call.Flags,
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
		explicitKey := collectionMapExplicitJSXKey(render)
		if explicitKey != nil {
			member, primitive, keyed = "", false, true
		}
		plan := collectionMapPlan{
			member:      member,
			primitive:   primitive,
			keyed:       keyed,
			explicitKey: explicitKey,
			declarative: lowering.moduleDeclarativeCollection(node),
			renderChild: insideJSXChildExpression(node),
		}
		lowering.collectionMaps[nodeSpanKey(node)] = plan
		if lowering.target == TargetClient && plan.keyed && plan.renderChild && !plan.declarative {
			lowering.markComponentListCapability(node)
		}
		return true
	})
}

// collectionMapExplicitJSXKey recognizes authored key identity on the value returned by a map
// callback. JSX key is structural metadata rather than a host property, so collection lowering
// must claim it before render-program lowering removes it from the emitted element attributes.
func collectionMapExplicitJSXKey(render *ast.Node) *ast.Node {
	if render == nil || len(render.Parameters()) != 1 ||
		!ast.IsIdentifier(render.Parameters()[0].Name()) {
		return nil
	}
	body := render.Body()
	if ast.IsBlock(body) {
		returns := directCallableReturns(render)
		if len(returns) != 1 {
			return nil
		}
		body = returns[0]
	}
	body = unwrapRenderExpression(body)
	var attributes *ast.Node
	switch {
	case ast.IsJsxElement(body):
		attributes = body.AsJsxElement().OpeningElement.Attributes()
	case ast.IsJsxSelfClosingElement(body):
		attributes = body.AsJsxSelfClosingElement().Attributes
	default:
		return nil
	}
	if attributes == nil {
		return nil
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if jsxAttributeText(attribute.Name()) != "key" || attribute.Initializer == nil ||
			!ast.IsJsxExpression(attribute.Initializer) {
			continue
		}
		return attribute.Initializer.AsJsxExpression().Expression
	}
	return nil
}

func (lowering *jsxLowering) collectionMapKeyExpression(
	plan collectionMapPlan,
	parameter *ast.Node,
) *ast.Node {
	if plan.explicitKey != nil {
		return lowering.visitor.VisitNode(plan.explicitKey)
	}
	if plan.primitive {
		return parameter
	}
	return lowering.factory.NewPropertyAccessExpression(
		parameter,
		nil,
		lowering.factory.NewIdentifier(plan.member),
		ast.NodeFlagsNone,
	)
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
	if len(arguments) < 5 && ast.IsIdentifier(collection) && ast.GetSourceFileOfNode(collection) != nil {
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
