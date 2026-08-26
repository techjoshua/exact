package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
)

// lowerComponentLifecycleCall wires canonical authored lifecycle operations directly to the
// component kernel. Dynamic or extracted member access remains intact and selects the optional
// compatibility surface during runtime import planning.
func (lowering *jsxLowering) lowerComponentLifecycleCall(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) || !lowering.insideComponent(node) {
		return nil
	}
	call := node.AsCallExpression()
	if call.QuestionDotToken != nil {
		return nil
	}
	name, componentMember, dynamic := componentProtocolMember(call.Expression)
	if !componentMember || dynamic {
		return nil
	}
	arguments := make([]*ast.Node, 0, len(call.Arguments.Nodes)+2)
	arguments = append(arguments, lowering.factory.NewThisExpression())
	helper := ""
	directServer := lowering.target == TargetServer && lowering.directServerFrameComponent(node)
	switch name {
	case "onMount", "onActivate", "onDeactivate", "onUnmount":
		// Mount and client activation phases never execute during SSR. Erase the complete
		// registration expression so its callback and browser-only dependency graph cannot
		// enter a server artifact. Unmount remains meaningful because SSR owners run request
		// cleanup, while render and owned resources likewise retain their server semantics.
		if lowering.target == TargetServer &&
			(name == "onMount" || name == "onActivate" || name == "onDeactivate") {
			return lowering.factory.NewVoidExpression(
				lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
			)
		}
		helper = lowering.names.registerLifecycle
		if directServer {
			helper = lowering.names.directSsrLifecycle
		}
		phase := map[string]string{
			"onMount": "mount", "onActivate": "activate", "onDeactivate": "deactivate", "onUnmount": "unmount",
		}[name]
		arguments = append(arguments, lowering.factory.NewStringLiteral(phase, ast.TokenFlagsNone))
	case "onRender":
		helper = lowering.names.registerRender
		if directServer {
			helper = lowering.names.directSsrRender
		}
	case "own":
		helper = lowering.names.ownResource
		if directServer {
			helper = lowering.names.directSsrOwn
		}
	default:
		return nil
	}
	for _, argument := range call.Arguments.Nodes {
		arguments = append(arguments, lowering.visitor.VisitNode(argument))
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(helper),
		nil,
		call.TypeArguments,
		lowering.factory.NewNodeList(arguments),
		call.Flags,
	)
}

// lowerComponentLogCall preserves the ordinary ComponentLog authoring surface while
// moving its runtime enablement check ahead of argument evaluation. Optional-call
// semantics are the important part of this ABI: when the helper returns undefined,
// JavaScript does not evaluate or allocate any of the authored arguments.
func (lowering *jsxLowering) lowerComponentLogCall(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) || !lowering.insideComponent(node) {
		return nil
	}
	call := node.AsCallExpression()
	level, canonical := canonicalComponentLogLevel(node)
	if !canonical {
		return nil
	}
	arguments := make([]*ast.Node, 0, len(call.Arguments.Nodes))
	for _, argument := range call.Arguments.Nodes {
		arguments = append(arguments, lowering.visitor.VisitNode(argument))
	}
	methodLookup := lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(lowering.names.componentLog),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewThisExpression(),
			lowering.factory.NewStringLiteral(level, ast.TokenFlagsNone),
		}),
		ast.NodeFlagsNone,
	)
	return lowering.factory.NewCallExpression(
		methodLookup,
		lowering.factory.NewToken(ast.KindQuestionDotToken),
		call.TypeArguments,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.arrow(
				lowering.factory.NewArrayLiteralExpression(
					lowering.factory.NewNodeList(arguments),
					false,
				),
			),
		}),
		call.Flags,
	)
}

// canonicalComponentLogLevel recognizes only the framework-owned authored surface.
// Analysis uses the same predicate as emission so dependency planning and runtime
// lowering cannot disagree about which calls are observational boundaries.
func canonicalComponentLogLevel(node *ast.Node) (string, bool) {
	if !ast.IsCallExpression(node) {
		return "", false
	}
	call := node.AsCallExpression()
	if call.QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression) {
		return "", false
	}
	method := call.Expression.AsPropertyAccessExpression()
	level := method.Name().Text()
	switch level {
	case "trace", "debug", "info", "warn", "error":
	default:
		return "", false
	}
	if method.QuestionDotToken != nil || !ast.IsPropertyAccessExpression(method.Expression) {
		return "", false
	}
	log := method.Expression.AsPropertyAccessExpression()
	if log.QuestionDotToken != nil || log.Name().Text() != "log" ||
		log.Expression.Kind != ast.KindThisKeyword {
		return "", false
	}
	return level, true
}

