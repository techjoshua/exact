package exactcompiler

import (
	"sort"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

type jsxLowering struct {
	phase                        jsxLoweringPhase
	sourceFile                   *ast.SourceFile
	factory                      *printer.NodeFactory
	emitContext                  *printer.EmitContext
	visitor                      *ast.NodeVisitor
	names                        jsxRuntimeNames
	nodeIDs                      map[*ast.Node]string
	writes                       map[string]StateWrite
	stateReadSlots               map[string]indexedStateRead
	propsReadSlots               map[string]indexedPropsRead
	stateWriteSlots              map[string]int
	indexedStateReads            map[*ast.Node]indexedStateRead
	indexedPropsReads            map[*ast.Node]indexedPropsRead
	tasks                        map[string]Task
	invokedTasks                 map[int]Task
	functionTasks                map[int]Task
	taskDefinitions              map[ast.SymbolId]Task
	taskDefinitionNames          map[string]Task
	operations                   map[string]InvokedTaskOperation
	stateReads                   []StateRead
	bindings                     []ReactiveBinding
	reactiveCaptureSpans         []SourceSpan
	formBindings                 map[int]formBinding
	componentBindings            map[int]componentBinding
	checker                      *checker.Checker
	taskHelpers                  map[string]string
	derived                      map[int]ReactiveBinding
	elidedDerived                map[int]ReactiveBinding
	target                       Target
	contractProjection           ComponentContractProjection
	serverComponents             bool
	instrumentInspection         bool
	components                   map[string]Component
	componentTagSymbols          map[ast.SymbolId]bool
	resolvedComponentTagSymbols  map[ast.SymbolId]struct{}
	componentDeclarationSpans    map[*ast.SourceFile][]SourceSpan
	publishedComponentImports    map[string]bool
	microComponents              map[ast.SymbolId]struct{}
	renderEdges                  map[string]RenderEdge
	clientIslands                map[*ast.Node]clientElementIsland
	clientDefinitions            []*ast.Node
	recordedClientIslands        map[string]struct{}
	serverTaskSlices             map[string]string
	captureValues                map[ast.SymbolId]string
	clientIslandPropsSlots       map[string]int
	interop                      *JSXInterop
	materializedNames            map[int]string
	cachedDerivedNames           map[int]string
	contextWrites                map[string][]string
	continuationComponents       map[string]struct{}
	collectionMaps               map[string]collectionMapPlan
	enhancementImports           enhancementImports
	partitionPlan                PartitionPlan
	dynamicComponents            map[int]dynamicComponentUseKind
	componentLocalization        bool
	externalImports              externalImportBindings
	closedServerWriters          map[string]struct{}
	redirectedRootImports        map[string]struct{}
	listCapabilityUsed           bool
	renderProgramChildDepth      int
	renderProgramComponentDepth  int
	renderProgramListDepth       int
	renderProgramFallback        bool
	serverClientFallbackDepth    int
	renderProgramContexts        map[int]renderProgramContext
	renderProgramDefinitions     map[int]string
	renderProgramDefinitionNodes []namedRenderProgramDefinition
	componentUpdates             map[string]*componentUpdateBuild
	componentInputUpdates        map[string]*componentInputUpdateBuild
	componentInputTaskIDs        map[string]struct{}
	declarativeRenderDepth       int
	componentRangeOutputs        map[string]struct{}
	componentRangeReaders        map[string]struct{}
	timeActivation               string
	timeActivationAdopted        bool
	timePlanNode                 *ast.Node
	timePlanInputs               []*ast.Node
	timePlanInputIndexes         map[*ast.Node]int
	timeAdoptedRanges            []timeAdoptedRange
	timeAdoptedSelection         *timeAdoptedRange
	structure                    ArtifactStructure
	genericPropertyGroups        map[string]struct{}
	parentChildRouting           map[string]struct{}
	declinedNativeJSXReasons     map[string]int
	genericNativeBindingReasons  map[string]int
}

type jsxLoweringPhase uint8

const (
	jsxLoweringPrepared jsxLoweringPhase = iota
	jsxLoweringVisited
	jsxLoweringProjected
	jsxLoweringDefinitionsReady
	jsxLoweringAssembled
)

// omitsComponentFromClient distinguishes a complete client-rendering artifact from the
// same-build hydration projection. A mixed component can require client code solely for finite
// interactive ranges; hydration retains those ranges but must not rerun server-owned setup.
func (lowering *jsxLowering) omitsComponentFromClient(component Component) bool {
	if componentOmittedFromClient(component, lowering.serverComponents) {
		return true
	}
	return lowering.serverComponents &&
		lowering.contractProjection == ComponentContractProjectionHydrate &&
		component.ClientIslandCount != 0 &&
		component.EnvironmentEffect == "server"
}

type namedRenderProgramDefinition struct {
	name string
	node *ast.Node
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
	emitContext *printer.EmitContext,
	plan jsxLoweringPlan,
) (*ast.SourceFile, map[string]string, map[string]string, map[string]struct{}, map[string]struct{}, ArtifactStructure, map[string]struct{}) {
	lowering, required := plan.prepare(sourceFile, emitContext)
	if !required {
		return sourceFile, nil, nil, nil, nil, ArtifactStructure{}, nil
	}
	transformed := lowering.lowerAuthoredTree(sourceFile)
	transformed = lowering.projectTargetTree(transformed)
	transformed, componentUpdateNames, componentInputUpdateNames, sourceStatementCount := lowering.prepareDefinitions(transformed)
	return lowering.assembleModule(transformed, sourceStatementCount), componentUpdateNames, componentInputUpdateNames, lowering.componentInputTaskIDs, lowering.componentRangeOutputs, lowering.artifactStructure(), lowering.componentListOwners()
}

// componentListOwners returns target-local constructor facts discovered only after typed JSX
// collection planning. Contract emission consumes these names instead of rescanning transformed
// helper calls or losing primitive and annotated key inference.
func (lowering *jsxLowering) componentListOwners() map[string]struct{} {
	owners := make(map[string]struct{})
	for name, component := range lowering.components {
		if component.Lists {
			owners[name] = struct{}{}
		}
	}
	return owners
}

func (lowering *jsxLowering) artifactStructure() ArtifactStructure {
	result := lowering.structure
	result.FallbackBearingArtifacts = 0
	result.GenericNativeBindingGroups = len(lowering.genericPropertyGroups)
	result.ParentOwnedChildDirtyRouting = len(lowering.parentChildRouting)
	if len(lowering.declinedNativeJSXReasons) != 0 {
		result.DeclinedNativeJSXReasons = make(map[string]int, len(lowering.declinedNativeJSXReasons))
		for reason, count := range lowering.declinedNativeJSXReasons {
			result.DeclinedNativeJSXReasons[reason] = count
		}
	}
	if len(lowering.genericNativeBindingReasons) != 0 {
		result.GenericNativeBindingReasons = make(map[string]int, len(lowering.genericNativeBindingReasons))
		for reason, count := range lowering.genericNativeBindingReasons {
			result.GenericNativeBindingReasons[reason] = count
		}
	}
	return result
}

func (lowering *jsxLowering) lowerAuthoredTree(sourceFile *ast.SourceFile) *ast.SourceFile {
	lowering.advancePhase(jsxLoweringPrepared, jsxLoweringVisited)
	lowering.visitor = ast.NewNodeVisitor(
		lowering.visit,
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	transformed := lowering.visitor.VisitEachChild(sourceFile.AsNode()).AsSourceFile()
	transformed = lowering.lowerCompilerClosedSsrCalls(transformed)
	transformed = lowering.lowerCompiledClientRootCalls(transformed)
	return lowering.pruneRedirectedRootImports(transformed)
}

func (lowering *jsxLowering) projectTargetTree(transformed *ast.SourceFile) *ast.SourceFile {
	lowering.advancePhase(jsxLoweringVisited, jsxLoweringProjected)
	if lowering.target == TargetClient &&
		lowering.contractProjection == ComponentContractProjectionHydrate {
		components := make([]Component, 0, len(lowering.components))
		for _, component := range lowering.components {
			components = append(components, component)
		}
		sort.Slice(components, func(left int, right int) bool {
			return components[left].Start < components[right].Start
		})
		for _, component := range components {
			if component.Placement != "client" && component.ClientIslandCount != 0 {
				lowering.recordClientIslandDefinitions(component)
			}
		}
	}
	transformed = lowering.omitUnreachableServerComponentLocals(transformed.AsNode()).AsSourceFile()
	return lowering.omitFullyMaterializedRenderLocals(transformed.AsNode()).AsSourceFile()
}

func (lowering *jsxLowering) prepareDefinitions(
	transformed *ast.SourceFile,
) (*ast.SourceFile, map[string]string, map[string]string, int) {
	lowering.advancePhase(jsxLoweringProjected, jsxLoweringDefinitionsReady)
	for _, definition := range lowering.renderProgramDefinitionNodes {
		if containsIdentifier(transformed.AsNode(), definition.name) {
			lowering.clientDefinitions = append(lowering.clientDefinitions, definition.node)
		}
	}
	componentUpdateNames := lowering.emitComponentUpdateDefinitions()
	componentInputUpdateNames := lowering.emitComponentInputUpdateDefinitions()
	sourceStatementCount := len(transformed.Statements.Nodes)
	if len(lowering.clientDefinitions) != 0 {
		statements := append(
			[]*ast.Node(nil),
			transformed.Statements.Nodes...,
		)
		statements = append(statements, lowering.clientDefinitions...)
		transformed = lowering.factory.UpdateSourceFile(
			transformed,
			lowering.factory.NewNodeList(statements),
			transformed.EndOfFileToken,
		).AsSourceFile()
		ast.SetParentInChildren(transformed.AsNode())
	}
	return transformed, componentUpdateNames, componentInputUpdateNames, sourceStatementCount
}

func (lowering *jsxLowering) assembleModule(
	transformed *ast.SourceFile,
	sourceStatementCount int,
) *ast.SourceFile {
	lowering.advancePhase(jsxLoweringDefinitionsReady, jsxLoweringAssembled)
	runtimeImports := lowering.runtimeImports(transformed.AsNode())
	interopImport := lowering.interopImport(transformed.AsNode())
	statements := make([]*ast.Node, 0, len(transformed.Statements.Nodes)+len(runtimeImports)+1)
	insertion := 0
	for insertion < sourceStatementCount &&
		isDirectiveStatement(transformed.Statements.Nodes[insertion]) {
		statements = append(statements, transformed.Statements.Nodes[insertion])
		insertion++
	}
	statements = append(statements, runtimeImports...)
	if interopImport != nil {
		statements = append(statements, interopImport)
	}
	definitionInsertion := insertion
	for definitionInsertion < sourceStatementCount {
		statement := transformed.Statements.Nodes[definitionInsertion]
		if !ast.IsImportDeclaration(statement) && !isDirectiveStatement(statement) {
			break
		}
		definitionInsertion++
	}
	statements = append(statements, transformed.Statements.Nodes[insertion:definitionInsertion]...)
	// Generated render and update programs must be initialized before authored module work can
	// synchronously mount a component. Appending them after a top-level render() call leaves their
	// const bindings in the temporal dead zone during the component's first render.
	statements = append(statements, transformed.Statements.Nodes[sourceStatementCount:]...)
	statements = append(statements, transformed.Statements.Nodes[definitionInsertion:sourceStatementCount]...)
	result := lowering.factory.UpdateSourceFile(
		transformed,
		lowering.factory.NewNodeList(statements),
		transformed.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func (lowering *jsxLowering) advancePhase(expected jsxLoweringPhase, next jsxLoweringPhase) {
	if lowering.phase != expected {
		panic("invalid JSX lowering phase order")
	}
	lowering.phase = next
}

func (lowering *jsxLowering) visit(node *ast.Node) *ast.Node {
	if node == nil {
		return nil
	}
	if direct := lowering.lowerDirectServerExecutorReturn(node); direct != nil {
		return direct
	}
	if ast.IsImportDeclaration(node) {
		if _, exists := lowering.enhancementImports.declarations[node.Pos()]; exists {
			return lowering.factory.NewEmptyStatement()
		}
	}
	if _, focusedRange := lowering.componentRangeReaders[nodeSpanKey(node)]; focusedRange {
		delete(lowering.componentRangeReaders, nodeSpanKey(node))
		return lowering.call(lowering.names.dynamic, []*ast.Node{
			lowering.arrow(lowering.visit(node)),
		})
	}
	if lowering.target == TargetClient {
		if read := lowering.lowerIndexedStateRead(node); read != nil {
			return read
		}
		if read := lowering.lowerIndexedPropsRead(node); read != nil {
			return read
		}
	}
	if direct := lowering.lowerDirectServerReactive(node); direct != nil {
		return direct
	}
	if captured := lowering.lowerReactiveCapture(node); captured != nil {
		return captured
	}
	if compiled := lowering.lowerComponentRegistryCreation(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerDirectServerRefCall(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerComponentLogCall(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerComponentIntlAccess(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerComponentLifecycleCall(node); compiled != nil {
		return compiled
	}
	if compiled := lowering.lowerDirectServerSurfaceAccess(node); compiled != nil {
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
		if task, exists := lowering.functionTasks[node.Pos()]; exists {
			if lowering.target == TargetServer && task.Placement == "client" {
				return lowering.lowerInvokedTaskDeclaration(node.AsFunctionDeclaration(), task, nil)
			}
			return nil
		}
	}
	if ast.IsVariableStatement(node) {
		declarations := node.AsVariableStatement().
			DeclarationList.
			AsVariableDeclarationList().
			Declarations.Nodes
		setupTasks := len(declarations) != 0
		retainClientPlaceholder := false
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
			task, setup := lowering.functionTasks[declaration.Initializer.Pos()]
			if !setup {
				setupTasks = false
				break
			}
			if lowering.target == TargetServer && task.Placement == "client" {
				retainClientPlaceholder = true
			}
		}
		if setupTasks {
			if !retainClientPlaceholder {
				return nil
			}
			return lowering.visitor.VisitEachChild(node)
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
				lowering.omitsComponentFromClient(component) {
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
			updated := lowering.factory.UpdateFunctionDeclaration(
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
			if lowering.target != TargetServer && node.Parent != nil && ast.IsSourceFile(node.Parent) {
				return lowering.withCompiledComponentThisParameter(updated.AsFunctionDeclaration())
			}
			return updated
		}
	}
	if lowering.target != TargetServer && ast.IsFunctionDeclaration(node) &&
		node.Parent != nil && ast.IsSourceFile(node.Parent) {
		name := node.Name()
		if name != nil {
			if _, exists := lowering.components[name.Text()]; exists {
				visited := lowering.visitor.VisitEachChild(node).AsFunctionDeclaration()
				return lowering.withCompiledComponentThisParameter(visited)
			}
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
			if task, exists := lowering.functionTasks[declaration.Initializer.Pos()]; exists {
				if lowering.target == TargetServer && task.Placement == "client" {
					return lowering.factory.UpdateVariableDeclaration(
						declaration,
						name,
						declaration.ExclamationToken,
						declaration.Type,
						lowering.inertClientTaskCallable(),
					)
				}
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
		if lowering.target != TargetServer && name != nil && ast.IsIdentifier(name) &&
			declaration.Initializer != nil && componentVariableIsModuleLevel(node) {
			if component, exists := lowering.components[name.Text()]; exists &&
				component.Start == declaration.Initializer.Pos() &&
				(ast.IsArrowFunction(declaration.Initializer) ||
					ast.IsFunctionExpression(declaration.Initializer)) {
				visited := lowering.visitor.VisitEachChild(node).AsVariableDeclaration()
				return lowering.withCompiledComponentValueThisParameter(visited)
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
		if lowering.directServerArtifactComponent(node) {
			if ast.IsBinaryExpression(node) {
				expression := node.AsBinaryExpression()
				if expression.OperatorToken.Kind == ast.KindEqualsToken {
					if taskNode, task, exists := lowering.assignedTask(expression.Right); exists {
						return lowering.lowerTask(taskNode, task)
					}
				}
			}
			// Compiler-closed server artifacts own plain request-local state. Preserve the
			// authored JavaScript operation instead of routing it through reactive writes.
			return lowering.visitor.VisitEachChild(node)
		}
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

func componentVariableIsModuleLevel(declaration *ast.Node) bool {
	list := declaration.Parent
	if list == nil || list.Parent == nil || !ast.IsVariableStatement(list.Parent) {
		return false
	}
	return list.Parent.Parent != nil && ast.IsSourceFile(list.Parent.Parent)
}

func (lowering *jsxLowering) withCompiledComponentValueThisParameter(
	declaration *ast.VariableDeclaration,
) *ast.Node {
	initializer := declaration.Initializer
	var implementation *ast.Node
	if ast.IsArrowFunction(initializer) {
		arrow := initializer.AsArrowFunction()
		body := arrow.Body
		if !ast.IsBlock(body) {
			body = lowering.factory.NewBlock(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewReturnStatement(body),
				}),
				true,
			)
		}
		implementation = lowering.factory.NewFunctionExpression(
			arrow.Modifiers(),
			nil,
			nil,
			arrow.TypeParameters,
			lowering.compiledComponentParameters(arrow.Parameters),
			arrow.Type,
			arrow.FullSignature,
			body,
		)
	} else {
		function := initializer.AsFunctionExpression()
		implementation = lowering.factory.UpdateFunctionExpression(
			function,
			function.Modifiers(),
			function.AsteriskToken,
			function.Name(),
			function.TypeParameters,
			lowering.compiledComponentParameters(function.Parameters),
			function.Type,
			function.FullSignature,
			function.Body,
		)
	}
	return lowering.factory.UpdateVariableDeclaration(
		declaration,
		declaration.Name(),
		declaration.ExclamationToken,
		declaration.Type,
		implementation,
	)
}

// withCompiledComponentThisParameter gives generated owner references a concrete type even when a
// stateless authored component did not need to declare `this`. The parameter is erased from
// JavaScript and makes the compiler-owned instance requirement explicit in generated TypeScript.
func (lowering *jsxLowering) withCompiledComponentThisParameter(
	declaration *ast.FunctionDeclaration,
) *ast.Node {
	parameters := lowering.compiledComponentParameters(declaration.Parameters)
	if parameters == declaration.Parameters {
		return declaration.AsNode()
	}
	return lowering.factory.UpdateFunctionDeclaration(
		declaration,
		declaration.Modifiers(),
		declaration.AsteriskToken,
		declaration.Name(),
		declaration.TypeParameters,
		parameters,
		declaration.Type,
		declaration.FullSignature,
		declaration.Body,
	)
}

func (lowering *jsxLowering) compiledComponentParameters(parameters *ast.NodeList) *ast.NodeList {
	nodes := parameters.Nodes
	if len(nodes) != 0 {
		name := nodes[0].Name()
		if name != nil && ast.IsIdentifier(name) && name.Text() == "this" {
			return parameters
		}
	}
	thisParameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		lowering.factory.NewIdentifier("this"),
		nil,
		lowering.factory.NewKeywordTypeNode(ast.KindObjectKeyword),
		nil,
	)
	next := make([]*ast.Node, 0, len(nodes)+1)
	next = append(next, thisParameter)
	next = append(next, nodes...)
	return lowering.factory.NewNodeList(next)
}
