package exactcompiler

import (
	"regexp"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

type collectionMapPlan struct {
	nativeArray bool
	callbackKey bool
	member      string
	primitive   bool
	keyed       bool
	explicitKey *ast.Node
	declarative bool
	renderChild bool
	renderArray bool
}

var exactKeyArgument = regexp.MustCompile(
	`@exact\s+key(?:\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*))?`,
)

func (lowering *jsxLowering) lowerAnnotatedMap(node *ast.Node) *ast.Node {
	// The checking projection retains Array.map's contextual callback types outside a
	// component. Executable targets own their keyed operations without inventing this.map.
	if lowering.target == TargetDefault {
		if _, owned := lowering.componentContaining(node); !owned {
			return nil
		}
	}
	if lowering.checker == nil {
		return nil
	}
	plan, planned := lowering.collectionMaps[nodeSpanKey(node)]
	// Materializing a compiler-proven derived value clones its sole render expression into the
	// retained binding closure. Synthesized parent links no longer lead back to authored JSX, so
	// retain the source classification recorded before lowering rather than losing keyed identity.
	if !insideJSXChildExpression(node) && (!planned || !plan.renderChild) {
		// Rendered array literals preserve inferred keys, while explicitly keyed JSX
		// projections can also feed ordinary array consumers.
		// Keep its array result and keyed item receipts instead of dropping authored keys.
		if planned && plan.keyed && (plan.explicitKey != nil || plan.renderArray) && !plan.declarative {
			return lowering.lowerRenderProgramKeyedMap(node, plan)
		}
		return nil
	}
	call := node.AsCallExpression()
	collection := collectionMapReceiver(call.Expression)
	if collection == nil {
		return nil
	}
	if !planned || plan.declarative {
		return nil
	}
	render := collectionMapRender(call)
	if render == nil {
		return nil
	}
	if !plan.keyed {
		return nil
	}
	// A custom map method owns its call semantics. Its returned JSX can retain keys
	// without replacing the method with an array controller.
	if !plan.nativeArray || plan.callbackKey {
		return lowering.lowerRenderProgramKeyedMap(node, plan)
	}
	// Module-scope view helpers have no durable component receiver. Their keyed
	// children carry identity directly, including when the surrounding host falls back.
	if _, owned := lowering.componentContaining(node); !owned {
		return lowering.lowerRenderProgramKeyedMap(node, plan)
	}
	// Request-local server frames carry keyed identity in their output. They do not
	// own a durable list controller, including while scheduled tasks prepare state.
	if lowering.directServerArtifactComponent(node) {
		return lowering.lowerRenderProgramKeyedMap(node, plan)
	}
	if lowering.target == TargetClient && lowering.insideNativeMapCallback(node) {
		return lowering.lowerRenderProgramKeyedMap(node, plan)
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
	arguments := []*ast.Node{
		emittedCollection, selector, lowering.lowerCollectionRender(render),
		lowering.factory.NewStringLiteral(exactStableID(lowering.sourceFile.FileName(), "list", lowering.nodeIDs[node]), ast.TokenFlagsNone),
		provenance, emittedIdentity,
	}
	if !ast.IsIdentifier(render.Parameters()[0].Name()) {
		return lowering.call(lowering.names.mapKeyedChildren, append([]*ast.Node{lowering.factory.NewThisExpression()}, arguments...))
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(lowering.factory.NewThisExpression(), nil, lowering.factory.NewIdentifier("map"), ast.NodeFlagsNone),
		nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone,
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
	// Conditional branches retain the same list ownership as a directly rendered map.
	// Otherwise server frames emit items while client islands add a list-controller range.
	if ast.IsConditionalExpression(node) {
		branch := node.AsConditionalExpression()
		return lowering.directRenderProgramKeyedMap(branch.WhenTrue) && lowering.directRenderProgramKeyedMap(branch.WhenFalse)
	}
	if ast.IsParenthesizedExpression(node) {
		return lowering.directRenderProgramKeyedMap(node.AsParenthesizedExpression().Expression)
	}

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
	render := collectionMapRender(call)
	// Block bodies and ordinary callback functions use the same item ownership
	// as expression arrows. The result visitor already preserves their returns.
	return render != nil && (ast.IsArrowFunction(render) || ast.IsFunctionExpression(render)) &&
		len(render.Parameters()) == 1 && ast.IsIdentifier(render.Parameters()[0].Name())
}

// lowerRenderProgramKeyedMap makes compiler-owned structural slots publish keyed child operations
// directly. The generated component therefore owns collection evaluation and identity wiring;
// the universal component list controller remains available only to non-program fallbacks.
func (lowering *jsxLowering) lowerRenderProgramKeyedMap(
	node *ast.Node,
	plan collectionMapPlan,
) *ast.Node {
	call := node.AsCallExpression()
	render := collectionMapRender(call)
	if render == nil {
		return nil
	}
	if plan.callbackKey {
		// Local derived bindings may be inlined while the callback is lowered. Project
		// the original key reference through that same binding transformation.
		key := lowering.collectionMapKeyExpression(plan, nil)
		if closure := lowering.reactiveClosure(key); closure != nil {
			key = lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(closure), nil, nil, lowering.factory.NewNodeList(nil), ast.NodeFlagsNone)
		} else {
			key = lowering.visitor.VisitNode(key)
		}
		return lowering.lowerNativeKeyedMap(call, render, key)
	}
	render = lowering.collectionMapBindingRender(render)
	parameter := render.Parameters()[0].Name()
	key := lowering.collectionMapKeyExpression(plan, parameter)
	if _, componentOwned := lowering.componentContaining(node); lowering.target == TargetClient &&
		componentOwned && plan.nativeArray && !lowering.insideNativeMapCallback(node) {
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
		collection := collectionMapReceiver(call.Expression)
		var provenance *ast.Node = lowering.factory.NewIdentifier("undefined")
		if ast.IsIdentifier(collection) && ast.GetSourceFileOfNode(collection) != nil {
			if _, derived := lowering.derivedBindingAtReference(collection); derived {
				provenance = lowering.derivedCollectionProvenance(collection)
			}
		}
		// A projection helper need not expose a source collection. Preserve the optional
		// argument position instead of inserting a nil AST node into the call.
		if provenance == nil {
			provenance = lowering.factory.NewIdentifier("undefined")
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
			lowering.lowerCollectionRender(render),
			lowering.factory.NewStringLiteral(
				exactStableID(lowering.sourceFile.FileName(), "list", lowering.nodeIDs[node]),
				ast.TokenFlagsNone,
			),
			provenance,
			emittedIdentity,
		})
	}
	return lowering.lowerNativeKeyedMap(call, render, key)
}

// insideNativeMapCallback prevents component-wide site caches from sharing closures across
// native map iterations that do not establish compiler-owned keyed item scopes.
func (lowering *jsxLowering) insideNativeMapCallback(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if !ast.IsArrowFunction(parent) && !ast.IsFunctionExpression(parent) {
			continue
		}
		call := collectionMapCallbackInvocation(parent)
		if call == nil {
			continue
		}
		plan, planned := lowering.collectionMaps[nodeSpanKey(call)]
		if len(parent.Parameters()) != 1 || !planned || !plan.nativeArray || !plan.keyed ||
			plan.callbackKey || plan.declarative {
			return true
		}
	}
	return false
}

