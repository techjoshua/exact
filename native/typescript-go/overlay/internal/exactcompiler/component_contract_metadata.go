package exactcompiler

import (
	"fmt"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

func componentDescriptorDeclaration(
	emitContext *printer.EmitContext,
	name string,
) *ast.Node {
	factory := emitContext.Factory
	value := factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Symbol"),
			nil,
			factory.NewIdentifier("for"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			contractString(factory, "@exactjs/component-contract"),
		}),
		ast.NodeFlagsNone,
	)
	value = emitContext.AddSyntheticLeadingComment(
		value,
		ast.KindMultiLineCommentTrivia,
		" @__PURE__ ",
		false,
	)
	return factory.NewVariableStatement(
		nil,
		factory.NewVariableDeclarationList(
			factory.NewNodeList([]*ast.Node{
				factory.NewVariableDeclaration(
					factory.NewIdentifier(name),
					nil,
					nil,
					value,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
}

func continuationsForComponent(
	continuations []Continuation,
	componentID string,
) []Continuation {
	result := []Continuation{}
	for _, continuation := range continuations {
		if continuation.ComponentID == componentID {
			result = append(result, continuation)
		}
	}
	return result
}

func continuationExecutorMetadata(
	factory *printer.NodeFactory,
	componentFunction *ast.Node,
	continuations []Continuation,
	used map[string]struct{},
) *ast.Node {
	workByID := continuationWorkByID(componentFunction, continuations)
	aliases := componentContextAliases(componentFunction)
	stateType := continuationExecutorStateType(factory, componentFunction)
	values := make([]*ast.Node, 0, len(continuations))
	for _, continuation := range continuations {
		work := workByID[continuation.ID]
		if work == nil {
			continue
		}
		execute := continuationExecutor(
			factory,
			work,
			continuation,
			aliases,
			stateType,
			used,
		)
		values = append(values, contractObject(factory, true,
			contractProperty(
				factory,
				"id",
				contractString(factory, continuation.ID),
			),
			contractProperty(
				factory,
				"componentId",
				contractString(factory, continuation.ComponentID),
			),
			contractProperty(factory, "execute", execute),
		))
	}
	return contractArray(factory, values...)
}

func continuationWorkByID(
	componentFunction *ast.Node,
	continuations []Continuation,
) map[string]*ast.Node {
	expected := make(map[string]struct{}, len(continuations))
	for _, continuation := range continuations {
		expected[continuation.ID] = struct{}{}
	}
	result := make(map[string]*ast.Node, len(continuations))
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		if node == nil {
			return
		}
		if node != componentFunction && ast.IsFunctionLike(node) {
			return
		}
		if ast.IsCallExpression(node) {
			call := node.AsCallExpression()
			arguments := callArguments(node)
			if ast.IsIdentifier(call.Expression) && len(arguments) >= 4 &&
				ast.IsStringLiteral(arguments[2]) &&
				(ast.IsArrowFunction(arguments[3]) || ast.IsFunctionExpression(arguments[3])) {
				id := arguments[2].Text()
				if _, exists := expected[id]; exists {
					result[id] = arguments[3]
					return
				}
			}
			if ast.IsIdentifier(call.Expression) &&
				len(arguments) == 2 {
				if ast.IsStringLiteral(arguments[0]) &&
					(ast.IsArrowFunction(arguments[1]) ||
						ast.IsFunctionExpression(arguments[1])) {
					id := arguments[0].Text()
					if _, exists := expected[id]; exists {
						result[id] = arguments[1]
						return
					}
				}
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child)
			return false
		})
	}
	visit(componentFunction)
	return result
}

func continuationExecutor(
	factory *printer.NodeFactory,
	work *ast.Node,
	continuation Continuation,
	aliases []continuationContextAlias,
	stateType *ast.Node,
	used map[string]struct{},
) *ast.Node {
	activationName := allocateGeneratedName(used, "__exactActivation")
	executionName := allocateGeneratedName(used, "__exactExecution")
	componentName := allocateGeneratedName(used, "__exactComponent")
	contextWritesName := allocateGeneratedName(used, "__exactContextWrites")
	activation := factory.NewIdentifier(activationName)
	execution := factory.NewIdentifier(executionName)
	component := factory.NewIdentifier(componentName)
	contextWrites := factory.NewIdentifier(contextWritesName)

	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if node != work && ast.IsFunctionExpression(node) {
				return node
			}
			if ast.IsCallExpression(node) &&
				ast.IsPropertyAccessExpression(
					node.AsCallExpression().Expression,
				) {
				call := node.AsCallExpression()
				member := call.Expression.AsPropertyAccessExpression()
				if member.Expression != nil &&
					member.Expression.Kind == ast.KindThisKeyword {
					arguments := callArguments(node)
					switch member.Name().Text() {
					case "getContext":
						if len(arguments) == 1 {
							if value := continuationContextValue(
								factory,
								arguments[0],
								continuation,
								activation,
								execution,
							); value != nil {
								return value
							}
						}
					case "setContext":
						if len(arguments) >= 2 {
							token := stableContextToken(arguments[0])
							if continuationHasContext(
								continuation.Effects.ContextWrites,
								token,
							) {
								assignment := factory.NewBinaryExpression(
									nil,
									factory.NewElementAccessExpression(
										contextWrites,
										nil,
										contractString(factory, token),
										ast.NodeFlagsNone,
									),
									nil,
									factory.NewToken(ast.KindEqualsToken),
									visitor.VisitNode(arguments[1]),
								)
								return factory.NewBinaryExpression(
									nil,
									assignment,
									nil,
									factory.NewToken(ast.KindCommaToken),
									factory.NewVoidExpression(
										factory.NewNumericLiteral(
											"0",
											ast.TokenFlagsNone,
										),
									),
								)
							}
							if continuationHasContext(
								continuation.Effects.ServerContextWrites,
								token,
							) {
								return factory.NewCallExpression(
									factory.NewPropertyAccessExpression(
										execution,
										nil,
										factory.NewIdentifier("setContext"),
										ast.NodeFlagsNone,
									),
									nil,
									nil,
									factory.NewNodeList([]*ast.Node{
										arguments[0],
										visitor.VisitNode(arguments[1]),
										contractString(factory, token),
									}),
									ast.NodeFlagsNone,
								)
							}
						}
					}
				}
			}
			if node.Kind == ast.KindThisKeyword {
				return factory.NewIdentifier(componentName)
			}
			return visitor.VisitEachChild(node)
		},
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	rewrittenWork := visitor.VisitNode(work)
	arguments := make([]*ast.Node, 0, len(continuation.Activation.Dependencies)+1)
	for index := range continuation.Activation.Dependencies {
		arguments = append(
			arguments,
			factory.NewElementAccessExpression(
				factory.NewPropertyAccessExpression(
					activation,
					nil,
					factory.NewIdentifier("dependencies"),
					ast.NodeFlagsNone,
				),
				nil,
				factory.NewNumericLiteral(
					fmt.Sprintf("%d", index),
					ast.TokenFlagsNone,
				),
				ast.NodeFlagsNone,
			),
		)
	}
	contextArgument := factory.NewPropertyAccessExpression(
		execution,
		nil,
		factory.NewIdentifier("task"),
		ast.NodeFlagsNone,
	)
	arguments = append(arguments, contextArgument)
	invocation := factory.NewCallExpression(
		factory.NewParenthesizedExpression(rewrittenWork),
		nil,
		nil,
		factory.NewNodeList(arguments),
		ast.NodeFlagsNone,
	)
	aliasStatements := []*ast.Node{}
	referencedNames := continuationReferencedNames(work)
	for _, alias := range aliases {
		if _, referenced := referencedNames[alias.Name]; !referenced {
			continue
		}
		value := continuationContextValue(
			factory,
			alias.Token,
			continuation,
			activation,
			execution,
		)
		if value == nil {
			continue
		}
		aliasStatements = append(
			aliasStatements,
			constStatement(
				factory,
				factory.NewIdentifier(alias.Name),
				value,
			),
		)
	}
	statements := []*ast.Node{
		constStatement(
			factory,
			component,
			continuationComponentValue(factory, activation, stateType),
		),
		constStatement(
			factory,
			contextWrites,
			contractObject(factory, false),
		),
	}
	statements = append(statements, aliasStatements...)
	resultProperties := []*ast.Node{
		contractProperty(
			factory,
			"state",
			factory.NewPropertyAccessExpression(
				component,
				nil,
				factory.NewIdentifier("state"),
				ast.NodeFlagsNone,
			),
		),
		contractProperty(
			factory,
			"contexts",
			contextWrites,
		),
	}
	if continuation.Invocation != nil {
		result := factory.NewIdentifier(
			allocateGeneratedName(used, "__exactTaskResult"),
		)
		statements = append(statements, constStatement(
			factory,
			result,
			factory.NewAwaitExpression(invocation),
		))
		resultProperties = append(
			resultProperties,
			contractProperty(factory, "value", result),
		)
	} else {
		statements = append(
			statements,
			factory.NewExpressionStatement(
				factory.NewAwaitExpression(invocation),
			),
		)
	}
	statements = append(statements,
		factory.NewReturnStatement(
			contractObject(factory, false, resultProperties...),
		),
	)
	body := factory.NewBlock(
		factory.NewNodeList(statements),
		true,
	)
	return factory.NewArrowFunction(
		factory.NewModifierList([]*ast.Node{
			factory.NewModifier(ast.KindAsyncKeyword),
		}),
		nil,
		factory.NewNodeList([]*ast.Node{
			factory.NewParameterDeclaration(
				nil,
				nil,
				activation,
				nil,
				factory.NewKeywordTypeNode(ast.KindAnyKeyword),
				nil,
			),
			factory.NewParameterDeclaration(
				nil,
				nil,
				execution,
				nil,
				factory.NewKeywordTypeNode(ast.KindAnyKeyword),
				nil,
			),
		}),
		nil,
		nil,
		factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func constStatement(
	factory *printer.NodeFactory,
	name *ast.Node,
	value *ast.Node,
) *ast.Node {
	return factory.NewVariableStatement(
		nil,
		factory.NewVariableDeclarationList(
			factory.NewNodeList([]*ast.Node{
				factory.NewVariableDeclaration(name, nil, nil, value),
			}),
			ast.NodeFlagsConst,
		),
	)
}

func continuationMetadata(
	factory *printer.NodeFactory,
	continuations []Continuation,
	client bool,
) *ast.Node {
	values := make([]*ast.Node, 0, len(continuations))
	for _, continuation := range continuations {
		dependencies := continuationDependencyMetadata(
			factory,
			continuation.Activation.Dependencies,
		)
		serverContexts := []string{}
		if !client {
			for _, context := range continuation.Activation.ServerContexts {
				serverContexts = append(serverContexts, context.Token)
			}
		}
		publicContexts := []string{}
		for _, context := range continuation.Activation.PublicContexts {
			publicContexts = append(publicContexts, context.Token)
		}
		contextWrites := []string{}
		for _, context := range continuation.Effects.ContextWrites {
			contextWrites = append(contextWrites, context.Token)
		}
		serverContextWrites := []string{}
		if !client {
			for _, context := range continuation.Effects.ServerContextWrites {
				serverContextWrites = append(
					serverContextWrites,
					context.Token,
				)
			}
		}
		properties := []*ast.Node{
			contractProperty(
				factory,
				"kind",
				contractString(factory, continuation.Kind),
			),
			contractProperty(
				factory,
				"id",
				contractString(factory, continuation.ID),
			),
			contractProperty(
				factory,
				"componentId",
				contractString(factory, continuation.ComponentID),
			),
			contractProperty(
				factory,
				"readiness",
				contractString(factory, continuation.Readiness),
			),
			contractProperty(
				factory,
				"concurrency",
				contractString(factory, continuation.Concurrency),
			),
			contractProperty(
				factory,
				"dependencies",
				contractArray(factory, dependencies...),
			),
			contractProperty(
				factory,
				"stateReads",
				stateEffectMetadata(factory, continuation.Activation.StateReads),
			),
			contractProperty(
				factory,
				"stateWrites",
				stateEffectMetadata(factory, continuation.Effects.StateWrites),
			),
			contractProperty(
				factory,
				"publicContexts",
				stringMetadata(factory, publicContexts),
			),
			contractProperty(
				factory,
				"serverContexts",
				stringMetadata(factory, serverContexts),
			),
			contractProperty(
				factory,
				"contextWrites",
				stringMetadata(factory, contextWrites),
			),
			contractProperty(
				factory,
				"serverContextWrites",
				stringMetadata(factory, serverContextWrites),
			),
			contractProperty(
				factory,
				"boundaries",
				stringMetadata(factory, continuation.Effects.Boundaries),
			),
		}
		if continuation.Invocation != nil {
			properties = append(properties, continuationInvocationMetadata(factory, continuation))
		}
		values = append(values, contractObject(factory, true, properties...))
	}
	return contractArray(factory, values...)
}

func continuationInvocationMetadata(
	factory *printer.NodeFactory,
	continuation Continuation,
) *ast.Node {
	if continuation.Invocation == nil {
		panic("continuation invocation metadata requires task invocation analysis")
	}
	arguments := make([]*ast.Node, 0, len(continuation.Invocation.Arguments))
	for _, argument := range continuation.Invocation.Arguments {
		properties := []*ast.Node{
			contractProperty(factory, "index", contractNumber(factory, argument.Index)),
			contractProperty(factory, "source", contractString(factory, argument.Source)),
		}
		if argument.Path != "" {
			properties = append(properties,
				contractProperty(factory, "path", contractString(factory, argument.Path)),
			)
		}
		arguments = append(arguments, contractObject(factory, true, properties...))
	}
	return contractProperty(
		factory,
		"invocation",
		contractObject(
			factory,
			true,
			contractProperty(
				factory,
				"arguments",
				contractArray(factory, arguments...),
			),
			contractProperty(
				factory,
				"concurrency",
				contractString(factory, continuation.Invocation.Concurrency),
			),
		),
	)
}

func stateEffectMetadata(
	factory *printer.NodeFactory,
	effects []StateEffect,
) *ast.Node {
	values := make([]*ast.Node, 0, len(effects))
	for _, effect := range effects {
		properties := []*ast.Node{
			contractProperty(
				factory,
				"path",
				contractString(factory, effect.Path),
			),
			contractProperty(
				factory,
				"kind",
				contractString(factory, effect.Kind),
			),
			contractProperty(
				factory,
				"confidence",
				contractString(factory, effect.Confidence),
			),
		}
		if effect.Operation != "" {
			properties = append(properties, contractProperty(
				factory,
				"operation",
				contractString(factory, effect.Operation),
			))
		}
		values = append(values, contractObject(factory, true, properties...))
	}
	return contractArray(factory, values...)
}

func componentBoundaryMetadata(
	factory *printer.NodeFactory,
	component Component,
	boundaries []Boundary,
) *ast.Node {
	values := []*ast.Node{}
	for _, boundary := range boundaries {
		if boundary.OwnerComponentID != component.ID ||
			(component.Placement == "client" &&
				boundary.ComponentID == boundary.OwnerComponentID) {
			continue
		}
		properties := []*ast.Node{
			contractProperty(
				factory,
				"id",
				contractString(factory, boundary.ID),
			),
			contractProperty(
				factory,
				"componentId",
				contractString(factory, boundary.ComponentID),
			),
			contractProperty(
				factory,
				"ownerComponentId",
				contractString(factory, boundary.OwnerComponentID),
			),
			contractProperty(
				factory,
				"kind",
				contractString(factory, boundary.Kind),
			),
		}
		if boundary.PlanEdgeID != "" {
			properties = append(properties,
				contractProperty(factory, "planVersion", factory.NewNumericLiteral(strconv.Itoa(boundary.PlanVersion), ast.TokenFlagsNone)),
				contractProperty(factory, "buildKey", contractString(factory, boundary.BuildKey)),
				contractProperty(factory, "planEdgeId", contractString(factory, boundary.PlanEdgeID)),
				contractProperty(factory, "parentPlanId", contractString(factory, boundary.ParentPlanID)),
				contractProperty(factory, "fallbackPlanId", contractString(factory, boundary.FallbackPlanID)),
				contractProperty(factory, "patchTargets", stringMetadata(factory, boundary.PatchTargets)),
				contractProperty(factory, "discriminatorKind", contractString(factory, boundary.DiscriminatorKind)),
				contractProperty(factory, "discriminatorValues", stringMetadata(factory, boundary.DiscriminatorValues)),
				contractProperty(factory, "generation", factory.NewNumericLiteral(strconv.Itoa(boundary.Generation), ast.TokenFlagsNone)),
			)
		}
		values = append(values, contractObject(factory, true, properties...))
	}
	return contractArray(factory, values...)
}

func componentResumptionMetadata(
	factory *printer.NodeFactory,
	component Component,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	includeStateInputs bool,
) *ast.Node {
	record := ComponentResumption{
		ComponentID: component.ID,
		Client: ClientResumptionRecord{
			StatePaths:    []string{},
			StateInputs:   []StateInput{},
			ValueCaptures: []string{},
			Contexts:      []string{},
			Boundaries:    []string{},
		},
	}
	for _, candidate := range resumptions {
		if candidate.ComponentID == component.ID {
			record = candidate
			break
		}
	}
	if component.Placement == "client" {
		visible := make(map[string]struct{})
		for _, boundary := range boundaries {
			if boundary.OwnerComponentID == component.ID &&
				boundary.ComponentID != boundary.OwnerComponentID {
				visible[boundary.ID] = struct{}{}
			}
		}
		filtered := []string{}
		for _, id := range record.Client.Boundaries {
			if _, exists := visible[id]; exists {
				filtered = append(filtered, id)
			}
		}
		record.Client.Boundaries = filtered
	}
	// State-input paths authorize server-side omission only. Hydration receives finalized props and
	// consumes state paths, so shipping the source paths would retain descriptive build facts.
	if !includeStateInputs {
		record.Client.StateInputs = []StateInput{}
	}
	return contractObject(factory, true,
		contractProperty(
			factory,
			"componentId",
			contractString(factory, component.ID),
		),
		contractProperty(
			factory,
			"statePaths",
			stringMetadata(factory, record.Client.StatePaths),
		),
		contractProperty(
			factory,
			"stateInputs",
			stateInputMetadata(factory, record.Client.StateInputs),
		),
		contractProperty(
			factory,
			"valueCaptures",
			stringMetadata(factory, record.Client.ValueCaptures),
		),
		contractProperty(
			factory,
			"contexts",
			stringMetadata(factory, record.Client.Contexts),
		),
		contractProperty(
			factory,
			"boundaries",
			stringMetadata(factory, record.Client.Boundaries),
		),
	)
}

func stateInputMetadata(factory *printer.NodeFactory, values []StateInput) *ast.Node {
	entries := make([]*ast.Node, 0, len(values))
	for _, value := range values {
		if value.StatePath == "" || value.PropPath == "" {
			continue
		}
		entries = append(entries, contractArray(
			factory,
			contractString(factory, value.StatePath),
			contractString(factory, value.PropPath),
		))
	}
	return contractArray(factory, entries...)
}

func stringMetadata(
	factory *printer.NodeFactory,
	values []string,
) *ast.Node {
	nodes := make([]*ast.Node, 0, len(values))
	for _, value := range values {
		nodes = append(nodes, contractString(factory, value))
	}
	return contractArray(factory, nodes...)
}

func contractProperty(
	factory *printer.NodeFactory,
	name string,
	value *ast.Node,
) *ast.Node {
	return factory.NewPropertyAssignment(
		nil,
		factory.NewIdentifier(name),
		nil,
		nil,
		value,
	)
}

func contractString(factory *printer.NodeFactory, value string) *ast.Node {
	return factory.NewStringLiteral(value, ast.TokenFlagsNone)
}

func contractArray(
	factory *printer.NodeFactory,
	values ...*ast.Node,
) *ast.Node {
	return factory.NewArrayLiteralExpression(factory.NewNodeList(values), true)
}

func contractObject(
	factory *printer.NodeFactory,
	multiline bool,
	properties ...*ast.Node,
) *ast.Node {
	return factory.NewObjectLiteralExpression(
		factory.NewNodeList(properties),
		multiline,
	)
}

func sourceIdentifiers(sourceFile *ast.SourceFile) map[string]struct{} {
	result := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			result[node.Text()] = struct{}{}
		}
		return true
	})
	return result
}

func allocateGeneratedName(used map[string]struct{}, base string) string {
	for suffix := 1; ; suffix++ {
		candidate := base + "_" + fmt.Sprintf("%d", suffix)
		if _, exists := used[candidate]; exists {
			continue
		}
		used[candidate] = struct{}{}
		return candidate
	}
}

func isDirectiveStatement(statement *ast.Node) bool {
	return ast.IsExpressionStatement(statement) &&
		ast.IsStringLiteral(statement.AsExpressionStatement().Expression)
}
