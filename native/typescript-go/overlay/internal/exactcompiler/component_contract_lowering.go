package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// lowerComponentContracts attaches the target-local ownership brand for
// components whose complete descriptor contains no generated implementations
// or distributed continuations. Rich contracts are added by the continuation
// and artifact passes as those records become available.
func lowerComponentContracts(
	sourceFile *ast.SourceFile,
	emitContext *printer.EmitContext,
	components []Component,
	tasks []Task,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	identityFilename string,
	preserveComponentHoisting bool,
) *ast.SourceFile {
	if target == TargetDefault {
		return sourceFile
	}
	factory := emitContext.Factory
	eligible := make(map[string]struct{})
	rootContracts := make(map[string]Component)
	for _, component := range components {
		if !componentExecutableOnTarget(component, target) {
			continue
		}
		if componentRootContract(
			component,
			target,
			continuations,
			boundaries,
		) {
			rootContracts[component.Name] = component
		} else if componentBrandOnly(component, tasks, target) {
			eligible[component.Name] = struct{}{}
		}
	}
	if len(eligible) == 0 && len(rootContracts) == 0 {
		return sourceFile
	}

	used := sourceIdentifiers(sourceFile)
	descriptorName := allocateGeneratedName(used, "__exactComponentContract")
	statements := make(
		[]*ast.Node,
		0,
		len(sourceFile.Statements.Nodes)+len(eligible)+len(rootContracts)+1,
	)
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) {
			name := statement.Name()
			if name != nil {
				if component, wrap := rootContracts[name.Text()]; wrap {
					statements = append(
						statements,
						wrapRootComponentFunction(
							emitContext,
							statement.AsFunctionDeclaration(),
							component,
							descriptorName,
							identityFilename,
							continuations,
							resumptions,
							boundaries,
							target,
							used,
							preserveComponentHoisting,
						)...,
					)
					continue
				}
				if _, attach := eligible[name.Text()]; attach {
					statements = append(
						statements,
						statement,
						factory.NewExpressionStatement(
							componentBrandAttachment(factory, name),
						),
					)
					continue
				}
			}
		}
		if ast.IsVariableStatement(statement) {
			updatedRoot, rootChanged := wrapRootComponentVariables(
				emitContext,
				statement,
				rootContracts,
				descriptorName,
				identityFilename,
				continuations,
				resumptions,
				boundaries,
				target,
				used,
			)
			if rootChanged {
				statements = append(statements, updatedRoot)
				continue
			}
			updated, changed := brandComponentVariables(
				factory,
				statement,
				eligible,
			)
			if changed {
				statements = append(statements, updated)
				continue
			}
		}
		statements = append(statements, statement)
	}
	if target == TargetServer {
		for _, component := range components {
			if _, exists := rootContracts[component.Name]; !exists {
				continue
			}
			if component.ClientIslandCount == 0 {
				continue
			}
			generatedName := generatedComponentName(
				component.Name,
				"server-part",
				1,
			)
			statements = append(
				statements,
				factory.NewExportDeclaration(
					nil,
					false,
					factory.NewNamedExports(
						factory.NewNodeList([]*ast.Node{
							factory.NewExportSpecifier(
								false,
								factory.NewIdentifier(component.Name),
								factory.NewIdentifier(generatedName),
							),
						}),
					),
					nil,
					nil,
				),
			)
		}
	}
	if len(rootContracts) != 0 {
		insertionIndex := 0
		for insertionIndex < len(statements) {
			statement := statements[insertionIndex]
			if ast.IsImportDeclaration(statement) ||
				isDirectiveStatement(statement) {
				insertionIndex++
				continue
			}
			break
		}
		descriptor := componentDescriptorDeclaration(
			emitContext,
			descriptorName,
		)
		statements = append(statements, nil)
		copy(statements[insertionIndex+1:], statements[insertionIndex:])
		statements[insertionIndex] = descriptor
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func componentRootContract(
	component Component,
	target Target,
	continuations []Continuation,
	boundaries []Boundary,
) bool {
	if !component.Exported {
		return false
	}
	if target == TargetClient && component.Placement == "client" {
		return true
	}
	if component.Placement != "isomorphic" {
		return false
	}
	for _, continuation := range continuations {
		if continuation.ComponentID == component.ID {
			return target == TargetClient || target == TargetServer
		}
	}
	for _, boundary := range boundaries {
		if boundary.OwnerComponentID == component.ID {
			return target == TargetClient || target == TargetServer
		}
	}
	return false
}

func componentExecutableOnTarget(component Component, target Target) bool {
	switch target {
	case TargetClient:
		return component.Placement == "client" ||
			component.Placement == "isomorphic"
	case TargetServer:
		return component.Placement == "server" ||
			component.Placement == "isomorphic"
	default:
		return false
	}
}

func componentBrandOnly(
	component Component,
	tasks []Task,
	target Target,
) bool {
	if component.ClientIslandCount != 0 {
		return false
	}
	if target == TargetClient && component.Placement == "client" &&
		component.Exported {
		return false
	}
	if component.Placement == "isomorphic" {
		for _, task := range tasks {
			if task.Component == component.Name && task.Placement == "server" {
				return false
			}
		}
	}
	return true
}

func brandComponentVariables(
	factory *printer.NodeFactory,
	statement *ast.Node,
	eligible map[string]struct{},
) (*ast.Node, bool) {
	variable := statement.AsVariableStatement()
	list := variable.DeclarationList.AsVariableDeclarationList()
	declarations := append([]*ast.Node(nil), list.Declarations.Nodes...)
	changed := false
	for index, node := range declarations {
		declaration := node.AsVariableDeclaration()
		name := declaration.Name()
		if name == nil || !ast.IsIdentifier(name) ||
			declaration.Initializer == nil {
			continue
		}
		if _, attach := eligible[name.Text()]; !attach {
			continue
		}
		if !ast.IsArrowFunction(declaration.Initializer) &&
			!ast.IsFunctionExpression(declaration.Initializer) {
			continue
		}
		declarations[index] = factory.UpdateVariableDeclaration(
			declaration,
			name,
			declaration.ExclamationToken,
			declaration.Type,
			componentBrandAttachment(factory, declaration.Initializer),
		)
		changed = true
	}
	if !changed {
		return statement, false
	}
	declarationList := factory.UpdateVariableDeclarationList(
		list,
		factory.NewNodeList(declarations),
		list.Flags,
	)
	return factory.UpdateVariableStatement(
		variable,
		variable.Modifiers(),
		declarationList,
	), true
}

func componentBrandAttachment(
	factory *printer.NodeFactory,
	component *ast.Node,
) *ast.Node {
	symbol := factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Symbol"),
			nil,
			factory.NewIdentifier("for"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			factory.NewStringLiteral("@exactjs/component", ast.TokenFlagsNone),
		}),
		ast.NodeFlagsNone,
	)
	properties := factory.NewObjectLiteralExpression(
		factory.NewNodeList([]*ast.Node{
			factory.NewPropertyAssignment(
				nil,
				factory.NewComputedPropertyName(symbol),
				nil,
				nil,
				factory.NewTrueExpression(),
			),
		}),
		false,
	)
	return factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Object"),
			nil,
			factory.NewIdentifier("assign"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{component, properties}),
		ast.NodeFlagsNone,
	)
}

