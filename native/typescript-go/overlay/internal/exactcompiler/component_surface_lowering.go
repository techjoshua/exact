package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
)

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
				componentOmittedFromClient(component, lowering.serverComponents) {
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