// lowerComponentIntlAccess links the authored localization facade directly to the
// target-specific component frame. This avoids installing the universal component
// runtime surface for compiler-owned access while retaining a stable facade per owner.
func (lowering *jsxLowering) lowerComponentIntlAccess(node *ast.Node) *ast.Node {
	if !ast.IsPropertyAccessExpression(node) || !lowering.insideComponent(node) {
		return nil
	}
	access := node.AsPropertyAccessExpression()
	if access.QuestionDotToken != nil || access.Name().Text() != "intl" ||
		access.Expression.Kind != ast.KindThisKeyword {
		return nil
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(lowering.names.componentIntl),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewThisExpression()}),
		ast.NodeFlagsNone,
	)
}

// lowerDirectServerRefCall links canonical ref operations to the non-reactive request-local SSR
// lane. The server never publishes a DOM target, but bindings retain stable identity and authored
// fulfillment remains observable. Unsupported extraction or dynamic dispatch stays generic.
func (lowering *jsxLowering) lowerDirectServerRefCall(node *ast.Node) *ast.Node {
	if lowering.target != TargetServer || !ast.IsCallExpression(node) ||
		!lowering.directServerFrameComponent(node) {
		return nil
	}
	call := node.AsCallExpression()
	if call.QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil
	}
	method := call.Expression.AsPropertyAccessExpression()
	helper := ""
	if method.QuestionDotToken == nil && method.Expression.Kind == ast.KindThisKeyword {
		switch method.Name().Text() {
		case "ref":
			helper = lowering.names.directSsrRef
		case "readRef":
			helper = lowering.names.directSsrReadRef
		}
	} else if method.QuestionDotToken == nil && ast.IsPropertyAccessExpression(method.Expression) {
		refs := method.Expression.AsPropertyAccessExpression()
		if refs.QuestionDotToken == nil && refs.Expression.Kind == ast.KindThisKeyword &&
			refs.Name().Text() == "refs" {
			switch method.Name().Text() {
			case "get":
				helper = lowering.names.directSsrReadRef
			case "root":
				helper = lowering.names.directSsrRoot
			}
		}
	}
	if helper == "" {
		return nil
	}
	arguments := make([]*ast.Node, 0, len(call.Arguments.Nodes)+1)
	arguments = append(arguments, lowering.factory.NewThisExpression())
	for _, argument := range call.Arguments.Nodes {
		arguments = append(arguments, lowering.visitor.VisitNode(argument))
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(helper), nil, call.TypeArguments,
		lowering.factory.NewNodeList(arguments), call.Flags,
	)
}

// lowerDirectServerReactive links the component convenience API to a request-local value whose
// reads evaluate against the current direct frame. The generated server task plan owns ordering;
// no runtime dependency graph or effect scope is required for this value.
func (lowering *jsxLowering) lowerDirectServerReactive(node *ast.Node) *ast.Node {
	if lowering.target != TargetServer || !lowering.directServerFrameComponent(node) {
		return nil
	}
	var value *ast.Node
	var typeArguments *ast.NodeList
	var flags ast.NodeFlags
	switch {
	case ast.IsCallExpression(node):
		call := node.AsCallExpression()
		if call.QuestionDotToken != nil || !componentReactiveMember(call.Expression) ||
			call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
			return nil
		}
		value = call.Arguments.Nodes[0]
		typeArguments = call.TypeArguments
		flags = call.Flags
	case ast.IsTaggedTemplateExpression(node):
		tagged := node.AsTaggedTemplateExpression()
		if !componentReactiveMember(tagged.Tag) {
			return nil
		}
		value = tagged.Template
		typeArguments = tagged.TypeArguments
		flags = tagged.Flags
	default:
		return nil
	}
	value = lowering.visitor.VisitNode(value)
	if !ast.IsArrowFunction(value) && !ast.IsFunctionExpression(value) {
		value = lowering.arrow(value)
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(lowering.names.directSsrReactive), nil, typeArguments,
		lowering.factory.NewNodeList([]*ast.Node{value}), flags,
	)
}