func wrapRootComponentFunction(
	emitContext *printer.EmitContext,
	declaration *ast.FunctionDeclaration,
	component Component,
	descriptorName string,
	identityFilename string,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	used map[string]struct{},
	preserveComponentHoisting bool,
) []*ast.Node {
	if !preserveComponentHoisting {
		return wrapRootComponentFunctionValue(
			emitContext,
			declaration,
			component,
			descriptorName,
			identityFilename,
			continuations,
			resumptions,
			boundaries,
			target,
			used,
		)
	}
	factory := emitContext.Factory
	name := declaration.Name()
	implementationIdentifier := factory.NewIdentifier(name.Text())
	attachment := rootComponentContractAttachment(
		emitContext,
		implementationIdentifier,
		component,
		descriptorName,
		identityFilename,
		continuations,
		resumptions,
		boundaries,
		target,
		declaration.AsNode(),
		used,
		false,
	)
	attachmentStatement := factory.NewExpressionStatement(attachment)
	return []*ast.Node{declaration.AsNode(), attachmentStatement}
}

func wrapRootComponentFunctionValue(
	emitContext *printer.EmitContext,
	declaration *ast.FunctionDeclaration,
	component Component,
	descriptorName string,
	identityFilename string,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	used map[string]struct{},
) []*ast.Node {
	factory := emitContext.Factory
	name := declaration.Name()
	implementationIdentifier := factory.NewIdentifier(
		allocateGeneratedName(used, "__exactImplementation_"+name.Text()),
	)
	functionModifiers := []*ast.Node{}
	if modifiers := declaration.Modifiers(); modifiers != nil {
		for _, modifier := range modifiers.Nodes {
			if modifier.Kind != ast.KindExportKeyword &&
				modifier.Kind != ast.KindDefaultKeyword {
				functionModifiers = append(functionModifiers, modifier)
			}
		}
	}
	var implementationModifiers *ast.ModifierList
	if len(functionModifiers) != 0 {
		implementationModifiers = factory.NewModifierList(functionModifiers)
	}
	implementation := factory.NewFunctionExpression(
		implementationModifiers,
		declaration.AsteriskToken,
		factory.NewIdentifier(name.Text()),
		declaration.TypeParameters,
		declaration.Parameters,
		declaration.Type,
		declaration.FullSignature,
		declaration.Body,
	)
	attachment := rootComponentContractAttachment(
		emitContext,
		implementationIdentifier,
		component,
		descriptorName,
		identityFilename,
		continuations,
		resumptions,
		boundaries,
		target,
		implementation,
		used,
		true,
	)
	implementationDeclaration := factory.NewVariableStatement(
		nil,
		factory.NewVariableDeclarationList(
			factory.NewNodeList([]*ast.Node{
				factory.NewVariableDeclaration(
					implementationIdentifier,
					nil,
					nil,
					implementation,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	defaultExport := ast.HasSyntacticModifier(
		declaration.AsNode(),
		ast.ModifierFlagsDefault,
	)
	var publicModifiers *ast.ModifierList
	if ast.HasSyntacticModifier(declaration.AsNode(), ast.ModifierFlagsExport) &&
		!defaultExport {
		publicModifiers = factory.NewModifierList([]*ast.Node{
			factory.NewModifier(ast.KindExportKeyword),
		})
	}
	publicDeclaration := factory.NewVariableStatement(
		publicModifiers,
		factory.NewVariableDeclarationList(
			factory.NewNodeList([]*ast.Node{
				factory.NewVariableDeclaration(
					factory.NewIdentifier(name.Text()),
					nil,
					factory.NewTypeQueryNode(implementationIdentifier, nil),
					attachment,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	result := []*ast.Node{implementationDeclaration, publicDeclaration}
	if defaultExport {
		result = append(
			result,
			factory.NewExportAssignment(
				nil,
				false,
				nil,
				factory.NewIdentifier(name.Text()),
			),
		)
	}
	return result
}

func rootComponentContractAttachment(
	emitContext *printer.EmitContext,
	implementation *ast.Node,
	component Component,
	descriptorName string,
	identityFilename string,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	componentFunction *ast.Node,
	used map[string]struct{},
	wrapIIFE bool,
) *ast.Node {
	factory := emitContext.Factory
	implementationName := component.Name
	implementationRole := "root"
	rootSymbolID := exactStableID(
		identityFilename,
		"symbol",
		component.ID,
		"root",
		component.Name,
	)
	if target == TargetServer && component.ClientIslandCount != 0 {
		implementationName = generatedComponentName(
			component.Name,
			"server-part",
			1,
		)
		implementationRole = "server-part"
		rootSymbolID = exactStableID(
			identityFilename,
			component.Name,
			"server-part",
			"1",
		)
	}
	implementationRecord := contractObject(factory, false,
		contractProperty(factory, "id", contractString(factory, rootSymbolID)),
		contractProperty(factory, "name", contractString(factory, implementationName)),
		contractProperty(factory, "role", contractString(factory, implementationRole)),
		contractProperty(factory, "implementation", implementation),
	)
	componentContinuations := continuationsForComponent(
		continuations,
		component.ID,
	)
	executors := contractArray(factory)
	if target == TargetServer {
		executors = continuationExecutorMetadata(
			factory,
			componentFunction,
			componentContinuations,
			used,
		)
	}
	resumption := componentResumptionMetadata(
		factory,
		component,
		resumptions,
		boundaries,
	)
	role := "executor"
	if target == TargetClient {
		role = "client"
	}
	contract := contractObject(factory, true,
		contractProperty(
			factory,
			"version",
			factory.NewNumericLiteral("1", ast.TokenFlagsNone),
		),
		contractProperty(factory, "id", contractString(factory, component.ID)),
		contractProperty(
			factory,
			"placement",
			contractString(factory, component.Placement),
		),
		contractProperty(factory, "role", contractString(factory, role)),
		contractProperty(
			factory,
			"implementations",
			contractArray(factory, implementationRecord),
		),
		contractProperty(
			factory,
			"continuations",
			continuationMetadata(
				factory,
				componentContinuations,
				target == TargetClient,
			),
		),
		contractProperty(factory, "executors", executors),
		contractProperty(
			factory,
			"boundaries",
			componentBoundaryMetadata(factory, component, boundaries),
		),
		contractProperty(factory, "resumption", resumption),
	)
	brandSymbol := factory.NewComputedPropertyName(
		factory.NewCallExpression(
			factory.NewPropertyAccessExpression(
				factory.NewIdentifier("Symbol"),
				nil,
				factory.NewIdentifier("for"),
				ast.NodeFlagsNone,
			),
			nil,
			nil,
			factory.NewNodeList([]*ast.Node{
				contractString(factory, "@exactjs/component"),
			}),
			ast.NodeFlagsNone,
		),
	)
	properties := factory.NewObjectLiteralExpression(
		factory.NewNodeList([]*ast.Node{
			factory.NewPropertyAssignment(
				nil,
				brandSymbol,
				nil,
				nil,
				factory.NewTrueExpression(),
			),
			factory.NewPropertyAssignment(
				nil,
				factory.NewComputedPropertyName(
					factory.NewIdentifier(descriptorName),
				),
				nil,
				nil,
				contract,
			),
		}),
		true,
	)
	assigned := factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Object"),
			nil,
			factory.NewIdentifier("assign"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{implementation, properties}),
		ast.NodeFlagsNone,
	)
	if !wrapIIFE {
		return assigned
	}
	iife := factory.NewCallExpression(
		factory.NewParenthesizedExpression(
			factory.NewArrowFunction(
				nil,
				nil,
				factory.NewNodeList(nil),
				nil,
				nil,
				factory.NewToken(ast.KindEqualsGreaterThanToken),
				assigned,
			),
		),
		nil,
		nil,
		factory.NewNodeList(nil),
		ast.NodeFlagsNone,
	)
	return emitContext.AddSyntheticLeadingComment(
		iife,
		ast.KindMultiLineCommentTrivia,
		" @__PURE__ ",
		false,
	)
}

func wrapRootComponentVariables(
	emitContext *printer.EmitContext,
	statement *ast.Node,
	components map[string]Component,
	descriptorName string,
	identityFilename string,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	used map[string]struct{},
) (*ast.Node, bool) {
	factory := emitContext.Factory
	variable := statement.AsVariableStatement()
	list := variable.DeclarationList.AsVariableDeclarationList()
	declarations := append([]*ast.Node(nil), list.Declarations.Nodes...)
	changed := false
	for index, node := range declarations {
		declaration := node.AsVariableDeclaration()
		name := declaration.Name()
		if name == nil || !ast.IsIdentifier(name) ||
			declaration.Initializer == nil {
			continue
		}
		component, wrap := components[name.Text()]
		if !wrap ||
			(!ast.IsArrowFunction(declaration.Initializer) &&
				!ast.IsFunctionExpression(declaration.Initializer)) {
			continue
		}
		implementationName := allocateGeneratedName(
			used,
			"__exactComponentImplementation",
		)
		implementation := factory.NewIdentifier(implementationName)
		implementationDeclaration := factory.NewVariableStatement(
			nil,
			factory.NewVariableDeclarationList(
				factory.NewNodeList([]*ast.Node{
					factory.NewVariableDeclaration(
						implementation,
						nil,
						nil,
						declaration.Initializer,
					),
				}),
				ast.NodeFlagsConst,
			),
		)
		attachment := rootComponentContractAttachment(
			emitContext,
			implementation,
			component,
			descriptorName,
			identityFilename,
			continuations,
			resumptions,
			boundaries,
			target,
			declaration.Initializer,
			used,
			false,
		)
		body := factory.NewBlock(
			factory.NewNodeList([]*ast.Node{
				implementationDeclaration,
				factory.NewReturnStatement(attachment),
			}),
			true,
		)
		iife := factory.NewCallExpression(
			factory.NewParenthesizedExpression(
				factory.NewArrowFunction(
					nil,
					nil,
					factory.NewNodeList(nil),
					nil,
					nil,
					factory.NewToken(ast.KindEqualsGreaterThanToken),
					body,
				),
			),
			nil,
			nil,
			factory.NewNodeList(nil),
			ast.NodeFlagsNone,
		)
		declarations[index] = factory.UpdateVariableDeclaration(
			declaration,
			name,
			declaration.ExclamationToken,
			declaration.Type,
			iife,
		)
		changed = true
	}
	if !changed {
		return statement, false
	}
	declarationList := factory.UpdateVariableDeclarationList(
		list,
		factory.NewNodeList(declarations),
		list.Flags,
	)
	return factory.UpdateVariableStatement(
		variable,
		variable.Modifiers(),
		declarationList,
	), true
}

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
			if ast.IsIdentifier(call.Expression) &&
				len(callArguments(node)) == 2 {
				arguments := callArguments(node)
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
	contextProperties := []*ast.Node{
		contractProperty(
			factory,
			"signal",
			factory.NewPropertyAccessExpression(
				execution,
				nil,
				factory.NewIdentifier("signal"),
				ast.NodeFlagsNone,
			),
		),
	}
	if continuation.Kind == "action" {
		contextProperties = append(contextProperties, contractProperty(
			factory,
			"generation",
			factory.NewPropertyAccessExpression(
				activation,
				nil,
				factory.NewIdentifier("generation"),
				ast.NodeFlagsNone,
			),
		))
	}
	contextArgument := contractObject(factory, false, contextProperties...)
	if continuation.Kind == "action" {
		// The server half receives cancellation and generation only. Optimistic
		// mutation is a client prelude and must never become executable server
		// authority, even when the authored callback names ActionContext.
		contextArgument = factory.NewAsExpression(
			contextArgument,
			factory.NewKeywordTypeNode(ast.KindAnyKeyword),
		)
	}
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
			contractObject(factory, false,
				contractProperty(
					factory,
					"state",
					factory.NewPropertyAccessExpression(
						activation,
						nil,
						factory.NewIdentifier("state"),
						ast.NodeFlagsNone,
					),
				),
			),
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
	if continuation.Kind == "action" {
		result := factory.NewIdentifier(
			allocateGeneratedName(used, "__exactActionResult"),
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
		dependencies := make([]*ast.Node, 0, len(continuation.Activation.Dependencies))
		for _, dependency := range continuation.Activation.Dependencies {
			dependencies = append(
				dependencies,
				contractObject(
					factory,
					true,
					contractProperty(
						factory,
						"source",
						contractString(factory, dependency.Source),
					),
				),
			)
		}
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
		panic("continuation invocation metadata requires action invocation analysis")
	}
	arguments := make([]*ast.Node, 0, len(continuation.Invocation.Arguments))
	for _, argument := range continuation.Invocation.Arguments {
		arguments = append(arguments, contractObject(
			factory,
			true,
			contractProperty(
				factory,
				"source",
				contractString(factory, argument.Source),
			),
		))
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
		values = append(values, contractObject(factory, true,
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
		))
	}
	return contractArray(factory, values...)
}

func componentResumptionMetadata(
	factory *printer.NodeFactory,
	component Component,
	resumptions []ComponentResumption,
	boundaries []Boundary,
) *ast.Node {
	record := ComponentResumption{
		ComponentID: component.ID,
		Client: ClientResumptionRecord{
			StatePaths:    []string{},
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
