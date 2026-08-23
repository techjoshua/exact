package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// lowerComponentContracts attaches a target-local executable artifact to every
// native component. Exported roots may additionally own continuations,
// resumption, and boundary records, but private children are not reduced to a
// ad hoc identity-only callable without executable compiler artifacts.
func lowerComponentContracts(
	sourceFile *ast.SourceFile,
	emitContext *printer.EmitContext,
	components []Component,
	continuations []Continuation,
	resumptions []ComponentResumption,
	boundaries []Boundary,
	target Target,
	identityFilename string,
	preserveComponentHoisting bool,
	compatibility bool,
	projection ComponentContractProjection,
	componentUpdates map[string]string,
) *ast.SourceFile {
	if target == TargetDefault {
		return sourceFile
	}
	factory := emitContext.Factory
	rootContracts := make(map[string]Component)
	for _, component := range components {
		if componentHasTargetArtifact(component, target) {
			rootContracts[component.Name] = component
		}
	}
	if len(rootContracts) == 0 {
		return sourceFile
	}

	used := sourceIdentifiers(sourceFile)
	descriptorName := allocateGeneratedName(used, "__exactComponentContract")
	statements := make(
		[]*ast.Node,
		0,
		len(sourceFile.Statements.Nodes)+len(rootContracts)+1,
	)
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) {
			name := statement.Name()
			if name != nil {
				if component, wrap := rootContracts[name.Text()]; wrap {
					preserveHoisting := preserveComponentHoisting ||
						componentFunctionReferencedEarlier(sourceFile, statement, name.Text())
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
							preserveHoisting,
							compatibility,
							projection,
							componentUpdates,
						)...,
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
				compatibility,
				projection,
				componentUpdates,
			)
			if rootChanged {
				statements = append(statements, updatedRoot)
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
			if component.Placement == "client" {
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
		updateDefinitions, retained := extractComponentUpdateDefinitions(statements, componentUpdates)
		statements = retained
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
		ordered := make([]*ast.Node, 0, len(statements)+len(updateDefinitions)+1)
		ordered = append(ordered, statements[:insertionIndex]...)
		ordered = append(ordered, descriptor)
		ordered = append(ordered, updateDefinitions...)
		ordered = append(ordered, statements[insertionIndex:]...)
		statements = ordered
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func extractComponentUpdateDefinitions(
	statements []*ast.Node,
	componentUpdates map[string]string,
) ([]*ast.Node, []*ast.Node) {
	names := make(map[string]struct{}, len(componentUpdates))
	for _, name := range componentUpdates {
		names[name] = struct{}{}
	}
	definitions := make([]*ast.Node, 0, len(names))
	retained := make([]*ast.Node, 0, len(statements))
	for _, statement := range statements {
		if ast.IsVariableStatement(statement) {
			declarations := statement.AsVariableStatement().DeclarationList.
				AsVariableDeclarationList().Declarations.Nodes
			if len(declarations) == 1 {
				name := declarations[0].AsVariableDeclaration().Name()
				if name != nil && ast.IsIdentifier(name) {
					if _, generated := names[name.Text()]; generated {
						definitions = append(definitions, statement)
						continue
					}
				}
			}
		}
		retained = append(retained, statement)
	}
	return definitions, retained
}

func componentFunctionReferencedEarlier(
	sourceFile *ast.SourceFile,
	declaration *ast.Node,
	name string,
) bool {
	for _, statement := range sourceFile.Statements.Nodes {
		if statement == declaration {
			return false
		}
		found := false
		walkNode(statement, func(node *ast.Node) bool {
			if ast.IsIdentifier(node) && node.Text() == name {
				found = true
				return false
			}
			return !found
		})
		if found {
			return true
		}
	}
	return false
}

func componentHasTargetArtifact(_ Component, target Target) bool {
	// Partition lowering has already replaced opposite-target implementations
	// with target-local boundary callables. Those stubs are compiled artifacts
	// too; placement does not authorize an identity-only native value.
	return target != TargetDefault
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
	compatibility bool,
	projection ComponentContractProjection,
	componentUpdates map[string]string,
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
			compatibility,
			projection,
			componentUpdates,
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
		compatibility,
		projection,
		componentUpdates,
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
	compatibility bool,
	projection ComponentContractProjection,
	componentUpdates map[string]string,
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
		compatibility,
		projection,
		componentUpdates,
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
					nil,
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
	compatibility bool,
	projection ComponentContractProjection,
	componentUpdates map[string]string,
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
	if target == TargetServer && component.Placement != "client" && component.ClientIslandCount != 0 {
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
	role := "executor"
	if target == TargetClient {
		role = "client"
	}
	projectedExecution := projectComponentExecution(component.Execution, target)
	projectedContinuations := continuationMetadata(factory, componentContinuations, target == TargetClient)
	projectedBoundaries := componentBoundaryMetadata(factory, component, boundaries)
	if target == TargetClient && projection == ComponentContractProjectionHydrate {
		// A hydration-only client executes its compiled local task definitions directly and
		// receives server-operation authorization through the serialized hydration config.
		// The verbose composition catalogs are needed only by complete and island clients.
		projectedContinuations = contractArray(factory)
		projectedBoundaries = contractArray(factory)
	}
	usesCompatibility := compatibility && componentUsesJSXInterop(component, componentFunction)
	hasResumption := component.Placement == "isomorphic" &&
		componentHasResumption(component.ID, resumptions)
	var updates *ast.Node
	if name, exists := componentUpdates[component.Name]; exists {
		updates = factory.NewIdentifier(name)
	}
	contractProperties := []*ast.Node{
		contractProperty(
			factory,
			"version",
			factory.NewNumericLiteral("2", ast.TokenFlagsNone),
		),
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
			projectedContinuations,
		),
		contractProperty(factory, "executors", executors),
		contractProperty(factory, "boundaries", projectedBoundaries),
		contractProperty(
			factory,
			"definition",
			componentDefinitionMetadata(
				factory,
				implementation,
				projectedExecution,
				component.StateSlots,
				componentContinuations,
				hasResumption,
				target == TargetClient && component.Interactions,
				usesCompatibility,
				component.DynamicComponents,
				component.Collections,
				componentRuntimeABI(component, projectedExecution, usesCompatibility),
				componentUsesProtocolMember(
					componentFunction,
					"log", "intl", "hasContext", "getContext", "setContext", "reactive",
					"ref", "refs", "map", "onMount", "onActivate", "onDeactivate",
					"onUnmount", "onRender", "own",
				),
				target == TargetServer,
				projection != ComponentContractProjectionComplete,
				updates,
			),
		),
	}
	if projection != ComponentContractProjectionHydrate {
		contractProperties = append(contractProperties, contractProperty(
			factory,
			"execution",
			componentExecutionMetadata(
				factory,
				projectedExecution,
				projection != ComponentContractProjectionComplete,
			),
		))
	}
	if component.Placement == "isomorphic" &&
		projection != ComponentContractProjectionClient &&
		hasResumption {
		contractProperties = append(contractProperties, contractProperty(
			factory,
			"resumption",
			componentResumptionMetadata(factory, component, resumptions, boundaries),
		))
	}
	contract := contractObject(factory, true, contractProperties...)
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
				contractString(factory, component.ID),
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

func componentUsesJSXInterop(component Component, componentFunction *ast.Node) bool {
	for _, edge := range component.RenderEdges {
		if edge.ModuleSpecifier != "" && edge.ComponentID == "" {
			return true
		}
	}
	used := false
	walkNode(componentFunction, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) {
			return true
		}
		name := node.Text()
		used = name == "__exactInteropComponent" || strings.HasPrefix(name, "__exactInteropComponent_")
		return !used
	})
	return used
}

func componentHasResumption(componentID string, resumptions []ComponentResumption) bool {
	for _, resumption := range resumptions {
		if resumption.ComponentID == componentID &&
			(len(resumption.Client.StatePaths) != 0 ||
				len(resumption.Client.ValueCaptures) != 0 ||
				len(resumption.Client.Contexts) != 0 ||
				len(resumption.Client.Boundaries) != 0) {
			return true
		}
	}
	return false
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
	compatibility bool,
	projection ComponentContractProjection,
	componentUpdates map[string]string,
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
			compatibility,
			projection,
			componentUpdates,
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