// insideComponent prevents the logging ABI from rewriting unrelated objects which
// happen to expose a this.log property in the same TypeScript project.
func (lowering *jsxLowering) insideComponent(node *ast.Node) bool {
	for _, component := range lowering.components {
		if node.Pos() >= component.Start && node.End() <= component.Start+component.Length {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) lowerComponentRegistryCreation(
	node *ast.Node,
) *ast.Node {
	if !ast.IsCallExpression(node) {
		return nil
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) ||
		call.Expression.Text() != "createComponentRegistry" ||
		call.Arguments == nil ||
		len(call.Arguments.Nodes) != 1 {
		return nil
	}
	declaration := componentRegistryDeclaration(node)
	if declaration == nil || !ast.IsIdentifier(declaration.Name()) {
		return nil
	}
	name := declaration.Name().Text()
	registryTarget := "client"
	if lowering.target == TargetServer {
		registryTarget = "server"
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(lowering.names.componentRegistry),
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewStringLiteral(
				exactStableID(
					normalizedIdentityFilename(lowering.sourceFile.FileName()),
					"registry",
					name,
				),
				ast.TokenFlagsNone,
			),
			lowering.factory.NewStringLiteral(name, ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(registryTarget, ast.TokenFlagsNone),
			lowering.visitor.VisitNode(call.Arguments.Nodes[0]),
		}),
		call.Flags,
	)
}

func (lowering *jsxLowering) elidesComponentAwait(component string) bool {
	for _, task := range lowering.tasks {
		if task.Component == component && len(task.ResultWritePath) != 0 {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) omitServerComponentValues(
	node *ast.Node,
) *ast.Node {
	statement := node.AsVariableStatement()
	list := statement.DeclarationList.AsVariableDeclarationList()
	declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
	changed := false
	for _, candidate := range list.Declarations.Nodes {
		declaration := candidate.AsVariableDeclaration()
		name := declaration.Name()
		if name != nil && ast.IsIdentifier(name) &&
			declaration.Initializer != nil &&
			(ast.IsArrowFunction(declaration.Initializer) ||
				ast.IsFunctionExpression(declaration.Initializer)) {
			if component, exists := lowering.components[name.Text()]; exists &&
				lowering.omitsComponentFromClient(component) {
				lowering.recordClientIslandDefinitions(component)
				declarations = append(
					declarations,
					lowering.factory.UpdateVariableDeclaration(
						declaration,
						name,
						declaration.ExclamationToken,
						declaration.Type,
						lowering.clientComponentValueStub(component),
					),
				)
				changed = true
				continue
			}
			if component, exists := lowering.components[name.Text()]; exists &&
				component.Placement == "server" {
				declarations = append(
					declarations,
					lowering.factory.UpdateVariableDeclaration(
						declaration,
						name,
						declaration.ExclamationToken,
						declaration.Type,
						lowering.clientComponentValueStub(component),
					),
				)
				changed = true
				continue
			}
		}
		declarations = append(
			declarations,
			lowering.visitor.VisitNode(candidate),
		)
	}
	if !changed {
		return nil
	}
	if len(declarations) == 0 {
		return lowering.factory.NewEmptyStatement()
	}
	return lowering.factory.UpdateVariableStatement(
		statement,
		statement.Modifiers(),
		lowering.factory.UpdateVariableDeclarationList(
			list,
			lowering.factory.NewNodeList(declarations),
			list.Flags,
		),
	)
}

func componentIndexByName(components []Component) map[string]Component {
	result := make(map[string]Component, len(components))
	for _, component := range components {
		result[component.Name] = component
	}
	return result
}

func indexRenderEdges(components []Component) map[string]RenderEdge {
	count := 0
	for _, component := range components {
		count += len(component.RenderEdges)
	}
	result := make(map[string]RenderEdge, count)
	for _, component := range components {
		for _, edge := range component.RenderEdges {
			result[edge.Path+":"+edge.Tag] = edge
		}
	}
	return result
}

func (lowering *jsxLowering) clientComponentFunctionStub(
	declaration *ast.FunctionDeclaration,
	component Component,
) *ast.Node {
	return lowering.factory.UpdateFunctionDeclaration(
		declaration,
		declaration.Modifiers(),
		declaration.AsteriskToken,
		declaration.Name(),
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.clientBoundaryPropsParameter(),
		}),
		declaration.Type,
		declaration.FullSignature,
		lowering.clientBoundaryStubBody(component),
	)
}

func (lowering *jsxLowering) clientComponentValueStub(
	component Component,
) *ast.Node {
	return lowering.factory.NewFunctionExpression(
		nil,
		nil,
		lowering.factory.NewIdentifier(component.Name),
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.clientBoundaryPropsParameter(),
		}),
		nil,
		nil,
		lowering.clientBoundaryStubBody(component),
	)
}

func (lowering *jsxLowering) clientBoundaryPropsParameter() *ast.Node {
	return lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		lowering.factory.NewIdentifier("props"),
		nil,
		nil,
		lowering.factory.NewObjectLiteralExpression(nil, false),
	)
}

func (lowering *jsxLowering) clientBoundaryStubBody(
	component Component,
) *ast.Node {
	call := lowering.call(
		lowering.names.boundary,
		[]*ast.Node{
			lowering.factory.NewStringLiteral(
				exactStableID(
					lowering.sourceFile.FileName(),
					component.Name,
					"component-island",
				),
				ast.TokenFlagsNone,
			),
			lowering.factory.NewStringLiteral(
				component.Name,
				ast.TokenFlagsNone,
			),
			lowering.factory.NewIdentifier("props"),
		},
	)
	render := lowering.arrow(call)
	return lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewReturnStatement(render),
		}),
		true,
	)
}
