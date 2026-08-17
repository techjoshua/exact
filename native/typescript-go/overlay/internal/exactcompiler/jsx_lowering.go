package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

type jsxLowering struct {
	sourceFile             *ast.SourceFile
	factory                *printer.NodeFactory
	visitor                *ast.NodeVisitor
	names                  jsxRuntimeNames
	nodeIDs                map[*ast.Node]string
	writes                 map[string]StateWrite
	tasks                  map[string]Task
	invokedTasks           map[int]Task
	functionTasks          map[int]Task
	taskDefinitions        map[ast.SymbolId]Task
	taskDefinitionNames    map[string]Task
	operations             map[string]InvokedTaskOperation
	stateReads             []StateRead
	bindings               []ReactiveBinding
	formBindings           map[int]formBinding
	componentBindings      map[int]componentBinding
	checker                *checker.Checker
	taskHelpers            map[string]string
	derived                map[int]ReactiveBinding
	elidedDerived          map[int]ReactiveBinding
	target                 Target
	contractProjection     ComponentContractProjection
	serverComponents       bool
	instrumentInspection   bool
	components             map[string]Component
	microComponents        map[ast.SymbolId]struct{}
	renderEdges            map[string]RenderEdge
	clientIslands          map[*ast.Node]clientElementIsland
	clientDefinitions      []*ast.Node
	captureValues          map[ast.SymbolId]string
	interop                *JSXInterop
	materializedNames      map[int]string
	cachedDerivedNames     map[int]string
	contextWrites          map[string][]string
	collectionMaps         map[string]collectionMapPlan
	enhancementImports     enhancementImports
	partitionPlan          PartitionPlan
	dynamicComponents      map[int]dynamicComponentUseKind
	componentLocalization  bool
	renderProgramFallback  bool
	renderProgramContexts  map[int]renderProgramContext
	declarativeRenderDepth int
	timeActivation         string
	timeActivationAdopted  bool
	timePlanNode           *ast.Node
	timePlanInputs         []*ast.Node
	timePlanInputIndexes   map[*ast.Node]int
	timeAdoptedRanges      []timeAdoptedRange
	timeAdoptedSelection   *timeAdoptedRange
}

type timeAdoptedRange struct {
	node   *ast.Node
	inputs []*ast.Node
	index  int
}