// Key inference removes authored list ceremony only for maps that produce JSX
// children. Ordinary data transforms must retain Array.prototype.map semantics.
func insideJSXChildExpression(node *ast.Node) bool {
	return jsxChildValuePath(node, false)
}

// jsxChildValuePath follows values into a JSX child, optionally through array containers.
// Array containers need array-valued lowering, but retain the same rendered item ownership.
func jsxChildValuePath(node *ast.Node, allowArrays bool) bool {
	for current := node; current.Parent != nil; current = current.Parent {
		parent := current.Parent
		if ast.IsJsxExpression(parent) {
			host := parent.Parent
			return host != nil && (ast.IsJsxElement(host) || ast.IsJsxFragment(host))
		}
		switch parent.Kind {
		case ast.KindArrayLiteralExpression, ast.KindSpreadElement, ast.KindAsExpression, ast.KindSatisfiesExpression:
			if !allowArrays {
				return false
			}
		case ast.KindParenthesizedExpression, ast.KindNonNullExpression:
			continue
		case ast.KindConditionalExpression:
			if parent.AsConditionalExpression().Condition == current {
				return false
			}
		case ast.KindBinaryExpression:
			binary := parent.AsBinaryExpression()
			switch binary.OperatorToken.Kind {
			case ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			case ast.KindAmpersandAmpersandToken:
				if binary.Left == current {
					return false
				}
			default:
				return false
			}
		default:
			// A call receiver or argument, property read, and callback body consume data.
			// Merely being nested inside JSX does not make their arrays render operations.
			return false
		}
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
		collection := collectionMapReceiver(call.Expression)
		render := collectionMapRender(call)
		if collection == nil || render == nil {
			return true
		}
		member, primitive, keyed := lowering.safeCollectionKey(collection)
		explicitKey := collectionMapExplicitJSXKey(render, false)
		if explicitKey != nil {
			member, primitive, keyed = "", false, true
		}
		owner := standardLibraryCallOwner(call, lowering.checker)
		nativeArray := (owner == "Array" || owner == "ReadonlyArray") && lowering.checker.GetElementTypeOfArrayType(lowering.checker.GetTypeAtLocation(collection)) != nil
		plan := collectionMapPlan{
			nativeArray: nativeArray,
			callbackKey: explicitKey != nil && collectionMapKeyNeedsCallbackScope(render, explicitKey, lowering.checker),
			member:      member,
			primitive:   primitive,
			keyed:       keyed,
			explicitKey: explicitKey,
			declarative: lowering.moduleDeclarativeCollection(node),
			renderChild: insideJSXChildExpression(node),
			renderArray: jsxChildValuePath(node, true),
		}
		lowering.collectionMaps[nodeSpanKey(node)] = plan
		if lowering.target == TargetClient && plan.keyed && (plan.renderArray || plan.explicitKey != nil) && !plan.declarative {
			lowering.markComponentListCapability(node)
		}
		return true
	})
}