// lowerExactJSX replaces authored TSX with eXact runtime operations inside the
// native process. The returned tree contains no JSX nodes and is ready for
// subsequent native passes and the TypeScript-Go printer.
func lowerExactJSX(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	plan jsxLoweringPlan,
) *ast.SourceFile {
	lowering, required := plan.prepare(sourceFile, factory)
	if !required {
		return sourceFile
	}
	lowering.visitor = ast.NewNodeVisitor(
		lowering.visit,
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	transformed := lowering.visitor.VisitEachChild(sourceFile.AsNode()).AsSourceFile()
	transformed = lowering.omitFullyMaterializedRenderLocals(transformed.AsNode()).AsSourceFile()
	if len(lowering.clientDefinitions) != 0 {
		statements := append(
			[]*ast.Node(nil),
			transformed.Statements.Nodes...,
		)
		statements = append(statements, lowering.clientDefinitions...)
		transformed = factory.UpdateSourceFile(
			transformed,
			factory.NewNodeList(statements),
			transformed.EndOfFileToken,
		).AsSourceFile()
		ast.SetParentInChildren(transformed.AsNode())
	}
	runtimeImports := lowering.runtimeImports(transformed.AsNode())
	interopImport := lowering.interopImport(transformed.AsNode())
	statements := make([]*ast.Node, 0, len(transformed.Statements.Nodes)+len(runtimeImports)+1)
	insertion := 0
	for insertion < len(transformed.Statements.Nodes) &&
		isDirectiveStatement(transformed.Statements.Nodes[insertion]) {
		statements = append(statements, transformed.Statements.Nodes[insertion])
		insertion++
	}
	statements = append(statements, runtimeImports...)
	if interopImport != nil {
		statements = append(statements, interopImport)
	}
	statements = append(statements, transformed.Statements.Nodes[insertion:]...)
	result := factory.UpdateSourceFile(
		transformed,
		factory.NewNodeList(statements),
		transformed.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func (lowering *jsxLowering) visit(node *ast.Node) *ast.Node {
	if node == nil {
		return nil
	}
	if ast.IsImportDeclaration(node) {
		if _, exists := lowering.enhancementImports.declarations[node.Pos()]; exists {
			return lowering.factory.NewEmptyStatement()
		}
	}
	if captured := lowering.lowerReactiveCapture(node); captured != nil {
		return captured
	}
	if compiled := lowering.lowerComponentRegistryCreation(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerComponentLogCall(node); compiled != nil {
		return compiled
	}
	if ast.IsCallExpression(node) && isComponentMapCall(node) {
		return lowering.lowerComponentMapCall(node)
	}
	if task, exists := lowering.tasks[nodeSpanKey(node)]; exists &&
		task.SyntheticSetup && ast.IsExpressionStatement(node) {
		return lowering.lowerSetupResourceTask(node, task)
	}
	if ast.IsCallExpression(node) {
		if lowered := lowering.lowerTimeClockRead(node); lowered != nil {
			return lowered
		}
		if mapped := lowering.lowerAnnotatedMap(node); mapped != nil {
			return mapped
		}
	}
	if ast.IsNewExpression(node) {
		if lowered := lowering.lowerTimeNewDate(node); lowered != nil {
			return lowered
		}
	}
	if task, exists := lowering.tasks[nodeSpanKey(node)]; exists &&
		ast.IsCallExpression(node) {
		if task.Invoked {
			return lowering.visitor.VisitEachChild(node)
		}
		return lowering.lowerTask(node, task)
	}
	if ast.IsFunctionDeclaration(node) {
		if task, exists := lowering.invokedTasks[node.Pos()]; exists {
			operation, hasOperation := lowering.operations[nodeSpanKey(node)]
			if hasOperation {
				return lowering.lowerInvokedTaskDeclaration(
					node.AsFunctionDeclaration(),
					task,
					&operation,
				)
			}
			return lowering.lowerInvokedTaskDeclaration(node.AsFunctionDeclaration(), task, nil)
		}
		if _, exists := lowering.functionTasks[node.Pos()]; exists {
			return nil
		}
	}
	if ast.IsVariableStatement(node) {
		declarations := node.AsVariableStatement().
			DeclarationList.
			AsVariableDeclarationList().
			Declarations.Nodes
		setupTasks := len(declarations) != 0
		for _, declarationNode := range declarations {
			declaration := declarationNode.AsVariableDeclaration()
			if declaration.Initializer == nil {
				setupTasks = false
				break
			}
			if _, invoked := lowering.invokedTasks[declaration.Initializer.Pos()]; invoked {
				setupTasks = false
				break
			}
			if _, setup := lowering.functionTasks[declaration.Initializer.Pos()]; !setup {
				setupTasks = false
				break
			}
		}
		if setupTasks {
			return nil
		}
		if transformed := lowering.omitElidedDerivedDeclarations(node); transformed != nil {
			return transformed
		}
	}
	if lowering.target == TargetServer && ast.IsFunctionDeclaration(node) {
		name := node.Name()
		if name != nil {
			if component, exists := lowering.components[name.Text()]; exists &&
				component.Placement == "client" {
				return lowering.clientComponentFunctionStub(
					node.AsFunctionDeclaration(),
					component,
				)
			}
		}
	}
	if lowering.target == TargetClient && ast.IsFunctionDeclaration(node) {
		name := node.Name()
		if name != nil {
			if component, exists := lowering.components[name.Text()]; exists &&
				componentOmittedFromClient(component, lowering.serverComponents) {
				lowering.recordClientIslandDefinitions(component)
				return lowering.clientComponentFunctionStub(
					node.AsFunctionDeclaration(),
					component,
				)
			}
			if component, exists := lowering.components[name.Text()]; exists &&
				component.Placement == "server" {
				if lowering.serverComponents && !component.Exported {
					return lowering.factory.NewEmptyStatement()
				}
				return lowering.clientComponentFunctionStub(
					node.AsFunctionDeclaration(),
					component,
				)
			}
		}
	}
	if lowering.target == TargetClient && ast.IsVariableStatement(node) {
		if transformed := lowering.omitServerComponentValues(node); transformed != nil {
			return transformed
		}
	}
	if ast.IsFunctionDeclaration(node) {
		name := node.Name()
		if name != nil && lowering.elidesComponentAwait(name.Text()) {
			visited := lowering.visitor.VisitEachChild(node).AsFunctionDeclaration()
			modifiers := []*ast.Node{}
			if list := visited.Modifiers(); list != nil {
				for _, modifier := range list.Nodes {
					if modifier.Kind != ast.KindAsyncKeyword {
						modifiers = append(modifiers, modifier)
					}
				}
			}
			var nextModifiers *ast.ModifierList
			if len(modifiers) != 0 {
				nextModifiers = lowering.factory.NewModifierList(modifiers)
			}
			return lowering.factory.UpdateFunctionDeclaration(
				visited,
				nextModifiers,
				visited.AsteriskToken,
				visited.Name(),
				visited.TypeParameters,
				visited.Parameters,
				visited.Type,
				visited.FullSignature,
				visited.Body,
			)
		}
	}
	if ast.IsVariableDeclaration(node) {
		declaration := node.AsVariableDeclaration()
		name := declaration.Name()
		if declaration.Initializer != nil {
			if task, exists := lowering.invokedTasks[declaration.Initializer.Pos()]; exists {
				operation, hasOperation := lowering.operations[nodeSpanKey(declaration.Initializer)]
				if hasOperation {
					return lowering.lowerInvokedTaskValue(declaration, task, &operation)
				}
				return lowering.lowerInvokedTaskValue(declaration, task, nil)
			}
			if _, exists := lowering.functionTasks[declaration.Initializer.Pos()]; exists {
				return nil
			}
		}
		if lowering.target == TargetServer && name != nil &&
			ast.IsIdentifier(name) && declaration.Initializer != nil {
			if component, exists := lowering.components[name.Text()]; exists &&
				component.Placement == "client" &&
				(ast.IsArrowFunction(declaration.Initializer) ||
					ast.IsFunctionExpression(declaration.Initializer)) {
				return lowering.factory.UpdateVariableDeclaration(
					declaration,
					name,
					declaration.ExclamationToken,
					declaration.Type,
					lowering.clientComponentValueStub(component),
				)
			}
		}
		if transformed := lowering.lowerDerivedDeclaration(node); transformed != nil {
			return transformed
		}
	}
	if ast.IsIdentifier(node) && node.Parent != nil &&
		!ast.IsDeclarationName(node) &&
		!isStaticPropertyName(node) {
		if transformed := lowering.lowerTimeDerivedReference(node); transformed != nil {
			return transformed
		}
		if transformed := lowering.clientIslandCaptureReference(node); transformed != nil {
			return transformed
		}
		if transformed := lowering.lowerDerivedReference(node); transformed != nil {
			return transformed
		}
	}
	if write, exists := lowering.writes[nodeSpanKey(node)]; exists {
		if transformed := lowering.lowerStateWrite(node, write); transformed != nil {
			return transformed
		}
	}
	switch {
	case ast.IsJsxElement(node):
		element := node.AsJsxElement()
		return lowering.lowerOpeningLike(
			node,
			element.OpeningElement,
			element.Children,
		)
	case ast.IsJsxSelfClosingElement(node):
		return lowering.lowerOpeningLike(node, node, nil)
	case ast.IsJsxFragment(node):
		return lowering.lowerFragment(node.AsJsxFragment())
	default:
		return lowering.visitor.VisitEachChild(node)
	}
}