// collectionMapExplicitJSXKey recognizes authored key identity on the value returned by a map
// callback. JSX key is structural metadata rather than a host property, so collection lowering
// must claim it before render-program lowering removes it from the emitted element attributes.
func collectionMapExplicitJSXKey(render *ast.Node, capabilityDiscovery bool) *ast.Node {
	if render == nil || (!ast.IsArrowFunction(render) && !ast.IsFunctionExpression(render)) ||
		len(render.Parameters()) != 1 {
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
	body = unwrapSourceCallableReference(body)
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
	// Later spreads can replace an earlier key. The lowered child owns the final
	// identity after ordinary JavaScript prop precedence has been evaluated.
	var key *ast.Node
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			// Structural TypeScript types cannot prove the absence of extra runtime
			// properties. Only a subsequent explicit key can establish final identity.
			// Capability discovery remains conservative about potential keyed output.
			if !capabilityDiscovery {
				key = nil
			}
			continue
		}
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if jsxAttributeText(attribute.Name()) == "key" && attribute.Initializer != nil {
			if ast.IsStringLiteral(attribute.Initializer) {
				key = attribute.Initializer
			} else if ast.IsJsxExpression(attribute.Initializer) {
				key = attribute.Initializer.AsJsxExpression().Expression
			}
		}
	}
	return key
}

func (lowering *jsxLowering) collectionMapKeyExpression(
	plan collectionMapPlan,
	parameter *ast.Node,
) *ast.Node {
	if plan.explicitKey != nil {
		if ast.IsStringLiteral(plan.explicitKey) {
			return lowering.factory.NewStringLiteral(plan.explicitKey.Text(), ast.TokenFlagsNone)
		}
		return lowering.visitor.VisitNode(plan.explicitKey)
	}
	if plan.primitive {
		return parameter
	}
	if !scanner.IsIdentifierText(plan.member, core.LanguageVariantStandard) {
		return lowering.factory.NewElementAccessExpression(parameter, nil, lowering.factory.NewStringLiteral(plan.member, ast.TokenFlagsNone), ast.NodeFlagsNone)
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
	return safeCollectionKeyForChecker(lowering.checker, collection)
}

func safeCollectionKeyForChecker(
	typeChecker *checker.Checker,
	collection *ast.Node,
) (member string, primitive bool, keyed bool) {
	defer func() {
		if recover() != nil {
			member, primitive, keyed = "", false, false
		}
	}()
	return collectionKey(typeChecker, collection)
}

func collectionKey(
	typeChecker *checker.Checker,
	collection *ast.Node,
) (string, bool, bool) {
	if ast.IsIdentifier(collection) {
		if symbol := typeChecker.GetSymbolAtLocation(collection); symbol != nil {
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
	valueType := typeChecker.GetTypeAtLocation(collection)
	elementType := typeChecker.GetElementTypeOfArrayType(valueType)
	if elementType == nil {
		return "", false, false
	}
	if collectionPrimitiveKeyType(elementType, typeChecker) {
		return "", true, true
	}
	for _, property := range typeChecker.GetPropertiesOfType(elementType) {
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
	receiver := collectionMapReceiver(call.Expression)
	if receiver == nil || !ast.IsIdentifier(receiver) || ast.NodeIsSynthesized(receiver) {
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
	receiver, name := sourceLiteralMemberReference(body)
	if !ast.IsIdentifier(parameter) || receiver == nil || !ast.IsIdentifier(receiver) || receiver.Text() != parameter.Text() {
		return ""
	}
	return "member:" + name
}
