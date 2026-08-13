package exactcompiler

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"html"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
	"github.com/microsoft/typescript-go/internal/printer"
	"github.com/microsoft/typescript-go/internal/scanner"
)

type jsxRuntimeNames struct {
	element                string
	componentElement       string
	renderProgram          string
	fragment               string
	target                 string
	expression             string
	forwardedExpression    string
	componentOutput        string
	dynamic                string
	dynamicComponent       string
	serverDynamicComponent string
	dynamicComponentValue  string
	boundary               string
	finiteBoundary         string
	asyncSiblings          string
	serverSlot             string
	keyedServerSlot        string
	clientProps            string
	derived                string
	write                  string
	update                 string
	updateResult           string
	abortOptions           string
	taskSignal             string
	taskTimeout            string
	taskInterval           string
	taskAnimation          string
	taskIdle               string
	taskObserver           string
	taskFetch              string
	taskResource           string
	taskAwait              string
	taskMutation           string
	stageTaskMutation      string
	taskCollectionMutation string
	taskContinuation       string
	dispatchContinuation   string
	registerContexts       string
	inspectionSource       string
	defineTask             string
	bindTask               string
	invokeTask             string
	activateTask           string
	taskOptions            string
	taskCombined           string
	delete                 string
	arrayMutation          string
	collectionMutation     string
	componentRegistry      string
	enhancements           string
	omitEnhancementProps   string
	componentLog           string
	interop                string
}

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
	renderProgramFallback  bool
	renderProgramContexts  map[int]renderProgramContext
	declarativeRenderDepth int
}

type renderProgramContext struct {
	namespace string
	certain   bool
}

type renderProgramSlot struct {
	id     string
	kind   string
	path   []int
	name   string
	reader *ast.Node
}

type renderProgramNode struct {
	id        string
	path      []int
	tag       string
	namespace string
}

type renderProgramSsrOperation struct {
	kind  string
	index int
}

type renderProgramBuild struct {
	template      strings.Builder
	part          strings.Builder
	parts         []string
	ssrPart       strings.Builder
	ssrParts      []string
	ssrOperations []renderProgramSsrOperation
	slots         []renderProgramSlot
	nodes         []renderProgramNode
	namespace     string
}

func (build *renderProgramBuild) write(value string) {
	build.template.WriteString(value)
	build.part.WriteString(value)
	build.ssrPart.WriteString(value)
}

func (build *renderProgramBuild) ssrOperation(kind string, index int) {
	build.ssrParts = append(build.ssrParts, build.ssrPart.String())
	build.ssrPart.Reset()
	build.ssrOperations = append(build.ssrOperations, renderProgramSsrOperation{kind: kind, index: index})
}

func (build *renderProgramBuild) textSlot(id string, path []int, reader *ast.Node) {
	index := len(build.slots)
	build.template.WriteString(fmt.Sprintf("\ue000exact:%d\ue001", index))
	build.parts = append(build.parts, build.part.String())
	build.part.Reset()
	build.ssrOperation("slot", index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "text", path: append([]int(nil), path...), reader: reader})
}

func (build *renderProgramBuild) propertySlot(id string, path []int, name string, reader *ast.Node) {
	index := len(build.slots)
	build.parts = append(build.parts, build.part.String())
	build.part.Reset()
	build.ssrOperation("slot", index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: renderProgramSlotKind(name), path: append([]int(nil), path...), name: name, reader: reader})
}

type collectionMapPlan struct {
	member      string
	primitive   bool
	keyed       bool
	declarative bool
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

// omitFullyMaterializedRenderLocals removes safe view-local declarations after every authored
// reference has been moved into a precise reactive closure. The first lowering pass must finish
// before this decision because declarations precede the JSX consumers that materialize them.
func (lowering *jsxLowering) omitFullyMaterializedRenderLocals(root *ast.Node) *ast.Node {
	if lowering.checker == nil || len(lowering.materializedNames) == 0 {
		return root
	}
	candidates := make(map[ast.SymbolId]int)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		name := node.AsVariableDeclaration().Name()
		if name == nil || !ast.IsIdentifier(name) ||
			lowering.materializedNames[name.Pos()] == "" {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(name); symbol != nil {
			candidates[ast.GetSymbolId(symbol)] = name.Pos()
		}
		return true
	})
	if len(candidates) == 0 {
		return root
	}
	remaining := make(map[ast.SymbolId]struct{})
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || node.Parent == nil ||
			ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
			id := ast.GetSymbolId(symbol)
			if _, candidate := candidates[id]; candidate {
				remaining[id] = struct{}{}
			}
		}
		return true
	})
	removable := make(map[int]struct{})
	for symbol, start := range candidates {
		if _, retained := remaining[symbol]; !retained {
			removable[start] = struct{}{}
		}
	}
	if len(removable) == 0 {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if !ast.IsVariableStatement(node) {
				return visitor.VisitEachChild(node)
			}
			statement := node.AsVariableStatement()
			list := statement.DeclarationList.AsVariableDeclarationList()
			declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
			for _, declaration := range list.Declarations.Nodes {
				name := declaration.AsVariableDeclaration().Name()
				if name != nil && ast.IsIdentifier(name) {
					if _, remove := removable[name.Pos()]; remove {
						continue
					}
				}
				declarations = append(declarations, visitor.VisitEachChild(declaration))
			}
			if len(declarations) == len(list.Declarations.Nodes) {
				return visitor.VisitEachChild(node)
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
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	return visitor.VisitNode(root)
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
		if mapped := lowering.lowerAnnotatedMap(node); mapped != nil {
			return mapped
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

func (lowering *jsxLowering) lowerReactiveCapture(node *ast.Node) *ast.Node {
	var callee *ast.Node
	var value *ast.Node
	var typeArguments *ast.NodeList
	var flags ast.NodeFlags
	switch {
	case ast.IsCallExpression(node):
		call := node.AsCallExpression()
		if !componentReactiveMember(call.Expression) ||
			call.Arguments == nil ||
			len(call.Arguments.Nodes) != 1 {
			return nil
		}
		value = call.Arguments.Nodes[0]
		if ast.IsArrowFunction(value) || ast.IsFunctionExpression(value) {
			return nil
		}
		callee = call.Expression
		typeArguments = call.TypeArguments
		flags = call.Flags
	case ast.IsTaggedTemplateExpression(node):
		tagged := node.AsTaggedTemplateExpression()
		if !componentReactiveMember(tagged.Tag) {
			return nil
		}
		callee = tagged.Tag
		value = tagged.Template
		typeArguments = tagged.TypeArguments
		flags = tagged.Flags
	default:
		return nil
	}
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(callee),
		nil,
		typeArguments,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.arrow(lowering.visitor.VisitNode(value)),
		}),
		flags,
	)
}

func componentReactiveMember(expression *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	return member.Expression.Kind == ast.KindThisKeyword &&
		member.Name() != nil &&
		member.Name().Text() == "reactive"
}

// lowerSetupResourceTask gives a resource-producing setup statement the same
// abort-scoped lifetime as an authored client task without changing ordinary
// setup statement ordering. The synthetic marker is temporarily removed while
// its body is visited so the retained authored statement cannot recursively
// synthesize itself.
func (lowering *jsxLowering) lowerSetupResourceTask(
	statement *ast.Node,
	task Task,
) *ast.Node {
	if lowering.target == TargetServer {
		return lowering.factory.NewExpressionStatement(
			lowering.factory.NewVoidExpression(
				lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
			),
		)
	}
	key := nodeSpanKey(statement)
	delete(lowering.tasks, key)
	defer func() {
		lowering.tasks[key] = task
	}()
	work := lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList([]*ast.Node{statement}),
			true,
		),
	)
	work = lowering.manageTaskWork(
		work,
		task,
		0,
		lowering.taskWorkCallsDefinition(work),
	)
	callee := lowering.factory.NewPropertyAccessExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewThisExpression(),
			nil,
			lowering.factory.NewIdentifier("task"),
			ast.NodeFlagsNone,
		),
		nil,
		lowering.factory.NewIdentifier("client"),
		ast.NodeFlagsNone,
	)
	return lowering.factory.NewExpressionStatement(
		lowering.factory.NewCallExpression(
			callee,
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{work}),
			ast.NodeFlagsNone,
		),
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

// omitElidedDerivedDeclarations removes setup bindings whose safe scalar
// calculation is materialized directly inside its sole reactive view
// consumer. Retained declarations still pass through the normal visitor so a
// mixed declaration statement preserves every unrelated lowering.
func (lowering *jsxLowering) omitElidedDerivedDeclarations(
	node *ast.Node,
) *ast.Node {
	statement := node.AsVariableStatement()
	list := statement.DeclarationList.AsVariableDeclarationList()
	declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
	changed := false
	for _, candidate := range list.Declarations.Nodes {
		name := candidate.AsVariableDeclaration().Name()
		if name != nil && ast.IsIdentifier(name) {
			if _, elided := lowering.elidedDerived[name.Pos()]; elided {
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

func (lowering *jsxLowering) lowerOpeningLike(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	if tagText == "_" {
		return lowering.call(
			lowering.names.fragment,
			append(
				[]*ast.Node{
					lowering.props(opening.Attributes(), "", false, ""),
				},
				lowering.children(children)...,
			),
		)
	}
	if tagText == "_target" {
		return lowering.call(
			lowering.names.target,
			append(
				[]*ast.Node{lowering.props(opening.Attributes(), "", false, "")},
				lowering.children(children)...,
			),
		)
	}
	if kind, exists := lowering.dynamicComponents[tag.Pos()]; exists {
		return lowering.lowerDynamicComponent(identityNode, tag, opening, children, kind)
	}
	if lowering.microComponentTag(tag) {
		return lowering.lowerMicroComponent(tag, opening, children)
	}
	intrinsic := jsxIntrinsic(tagText)
	partitionEdge, partitionedServerComponent := lowering.serverPartitionRangeEdge(identityNode.Pos())
	if !intrinsic && partitionedServerComponent && lowering.target == TargetClient &&
		lowering.serverComponents {
		return lowering.clientPartitionSlot(opening, partitionEdge)
	}
	if intrinsic && lowering.target == TargetServer &&
		lowering.serverComponents {
		if island, exists := lowering.clientIslands[identityNode]; exists {
			return lowering.lowerServerClientIsland(
				identityNode,
				opening,
				children,
				island,
			)
		}
	}
	if !intrinsic && lowering.target == TargetServer {
		if edge, exists := lowering.renderEdges[fmt.Sprintf("%d:%s", identityNode.Pos(), tagText)]; exists && edge.Placement == "client" {
			return lowering.clientComponentBoundary(
				opening,
				children,
				edge,
			)
		}
	}
	if intrinsic && !lowering.renderProgramFallback {
		if planned := lowering.lowerRenderProgram(identityNode, opening, children); planned != nil {
			return planned
		}
	}
	var emittedTag *ast.Node
	if intrinsic {
		emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
	} else {
		emittedTag = lowering.visitor.VisitNode(tag)
		if lowering.interop != nil &&
			!lowering.localExactComponentTag(tag) &&
			!lowering.exactCoreVNodeTag(tag) {
			emittedTag = lowering.call(lowering.names.interop, []*ast.Node{emittedTag})
		}
	}
	props := lowering.props(
		opening.Attributes(),
		lowering.elementID(identityNode),
		intrinsic,
		tagText,
	)
	arguments := []*ast.Node{
		emittedTag,
		props,
	}
	arguments = append(arguments, lowering.children(children)...)
	elementHelper := lowering.names.element
	if !intrinsic && lowering.localExactComponentTag(tag) {
		elementHelper = lowering.names.componentElement
	}
	element := lowering.call(elementHelper, arguments)
	if intrinsic && lowering.independentAsyncSiblings(children) {
		element = lowering.call(lowering.names.asyncSiblings, []*ast.Node{element})
	}
	if !intrinsic && partitionedServerComponent && lowering.target == TargetServer {
		element = lowering.serverPartitionSlot(opening, partitionEdge, element)
	}
	if !intrinsic && ast.IsIdentifier(tag) {
		if _, derived := lowering.derivedBindingAtReference(tag); derived {
			return lowering.call(
				lowering.names.dynamic,
				[]*ast.Node{lowering.arrow(element)},
			)
		}
	}
	return element
}

func (lowering *jsxLowering) lowerDynamicComponent(
	identityNode *ast.Node,
	tag *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	kind dynamicComponentUseKind,
) *ast.Node {
	id := lowering.factory.NewStringLiteral(
		exactStableID(
			normalizedIdentityFilename(lowering.sourceFile.FileName()),
			"dynamic-component",
			lowering.nodeIDs[identityNode],
		),
		ast.TokenFlagsNone,
	)
	if lowering.target == TargetServer {
		return lowering.call(lowering.names.serverDynamicComponent, []*ast.Node{id})
	}
	props := lowering.props(opening.Attributes(), "", false, "")
	values := lowering.children(children)
	if len(values) != 0 {
		var childrenValue *ast.Node
		if len(values) == 1 {
			childrenValue = values[0]
		} else {
			childrenValue = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		props = lowering.appendObjectProperty(props, "children", childrenValue)
	}
	source := lowering.visitor.VisitNode(tag)
	if kind != dynamicComponentHelper {
		source = lowering.call(
			lowering.names.dynamicComponentValue,
			[]*ast.Node{lowering.arrow(source)},
		)
	}
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	options := lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("id", id),
			property("source", source),
			property("props", props),
		}),
		false,
	)
	return lowering.call(lowering.names.dynamicComponent, []*ast.Node{options})
}

func (lowering *jsxLowering) independentAsyncSiblings(children *ast.NodeList) bool {
	if children == nil || lowering.target == TargetClient {
		return false
	}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	if len(semantic) < 2 {
		return false
	}
	for _, child := range semantic {
		var tag *ast.Node
		switch {
		case ast.IsJsxElement(child):
			tag = child.AsJsxElement().OpeningElement.AsJsxOpeningElement().TagName
		case ast.IsJsxSelfClosingElement(child):
			tag = child.AsJsxSelfClosingElement().TagName
		default:
			return false
		}
		if !ast.IsIdentifier(tag) {
			return false
		}
		component, exists := lowering.components[tag.Text()]
		if !exists || component.Placement == "client" || component.EnvironmentEffect != "neutral" ||
			len(component.Contexts) != 0 || len(component.EnhancementContexts.Provides) != 0 ||
			len(component.EnhancementContexts.Requires) != 0 ||
			len(component.EnhancementContexts.OptionallyConsumes) != 0 || len(component.SplitBoundaries) != 0 {
			return false
		}
	}
	return true
}

// lowerRenderProgram emits the first deliberately conservative planned subset:
// intrinsic HTML trees with no authored attributes and with scalar expression
// children occupying their own text node. Unsupported regions remain generic.
func (lowering *jsxLowering) lowerRenderProgram(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	parentNamespace, certain := lowering.renderProgramParentNamespace(identityNode)
	if !certain {
		return nil
	}
	build := &renderProgramBuild{}
	if !lowering.appendRenderProgramElement(build, identityNode, opening, children, nil, parentNamespace) {
		return nil
	}
	build.parts = append(build.parts, build.part.String())
	build.ssrParts = append(build.ssrParts, build.ssrPart.String())
	programID := exactStableID(
		lowering.sourceFile.FileName(),
		"render-program",
		lowering.nodeIDs[identityNode],
	)
	programCacheKey := exactStableID(programID, sourceText(lowering.sourceFile, identityNode))
	program := lowering.renderProgramLiteral(programID, build)
	readers := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		readers[index] = lowering.reactiveClosure(slot.reader)
		if readers[index] == nil {
			readers[index] = lowering.arrow(slot.reader)
		}
	}
	lowering.renderProgramFallback = true
	fallback := lowering.lowerOpeningLike(identityNode, opening, children)
	lowering.renderProgramFallback = false
	return lowering.call(lowering.names.renderProgram, []*ast.Node{
		lowering.factory.NewStringLiteral(programCacheKey, ast.TokenFlagsNone),
		lowering.arrow(program),
		lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(readers), false),
		lowering.arrow(fallback),
	})
}

// renderProgramParentNamespace resolves the concrete DOM namespace inherited by
// a planned region from intrinsic JSX ancestors. A component ancestor makes the
// eventual insertion point component-defined, so that region stays on the
// generic renderer where namespace inheritance is resolved at mount time.
func (lowering *jsxLowering) renderProgramParentNamespace(node *ast.Node) (string, bool) {
	if lowering.renderProgramContexts == nil {
		lowering.renderProgramContexts = make(map[int]renderProgramContext)
		walkNode(lowering.sourceFile.AsNode(), func(candidate *ast.Node) bool {
			if ast.IsJsxElement(candidate) || ast.IsJsxSelfClosingElement(candidate) {
				namespace, certain := lowering.renderProgramSourceParentNamespace(candidate)
				lowering.renderProgramContexts[candidate.Pos()] = renderProgramContext{
					namespace: namespace,
					certain:   certain,
				}
			}
			return true
		})
	}
	if context, exists := lowering.renderProgramContexts[node.Pos()]; exists {
		return context.namespace, context.certain
	}
	return lowering.renderProgramSourceParentNamespace(node)
}

func (lowering *jsxLowering) renderProgramSourceParentNamespace(node *ast.Node) (string, bool) {
	tags := make([]string, 0, 2)
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsJsxElement(current) {
			continue
		}
		tag := sourceText(lowering.sourceFile, openingTag(current.AsJsxElement().OpeningElement))
		if tag == "_" {
			continue
		}
		if !jsxIntrinsic(tag) {
			return "", false
		}
		tags = append(tags, tag)
	}
	parentNamespace := "html"
	for index := len(tags) - 1; index >= 0; index-- {
		tag := tags[index]
		namespace := renderProgramNamespace(tag, parentNamespace)
		parentNamespace = renderProgramChildNamespace(tag, namespace)
	}
	return parentNamespace, true
}

func (lowering *jsxLowering) appendRenderProgramElement(
	build *renderProgramBuild,
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	path []int,
	parentNamespace string,
) bool {
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if !jsxIntrinsic(tag) || unsupportedPlannedHost(tag) {
		return false
	}
	namespace := renderProgramNamespace(tag, parentNamespace)
	if len(path) == 0 {
		build.namespace = namespace
	}
	nodeIndex := len(build.nodes)
	build.nodes = append(build.nodes, renderProgramNode{
		id: lowering.elementID(identityNode), path: append([]int(nil), path...), tag: tag, namespace: namespace,
	})
	build.ssrOperation("node-open", nodeIndex)
	build.write("<" + tag + ` data-exact-id="` + html.EscapeString(lowering.elementID(identityNode)) + `"`)
	if !lowering.appendRenderProgramAttributes(build, opening.Attributes(), tag, path) {
		return false
	}
	build.write(">")
	domIndex := 0
	semantic := ast.GetSemanticJsxChildren(nil)
	if children != nil {
		semantic = ast.GetSemanticJsxChildren(children.Nodes)
	}
	for childIndex, child := range semantic {
		childPath := append(append([]int(nil), path...), domIndex)
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text == "" {
				continue
			}
			build.write(html.EscapeString(text))
			domIndex++
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			// Adjacent text would be coalesced by HTML parsing and cannot retain an
			// independently addressable reactive slot without extra marker nodes.
			if domIndex != 0 || len(semantic) != 1 ||
				expression.SubtreeFacts()&ast.SubtreeContainsJsx != 0 ||
				!lowering.scalarRenderProgramExpression(expression) {
				return false
			}
			build.textSlot(lowering.dynamicID(child), childPath, lowering.visitor.VisitNode(expression))
			domIndex++
		case ast.IsJsxElement(child):
			element := child.AsJsxElement()
			if !lowering.appendRenderProgramElement(build, child, element.OpeningElement, element.Children, childPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
		case ast.IsJsxSelfClosingElement(child):
			if !lowering.appendRenderProgramElement(build, child, child, nil, childPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
		default:
			return false
		}
	}
	if !voidElement(tag) {
		build.write("</" + tag + ">")
	}
	build.ssrOperation("node-close", nodeIndex)
	return true
}

func renderProgramNamespace(tag string, parent string) string {
	if tag == "svg" {
		return "svg"
	}
	if tag == "math" {
		return "mathml"
	}
	if parent == "svg" {
		return "svg"
	}
	if parent == "mathml" {
		return "mathml"
	}
	return "html"
}

func renderProgramChildNamespace(tag string, namespace string) string {
	if namespace == "svg" && tag == "foreignObject" {
		return "html"
	}
	return namespace
}

func (lowering *jsxLowering) appendRenderProgramAttributes(
	build *renderProgramBuild,
	attributes *ast.Node,
	tag string,
	path []int,
) bool {
	if attributes == nil {
		return true
	}
	application := lowering.enhancementImports.applications[attributes.Pos()]
	if len(application.components) != 0 || jsxHasConditionalClassName(attributes) {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) || !ast.IsJsxAttribute(property) {
			return false
		}
		attribute := property.AsJsxAttribute()
		if ast.IsJsxNamespacedName(attribute.Name()) {
			return false
		}
		name := jsxAttributeText(attribute.Name())
		if name == "key" || name == "data-exact-id" {
			return false
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			return false
		}
		if len(lowering.formBindingProperties(name, attribute.Initializer, attributes)) != 0 {
			return false
		}
		reader := lowering.jsxAttributeInitializer(attribute, tag, name, false)
		if reader != nil {
			build.propertySlot(lowering.dynamicID(property), path, name, reader)
		}
	}
	return true
}

func renderProgramSlotKind(name string) string {
	switch name {
	case "class", "className":
		return "class"
	case "style":
		return "style"
	case "href", "src", "srcSet", "action", "formAction", "poster", "cite", "data":
		return "url"
	default:
		return "property"
	}
}

func (lowering *jsxLowering) scalarRenderProgramExpression(expression *ast.Node) bool {
	// Type queries are valid only for nodes from the bound source tree. Reactive
	// lowering can revisit synthetic expressions whose parent chain is incomplete.
	for current := expression; current != nil; current = current.Parent {
		if current == lowering.sourceFile.AsNode() {
			return scalarDerivedType(lowering.checker.GetTypeAtLocation(expression))
		}
	}
	return false
}

func voidElement(tag string) bool {
	switch tag {
	case "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr":
		return true
	}
	return false
}

func unsupportedPlannedHost(tag string) bool {
	switch tag {
	case "html", "head", "body", "script", "style", "title", "template", "annotation-xml":
		return true
	}
	return false
}

func (lowering *jsxLowering) renderProgramLiteral(id string, build *renderProgramBuild) *ast.Node {
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	array := func(values []*ast.Node) *ast.Node {
		return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
	}
	path := func(values []int) *ast.Node {
		items := make([]*ast.Node, len(values))
		for index, value := range values {
			items[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
		}
		return array(items)
	}
	parts := make([]*ast.Node, len(build.parts))
	for index, value := range build.parts {
		parts[index] = lowering.factory.NewStringLiteral(value, ast.TokenFlagsNone)
	}
	slots := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		members := []*ast.Node{
			property("id", lowering.factory.NewStringLiteral(slot.id, ast.TokenFlagsNone)),
			property("kind", lowering.factory.NewStringLiteral(slot.kind, ast.TokenFlagsNone)),
			property("path", path(slot.path)),
		}
		if slot.name != "" {
			members = append(members, property("name", lowering.factory.NewStringLiteral(slot.name, ast.TokenFlagsNone)))
		}
		slots[index] = lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(members), false)
	}
	nodes := make([]*ast.Node, len(build.nodes))
	for index, node := range build.nodes {
		nodes[index] = lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
			property("id", lowering.factory.NewStringLiteral(node.id, ast.TokenFlagsNone)),
			property("path", path(node.path)),
			property("tag", lowering.factory.NewStringLiteral(node.tag, ast.TokenFlagsNone)),
			property("namespace", lowering.factory.NewStringLiteral(node.namespace, ast.TokenFlagsNone)),
		}), false)
	}
	members := []*ast.Node{
		property("version", lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
		property("id", lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone)),
		property("namespace", lowering.factory.NewStringLiteral(build.namespace, ast.TokenFlagsNone)),
		property("template", lowering.factory.NewStringLiteral(build.template.String(), ast.TokenFlagsNone)),
		property("parts", array(parts)), property("slots", array(slots)), property("nodes", array(nodes)),
	}
	if lowering.target == TargetServer {
		ssrParts := make([]*ast.Node, len(build.ssrParts))
		for index, value := range build.ssrParts {
			ssrParts[index] = lowering.factory.NewStringLiteral(value, ast.TokenFlagsNone)
		}
		ssrOperations := make([]*ast.Node, len(build.ssrOperations))
		for index, operation := range build.ssrOperations {
			ssrOperations[index] = lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral(operation.kind, ast.TokenFlagsNone)),
				property("index", lowering.factory.NewNumericLiteral(strconv.Itoa(operation.index), ast.TokenFlagsNone)),
			}), false)
		}
		members = append(members, property("ssrParts", array(ssrParts)), property("ssrOperations", array(ssrOperations)))
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(members), false)
}

func (lowering *jsxLowering) serverPartitionRangeEdge(start int) (PartitionPlanEdge, bool) {
	placements := make(map[string]string, len(lowering.partitionPlan.Nodes))
	for _, node := range lowering.partitionPlan.Nodes {
		placements[node.ID] = node.Placement
	}
	best := PartitionPlanEdge{}
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.Start != start || placements[edge.Parent] == "server" || placements[edge.Child] != "server" {
			continue
		}
		if best.ID == "" || edge.Length < best.Length {
			best = edge
		}
	}
	return best, best.ID != ""
}

func (lowering *jsxLowering) clientPartitionSlot(
	opening *ast.Node,
	edge PartitionPlanEdge,
) *ast.Node {
	if edge.Kind == "keyed-item" {
		key := lowering.partitionKey(opening)
		if key != nil {
			return lowering.call(lowering.names.keyedServerSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(edge.Parent, ast.TokenFlagsNone),
				key,
			})
		}
	}
	return lowering.call(lowering.names.serverSlot, []*ast.Node{
		lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
	})
}

func (lowering *jsxLowering) serverPartitionSlot(
	opening *ast.Node,
	edge PartitionPlanEdge,
	child *ast.Node,
) *ast.Node {
	authority := lowering.partitionSlotReference(edge.ID)
	if edge.Kind == "keyed-item" {
		key := lowering.partitionKey(opening)
		if key != nil {
			return lowering.call(lowering.names.keyedServerSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(edge.Parent, ast.TokenFlagsNone),
				key,
				authority,
				child,
			})
		}
	}
	return lowering.call(lowering.names.serverSlot, []*ast.Node{
		lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
		authority,
		child,
	})
}

func (lowering *jsxLowering) partitionKey(opening *ast.Node) *ast.Node {
	attributes := opening.Attributes()
	if attributes == nil {
		return nil
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute.Name().Text() != "key" || attribute.Initializer == nil {
			continue
		}
		initializer := attribute.Initializer
		if ast.IsStringLiteral(initializer) {
			return lowering.factory.NewStringLiteral(initializer.AsStringLiteral().Text, ast.TokenFlagsNone)
		}
		if ast.IsJsxExpression(initializer) && initializer.AsJsxExpression().Expression != nil {
			return lowering.visitor.VisitNode(initializer.AsJsxExpression().Expression)
		}
	}
	return nil
}

func (lowering *jsxLowering) microComponentTag(tag *ast.Node) bool {
	if lowering.checker == nil || !ast.IsIdentifier(tag) {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(tag)
	if symbol == nil {
		return false
	}
	symbol = lowering.checker.SkipAlias(symbol)
	if symbol == nil {
		return false
	}
	_, exists := lowering.microComponents[ast.GetSymbolId(symbol)]
	return exists
}

func (lowering *jsxLowering) lowerMicroComponent(
	tag *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	props := lowering.props(opening.Attributes(), "", false, tag.Text())
	values := lowering.children(children)
	if len(values) != 0 {
		var value *ast.Node
		if len(values) == 1 {
			value = values[0]
		} else {
			value = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		props = lowering.appendObjectProperty(props, "children", value)
	}
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(tag),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{props}),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) localExactComponentTag(tag *ast.Node) bool {
	if !ast.IsIdentifier(tag) {
		return false
	}
	if _, exists := lowering.components[tag.Text()]; exists {
		return true
	}
	if lowering.checker == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(tag)
	if symbol == nil {
		return false
	}
	visited := make(map[ast.SymbolId]struct{})
	var resolvesToComponent func(*ast.Symbol) bool
	resolvesToComponent = func(candidate *ast.Symbol) bool {
		id := ast.GetSymbolId(candidate)
		if _, seen := visited[id]; seen {
			return false
		}
		visited[id] = struct{}{}
		if candidate.Flags&ast.SymbolFlagsAlias != 0 {
			target := lowering.checker.GetAliasedSymbol(candidate)
			if target != nil && resolvesToComponent(target) {
				return true
			}
		}
		for _, declaration := range candidate.Declarations {
			if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil {
				for _, component := range collectComponents(sourceFile) {
					if component.Start >= declaration.Pos() && component.Start < declaration.End() {
						return true
					}
				}
			}
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer == nil || !ast.IsIdentifier(initializer) {
				continue
			}
			if _, exists := lowering.components[initializer.Text()]; exists {
				return true
			}
			target := lowering.checker.GetSymbolAtLocation(initializer)
			if target != nil && resolvesToComponent(target) {
				return true
			}
		}
		return false
	}
	return resolvesToComponent(symbol)
}

func (lowering *jsxLowering) exactCoreVNodeTag(tag *ast.Node) bool {
	if !ast.IsIdentifier(tag) || lowering.checker == nil {
		return false
	}
	bindings := collectExternalImportBindings(lowering.sourceFile, lowering.checker)
	reference, exists := bindings.byName[tag.Text()]
	if !exists || reference.moduleSpecifier != "@exactjs/core" {
		return false
	}
	switch reference.exportName {
	case "Activity", "Cell", "Dynamic", "Fragment", "Portal", "RenderProgram", "ServerBoundary", "ServerSlot", "Suspense", "Target", "Text", "UnsafeHtml":
		return true
	default:
		return false
	}
}

func (lowering *jsxLowering) clientComponentBoundary(
	opening *ast.Node,
	children *ast.NodeList,
	edge RenderEdge,
) *ast.Node {
	props := lowering.propsWithReactivity(
		opening.Attributes(),
		"",
		false,
		"",
		false,
	)
	finite := finiteJSXAttributes(opening.Attributes())
	childrenValue, serverSlot := lowering.clientBoundaryChildren(children)
	if childrenValue != nil {
		props = lowering.appendObjectProperty(props, "children", childrenValue)
	}
	if serverSlot {
		if slots := lowering.partitionSlotIDs(children); len(slots) != 0 {
			values := make([]*ast.Node, len(slots))
			for index, slot := range slots {
				values[index] = lowering.partitionSlotReference(slot)
			}
			props = lowering.appendObjectProperty(
				props,
				"__exactServerSlots",
				lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false),
			)
		}
	}
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(
			exactStableID(
				lowering.sourceFile.FileName(),
				edge.Name,
				"component-island",
				edge.NodeID,
			),
			ast.TokenFlagsNone,
		),
		lowering.factory.NewStringLiteral(edge.Name, ast.TokenFlagsNone),
		props,
	}
	if serverSlot {
		arguments = append(arguments, lowering.children(children)...)
	}
	boundary := lowering.call(lowering.names.boundary, arguments)
	if finite {
		return lowering.call(lowering.names.finiteBoundary, []*ast.Node{boundary})
	}
	return boundary
}

func finiteJSXAttributes(attributes *ast.Node) bool {
	if attributes == nil {
		return true
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			return false
		}
	}
	return true
}

func (lowering *jsxLowering) partitionSlotReference(edgeID string) *ast.Node {
	ownerComponentID := ""
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.ID != edgeID {
			continue
		}
		for _, node := range lowering.partitionPlan.Nodes {
			if node.ID != edge.Child {
				continue
			}
			for _, owner := range lowering.partitionPlan.Nodes {
				if owner.ID == node.OwnerComponent {
					ownerComponentID = owner.ComponentContract
					break
				}
			}
			break
		}
		break
	}
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("__exactServerSlot", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			property("planVersion", lowering.factory.NewNumericLiteral(strconv.Itoa(lowering.partitionPlan.Version), ast.TokenFlagsNone)),
			property("buildKey", lowering.factory.NewStringLiteral(lowering.partitionPlan.BuildKey, ast.TokenFlagsNone)),
			property("planEdgeId", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			property("ownerComponentId", lowering.factory.NewStringLiteral(ownerComponentID, ast.TokenFlagsNone)),
			property("discriminator", lowering.partitionSlotDiscriminator(edgeID)),
			property("generation", lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
		}),
		false,
	)
}

func (lowering *jsxLowering) partitionSlotDiscriminator(edgeID string) *ast.Node {
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	single := func() *ast.Node {
		return lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral("single", ast.TokenFlagsNone)),
			}),
			false,
		)
	}
	var template PartitionPlanNode
	edgeKind := ""
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.ID != edgeID {
			continue
		}
		edgeKind = edge.Kind
		for _, node := range lowering.partitionPlan.Nodes {
			if node.ID == edge.Child {
				template = node
				break
			}
		}
		break
	}
	if edgeKind == "branch" {
		return lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral("branch", ast.TokenFlagsNone)),
				property("branch", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			}),
			false,
		)
	}
	if template.Kind != "conditional-template" {
		return single()
	}
	var conditional *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsConditionalExpression(node) && node.Pos() == template.Start {
			conditional = node
			return false
		}
		return conditional == nil
	})
	if conditional == nil {
		return single()
	}
	value := conditional.AsConditionalExpression()
	trueBranch := lowering.partitionBranchEdgeID(template.ID, value.WhenTrue.Pos())
	falseBranch := lowering.partitionBranchEdgeID(template.ID, value.WhenFalse.Pos())
	if trueBranch == "" || falseBranch == "" {
		return single()
	}
	branch := lowering.conditional(
		lowering.visitor.VisitNode(value.Condition),
		lowering.factory.NewStringLiteral(trueBranch, ast.TokenFlagsNone),
		lowering.factory.NewStringLiteral(falseBranch, ast.TokenFlagsNone),
	)
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("kind", lowering.factory.NewStringLiteral("branch", ast.TokenFlagsNone)),
			property("branch", branch),
		}),
		false,
	)
}

func (lowering *jsxLowering) partitionBranchEdgeID(parent string, start int) string {
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.Parent == parent && edge.Kind == "branch" && edge.Start == start {
			return edge.ID
		}
	}
	return ""
}

func (lowering *jsxLowering) partitionSlotIDs(children *ast.NodeList) []string {
	if children == nil {
		return nil
	}
	result := []string{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for _, child := range semantic {
		start, end := child.Pos(), child.End()
		switch {
		case ast.IsJsxText(child):
			if normalizeJSXText(child.AsJsxText().Text) == "" {
				continue
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			start, end = expression.Pos(), expression.End()
		}
		id := lowering.partitionRangeEdgeID(start, end)
		if id == "" {
			return nil
		}
		result = append(result, id)
	}
	return result
}

func (lowering *jsxLowering) partitionRangeEdgeID(start int, end int) string {
	best := ""
	bestWidth := int(^uint(0) >> 1)
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.Kind == "component" || edge.Kind == "enhancement" || edge.Length <= 0 ||
			edge.Start < start || edge.Start+edge.Length > end {
			continue
		}
		width := edge.Length
		if edge.Start == start && width < bestWidth {
			best, bestWidth = edge.ID, width
		}
	}
	return best
}

func (lowering *jsxLowering) clientBoundaryChildren(
	children *ast.NodeList,
) (*ast.Node, bool) {
	if children == nil {
		return nil, false
	}
	if jsxChildrenRequireServerSlot(children) {
		return nil, true
	}
	values := []*ast.Node{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				values = append(
					values,
					lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone),
				)
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression != nil {
				values = append(values, lowering.visitor.VisitNode(expression))
			}
		}
	}
	switch len(values) {
	case 0:
		return nil, false
	case 1:
		return values[0], false
	default:
		return lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList(values),
			false,
		), false
	}
}

func jsxChildrenRequireServerSlot(children *ast.NodeList) bool {
	if children == nil {
		return false
	}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for _, child := range semantic {
		if ast.IsJsxText(child) {
			continue
		}
		if ast.IsJsxExpression(child) {
			expression := child.AsJsxExpression().Expression
			if expression == nil ||
				expression.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
				continue
			}
		}
		return true
	}
	return false
}

func (lowering *jsxLowering) appendObjectProperty(
	object *ast.Node,
	name string,
	value *ast.Node,
) *ast.Node {
	literal := object.AsObjectLiteralExpression()
	properties := append([]*ast.Node(nil), literal.Properties.Nodes...)
	properties = append(
		properties,
		lowering.property(lowering.factory.NewIdentifier(name), value),
	)
	return lowering.factory.UpdateObjectLiteralExpression(
		literal,
		lowering.factory.NewNodeList(properties),
		literal.MultiLine,
	)
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

func (lowering *jsxLowering) lowerFragment(fragment *ast.JsxFragment) *ast.Node {
	arguments := []*ast.Node{lowering.props(nil, "", false, "")}
	arguments = append(arguments, lowering.children(fragment.Children)...)
	return lowering.call(lowering.names.fragment, arguments)
}

func openingTag(opening *ast.Node) *ast.Node {
	if ast.IsJsxOpeningElement(opening) {
		return opening.AsJsxOpeningElement().TagName
	}
	return opening.AsJsxSelfClosingElement().TagName
}

func (lowering *jsxLowering) props(
	attributes *ast.Node,
	elementID string,
	intrinsic bool,
	tag string,
) *ast.Node {
	return lowering.propsWithReactivity(
		attributes,
		elementID,
		intrinsic,
		tag,
		true,
	)
}

func (lowering *jsxLowering) propsWithReactivity(
	attributes *ast.Node,
	elementID string,
	intrinsic bool,
	tag string,
	reactive bool,
) *ast.Node {
	properties := []*ast.Node{}
	enhancementEntries := make(map[string][]*ast.Node)
	enhancementOrder := []string{}
	application := enhancementApplication{}
	if attributes != nil {
		application = lowering.enhancementImports.applications[attributes.Pos()]
	}
	for _, component := range application.components {
		if _, grouped := enhancementEntries[component.identity]; grouped {
			continue
		}
		enhancementOrder = append(enhancementOrder, component.identity)
		enhancementEntries[component.identity] = []*ast.Node{}
	}
	if intrinsic {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral("data-exact-id", ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(elementID, ast.TokenFlagsNone),
			),
		)
	}
	if attributes != nil {
		conditionalClasses := jsxHasConditionalClassName(attributes)
		classNameEmitted := false
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if conditionalClasses && jsxClassNameContribution(property) {
				if !classNameEmitted {
					properties = append(
						properties,
						lowering.property(
							lowering.factory.NewIdentifier("className"),
							lowering.lowerClassNameValue(attributes, reactive),
						),
					)
					classNameEmitted = true
				}
				continue
			}
			if ast.IsJsxSpreadAttribute(property) {
				expression := property.AsJsxSpreadAttribute().Expression
				if plan, exists := lowering.enhancementImports.spreads[property.Pos()]; exists {
					visited := lowering.visitor.VisitNode(expression)
					keys := make([]*ast.Node, 0, len(plan.keys))
					for _, key := range plan.keys {
						keys = append(keys, lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone))
					}
					properties = append(properties, lowering.factory.NewSpreadAssignment(
						lowering.call(lowering.names.omitEnhancementProps, []*ast.Node{
							visited,
							lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(keys), false),
						}),
					))
					for _, member := range plan.members {
						if _, grouped := enhancementEntries[member.identity]; !grouped {
							enhancementOrder = append(enhancementOrder, member.identity)
							enhancementEntries[member.identity] = []*ast.Node{}
						}
						value := lowering.factory.NewElementAccessExpression(
							lowering.visitor.VisitNode(expression),
							nil,
							lowering.factory.NewStringLiteral(member.source, ast.TokenFlagsNone),
							ast.NodeFlagsNone,
						)
						value = lowering.reactiveExpression(expression, value)
						enhancementEntries[member.identity] = append(
							enhancementEntries[member.identity],
							lowering.property(lowering.factory.NewIdentifier(member.prop), value),
						)
					}
					continue
				}
				properties = append(
					properties,
					lowering.factory.NewSpreadAssignment(
						lowering.visitor.VisitNode(expression),
					),
				)
				continue
			}
			attribute := property.AsJsxAttribute()
			name := jsxAttributeText(attribute.Name())
			if binding, exists := lowering.componentBindings[property.Pos()]; exists {
				properties = append(properties, lowering.componentBindingProperties(binding)...)
				continue
			}
			if ast.IsJsxNamespacedName(attribute.Name()) {
				namespaced := attribute.Name().AsJsxNamespacedName()
				prefix := namespaced.Namespace.Text()
				if _, exists := lowering.enhancementImports.bindings[prefix]; exists {
					value := lowering.jsxAttributeInitializer(attribute, tag, name, reactive)
					if value != nil {
						for _, member := range application.attributes[property.Pos()] {
							enhancementEntries[member.identity] = append(
								enhancementEntries[member.identity],
								lowering.property(jsxPropertyName(lowering.factory, member.prop), value),
							)
						}
					}
					continue
				}
			}
			if bindingProperties := lowering.formBindingProperties(
				name,
				attribute.Initializer,
				attributes,
			); len(bindingProperties) != 0 {
				properties = append(properties, bindingProperties...)
				continue
			}
			var initializer *ast.Node
			switch {
			case attribute.Initializer == nil:
				initializer = lowering.factory.NewTrueExpression()
			case ast.IsStringLiteral(attribute.Initializer):
				initializer = lowering.factory.NewStringLiteral(
					attribute.Initializer.AsStringLiteral().Text,
					ast.TokenFlagsNone,
				)
			case ast.IsJsxExpression(attribute.Initializer):
				expression := attribute.Initializer.AsJsxExpression().Expression
				if expression == nil {
					continue
				}
				expression = lowering.preserveContextualCallbackTypes(
					expression,
					tag,
					name,
				)
				initializer = lowering.visitor.VisitNode(expression)
				if reactive && !jsxCallbackExpression(expression) &&
					!jsxEventAttribute(name) &&
					name != "key" && name != "ref" {
					initializer = lowering.reactiveExpressionMode(
						expression,
						initializer,
						!intrinsic,
					)
				}
			default:
				initializer = lowering.visitor.VisitNode(attribute.Initializer)
			}
			properties = append(
				properties,
				lowering.property(jsxPropertyName(lowering.factory, name), initializer),
			)
		}
	}
	if len(enhancementOrder) != 0 {
		entries := make([]*ast.Node, 0, len(enhancementOrder))
		for _, identity := range enhancementOrder {
			members := enhancementEntries[identity]
			props := []*ast.Node{}
			var root *ast.Node
			for _, member := range members {
				if ast.IsPropertyAssignment(member) && member.AsPropertyAssignment().Name().Text() == "__exactRoot" {
					root = member.AsPropertyAssignment().Initializer
					continue
				}
				props = append(props, member)
			}
			entry := []*ast.Node{
				lowering.property(
					lowering.factory.NewIdentifier("identity"),
					lowering.factory.NewStringLiteral(identity, ast.TokenFlagsNone),
				),
				lowering.property(
					lowering.factory.NewIdentifier("props"),
					lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(props), false),
				),
			}
			if root != nil {
				entry = append(entry, lowering.property(lowering.factory.NewIdentifier("root"), root))
			}
			entries = append(entries, lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(entry), false))
		}
		properties = append(properties, lowering.property(
			lowering.factory.NewIdentifier("__exactEnhancements"),
			lowering.call(lowering.names.enhancements, []*ast.Node{
				lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(entries), false),
			}),
		))
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
}

func (lowering *jsxLowering) jsxAttributeInitializer(
	attribute *ast.JsxAttribute,
	tag string,
	name string,
	reactive bool,
) *ast.Node {
	switch {
	case attribute.Initializer == nil:
		return lowering.factory.NewTrueExpression()
	case ast.IsStringLiteral(attribute.Initializer):
		return lowering.factory.NewStringLiteral(attribute.Initializer.AsStringLiteral().Text, ast.TokenFlagsNone)
	case ast.IsJsxExpression(attribute.Initializer):
		expression := attribute.Initializer.AsJsxExpression().Expression
		if expression == nil {
			return nil
		}
		expression = lowering.preserveContextualCallbackTypes(expression, tag, name)
		initializer := lowering.visitor.VisitNode(expression)
		if reactive && !jsxCallbackExpression(expression) {
			initializer = lowering.reactiveExpression(expression, initializer)
		}
		return initializer
	default:
		return lowering.visitor.VisitNode(attribute.Initializer)
	}
}

func kebabToCamel(value string) string {
	result := ""
	upper := false
	for _, character := range value {
		if character == '-' {
			upper = true
			continue
		}
		if upper {
			result += strings.ToUpper(string(character))
			upper = false
			continue
		}
		result += string(character)
	}
	return result
}

func jsxClassNameContribution(property *ast.Node) bool {
	if !ast.IsJsxAttribute(property) {
		return false
	}
	name := property.AsJsxAttribute().Name()
	if ast.IsJsxNamespacedName(name) {
		return name.AsJsxNamespacedName().Namespace.Text() == "className"
	}
	return name.Text() == "className"
}

// lowerClassNameValue retains each authored class contribution as one ordered
// list entry. Conditional names use truthy-map entries so their reactive
// condition remains independently observable by the shared class normalizer.
func (lowering *jsxLowering) lowerClassNameValue(
	attributes *ast.Node,
	reactive bool,
) *ast.Node {
	contributions := []*ast.Node{}
	allStatic := true
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !jsxClassNameContribution(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		name := attribute.Name()
		if !ast.IsJsxNamespacedName(name) {
			value, static := lowering.lowerOrdinaryClassName(attribute, reactive)
			if value != nil {
				contributions = append(contributions, value)
				allStatic = allStatic && static
			}
			continue
		}
		token := name.AsJsxNamespacedName().Name().Text()
		if attribute.Initializer == nil {
			contributions = append(
				contributions,
				lowering.factory.NewStringLiteral(token, ast.TokenFlagsNone),
			)
			continue
		}
		condition := lowering.lowerClassNameCondition(attribute, reactive)
		if condition == nil {
			continue
		}
		allStatic = false
		contributions = append(
			contributions,
			lowering.factory.NewObjectLiteralExpression(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.property(
						lowering.factory.NewStringLiteral(token, ast.TokenFlagsNone),
						condition,
					),
				}),
				false,
			),
		)
	}
	if allStatic {
		values := make([]string, 0, len(contributions))
		for _, contribution := range contributions {
			values = append(values, contribution.AsStringLiteral().Text)
		}
		return lowering.factory.NewStringLiteral(
			strings.Join(values, " "),
			ast.TokenFlagsNone,
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(contributions),
		false,
	)
}

func (lowering *jsxLowering) lowerOrdinaryClassName(
	attribute *ast.JsxAttribute,
	reactive bool,
) (*ast.Node, bool) {
	switch {
	case attribute.Initializer == nil:
		return lowering.factory.NewTrueExpression(), false
	case ast.IsStringLiteral(attribute.Initializer):
		return lowering.factory.NewStringLiteral(
			attribute.Initializer.AsStringLiteral().Text,
			ast.TokenFlagsNone,
		), true
	case ast.IsJsxExpression(attribute.Initializer):
		expression := attribute.Initializer.AsJsxExpression().Expression
		if expression == nil {
			return nil, false
		}
		value := lowering.visitor.VisitNode(expression)
		if reactive && !jsxCallbackExpression(expression) {
			value = lowering.reactiveExpression(expression, value)
		}
		return value, false
	default:
		return lowering.visitor.VisitNode(attribute.Initializer), false
	}
}

func (lowering *jsxLowering) lowerClassNameCondition(
	attribute *ast.JsxAttribute,
	reactive bool,
) *ast.Node {
	if ast.IsStringLiteral(attribute.Initializer) {
		return lowering.factory.NewStringLiteral(
			attribute.Initializer.AsStringLiteral().Text,
			ast.TokenFlagsNone,
		)
	}
	if !ast.IsJsxExpression(attribute.Initializer) {
		return lowering.visitor.VisitNode(attribute.Initializer)
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	if expression == nil {
		return nil
	}
	value := lowering.visitor.VisitNode(expression)
	if reactive && !jsxCallbackExpression(expression) {
		value = lowering.reactiveExpression(expression, value)
	}
	return value
}

func jsxEventAttribute(name string) bool {
	return len(name) > 2 &&
		name[0] == 'o' &&
		name[1] == 'n' &&
		name[2] >= 'A' &&
		name[2] <= 'Z'
}

// preserveContextualCallbackTypes materializes types that TypeScript inferred
// from JSX before JSX lowering removes the contextual typing site. This keeps
// the emitted TypeScript independently checkable without reimplementing the
// JSX event-type table in eXact.
func (lowering *jsxLowering) preserveContextualCallbackTypes(
	expression *ast.Node,
	tag string,
	attribute string,
) *ast.Node {
	if lowering.checker == nil ||
		(!ast.IsArrowFunction(expression) &&
			!ast.IsFunctionExpression(expression)) {
		return expression
	}
	parameters := append([]*ast.Node(nil), expression.Parameters()...)
	contextualParameters := lowering.contextualCallbackParameterTypes(expression)
	changed := false
	for index, node := range parameters {
		parameter := node.AsParameterDeclaration()
		if parameter.Type != nil {
			continue
		}
		contextualType := contextualParameters[index]
		if contextualType == nil ||
			lowering.checker.TypeToString(contextualType) == "any" {
			contextualType = lowering.checker.GetTypeAtLocation(node)
		}
		if (contextualType == nil ||
			lowering.checker.TypeToString(contextualType) == "any") &&
			index == 0 {
			if eventType := lowering.jsxEventParameterType(
				expression,
				tag,
				attribute,
			); eventType != nil {
				parameters[index] = lowering.factory.UpdateParameterDeclaration(
					parameter,
					parameter.Modifiers(),
					parameter.DotDotDotToken,
					parameter.Name(),
					parameter.QuestionToken,
					eventType,
					parameter.Initializer,
				)
				changed = true
				continue
			}
		}
		if contextualType == nil {
			continue
		}
		typeNode := lowering.checker.TypeToTypeNode(
			contextualType,
			node,
			nodebuilder.FlagsNoTruncation,
			nil,
		)
		if typeNode == nil {
			continue
		}
		parameters[index] = lowering.factory.UpdateParameterDeclaration(
			parameter,
			parameter.Modifiers(),
			parameter.DotDotDotToken,
			parameter.Name(),
			parameter.QuestionToken,
			typeNode,
			parameter.Initializer,
		)
		changed = true
	}
	if !changed {
		return expression
	}
	list := lowering.factory.NewNodeList(parameters)
	if ast.IsArrowFunction(expression) {
		arrow := expression.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(
			arrow,
			arrow.Modifiers(),
			arrow.TypeParameters,
			list,
			arrow.Type,
			arrow.FullSignature,
			arrow.EqualsGreaterThanToken,
			arrow.Body,
		)
	}
	function := expression.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(
		function,
		function.Modifiers(),
		function.AsteriskToken,
		function.Name(),
		function.TypeParameters,
		list,
		function.Type,
		function.FullSignature,
		function.Body,
	)
}

// jsxEventParameterType resolves element and event types from TypeScript's DOM
// declarations, then qualifies eXact's event wrapper through its public JSX
// runtime. This is a semantic fallback for projects whose unresolved JSX
// import source causes the checker to expose `any` at the callback itself.
func (lowering *jsxLowering) jsxEventParameterType(
	location *ast.Node,
	tag string,
	attribute string,
) *ast.Node {
	if tag == "" || len(attribute) <= 2 ||
		!strings.HasPrefix(attribute, "on") {
		return nil
	}
	eventName := strings.TrimSuffix(attribute[2:], "Capture")
	if eventName == "" {
		return nil
	}
	eventName = strings.ToLower(eventName)
	if eventName == "doubleclick" {
		eventName = "dblclick"
	}
	elementType := lowering.globalPropertyType(
		"HTMLElementTagNameMap",
		strings.ToLower(tag),
		location,
	)
	eventType := lowering.globalPropertyType(
		"GlobalEventHandlersEventMap",
		eventName,
		location,
	)
	if elementType == nil || eventType == nil {
		return nil
	}
	elementNode := lowering.checker.TypeToTypeNode(
		elementType,
		location,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	eventNode := lowering.checker.TypeToTypeNode(
		eventType,
		location,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	if elementNode == nil || eventNode == nil {
		return nil
	}
	qualifier := lowering.factory.NewQualifiedName(
		lowering.factory.NewIdentifier("JSX"),
		lowering.factory.NewIdentifier("TargetedEvent"),
	)
	return lowering.factory.NewImportTypeNode(
		false,
		lowering.factory.NewLiteralTypeNode(
			lowering.factory.NewStringLiteral(
				"@exactjs/jsx/jsx-runtime",
				ast.TokenFlagsNone,
			),
		),
		nil,
		qualifier,
		lowering.factory.NewNodeList([]*ast.Node{elementNode, eventNode}),
	)
}

func (lowering *jsxLowering) globalPropertyType(
	globalName string,
	propertyName string,
	location *ast.Node,
) *checker.Type {
	symbol := lowering.checker.GetGlobalSymbol(
		globalName,
		ast.SymbolFlagsType,
		nil,
	)
	if symbol == nil {
		return nil
	}
	globalType := lowering.checker.GetDeclaredTypeOfSymbol(symbol)
	property := lowering.checker.GetPropertyOfType(globalType, propertyName)
	if property == nil {
		return nil
	}
	return lowering.checker.GetTypeOfSymbolAtLocation(property, location)
}

func (lowering *jsxLowering) contextualCallbackParameterTypes(
	expression *ast.Node,
) map[int]*checker.Type {
	result := make(map[int]*checker.Type)
	contextual := lowering.checker.GetContextualType(
		expression,
		checker.ContextFlagsNone,
	)
	if contextual == nil {
		return result
	}
	contextual = lowering.checker.GetNonNullableType(contextual)
	signatures := lowering.checker.GetSignaturesOfType(
		contextual,
		checker.SignatureKindCall,
	)
	if len(signatures) == 0 {
		return result
	}
	for index, parameter := range signatures[0].Parameters() {
		result[index] = lowering.checker.GetTypeOfSymbolAtLocation(
			parameter,
			expression,
		)
	}
	return result
}

func (lowering *jsxLowering) componentBindingProperties(
	binding componentBinding,
) []*ast.Node {
	target := lowering.visitor.VisitNode(binding.target)
	next := lowering.factory.NewIdentifier("__exactBindingValue")
	write := lowering.call(
		lowering.names.write,
		[]*ast.Node{
			lowering.stateWriteRoot(binding.write),
			lowering.stateWritePathNode(binding.write),
			lowering.arrow(next),
		},
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewExpressionStatement(write),
		}),
		true,
	)
	parameterType := lowering.checker.TypeToTypeNode(
		binding.parameter,
		binding.target,
		nodebuilder.FlagsNoTruncation,
		nil,
	)
	parameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		next,
		nil,
		parameterType,
		nil,
	)
	callback := lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
	return []*ast.Node{
		lowering.property(
			jsxPropertyName(lowering.factory, binding.valueProp),
			lowering.reactiveExpression(binding.target, target),
		),
		lowering.property(
			jsxPropertyName(lowering.factory, binding.callbackProp),
			callback,
		),
	}
}

func (lowering *jsxLowering) formBindingProperties(
	name string,
	initializer *ast.Node,
	attributes *ast.Node,
) []*ast.Node {
	if name != "value:onInput" && name != "value:onChange" &&
		name != "checked:onChange" && name != "open:onToggle" &&
		name != "modal:isOpen" {
		return nil
	}
	if initializer == nil || !ast.IsJsxExpression(initializer) {
		return nil
	}
	target := initializer.AsJsxExpression().Expression
	if target == nil {
		return nil
	}
	binding, exists := lowering.formBindings[target.Pos()]
	if !exists || binding.name != name {
		return nil
	}
	return lowering.lowerFormBinding(binding, attributes)
}

func (lowering *jsxLowering) stateReadPath(node *ast.Node) []string {
	for _, read := range lowering.stateReads {
		if read.Start == node.Pos() && read.Length == node.End()-node.Pos() &&
			read.Confidence == "exact" {
			return append([]string(nil), read.Path...)
		}
	}
	return nil
}

func (lowering *jsxLowering) children(children *ast.NodeList) []*ast.Node {
	if children == nil {
		return nil
	}
	result := []*ast.Node{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				result = append(
					result,
					lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone),
				)
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			if lowering.moduleDeclarativeCollection(expression) {
				lowering.declarativeRenderDepth++
				emitted := lowering.visitor.VisitNode(expression)
				lowering.declarativeRenderDepth--
				result = append(result, emitted)
				continue
			}
			emitted := lowering.visitor.VisitNode(expression)
			if lowering.declarativeRenderDepth > 0 {
				result = append(result, emitted)
				continue
			}
			closure := lowering.reactiveClosure(expression)
			if closure == nil {
				closure = lowering.arrow(emitted)
			}
			arguments := []*ast.Node{
				closure,
				lowering.factory.NewStringLiteral(
					lowering.dynamicID(child),
					ast.TokenFlagsNone,
				),
			}
			if lowering.checker != nil &&
				!ast.NodeIsSynthesized(expression) &&
				ast.GetSourceFileOfNode(expression) != nil &&
				scalarDerivedType(lowering.checker.GetTypeAtLocation(expression)) {
				arguments = append(
					arguments,
					lowering.factory.NewKeywordExpression(ast.KindFalseKeyword),
				)
			}
			result = append(
				result,
				lowering.call(lowering.names.dynamic, arguments),
			)
		default:
			result = append(result, lowering.visitor.VisitNode(child))
		}
	}
	return result
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
			lowering.visitor.VisitNode(collection),
			selector,
			lowering.visitor.VisitNode(render),
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

func (lowering *jsxLowering) reactiveExpression(
	source *ast.Node,
	expression *ast.Node,
) *ast.Node {
	return lowering.reactiveExpressionMode(source, expression, false)
}

func (lowering *jsxLowering) reactiveExpressionMode(
	source *ast.Node,
	expression *ast.Node,
	forwardLiveSlot bool,
) *ast.Node {
	if lowering.declarativeRenderDepth > 0 {
		return expression
	}
	closure := lowering.reactiveClosure(source)
	if closure == nil {
		closure = lowering.arrow(expression)
	}
	helper := lowering.names.expression
	if forwardLiveSlot && lowering.liveSlotForwarding(source) {
		helper = lowering.names.forwardedExpression
	}
	value := lowering.call(
		helper,
		[]*ast.Node{closure},
	)
	if paths, direct := lowering.componentExecutionOutputPaths(source); len(paths) != 0 {
		pathValue := lowering.factory.NewStringLiteral(paths[0], ast.TokenFlagsNone)
		if !direct {
			values := make([]*ast.Node, len(paths))
			for index, path := range paths {
				values[index] = lowering.factory.NewStringLiteral(path, ast.TokenFlagsNone)
			}
			pathValue = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		return lowering.call(lowering.names.componentOutput, []*ast.Node{
			lowering.factory.NewThisExpression(),
			pathValue,
			value,
		})
	}
	return value
}

func (lowering *jsxLowering) liveSlotForwarding(source *ast.Node) bool {
	root := source
	for ast.IsPropertyAccessExpression(root) {
		root = root.AsPropertyAccessExpression().Expression
	}
	for ast.IsElementAccessExpression(root) {
		root = root.AsElementAccessExpression().Expression
	}
	if !ast.IsIdentifier(root) || lowering.checker == nil || ast.GetSourceFileOfNode(root) == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		name := declaration.Name()
		if name == nil {
			continue
		}
		for _, binding := range lowering.bindings {
			if binding.Start == name.Pos() &&
				(binding.Provenance == "props" || binding.Provenance == "cell") {
				return true
			}
		}
	}
	return false
}

// componentExecutionOutputPaths recognizes state values whose pending
// generations must remain attached when a scalar or aggregate value is forwarded.
func (lowering *jsxLowering) componentExecutionOutputPaths(source *ast.Node) ([]string, bool) {
	paths := []string{}
	seen := make(map[string]bool)
	direct := false
	for _, read := range lowering.stateReads {
		if read.Start < source.Pos() || read.Start+read.Length > source.End() ||
			read.Confidence != "exact" {
			continue
		}
		component, exists := lowering.components[read.Component]
		if !exists {
			continue
		}
		path := strings.Join(read.Path, ".")
		for _, port := range component.Execution.Ports {
			if port.Kind == "state" && port.Path == path &&
				(port.Direction == "output" || port.Direction == "inout") {
				if !seen[path] {
					seen[path] = true
					paths = append(paths, path)
					direct = read.Start == source.Pos() && read.Length == source.End()-source.Pos()
				}
				break
			}
		}
	}
	return paths, len(paths) == 1 && direct
}

type materializedRenderLocal struct {
	symbol      ast.SymbolId
	declaration *ast.Node
	name        string
	cached      bool
}

// reactiveClosure moves render-local pure calculations into the reactive
// callback that consumes them. Closing over their first render value would
// retain a stale snapshot after a dependency changes.
func (lowering *jsxLowering) reactiveClosure(
	expression *ast.Node,
) *ast.Node {
	scope := enclosingCallableNode(expression)
	if scope == nil || lowering.checker == nil {
		return nil
	}
	bySymbol := make(map[ast.SymbolId]materializedRenderLocal)
	walkNode(expression, func(node *ast.Node) bool {
		// Nested JSX expressions receive their own reactive closures during child lowering.
		// Pulling their derived locals into this closure would broaden the outer dependency
		// set and reconcile an entire conditional branch for a leaf-only update.
		if node != expression && ast.IsJsxExpression(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := lowering.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		if _, exists := bySymbol[id]; exists {
			return true
		}
		if local, exists := lowering.elidedDerivedLocal(symbol); exists {
			bySymbol[id] = local
			return true
		}
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) ||
				enclosingCallableNode(declaration) != scope {
				continue
			}
			variable := declaration.AsVariableDeclaration()
			name := variable.Name()
			if variable.Initializer == nil || name == nil ||
				!ast.IsIdentifier(name) ||
				!safeReactiveInitializer(
					variable.Initializer,
					lowering.sourceFile,
					lowering.checker,
				) {
				continue
			}
			bySymbol[id] = materializedRenderLocal{
				symbol:      id,
				declaration: declaration,
				name:        lowering.materializedName(name.Text(), name.Pos()),
			}
			break
		}
		return true
	})
	queue := make([]materializedRenderLocal, 0, len(bySymbol))
	for _, local := range bySymbol {
		queue = append(queue, local)
	}
	for len(queue) != 0 {
		local := queue[0]
		queue = queue[1:]
		if local.cached {
			continue
		}
		initializer := local.declaration.AsVariableDeclaration().Initializer
		walkNode(initializer, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
				isStaticPropertyName(node) {
				return true
			}
			symbol := lowering.checker.GetSymbolAtLocation(node)
			if symbol == nil {
				return true
			}
			id := ast.GetSymbolId(symbol)
			if _, exists := bySymbol[id]; exists {
				return true
			}
			if dependency, exists := lowering.elidedDerivedLocal(symbol); exists {
				bySymbol[id] = dependency
				queue = append(queue, dependency)
			}
			return true
		})
	}
	for symbol, local := range lowering.cachedDerivedLocals(expression) {
		if _, exists := bySymbol[symbol]; !exists {
			bySymbol[symbol] = local
		}
	}
	return lowering.materializedClosure(expression, bySymbol)
}

// cachedDerivedLocals identifies retained derived values whose repeated reads
// belong to one eager reactive evaluation. Reading the cell once preserves
// TypeScript control-flow narrowing and avoids redundant get calls.
func (lowering *jsxLowering) cachedDerivedLocals(
	expression *ast.Node,
) map[ast.SymbolId]materializedRenderLocal {
	locals := make(map[ast.SymbolId]materializedRenderLocal)
	counts := make(map[ast.SymbolId]int)
	walkNode(expression, func(node *ast.Node) bool {
		if node != expression && isCallableNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		if _, exists := lowering.derivedBindingAtReference(node); !exists {
			return true
		}
		symbol := lowering.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		counts[id]++
		if _, exists := locals[id]; exists {
			return true
		}
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			name := declaration.AsVariableDeclaration().Name()
			if name == nil || !ast.IsIdentifier(name) {
				continue
			}
			locals[id] = materializedRenderLocal{
				symbol:      id,
				declaration: declaration,
				name:        lowering.cachedDerivedName(name.Text(), name.Pos()),
				cached:      true,
			}
			break
		}
		return true
	})
	for symbol := range locals {
		if counts[symbol] < 2 {
			delete(locals, symbol)
		}
	}
	return locals
}

func (lowering *jsxLowering) materializedClosure(
	expression *ast.Node,
	bySymbol map[ast.SymbolId]materializedRenderLocal,
) *ast.Node {
	if len(bySymbol) == 0 {
		return nil
	}
	locals := make([]materializedRenderLocal, 0, len(bySymbol))
	for _, local := range bySymbol {
		locals = append(locals, local)
	}
	sort.Slice(locals, func(left int, right int) bool {
		return locals[left].declaration.Pos() < locals[right].declaration.Pos()
	})
	statements := make([]*ast.Node, 0, len(locals)+1)
	for _, local := range locals {
		variable := local.declaration.AsVariableDeclaration()
		var initializer *ast.Node
		if local.cached {
			initializer = lowering.derivedGet(
				lowering.factory.NewIdentifier(variable.Name().Text()),
			)
		} else {
			initializer = lowering.replaceMaterializedReferences(
				variable.Initializer,
				bySymbol,
			)
		}
		statements = append(
			statements,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							lowering.factory.NewIdentifier(local.name),
							nil,
							variable.Type,
							initializer,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
	}
	value := lowering.replaceMaterializedReferences(expression, bySymbol)
	statements = append(statements, lowering.factory.NewReturnStatement(value))
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList(statements),
			true,
		),
	)
}

func (lowering *jsxLowering) elidedDerivedLocal(
	symbol *ast.Symbol,
) (materializedRenderLocal, bool) {
	id := ast.GetSymbolId(symbol)
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		variable := declaration.AsVariableDeclaration()
		name := variable.Name()
		if variable.Initializer == nil || name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if _, exists := lowering.elidedDerived[name.Pos()]; !exists {
			continue
		}
		return materializedRenderLocal{
			symbol:      id,
			declaration: declaration,
			name:        lowering.materializedName(name.Text(), name.Pos()),
		}, true
	}
	return materializedRenderLocal{}, false
}

func enclosingCallableNode(node *ast.Node) *ast.Node {
	for current := node.Parent; current != nil; current = current.Parent {
		if isCallableNode(current) ||
			ast.IsMethodDeclaration(current) ||
			ast.IsGetAccessorDeclaration(current) ||
			ast.IsSetAccessorDeclaration(current) {
			return current
		}
	}
	return nil
}

func (lowering *jsxLowering) materializedName(
	name string,
	start int,
) string {
	if existing := lowering.materializedNames[start]; existing != "" {
		return existing
	}
	base := "__exact_" + name + "_"
	index := 1
	candidate := base + strconv.Itoa(index)
	for strings.Contains(lowering.sourceFile.Text(), candidate) {
		index++
		candidate = base + strconv.Itoa(index)
	}
	lowering.materializedNames[start] = candidate
	return candidate
}

func (lowering *jsxLowering) cachedDerivedName(
	name string,
	start int,
) string {
	if existing := lowering.cachedDerivedNames[start]; existing != "" {
		return existing
	}
	base := "__exact_cached_" + name + "_"
	index := 1
	candidate := base + strconv.Itoa(index)
	for strings.Contains(lowering.sourceFile.Text(), candidate) {
		index++
		candidate = base + strconv.Itoa(index)
	}
	lowering.cachedDerivedNames[start] = candidate
	return candidate
}

func (lowering *jsxLowering) replaceMaterializedReferences(
	root *ast.Node,
	locals map[ast.SymbolId]materializedRenderLocal,
) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
				!isStaticPropertyName(node) {
				symbol := lowering.checker.GetSymbolAtLocation(node)
				if symbol != nil {
					if local, exists := locals[ast.GetSymbolId(symbol)]; exists {
						return lowering.factory.NewIdentifier(local.name)
					}
				}
			}
			updated := visitor.VisitEachChild(node)
			if updated != node {
				if identity := lowering.nodeIDs[node]; identity != "" {
					lowering.nodeIDs[updated] = identity
				}
			}
			return updated
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	return lowering.visitor.VisitNode(visitor.VisitNode(root))
}

func (lowering *jsxLowering) arrow(body *ast.Node) *ast.Node {
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) call(name string, arguments []*ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.factory.NewIdentifier(name),
		nil,
		nil,
		lowering.factory.NewNodeList(arguments),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) property(name *ast.Node, value *ast.Node) *ast.Node {
	return lowering.factory.NewPropertyAssignment(nil, name, nil, nil, value)
}

func (lowering *jsxLowering) lowerDerivedDeclaration(node *ast.Node) *ast.Node {
	declaration := node.AsVariableDeclaration()
	name := declaration.Name()
	if name == nil || !ast.IsIdentifier(name) || declaration.Initializer == nil {
		return nil
	}
	if _, exists := lowering.derived[name.Pos()]; !exists {
		return nil
	}
	closure := lowering.materializedClosure(
		declaration.Initializer,
		lowering.cachedDerivedLocals(declaration.Initializer),
	)
	if closure == nil {
		closure = lowering.arrow(lowering.visitor.VisitNode(declaration.Initializer))
	}
	value := lowering.call(
		lowering.names.derived,
		[]*ast.Node{closure},
	)
	return lowering.factory.UpdateVariableDeclaration(
		declaration,
		name,
		declaration.ExclamationToken,
		declaration.Type,
		value,
	)
}

func (lowering *jsxLowering) lowerDerivedReference(node *ast.Node) *ast.Node {
	if _, exists := lowering.derivedBindingAtReference(node); exists {
		return lowering.derivedGet(lowering.factory.NewIdentifier(node.Text()))
	}
	return nil
}

func (lowering *jsxLowering) derivedBindingAtReference(
	node *ast.Node,
) (ReactiveBinding, bool) {
	if lowering.checker == nil {
		return ReactiveBinding{}, false
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return ReactiveBinding{}, false
	}
	for _, declaration := range symbol.Declarations {
		name := declaration.Name()
		if name == nil {
			continue
		}
		if binding, exists := lowering.derived[name.Pos()]; exists {
			return binding, true
		}
	}
	return ReactiveBinding{}, false
}

func (lowering *jsxLowering) derivedGet(expression *ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			expression,
			nil,
			lowering.factory.NewIdentifier("get"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) lowerInvokedTaskOperationWork(
	work *ast.Node,
	operation InvokedTaskOperation,
) *ast.Node {
	dependencyCount := len(work.Parameters())
	hasAuthoredContext := taskWorkHasContextParameter(work, lowering.sourceFile)
	if hasAuthoredContext {
		dependencyCount--
	}
	signal, work := lowering.taskSignalExpression(work, dependencyCount)
	if !hasAuthoredContext && lowering.target == TargetServer && operation.Placement == "server" {
		parameters := append([]*ast.Node(nil), work.Parameters()...)
		context := parameters[len(parameters)-1].AsParameterDeclaration()
		parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
			context,
			context.Modifiers(),
			context.DotDotDotToken,
			context.Name(),
			context.QuestionToken,
			lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
			context.Initializer,
		)
		work = lowering.updateTaskWorkParameters(work, parameters)
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(current *ast.Node) *ast.Node {
			if current != work && isCallableNode(current) {
				return current
			}
			if write, exists := lowering.writes[nodeSpanKey(current)]; exists {
				mutation := lowering.lowerStateWrite(
					visitor.VisitEachChild(current),
					write,
				)
				if mutation != nil {
					return lowering.taskHelperCall(
						"taskMutation",
						lowering.names.taskMutation,
						[]*ast.Node{signal, lowering.arrow(mutation)},
					)
				}
			}
			if ast.IsAwaitExpression(current) {
				value := visitor.VisitNode(current.AsAwaitExpression().Expression)
				return lowering.factory.NewAwaitExpression(
					lowering.taskHelperCall(
						"taskAwait",
						lowering.names.taskAwait,
						[]*ast.Node{signal, value},
					),
				)
			}
			return visitor.VisitEachChild(current)
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	rewrittenWork := lowering.visitor.VisitEachChild(visitor.VisitNode(work))
	if lowering.target == TargetClient && operation.Placement == "server" {
		rewrittenWork = lowering.clientInvokedTaskContinuationWork(
			operation.ID,
			rewrittenWork,
		)
		if lowering.instrumentInspection {
			rewrittenWork = lowering.inspectionSource(operation.ID, rewrittenWork)
		}
		return rewrittenWork
	}
	if (lowering.target == TargetServer ||
		lowering.target == TargetDefault) &&
		(operation.Placement == "server" || operation.Placement == "isomorphic") {
		if lowering.target == TargetServer && operation.Placement == "server" {
			rewrittenWork = lowering.withoutTaskOptimisticStatements(
				rewrittenWork,
			)
		}
		rewrittenWork = lowering.taskHelperCall(
			"markComponentContinuationTask",
			lowering.names.taskContinuation,
			[]*ast.Node{
				lowering.factory.NewStringLiteral(operation.ID, ast.TokenFlagsNone),
				rewrittenWork,
			},
		)
	}
	if lowering.instrumentInspection {
		rewrittenWork = lowering.inspectionSource(operation.ID, rewrittenWork)
	}
	return rewrittenWork
}

func (lowering *jsxLowering) clientInvokedTaskContinuationWork(
	id string,
	work *ast.Node,
) *ast.Node {
	args := lowering.factory.NewIdentifier("__exactTaskArgs")
	context := lowering.factory.NewIdentifier("__exactTaskContext")
	contextValue := lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			args,
			nil,
			lowering.factory.NewIdentifier("pop"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		ast.NodeFlagsNone,
	)
	signal := lowering.factory.NewPropertyAccessExpression(
		context,
		nil,
		lowering.factory.NewIdentifier("signal"),
		ast.NodeFlagsNone,
	)
	generation := lowering.factory.NewPropertyAccessExpression(
		context,
		nil,
		lowering.factory.NewIdentifier("generation"),
		ast.NodeFlagsNone,
	)
	dispatch := lowering.taskHelperCall(
		"dispatchComponentContinuation",
		lowering.names.dispatchContinuation,
		[]*ast.Node{
			lowering.factory.NewAsExpression(
				lowering.factory.NewThisExpression(),
				lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
			),
			lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone),
			args,
			signal,
			lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(nil),
				false,
			),
			generation,
		},
	)
	statements := []*ast.Node{
		lowering.factory.NewVariableStatement(
			nil,
			lowering.factory.NewVariableDeclarationList(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewVariableDeclaration(
						context,
						nil,
						lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
						contextValue,
					),
				}),
				ast.NodeFlagsConst,
			),
		),
	}
	if prelude := lowering.taskOptimisticPrelude(work, args, context); prelude != nil {
		statements = append(statements, prelude)
	}
	statements = append(
		statements,
		lowering.factory.NewReturnStatement(dispatch),
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList(statements),
		true,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewParameterDeclaration(
				nil,
				lowering.factory.NewToken(ast.KindDotDotDotToken),
				args,
				nil,
				lowering.factory.NewArrayTypeNode(
					lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
				),
				nil,
			),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) taskOptimisticPrelude(
	work *ast.Node,
	args *ast.Node,
	context *ast.Node,
) *ast.Node {
	body := work.Body()
	if body == nil || !ast.IsBlock(body) {
		return nil
	}
	statements := []*ast.Node{}
	for _, statement := range body.AsBlock().Statements.Nodes {
		if taskOptimisticStatement(statement) {
			statements = append(statements, statement)
		}
	}
	if len(statements) == 0 {
		return nil
	}
	prelude := lowering.updateTaskWorkBody(
		work,
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList(statements),
			true,
		),
	)
	return lowering.factory.NewExpressionStatement(
		lowering.factory.NewCallExpression(
			lowering.factory.NewParenthesizedExpression(prelude),
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewSpreadElement(args),
				context,
			}),
			ast.NodeFlagsNone,
		),
	)
}

func (lowering *jsxLowering) withoutTaskOptimisticStatements(
	work *ast.Node,
) *ast.Node {
	body := work.Body()
	if body == nil || !ast.IsBlock(body) {
		return work
	}
	statements := []*ast.Node{}
	for _, statement := range body.AsBlock().Statements.Nodes {
		if !taskOptimisticStatement(statement) {
			statements = append(statements, statement)
		}
	}
	return lowering.updateTaskWorkBody(
		work,
		lowering.factory.NewBlock(
			lowering.factory.NewNodeList(statements),
			true,
		),
	)
}

func taskOptimisticStatement(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	if !ast.IsCallExpression(expression) {
		return false
	}
	callee := expression.AsCallExpression().Expression
	if ast.IsIdentifier(callee) {
		return callee.Text() == "optimistic"
	}
	return ast.IsPropertyAccessExpression(callee) &&
		callee.AsPropertyAccessExpression().Name().Text() == "optimistic"
}

func taskWorkHasContextParameter(
	work *ast.Node,
	sourceFile *ast.SourceFile,
) bool {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return false
	}
	last := parameters[len(parameters)-1]
	contextSource := sourceText(sourceFile, last)
	if strings.Contains(contextSource, "TaskContext") {
		return true
	}
	name := last.Name()
	if !ast.IsObjectBindingPattern(name) {
		return false
	}
	for _, element := range name.AsBindingPattern().Elements.Nodes {
		binding := element.AsBindingElement()
		property := binding.PropertyName
		if property == nil {
			property = binding.Name()
		}
		if ast.IsIdentifier(property) &&
			(property.Text() == "signal" ||
				property.Text() == "optimistic" ||
				property.Text() == "generation") {
			return true
		}
	}
	return false
}

type nativeTaskDependency struct {
	parameter    string
	expression   *ast.Node
	typeNode     *ast.Node
	readSpans    map[string]struct{}
	bindingStart int
	bindingName  string
	captureStart int
	captureEnd   int
}

func (lowering *jsxLowering) lowerTask(node *ast.Node, task Task) *ast.Node {
	if lowering.target == TargetServer && task.Placement == "client" {
		return lowering.factory.NewVoidExpression(
			lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
		)
	}
	if lowering.target == TargetClient && task.Placement == "server" {
		if component, exists := lowering.components[task.Component]; exists &&
			component.Placement == "server" {
			return lowering.factory.NewVoidExpression(
				lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
			)
		}
	}
	call := node.AsCallExpression()
	callee := call.Expression
	rebuiltTaskCallee := false
	arguments := []*ast.Node{}
	var work *ast.Node
	var captureArguments *ast.Node
	if task.FunctionDefined {
		if call.Arguments != nil {
			arguments = call.Arguments.Nodes
		}
		work = lowering.functionTaskWork(task)
		if work == nil {
			return lowering.visitor.VisitEachChild(node)
		}
		callee = lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewThisExpression(),
			nil,
			lowering.factory.NewIdentifier("task"),
			ast.NodeFlagsNone,
		)
		rebuiltTaskCallee = true
	} else {
		if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			return lowering.visitor.VisitEachChild(node)
		}
		arguments = call.Arguments.Nodes
		work = arguments[len(arguments)-1]
		if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
			return lowering.visitor.VisitEachChild(node)
		}
	}
	explicit := arguments
	if !task.FunctionDefined {
		explicit = arguments[:len(arguments)-1]
	}
	contextBindings := lowering.taskContextWriteBindings(work, task.ID)
	dependencies := []nativeTaskDependency{}
	nextArguments := []*ast.Node{}
	argumentOffset := 0
	if len(explicit) != 0 {
		for _, dependency := range explicit {
			if ast.IsIdentifier(dependency) {
				if _, derived := lowering.derivedBindingAtReference(dependency); derived {
					nextArguments = append(
						nextArguments,
						lowering.factory.NewIdentifier(dependency.Text()),
					)
					continue
				}
			}
			visited := lowering.visitor.VisitNode(dependency)
			if ast.IsArrowFunction(dependency) ||
				ast.IsFunctionExpression(dependency) {
				nextArguments = append(nextArguments, visited)
				continue
			}
			nextArguments = append(
				nextArguments,
				lowering.componentReactive(visited),
			)
		}
	} else {
		dependencies = lowering.inferredTaskDependencies(task, work)
		argumentOffset = len(dependencies)
		for _, dependency := range dependencies {
			nextArguments = append(
				nextArguments,
				lowering.componentReactive(dependency.expression),
			)
		}
	}
	runtimeArgumentCount := len(nextArguments)
	if task.FunctionDefined {
		captureArguments = lowering.taskCaptureArgumentResolver(
			work,
			argumentOffset,
			task.ArgumentCount,
		)
		if captureArguments != nil {
			work = lowering.eraseTaskCapturedParameterDefaults(
				work,
				task.ArgumentCount,
			)
		}
		runtimeArgumentCount = argumentOffset + task.ArgumentCount
		for captureArguments != nil && len(nextArguments) < runtimeArgumentCount {
			nextArguments = append(
				nextArguments,
				lowering.factory.NewAsExpression(
					lowering.factory.NewVoidExpression(
						lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
					),
					lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
				),
			)
		}
	}
	rewrittenWork := lowering.rewriteTaskWork(
		work,
		dependencies,
		task,
		// Runtime task context follows every activation dependency, including
		// authored dependencies that do not appear in the inferred plan.
		runtimeArgumentCount,
	)
	if lowering.target == TargetClient && task.Placement == "server" {
		if component, exists := lowering.components[task.Component]; exists &&
			component.Placement == "isomorphic" {
			rewrittenWork = lowering.clientContinuationWork(
				task,
				contextBindings,
			)
			rewrittenWork = lowering.taskHelperCall(
				"markComponentContinuationTask",
				lowering.names.taskContinuation,
				[]*ast.Node{
					lowering.factory.NewStringLiteral(
						task.ID,
						ast.TokenFlagsNone,
					),
					rewrittenWork,
				},
			)
			callee = lowering.factory.NewPropertyAccessExpression(
				lowering.factory.NewThisExpression(),
				nil,
				lowering.factory.NewIdentifier("task"),
				ast.NodeFlagsNone,
			)
			rebuiltTaskCallee = true
		}
	} else if lowering.target == TargetServer &&
		(task.Placement == "server" || task.Placement == "isomorphic") {
		if len(task.ResultWritePath) != 0 {
			rewrittenWork = lowering.stageTaskResult(
				rewrittenWork,
				task.ResultWritePath,
				false,
			)
		}
		rewrittenWork = lowering.taskHelperCall(
			"markComponentContinuationTask",
			lowering.names.taskContinuation,
			[]*ast.Node{
				lowering.factory.NewStringLiteral(task.ID, ast.TokenFlagsNone),
				rewrittenWork,
			},
		)
	} else if lowering.target == TargetDefault &&
		(task.Placement == "server" || task.Placement == "isomorphic") {
		if len(task.ResultWritePath) != 0 {
			rewrittenWork = lowering.stageTaskResult(
				rewrittenWork,
				task.ResultWritePath,
				true,
			)
		}
		rewrittenWork = lowering.taskHelperCall(
			"markComponentContinuationTask",
			lowering.names.taskContinuation,
			[]*ast.Node{
				lowering.factory.NewStringLiteral(task.ID, ast.TokenFlagsNone),
				rewrittenWork,
			},
		)
	}
	if lowering.instrumentInspection {
		rewrittenWork = lowering.inspectionSource(task.ID, rewrittenWork)
	}
	if !task.Invoked {
		defined := lowering.setupTaskDefinition(
			lowering.functionTaskLabel(task),
			rewrittenWork,
			task,
			runtimeArgumentCount,
			captureArguments,
		)
		taskCall := lowering.taskHelperCall(
			"activateTaskForHost",
			lowering.names.activateTask,
			append(
				[]*ast.Node{lowering.factory.NewThisExpression(), defined},
				nextArguments...,
			),
		)
		if len(contextBindings) == 0 {
			return taskCall
		}
		registration := lowering.taskHelperCall(
			"registerComponentContinuationContexts",
			lowering.names.registerContexts,
			[]*ast.Node{
				lowering.factory.NewThisExpression(),
				lowering.contextBindingArray(contextBindings),
			},
		)
		return lowering.factory.NewParenthesizedExpression(
			lowering.factory.NewBinaryExpression(
				nil,
				registration,
				nil,
				lowering.factory.NewToken(ast.KindCommaToken),
				taskCall,
			),
		)
	}
	nextArguments = append(nextArguments, rewrittenWork)
	if rebuiltTaskCallee && task.Priority == "deferred" {
		callee = lowering.factory.NewPropertyAccessExpression(
			callee,
			nil,
			lowering.factory.NewIdentifier("deferred"),
			ast.NodeFlagsNone,
		)
	}
	if task.Readiness == "blocking" &&
		(rebuiltTaskCallee || !containsString(task.Facets, "blocking")) {
		callee = lowering.factory.NewPropertyAccessExpression(
			callee,
			nil,
			lowering.factory.NewIdentifier("blocking"),
			ast.NodeFlagsNone,
		)
	}
	taskCall := lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(callee),
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList(nextArguments),
		call.Flags,
	)
	if len(contextBindings) == 0 {
		return taskCall
	}
	registration := lowering.taskHelperCall(
		"registerComponentContinuationContexts",
		lowering.names.registerContexts,
		[]*ast.Node{
			lowering.factory.NewAsExpression(
				lowering.factory.NewThisExpression(),
				lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
			),
			lowering.contextBindingArray(contextBindings),
		},
	)
	return lowering.factory.NewParenthesizedExpression(
		lowering.factory.NewBinaryExpression(
			nil,
			registration,
			nil,
			lowering.factory.NewToken(ast.KindCommaToken),
			taskCall,
		),
	)
}

func (lowering *jsxLowering) functionTaskLabel(task Task) string {
	label := "task"
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() != task.WorkStart || node.End()-node.Pos() != task.WorkLength {
			return true
		}
		if ast.IsFunctionDeclaration(node) && node.Name() != nil {
			label = node.Name().Text()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			name := node.Parent.AsVariableDeclaration().Name()
			if ast.IsIdentifier(name) {
				label = name.Text()
			}
		}
		return false
	})
	return label
}

func (lowering *jsxLowering) setupTaskDefinition(
	name string,
	work *ast.Node,
	task Task,
	dependencyCount int,
	captureArguments *ast.Node,
) *ast.Node {
	properties := []*ast.Node{
		lowering.property(
			lowering.factory.NewIdentifier("label"),
			lowering.factory.NewStringLiteral(name, ast.TokenFlagsNone),
		),
		lowering.property(
			lowering.factory.NewIdentifier("placement"),
			lowering.factory.NewStringLiteral(
				func() string {
					if task.RequestedPlacement == "" {
						return "current"
					}
					return task.RequestedPlacement
				}(),
				ast.TokenFlagsNone,
			),
		),
		lowering.property(
			lowering.factory.NewIdentifier("priority"),
			lowering.factory.NewStringLiteral(task.Priority, ast.TokenFlagsNone),
		),
		lowering.property(
			lowering.factory.NewIdentifier("concurrency"),
			lowering.factory.NewStringLiteral(
				func() string {
					if task.Concurrency == "" {
						return "latest"
					}
					return task.Concurrency
				}(),
				ast.TokenFlagsNone,
			),
		),
		lowering.property(
			lowering.factory.NewIdentifier("readiness"),
			lowering.factory.NewStringLiteral(task.Readiness, ast.TokenFlagsNone),
		),
	}
	if task.Detached {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("detached"),
				lowering.factory.NewTrueExpression(),
			),
		)
	}
	if captureArguments != nil {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("captureArguments"),
				captureArguments,
			),
		)
	}
	if key := lowering.taskConcurrencyKey(task, work, dependencyCount); key != nil {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("concurrencyKey"),
				key,
			),
		)
	}
	return lowering.taskHelperCall(
		"defineTask",
		lowering.names.defineTask,
		[]*ast.Node{
			lowering.factory.NewObjectLiteralExpression(
				lowering.factory.NewNodeList(properties),
				true,
			),
			work,
		},
	)
}

func (lowering *jsxLowering) functionTaskWork(task Task) *ast.Node {
	var declaration *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() == task.WorkStart &&
			node.End()-node.Pos() == task.WorkLength &&
			isCallableNode(node) {
			declaration = node
			return false
		}
		return declaration == nil
	})
	if declaration == nil {
		return nil
	}
	parameters := append([]*ast.Node(nil), declaration.Parameters()...)
	if len(parameters) != 0 {
		final := parameters[len(parameters)-1]
		if strings.Contains(sourceText(lowering.sourceFile, final), "TaskContext") {
			parameter := final.AsParameterDeclaration()
			parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
				parameter,
				parameter.Modifiers(),
				parameter.DotDotDotToken,
				parameter.Name(),
				parameter.QuestionToken,
				parameter.Type,
				nil,
			)
		}
	}
	return lowering.factory.NewArrowFunction(
		lowering.taskWorkModifiers(declaration),
		nil,
		lowering.factory.NewNodeList(parameters),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		declaration.Body(),
	)
}

func (lowering *jsxLowering) taskWorkModifiers(
	declaration *ast.Node,
) *ast.ModifierList {
	if !ast.HasSyntacticModifier(declaration, ast.ModifierFlagsAsync) {
		return nil
	}
	return lowering.factory.NewModifierList([]*ast.Node{
		lowering.factory.NewToken(ast.KindAsyncKeyword),
	})
}

func indexInvokedTasks(tasks []Task) map[int]Task {
	result := make(map[int]Task)
	for _, task := range tasks {
		if task.Invoked {
			result[task.WorkStart] = task
		}
	}
	return result
}

func indexFunctionTasks(tasks []Task) map[int]Task {
	result := make(map[int]Task)
	for _, task := range tasks {
		if task.FunctionDefined {
			result[task.WorkStart] = task
		}
	}
	return result
}

func indexFunctionTaskSymbols(
	tasks []Task,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[ast.SymbolId]Task {
	result := make(map[ast.SymbolId]Task)
	byStart := indexFunctionTasks(tasks)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		task, exists := byStart[node.Pos()]
		if !exists || node.End()-node.Pos() != task.WorkLength {
			return true
		}
		var name *ast.Node
		if ast.IsFunctionDeclaration(node) {
			name = node.Name()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			name = node.Parent.AsVariableDeclaration().Name()
		}
		if name == nil || !ast.IsIdentifier(name) {
			return true
		}
		symbol := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(name), typeChecker)
		if symbol != nil {
			result[ast.GetSymbolId(symbol)] = task
		}
		return true
	})
	return result
}

func indexFunctionTaskNames(
	tasks []Task,
	sourceFile *ast.SourceFile,
) map[string]Task {
	result := make(map[string]Task)
	ambiguous := make(map[string]struct{})
	byStart := indexFunctionTasks(tasks)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		task, exists := byStart[node.Pos()]
		if !exists || node.End()-node.Pos() != task.WorkLength {
			return true
		}
		name := ""
		if ast.IsFunctionDeclaration(node) && node.Name() != nil {
			name = node.Name().Text()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			declarationName := node.Parent.AsVariableDeclaration().Name()
			if ast.IsIdentifier(declarationName) {
				name = declarationName.Text()
			}
		}
		if name == "" {
			return true
		}
		if _, duplicate := result[name]; duplicate {
			delete(result, name)
			ambiguous[name] = struct{}{}
		} else if _, duplicate := ambiguous[name]; !duplicate {
			result[name] = task
		}
		return true
	})
	return result
}

func (lowering *jsxLowering) eraseFunctionTaskPolicy(
	declaration *ast.FunctionDeclaration,
) *ast.Node {
	visited := lowering.visitor.VisitEachChild(declaration.AsNode()).AsFunctionDeclaration()
	parameters := append([]*ast.Node(nil), visited.Parameters.Nodes...)
	if len(parameters) == 0 {
		return visited.AsNode()
	}
	final := parameters[len(parameters)-1]
	if !strings.Contains(sourceText(lowering.sourceFile, final), "TaskContext") {
		return visited.AsNode()
	}
	parameter := final.AsParameterDeclaration()
	parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
		parameter,
		parameter.Modifiers(),
		parameter.DotDotDotToken,
		parameter.Name(),
		parameter.QuestionToken,
		parameter.Type,
		nil,
	)
	return lowering.factory.UpdateFunctionDeclaration(
		visited,
		visited.Modifiers(),
		visited.AsteriskToken,
		visited.Name(),
		visited.TypeParameters,
		lowering.factory.NewNodeList(parameters),
		visited.Type,
		visited.FullSignature,
		visited.Body,
	)
}

func (lowering *jsxLowering) lowerInvokedTaskDeclaration(
	declaration *ast.FunctionDeclaration,
	task Task,
	operation *InvokedTaskOperation,
) *ast.Node {
	work := lowering.functionTaskWork(task)
	if work == nil || declaration.Name() == nil {
		return lowering.visitor.VisitEachChild(declaration.AsNode())
	}
	dependencyCount := len(declaration.Parameters.Nodes)
	if dependencyCount != 0 &&
		strings.Contains(
			sourceText(
				lowering.sourceFile,
				declaration.Parameters.Nodes[dependencyCount-1],
			),
			"TaskContext",
		) {
		dependencyCount--
	}
	bound := lowering.boundTaskDefinition(
		declaration.Name().Text(),
		work,
		task,
		operation,
		dependencyCount,
	)
	return lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					declaration.Name(),
					nil,
					nil,
					bound,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
}

func (lowering *jsxLowering) lowerInvokedTaskValue(
	declaration *ast.VariableDeclaration,
	task Task,
	operation *InvokedTaskOperation,
) *ast.Node {
	name := declaration.Name()
	work := lowering.functionTaskWork(task)
	if name == nil || !ast.IsIdentifier(name) || work == nil {
		return lowering.visitor.VisitEachChild(declaration.AsNode())
	}
	dependencyCount := len(work.Parameters())
	if dependencyCount != 0 &&
		strings.Contains(
			sourceText(
				lowering.sourceFile,
				work.Parameters()[dependencyCount-1],
			),
			"TaskContext",
		) {
		dependencyCount--
	}
	return lowering.factory.UpdateVariableDeclaration(
		declaration,
		name,
		declaration.ExclamationToken,
		declaration.Type,
		lowering.boundTaskDefinition(name.Text(), work, task, operation, dependencyCount),
	)
}

func (lowering *jsxLowering) boundTaskDefinition(
	name string,
	work *ast.Node,
	task Task,
	operation *InvokedTaskOperation,
	dependencyCount int,
) *ast.Node {
	captureArguments := lowering.taskCaptureArgumentResolver(
		work,
		0,
		dependencyCount,
	)
	if captureArguments != nil {
		work = lowering.eraseTaskCapturedParameterDefaults(
			work,
			dependencyCount,
		)
	}
	if operation != nil &&
		(operation.Placement == "server" || operation.Placement == "isomorphic") {
		work = lowering.lowerInvokedTaskOperationWork(work, *operation)
	} else {
		work = lowering.rewriteTaskWork(work, nil, task, dependencyCount)
	}
	properties := []*ast.Node{
		lowering.property(
			lowering.factory.NewIdentifier("label"),
			lowering.factory.NewStringLiteral(name, ast.TokenFlagsNone),
		),
		lowering.property(
			lowering.factory.NewIdentifier("placement"),
			lowering.factory.NewStringLiteral(
				func() string {
					if task.RequestedPlacement == "" {
						return "current"
					}
					return task.RequestedPlacement
				}(),
				ast.TokenFlagsNone,
			),
		),
		lowering.property(
			lowering.factory.NewIdentifier("priority"),
			lowering.factory.NewStringLiteral(task.Priority, ast.TokenFlagsNone),
		),
		lowering.property(
			lowering.factory.NewIdentifier("concurrency"),
			lowering.factory.NewStringLiteral(task.Concurrency, ast.TokenFlagsNone),
		),
		lowering.property(
			lowering.factory.NewIdentifier("readiness"),
			lowering.factory.NewStringLiteral(task.Readiness, ast.TokenFlagsNone),
		),
	}
	if task.Detached {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("detached"),
				lowering.factory.NewTrueExpression(),
			),
		)
	}
	if captureArguments != nil {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("captureArguments"),
				captureArguments,
			),
		)
	}
	if key := lowering.taskConcurrencyKey(task, work, dependencyCount); key != nil {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("concurrencyKey"),
				key,
			),
		)
	}
	options := lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		true,
	)
	defined := lowering.taskHelperCall(
		"defineTask",
		lowering.names.defineTask,
		[]*ast.Node{options, work},
	)
	bound := lowering.taskHelperCall(
		"bindTaskForHost",
		lowering.names.bindTask,
		[]*ast.Node{lowering.factory.NewThisExpression(), defined},
	)
	return bound
}

func (lowering *jsxLowering) taskConcurrencyKey(
	task Task,
	work *ast.Node,
	dependencyCount int,
) *ast.Node {
	if task.KeyLength == 0 {
		return nil
	}
	var expression *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() == task.KeyStart &&
			node.End()-node.Pos() == task.KeyLength {
			expression = node
			return false
		}
		return expression == nil
	})
	if expression == nil {
		return nil
	}
	parameters := append([]*ast.Node(nil), work.Parameters()...)
	if len(parameters) > dependencyCount {
		parameters = parameters[:dependencyCount]
	}
	for index, node := range parameters {
		parameter := node.AsParameterDeclaration()
		parameters[index] = lowering.factory.UpdateParameterDeclaration(
			parameter,
			parameter.Modifiers(),
			parameter.DotDotDotToken,
			parameter.Name(),
			parameter.QuestionToken,
			nil,
			parameter.Initializer,
		)
	}
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(parameters),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.visitor.VisitNode(expression),
	)
}

func (lowering *jsxLowering) eraseFunctionTaskValuePolicy(
	declaration *ast.VariableDeclaration,
) *ast.Node {
	visited := lowering.visitor.VisitEachChild(declaration.AsNode()).AsVariableDeclaration()
	work := visited.Initializer
	if work == nil || (!ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work)) {
		return visited.AsNode()
	}
	parameters := append([]*ast.Node(nil), work.Parameters()...)
	if len(parameters) == 0 ||
		!strings.Contains(
			sourceText(lowering.sourceFile, parameters[len(parameters)-1]),
			"TaskContext",
		) {
		return visited.AsNode()
	}
	parameter := parameters[len(parameters)-1].AsParameterDeclaration()
	parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
		parameter,
		parameter.Modifiers(),
		parameter.DotDotDotToken,
		parameter.Name(),
		parameter.QuestionToken,
		parameter.Type,
		nil,
	)
	return lowering.factory.UpdateVariableDeclaration(
		visited,
		visited.Name(),
		visited.ExclamationToken,
		visited.Type,
		lowering.updateTaskWorkParameters(work, parameters),
	)
}

// stageTaskResult turns an awaited task value assignment into continuation
// work. Client/default execution stages publication so an aborted generation
// cannot commit its result. Server executors already own cancellation and
// return the completed activation state, so they commit the write directly.
func (lowering *jsxLowering) stageTaskResult(
	work *ast.Node,
	path []string,
	staged bool,
) *ast.Node {
	args := lowering.factory.NewIdentifier("__exactTaskArgs")
	result := lowering.factory.NewIdentifier("__exactTaskResult")
	arguments := lowering.factory.NewSpreadElement(args)
	invocation := lowering.factory.NewCallExpression(
		lowering.factory.NewParenthesizedExpression(work),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{arguments}),
		ast.NodeFlagsNone,
	)
	resultDeclaration := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					result,
					nil,
					nil,
					lowering.factory.NewAwaitExpression(invocation),
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	context := lowering.factory.NewElementAccessExpression(
		args,
		nil,
		lowering.factory.NewBinaryExpression(
			nil,
			lowering.factory.NewPropertyAccessExpression(
				args,
				nil,
				lowering.factory.NewIdentifier("length"),
				ast.NodeFlagsNone,
			),
			nil,
			lowering.factory.NewToken(ast.KindMinusToken),
			lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone),
		),
		ast.NodeFlagsNone,
	)
	signal := lowering.factory.NewPropertyAccessExpression(
		context,
		nil,
		lowering.factory.NewIdentifier("signal"),
		ast.NodeFlagsNone,
	)
	write := lowering.call(
		lowering.names.write,
		[]*ast.Node{
			lowering.stateRoot(),
			lowering.statePath(path),
			lowering.arrow(result),
		},
	)
	publication := write
	if staged {
		publication = lowering.taskHelperCall(
			"stageTaskMutation",
			lowering.names.stageTaskMutation,
			[]*ast.Node{signal, lowering.arrow(write)},
		)
	}
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			resultDeclaration,
			lowering.factory.NewExpressionStatement(publication),
			lowering.factory.NewReturnStatement(result),
		}),
		true,
	)
	parameter := lowering.factory.NewParameterDeclaration(
		nil,
		lowering.factory.NewToken(ast.KindDotDotDotToken),
		args,
		nil,
		nil,
		nil,
	)
	return lowering.factory.NewArrowFunction(
		lowering.factory.NewModifierList([]*ast.Node{
			lowering.factory.NewModifier(ast.KindAsyncKeyword),
		}),
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) clientContinuationWork(
	task Task,
	contextBindings []continuationContextBinding,
) *ast.Node {
	args := lowering.factory.NewIdentifier("__exactTaskArgs")
	context := lowering.factory.NewIdentifier("__exactTaskContext")
	contextValue := lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			args,
			nil,
			lowering.factory.NewIdentifier("pop"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		ast.NodeFlagsNone,
	)
	signal := lowering.factory.NewPropertyAccessExpression(
		context,
		nil,
		lowering.factory.NewIdentifier("signal"),
		ast.NodeFlagsNone,
	)
	generation := lowering.factory.NewPropertyAccessExpression(
		context,
		nil,
		lowering.factory.NewIdentifier("generation"),
		ast.NodeFlagsNone,
	)
	dispatch := lowering.taskHelperCall(
		"dispatchComponentContinuation",
		lowering.names.dispatchContinuation,
		[]*ast.Node{
			lowering.factory.NewAsExpression(
				lowering.factory.NewThisExpression(),
				lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
			),
			lowering.factory.NewStringLiteral(task.ID, ast.TokenFlagsNone),
			args,
			signal,
			lowering.contextBindingArray(contextBindings),
			generation,
		},
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							context,
							nil,
							lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
							contextValue,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
			lowering.factory.NewReturnStatement(dispatch),
		}),
		true,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewParameterDeclaration(
				nil,
				lowering.factory.NewToken(ast.KindDotDotDotToken),
				args,
				nil,
				lowering.factory.NewArrayTypeNode(
					lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
				),
				nil,
			),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

type continuationContextBinding struct {
	name  string
	token *ast.Node
}

func indexContinuationContextWrites(
	continuations []Continuation,
) map[string][]string {
	result := make(map[string][]string)
	for _, continuation := range continuations {
		for _, effect := range continuation.Effects.ContextWrites {
			result[continuation.TaskID] = append(
				result[continuation.TaskID],
				effect.Token,
			)
		}
	}
	return result
}

func (lowering *jsxLowering) taskContextWriteBindings(
	work *ast.Node,
	taskID string,
) []continuationContextBinding {
	allowedValues := lowering.contextWrites[taskID]
	if len(allowedValues) == 0 {
		return nil
	}
	allowed := make(map[string]struct{}, len(allowedValues))
	for _, value := range allowedValues {
		allowed[value] = struct{}{}
	}
	result := []continuationContextBinding{}
	seen := make(map[string]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if node != work && ast.IsFunctionLike(node) {
			return false
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) ||
			call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
			return true
		}
		member := call.Expression.AsPropertyAccessExpression()
		if member.Expression.Kind != ast.KindThisKeyword ||
			member.Name() == nil || member.Name().Text() != "setContext" {
			return true
		}
		token := call.Arguments.Nodes[0]
		name := strings.TrimSpace(sourceText(lowering.sourceFile, token))
		if _, accepted := allowed[name]; !accepted {
			return true
		}
		if _, duplicate := seen[name]; duplicate {
			return true
		}
		seen[name] = struct{}{}
		result = append(result, continuationContextBinding{
			name:  name,
			token: token,
		})
		return true
	})
	return result
}

func (lowering *jsxLowering) contextBindingArray(
	bindings []continuationContextBinding,
) *ast.Node {
	values := make([]*ast.Node, 0, len(bindings))
	for _, binding := range bindings {
		values = append(values, lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.property(
					lowering.factory.NewIdentifier("name"),
					lowering.factory.NewStringLiteral(
						binding.name,
						ast.TokenFlagsNone,
					),
				),
				lowering.property(
					lowering.factory.NewIdentifier("token"),
					lowering.visitor.VisitNode(binding.token),
				),
			}),
			false,
		))
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(values),
		false,
	)
}

func (lowering *jsxLowering) inferredTaskDependencies(
	task Task,
	work *ast.Node,
) []nativeTaskDependency {
	analysisWork := work
	if task.FunctionDefined {
		if authored := nodeAtSpan(
			lowering.sourceFile.AsNode(),
			task.WorkStart,
			task.WorkLength,
		); authored != nil {
			analysisWork = authored
		}
	}
	capturedParameters := taskCaptureRanges(analysisWork, task.ArgumentCount)
	used := make(map[string]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = struct{}{}
		}
		return true
	})
	allocate := func(index int) string {
		base := "__exactDependency"
		if index != 0 {
			base += fmt.Sprintf("%d", index)
		}
		candidate := base
		for {
			if _, exists := used[candidate]; !exists {
				used[candidate] = struct{}{}
				return candidate
			}
			candidate += "_"
		}
	}
	requiredReads := make(map[string]struct{})
	for _, effect := range task.Reads {
		if effect.Kind == "read" {
			requiredReads[effect.Path] = struct{}{}
		}
	}
	updateTargets := stateUpdateTargetSpans(work)
	result := []nativeTaskDependency{}
	byPath := make(map[string]int)
	for _, read := range lowering.stateReads {
		if read.Component != task.Component ||
			read.Start < analysisWork.Pos() ||
			read.Start+read.Length > analysisWork.End() {
			continue
		}
		if spanInsideTaskCapture(
			read.Start,
			read.Start+read.Length,
			capturedParameters,
		) {
			continue
		}
		path := strings.Join(read.Path, ".")
		if _, required := requiredReads[path]; !required {
			continue
		}
		if _, updated := updateTargets[[2]int{read.Start, read.Start + read.Length}]; updated {
			continue
		}
		key := path
		if read.Confidence != "exact" {
			key = fmt.Sprintf("%s@%d", path, read.Start)
		}
		index, exists := byPath[key]
		if !exists {
			index = len(result)
			byPath[key] = index
			expression := lowering.stateValue(read.Path)
			typeLocation := nodeAtSpan(analysisWork, read.Start, read.Length)
			if read.Confidence != "exact" {
				expression = typeLocation
				if expression == nil {
					continue
				}
			}
			result = append(result, nativeTaskDependency{
				parameter:    allocate(index),
				expression:   expression,
				typeNode:     lowering.taskDependencyType(typeLocation),
				readSpans:    make(map[string]struct{}),
				captureStart: read.Start,
				captureEnd:   read.Start + read.Length,
			})
		}
		result[index].readSpans[fmt.Sprintf("%d:%d", read.Start, read.Length)] =
			struct{}{}
	}
	for _, name := range task.ReactiveDependencies {
		binding, exists := lowering.taskBinding(task.Component, name)
		if !exists {
			continue
		}
		if task.Placement == "server" &&
			binding.Provenance == "context" {
			continue
		}
		expression, start, end := taskBindingCapture(
			analysisWork,
			binding,
			lowering.checker,
		)
		if expression == nil {
			expression = lowering.factory.NewIdentifier(name)
		}
		typeNode := lowering.taskDependencyType(expression)
		if captureContainedByTaskDependency(start, end, result) {
			continue
		}
		if _, derived := lowering.derived[binding.Start]; derived {
			expression = lowering.derivedGet(expression)
		}
		index := len(result)
		spans := make(map[string]struct{})
		bindingStart := binding.Start
		bindingName := name
		if start != 0 && end > start {
			spans[fmt.Sprintf("%d:%d", start, end-start)] = struct{}{}
			bindingStart = 0
			bindingName = ""
		}
		result = append(result, nativeTaskDependency{
			parameter:    allocate(index),
			expression:   expression,
			typeNode:     typeNode,
			readSpans:    spans,
			bindingStart: bindingStart,
			bindingName:  bindingName,
			captureStart: start,
			captureEnd:   end,
		})
	}
	return result
}

func (lowering *jsxLowering) taskDependencyType(location *ast.Node) *ast.Node {
	if location == nil || lowering.checker == nil {
		return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
	}
	value := lowering.checker.GetTypeAtLocation(location)
	if value == nil {
		return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
	}
	if element := lowering.checker.GetElementTypeOfArrayType(value); element != nil {
		elementNode := lowering.checker.TypeToTypeNode(
			element,
			location,
			nodebuilder.FlagsNoTruncation|nodebuilder.FlagsInTypeAlias,
			nil,
		)
		if elementNode != nil {
			return lowering.factory.NewArrayTypeNode(elementNode)
		}
	}
	switch lowering.checker.TypeToString(value) {
	case "string":
		return lowering.factory.NewKeywordTypeNode(ast.KindStringKeyword)
	case "number":
		return lowering.factory.NewKeywordTypeNode(ast.KindNumberKeyword)
	case "boolean":
		return lowering.factory.NewKeywordTypeNode(ast.KindBooleanKeyword)
	case "bigint":
		return lowering.factory.NewKeywordTypeNode(ast.KindBigIntKeyword)
	}
	// Generated artifacts can live in a different directory than their authored
	// source. Avoid emitting source-relative import() types here; `any` retains
	// contextual typing where no portable structural annotation is available.
	return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
}

func nodeAtSpan(root *ast.Node, start int, length int) *ast.Node {
	var result *ast.Node
	walkNode(root, func(node *ast.Node) bool {
		if node.Pos() == start && node.End()-node.Pos() == length {
			result = node
			return false
		}
		return result == nil
	})
	return result
}

func taskBindingCapture(
	work *ast.Node,
	binding ReactiveBinding,
	typeChecker *checker.Checker,
) (*ast.Node, int, int) {
	var capture *ast.Node
	walkNode(work, func(node *ast.Node) bool {
		if capture != nil || !ast.IsIdentifier(node) ||
			ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return capture == nil
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		matches := false
		for _, declaration := range symbol.Declarations {
			if name := declaration.Name(); name != nil &&
				name.Pos() == binding.Start {
				matches = true
				break
			}
		}
		if !matches {
			return true
		}
		capture = node
		for capture.Parent != nil {
			parent := capture.Parent
			if ast.IsPropertyAccessExpression(parent) &&
				parent.AsPropertyAccessExpression().Expression == capture {
				capture = parent
				continue
			}
			if ast.IsElementAccessExpression(parent) &&
				parent.AsElementAccessExpression().Expression == capture {
				capture = parent
				continue
			}
			break
		}
		return false
	})
	if capture == nil {
		return nil, 0, 0
	}
	return capture, capture.Pos(), capture.End()
}

func captureContainedByTaskDependency(
	start int,
	end int,
	dependencies []nativeTaskDependency,
) bool {
	if start == 0 || end <= start {
		return false
	}
	for _, dependency := range dependencies {
		if dependency.captureStart <= start &&
			dependency.captureEnd >= end {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) rewriteTaskWork(
	work *ast.Node,
	dependencies []nativeTaskDependency,
	task Task,
	dependencyCount int,
) *ast.Node {
	callsTaskDefinition := lowering.taskWorkCallsDefinition(work)
	replacements := make(map[string]string)
	for _, dependency := range dependencies {
		for span := range dependency.readSpans {
			replacements[span] = dependency.parameter
		}
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if parameter, exists := replacements[nodeSpanKey(node)]; exists {
				return lowering.factory.NewIdentifier(parameter)
			}
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
				!isStaticPropertyName(node) {
				for _, dependency := range dependencies {
					if dependency.bindingStart != 0 &&
						node.Text() == dependency.bindingName &&
						lowering.identifierMatchesBinding(
							node,
							dependency.bindingStart,
						) {
						return lowering.factory.NewIdentifier(
							dependency.parameter,
						)
					}
				}
			}
			return visitor.VisitEachChild(node)
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	rewritten := visitor.VisitNode(work)
	if len(dependencies) != 0 {
		rewritten = lowering.prependTaskParameters(rewritten, dependencies)
	}
	rewritten = lowering.manageTaskWork(
		rewritten,
		task,
		dependencyCount,
		callsTaskDefinition,
	)
	return lowering.visitor.VisitEachChild(rewritten)
}

func (lowering *jsxLowering) manageTaskWork(
	work *ast.Node,
	task Task,
	dependencyCount int,
	callsTaskDefinition bool,
) *ast.Node {
	if len(task.Resources) == 0 && len(task.SignalCalls) == 0 &&
		len(task.Writes) == 0 && !taskContainsAwait(work) &&
		!callsTaskDefinition {
		return work
	}
	var signal *ast.Node
	var context *ast.Node
	if callsTaskDefinition {
		context, work = lowering.ensureTaskContextParameter(work, dependencyCount)
	}
	if context != nil {
		signal = lowering.factory.NewPropertyAccessExpression(
			context,
			nil,
			lowering.factory.NewIdentifier("signal"),
			ast.NodeFlagsNone,
		)
	} else {
		signal, work = lowering.taskSignalExpression(work, dependencyCount)
		context = taskContextExpression(work, dependencyCount)
	}
	resources := make(map[string]TaskResource, len(task.Resources))
	for _, resource := range task.Resources {
		resources[fmt.Sprintf("%d:%d", resource.Start, resource.Length)] = resource
	}
	signals := make(map[string]TaskSignalCall, len(task.SignalCalls))
	for _, call := range task.SignalCalls {
		signals[fmt.Sprintf("%d:%d", call.Start, call.Length)] = call
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsExpressionStatement(node) {
				expression := node.AsExpressionStatement().Expression
				if write, exists := lowering.writes[nodeSpanKey(expression)]; exists {
					if write.Operation == "assignment" &&
						ast.IsBinaryExpression(expression) &&
						expression.AsBinaryExpression().OperatorToken.Kind ==
							ast.KindEqualsToken {
						value := visitor.VisitNode(
							expression.AsBinaryExpression().Right,
						)
						if lowering.target == TargetServer ||
							task.Readiness != "blocking" {
							return lowering.directTaskAssignment(
								value,
								write,
								expression.Pos(),
							)
						}
						return lowering.stagedTaskAssignment(
							value,
							write,
							signal,
							expression.Pos(),
						)
					}
					var mutation *ast.Node
					if lowering.target == TargetServer &&
						(write.Operation == "map-mutation" ||
							write.Operation == "set-mutation") {
						mutation = lowering.lowerServerTaskCollectionWrite(
							expression,
							write,
							signal,
						)
					} else {
						mutation = lowering.lowerStateWrite(expression, write)
					}
					if mutation != nil {
						if lowering.target == TargetServer ||
							task.Readiness != "blocking" {
							return lowering.factory.NewExpressionStatement(mutation)
						}
						stage := lowering.taskHelperCall(
							"stageTaskMutation",
							lowering.names.stageTaskMutation,
							[]*ast.Node{
								signal,
								lowering.arrow(mutation),
							},
						)
						return lowering.factory.NewExpressionStatement(stage)
					}
				}
			}
			if context != nil && ast.IsCallExpression(node) {
				call := node.AsCallExpression()
				if lowering.taskDefinitionCall(call.Expression) {
					arguments := []*ast.Node{
						context,
						visitor.VisitNode(call.Expression),
					}
					if call.Arguments != nil {
						for _, argument := range call.Arguments.Nodes {
							arguments = append(arguments, visitor.VisitNode(argument))
						}
					}
					return lowering.taskHelperCall(
						"invokeTask",
						lowering.names.invokeTask,
						arguments,
					)
				}
			}
			if resource, exists := resources[nodeSpanKey(node)]; exists {
				return lowering.lowerTaskResource(
					node,
					resource,
					signal,
					visitor,
				)
			}
			if signalCall, exists := signals[nodeSpanKey(node)]; exists {
				return lowering.lowerTaskSignalCall(
					node,
					signalCall,
					signal,
					visitor,
				)
			}
			if ast.IsAwaitExpression(node) {
				argument := visitor.VisitNode(node.AsAwaitExpression().Expression)
				return lowering.factory.NewAwaitExpression(
					lowering.taskHelperCall(
						"taskAwait",
						lowering.names.taskAwait,
						[]*ast.Node{signal, argument},
					),
				)
			}
			return visitor.VisitEachChild(node)
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	body := visitor.VisitNode(work.Body())
	return lowering.updateTaskWorkBody(work, body)
}

func (lowering *jsxLowering) taskWorkCallsDefinition(work *ast.Node) bool {
	found := false
	walkNode(work.Body(), func(node *ast.Node) bool {
		if found || !ast.IsCallExpression(node) {
			return !found
		}
		call := node.AsCallExpression()
		found = lowering.taskDefinitionCall(call.Expression)
		return !found
	})
	return found
}

func (lowering *jsxLowering) taskDefinitionCall(expression *ast.Node) (found bool) {
	if expression == nil ||
		expression.Pos() < 0 ||
		expression.End() < expression.Pos() ||
		expression.End() > len(lowering.sourceFile.Text()) {
		return false
	}
	if ast.IsIdentifier(expression) {
		if _, exists := lowering.taskDefinitionNames[expression.Text()]; exists {
			return true
		}
	}
	defer func() {
		if recover() != nil {
			found = false
		}
	}()
	symbol := resolvedCallableSymbol(
		callTargetSymbol(expression, lowering.checker),
		lowering.checker,
	)
	if symbol != nil {
		_, found = lowering.taskDefinitions[ast.GetSymbolId(symbol)]
	}
	return found
}

func (lowering *jsxLowering) ensureTaskContextParameter(
	work *ast.Node,
	dependencyCount int,
) (*ast.Node, *ast.Node) {
	parameters := append([]*ast.Node(nil), work.Parameters()...)
	if len(parameters) > dependencyCount {
		final := parameters[len(parameters)-1].AsParameterDeclaration()
		name := final.Name()
		if ast.IsIdentifier(name) {
			return name, work
		}
		context := lowering.factory.NewIdentifier("__exactTaskContext")
		parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
			final,
			final.Modifiers(),
			final.DotDotDotToken,
			context,
			final.QuestionToken,
			final.Type,
			nil,
		)
		binding := lowering.factory.NewVariableStatement(
			nil,
			lowering.factory.NewVariableDeclarationList(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewVariableDeclaration(
						name,
						nil,
						nil,
						context,
					),
				}),
				ast.NodeFlagsConst,
			),
		)
		body := work.Body()
		statements := []*ast.Node{binding}
		if ast.IsBlock(body) {
			statements = append(statements, body.AsBlock().Statements.Nodes...)
		} else {
			statements = append(statements, lowering.factory.NewReturnStatement(body))
		}
		work = lowering.updateTaskWorkParameters(work, parameters)
		work = lowering.updateTaskWorkBody(
			work,
			lowering.factory.NewBlock(
				lowering.factory.NewNodeList(statements),
				true,
			),
		)
		return context, work
	}
	context := lowering.factory.NewIdentifier("__exactTaskContext")
	parameters = append(
		parameters,
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			context,
			nil,
			nil,
			nil,
		),
	)
	return context, lowering.updateTaskWorkParameters(work, parameters)
}

func taskContextExpression(work *ast.Node, dependencyCount int) *ast.Node {
	parameters := work.Parameters()
	if len(parameters) <= dependencyCount {
		return nil
	}
	name := parameters[len(parameters)-1].Name()
	if !ast.IsIdentifier(name) {
		return nil
	}
	return name
}

func (lowering *jsxLowering) lowerServerTaskCollectionWrite(
	node *ast.Node,
	write StateWrite,
	signal *ast.Node,
) *ast.Node {
	if !ast.IsCallExpression(node) ||
		!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
		return nil
	}
	call := node.AsCallExpression()
	method := call.Expression.AsPropertyAccessExpression().Name().Text()
	arguments := []*ast.Node{}
	if call.Arguments != nil {
		for _, argument := range call.Arguments.Nodes {
			arguments = append(arguments, lowering.visitor.VisitNode(argument))
		}
	}
	kind := "map"
	if write.Operation == "set-mutation" {
		kind = "set"
	}
	return lowering.taskHelperCall(
		"mutateTaskCollection",
		lowering.names.taskCollectionMutation,
		[]*ast.Node{
			signal,
			lowering.stateWriteRoot(write),
			lowering.stateWritePathNode(write),
			lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(method, ast.TokenFlagsNone),
			lowering.arrow(
				lowering.factory.NewArrayLiteralExpression(
					lowering.factory.NewNodeList(arguments),
					false,
				),
			),
		},
	)
}

func (lowering *jsxLowering) directTaskAssignment(
	value *ast.Node,
	writeEffect StateWrite,
	position int,
) *ast.Node {
	writeValue := value
	statements := []*ast.Node{}
	if ast.IsAwaitExpression(value) {
		local := lowering.factory.NewIdentifier(
			fmt.Sprintf("__exactTaskMutation_%d", position),
		)
		statements = append(
			statements,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							local,
							nil,
							nil,
							value,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
		writeValue = local
	}
	write := lowering.call(
		lowering.names.write,
		[]*ast.Node{
			lowering.stateWriteRoot(writeEffect),
			lowering.stateWritePathNode(writeEffect),
			lowering.arrow(writeValue),
		},
	)
	statements = append(
		statements,
		lowering.factory.NewExpressionStatement(write),
	)
	if len(statements) == 1 {
		return statements[0]
	}
	return lowering.factory.NewBlock(
		lowering.factory.NewNodeList(statements),
		true,
	)
}

func (lowering *jsxLowering) stagedTaskAssignment(
	value *ast.Node,
	writeEffect StateWrite,
	signal *ast.Node,
	position int,
) *ast.Node {
	writeValue := value
	statements := []*ast.Node{}
	if ast.IsAwaitExpression(value) {
		local := lowering.factory.NewIdentifier(
			fmt.Sprintf("__exactTaskMutation_%d", position),
		)
		statements = append(
			statements,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							local,
							nil,
							nil,
							value,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
		writeValue = local
	}
	write := lowering.call(
		lowering.names.write,
		[]*ast.Node{
			lowering.stateWriteRoot(writeEffect),
			lowering.stateWritePathNode(writeEffect),
			lowering.arrow(writeValue),
		},
	)
	stage := lowering.taskHelperCall(
		"stageTaskMutation",
		lowering.names.stageTaskMutation,
		[]*ast.Node{signal, lowering.arrow(write)},
	)
	statements = append(
		statements,
		lowering.factory.NewExpressionStatement(stage),
	)
	if len(statements) == 1 {
		return statements[0]
	}
	return lowering.factory.NewBlock(
		lowering.factory.NewNodeList(statements),
		true,
	)
}

func (lowering *jsxLowering) lowerTaskSignalCall(
	node *ast.Node,
	signalCall TaskSignalCall,
	signal *ast.Node,
	visitor *ast.NodeVisitor,
) *ast.Node {
	if !ast.IsCallExpression(node) {
		return visitor.VisitEachChild(node)
	}
	visited := visitor.VisitEachChild(node)
	call := visited.AsCallExpression()
	arguments := callArguments(visited)
	for len(arguments) <= signalCall.Parameter {
		arguments = append(arguments, lowering.factory.NewIdentifier("undefined"))
	}
	existing := arguments[signalCall.Parameter]
	switch {
	case signalCall.EventOptions:
		arguments[signalCall.Parameter] = lowering.taskHelperCall(
			"withAbortSignal",
			lowering.names.abortOptions,
			[]*ast.Node{existing, signal},
		)
	case signalCall.Mode == "options":
		arguments[signalCall.Parameter] = lowering.taskHelperCall(
			"withTaskSignal",
			lowering.names.taskOptions,
			[]*ast.Node{existing, signal},
		)
	default:
		combined := []*ast.Node{signal}
		if !isUndefinedIdentifier(existing) {
			combined = append(combined, existing)
		}
		arguments[signalCall.Parameter] = lowering.taskHelperCall(
			"combineTaskSignal",
			lowering.names.taskCombined,
			combined,
		)
	}
	return lowering.factory.NewCallExpression(
		call.Expression,
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList(arguments),
		call.Flags,
	)
}

func isUndefinedIdentifier(node *ast.Node) bool {
	return ast.IsIdentifier(node) && node.Text() == "undefined"
}

func (lowering *jsxLowering) taskSignalExpression(
	work *ast.Node,
	dependencyCount int,
) (*ast.Node, *ast.Node) {
	parameters := append([]*ast.Node(nil), work.Parameters()...)
	if len(parameters) > dependencyCount {
		context := parameters[len(parameters)-1]
		name := context.Name()
		if ast.IsIdentifier(name) {
			return lowering.factory.NewPropertyAccessExpression(
				name,
				nil,
				lowering.factory.NewIdentifier("signal"),
				ast.NodeFlagsNone,
			), work
		}
		if ast.IsObjectBindingPattern(name) {
			for _, element := range name.AsBindingPattern().Elements.Nodes {
				binding := element.AsBindingElement()
				property := binding.PropertyName
				local := binding.Name()
				if property == nil {
					property = local
				}
				if ast.IsIdentifier(property) && property.Text() == "signal" &&
					ast.IsIdentifier(local) {
					return local, work
				}
			}
			local := lowering.factory.NewIdentifier(lowering.names.taskSignal)
			pattern := name.AsBindingPattern()
			elements := append([]*ast.Node(nil), pattern.Elements.Nodes...)
			elements = append(
				elements,
				lowering.factory.NewBindingElement(
					nil,
					lowering.factory.NewIdentifier("signal"),
					local,
					nil,
				),
			)
			nextName := lowering.factory.UpdateBindingPattern(
				pattern,
				lowering.factory.NewNodeList(elements),
			)
			parameter := context.AsParameterDeclaration()
			parameters[len(parameters)-1] = lowering.factory.UpdateParameterDeclaration(
				parameter,
				parameter.Modifiers(),
				parameter.DotDotDotToken,
				nextName,
				parameter.QuestionToken,
				parameter.Type,
				parameter.Initializer,
			)
			return local, lowering.updateTaskWorkParameters(work, parameters)
		}
	}
	local := lowering.factory.NewIdentifier(lowering.names.taskSignal)
	pattern := lowering.factory.NewBindingPattern(
		ast.KindObjectBindingPattern,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewBindingElement(
				nil,
				lowering.factory.NewIdentifier("signal"),
				local,
				nil,
			),
		}),
	)
	parameters = append(
		parameters,
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			pattern,
			nil,
			nil,
			nil,
		),
	)
	return local, lowering.updateTaskWorkParameters(work, parameters)
}

func (lowering *jsxLowering) lowerTaskResource(
	node *ast.Node,
	resource TaskResource,
	signal *ast.Node,
	visitor *ast.NodeVisitor,
) *ast.Node {
	visited := visitor.VisitEachChild(node)
	switch resource.Kind {
	case "timeout":
		return lowering.taskHelperCall(
			"taskTimeout",
			lowering.names.taskTimeout,
			append([]*ast.Node{signal}, callArguments(visited)...),
		)
	case "interval":
		return lowering.taskHelperCall(
			"taskInterval",
			lowering.names.taskInterval,
			append([]*ast.Node{signal}, callArguments(visited)...),
		)
	case "animation-frame":
		return lowering.taskHelperCall(
			"taskAnimationFrame",
			lowering.names.taskAnimation,
			append([]*ast.Node{signal}, callArguments(visited)...),
		)
	case "idle-callback":
		return lowering.taskHelperCall(
			"taskIdleCallback",
			lowering.names.taskIdle,
			append([]*ast.Node{signal}, callArguments(visited)...),
		)
	case "fetch":
		if !ast.IsCallExpression(visited) {
			return visited
		}
		call := visited.AsCallExpression()
		arguments := []*ast.Node{signal, call.Expression}
		arguments = append(arguments, callArguments(visited)...)
		return lowering.taskHelperCall(
			"taskFetch",
			lowering.names.taskFetch,
			arguments,
		)
	case "observer":
		return lowering.taskHelperCall(
			"taskObserver",
			lowering.names.taskObserver,
			[]*ast.Node{signal, visited},
		)
	case "owned":
		arguments := []*ast.Node{signal, visited}
		if resource.Disposal != "" {
			arguments = append(
				arguments,
				lowering.factory.NewStringLiteral(
					resource.Disposal,
					ast.TokenFlagsNone,
				),
			)
		}
		return lowering.taskHelperCall(
			"ownTaskResource",
			lowering.names.taskResource,
			arguments,
		)
	default:
		return visited
	}
}

func (lowering *jsxLowering) taskHelperCall(
	imported string,
	local string,
	arguments []*ast.Node,
) *ast.Node {
	lowering.taskHelpers[imported] = local
	return lowering.call(local, arguments)
}

func (lowering *jsxLowering) inspectionSource(
	id string,
	work *ast.Node,
) *ast.Node {
	return lowering.taskHelperCall(
		"markExactInspectionSource",
		lowering.names.inspectionSource,
		[]*ast.Node{
			lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone),
			work,
		},
	)
}

func callArguments(node *ast.Node) []*ast.Node {
	if !ast.IsCallExpression(node) || node.AsCallExpression().Arguments == nil {
		return nil
	}
	return append([]*ast.Node(nil), node.AsCallExpression().Arguments.Nodes...)
}

func taskContainsAwait(work *ast.Node) bool {
	found := false
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsAwaitExpression(node) {
			found = true
			return false
		}
		return !isCallableNode(node) || node == work
	})
	return found
}

func (lowering *jsxLowering) updateTaskWorkParameters(
	work *ast.Node,
	parameters []*ast.Node,
) *ast.Node {
	list := lowering.factory.NewNodeList(parameters)
	if ast.IsArrowFunction(work) {
		arrow := work.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(
			arrow,
			arrow.Modifiers(),
			arrow.TypeParameters,
			list,
			arrow.Type,
			arrow.FullSignature,
			arrow.EqualsGreaterThanToken,
			arrow.Body,
		)
	}
	function := work.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(
		function,
		function.Modifiers(),
		function.AsteriskToken,
		function.Name(),
		function.TypeParameters,
		list,
		function.Type,
		function.FullSignature,
		function.Body,
	)
}

func (lowering *jsxLowering) updateTaskWorkBody(
	work *ast.Node,
	body *ast.Node,
) *ast.Node {
	if ast.IsArrowFunction(work) {
		arrow := work.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(
			arrow,
			arrow.Modifiers(),
			arrow.TypeParameters,
			arrow.Parameters,
			arrow.Type,
			arrow.FullSignature,
			arrow.EqualsGreaterThanToken,
			body,
		)
	}
	function := work.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(
		function,
		function.Modifiers(),
		function.AsteriskToken,
		function.Name(),
		function.TypeParameters,
		function.Parameters,
		function.Type,
		function.FullSignature,
		body,
	)
}

func (lowering *jsxLowering) prependTaskParameters(
	work *ast.Node,
	dependencies []nativeTaskDependency,
) *ast.Node {
	parameters := make([]*ast.Node, 0, len(dependencies)+len(work.Parameters()))
	for _, dependency := range dependencies {
		parameters = append(
			parameters,
			lowering.factory.NewParameterDeclaration(
				nil,
				nil,
				lowering.factory.NewIdentifier(dependency.parameter),
				nil,
				dependency.typeNode,
				nil,
			),
		)
	}
	parameters = append(parameters, work.Parameters()...)
	list := lowering.factory.NewNodeList(parameters)
	if ast.IsArrowFunction(work) {
		arrow := work.AsArrowFunction()
		return lowering.factory.UpdateArrowFunction(
			arrow,
			arrow.Modifiers(),
			arrow.TypeParameters,
			list,
			arrow.Type,
			arrow.FullSignature,
			arrow.EqualsGreaterThanToken,
			arrow.Body,
		)
	}
	function := work.AsFunctionExpression()
	return lowering.factory.UpdateFunctionExpression(
		function,
		function.Modifiers(),
		function.AsteriskToken,
		function.Name(),
		function.TypeParameters,
		list,
		function.Type,
		function.FullSignature,
		function.Body,
	)
}

func (lowering *jsxLowering) componentReactive(expression *ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewThisExpression(),
			nil,
			lowering.factory.NewIdentifier("reactive"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{lowering.arrow(expression)}),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) stateValue(path []string) *ast.Node {
	result := lowering.stateRoot()
	for _, segment := range path {
		if scanner.IsIdentifierText(segment, core.LanguageVariantStandard) {
			result = lowering.factory.NewPropertyAccessExpression(
				result,
				nil,
				lowering.factory.NewIdentifier(segment),
				ast.NodeFlagsNone,
			)
		} else {
			result = lowering.factory.NewElementAccessExpression(
				result,
				nil,
				lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
				ast.NodeFlagsNone,
			)
		}
	}
	return result
}

func (lowering *jsxLowering) taskBinding(
	component string,
	name string,
) (ReactiveBinding, bool) {
	for _, binding := range lowering.bindings {
		if binding.Component == component && binding.Name == name {
			return binding, true
		}
	}
	return ReactiveBinding{}, false
}

func (lowering *jsxLowering) identifierMatchesBinding(
	identifier *ast.Node,
	start int,
) bool {
	if lowering.checker == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if name := declaration.Name(); name != nil && name.Pos() == start {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) lowerStateWrite(
	node *ast.Node,
	write StateWrite,
) *ast.Node {
	switch write.Operation {
	case "assignment", "update":
		if !ast.IsBinaryExpression(node) {
			if write.Operation == "update" {
				return lowering.lowerStateUpdate(node, write)
			}
			return nil
		}
		expression := node.AsBinaryExpression()
		if expression.OperatorToken.Kind == ast.KindEqualsToken {
			if taskNode, task, exists := lowering.assignedTask(expression.Right); exists {
				return lowering.lowerTask(taskNode, task)
			}
		}
		value := lowering.visitor.VisitNode(expression.Right)
		if expression.OperatorToken.Kind == ast.KindEqualsToken {
			return lowering.call(
				lowering.names.write,
				[]*ast.Node{
					lowering.stateWriteRoot(write),
					lowering.stateWritePathNode(write),
					lowering.arrow(value),
				},
			)
		}
		operator, exists := compoundStateOperator(expression.OperatorToken.Kind)
		if !exists {
			return nil
		}
		previous := lowering.factory.NewIdentifier("previous")
		updated := lowering.factory.NewBinaryExpression(
			nil,
			previous,
			nil,
			lowering.factory.NewToken(operator),
			value,
		)
		return lowering.call(
			lowering.names.update,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.arrowWithParameter(previous, updated),
			},
		)
	case "delete":
		return lowering.call(
			lowering.names.delete,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
			},
		)
	case "array-mutation":
		if !ast.IsCallExpression(node) ||
			!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
			return nil
		}
		call := node.AsCallExpression()
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		arguments := []*ast.Node{}
		if call.Arguments != nil {
			for _, argument := range call.Arguments.Nodes {
				arguments = append(arguments, lowering.visitor.VisitNode(argument))
			}
		}
		return lowering.call(
			lowering.names.arrayMutation,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.factory.NewStringLiteral(method, ast.TokenFlagsNone),
				lowering.arrow(
					lowering.factory.NewArrayLiteralExpression(
						lowering.factory.NewNodeList(arguments),
						false,
					),
				),
			},
		)
	case "map-mutation", "set-mutation":
		if !ast.IsCallExpression(node) ||
			!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
			return nil
		}
		call := node.AsCallExpression()
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		arguments := []*ast.Node{}
		if call.Arguments != nil {
			for _, argument := range call.Arguments.Nodes {
				arguments = append(arguments, lowering.visitor.VisitNode(argument))
			}
		}
		kind := "map"
		if write.Operation == "set-mutation" {
			kind = "set"
		}
		return lowering.call(
			lowering.names.collectionMutation,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(method, ast.TokenFlagsNone),
				lowering.arrow(
					lowering.factory.NewArrayLiteralExpression(
						lowering.factory.NewNodeList(arguments),
						false,
					),
				),
			},
		)
	}
	return nil
}

func (lowering *jsxLowering) assignedTask(
	value *ast.Node,
) (*ast.Node, Task, bool) {
	for value != nil &&
		(ast.IsAwaitExpression(value) || ast.IsParenthesizedExpression(value)) {
		if ast.IsAwaitExpression(value) {
			value = value.AsAwaitExpression().Expression
		} else {
			value = value.AsParenthesizedExpression().Expression
		}
	}
	if value == nil || !ast.IsCallExpression(value) {
		return nil, Task{}, false
	}
	task, exists := lowering.tasks[nodeSpanKey(value)]
	if !exists || len(task.ResultWritePath) == 0 {
		return nil, Task{}, false
	}
	return value, task, true
}

func (lowering *jsxLowering) lowerStateUpdate(
	node *ast.Node,
	write StateWrite,
) *ast.Node {
	previous := lowering.factory.NewIdentifier("previous")
	var operation *ast.Node
	switch {
	case ast.IsPrefixUnaryExpression(node):
		expression := node.AsPrefixUnaryExpression()
		operation = lowering.factory.NewPrefixUnaryExpression(
			expression.Operator,
			previous,
		)
	case ast.IsPostfixUnaryExpression(node):
		expression := node.AsPostfixUnaryExpression()
		operation = lowering.factory.NewPostfixUnaryExpression(
			previous,
			expression.Operator,
		)
	default:
		return nil
	}
	result := lowering.factory.NewIdentifier("result")
	declaration := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					result,
					nil,
					nil,
					operation,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	returnValue := lowering.factory.NewReturnStatement(
		lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{previous, result}),
			false,
		),
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{declaration, returnValue}),
		true,
	)
	return lowering.call(
		lowering.names.updateResult,
		[]*ast.Node{
			lowering.stateWriteRoot(write),
			lowering.stateWritePathNode(write),
			lowering.arrowWithParameter(previous, body),
		},
	)
}

func (lowering *jsxLowering) arrowWithParameter(
	parameter *ast.Node,
	body *ast.Node,
) *ast.Node {
	declaration := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		parameter,
		nil,
		nil,
		nil,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{declaration}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) stateRoot() *ast.Node {
	return lowering.factory.NewPropertyAccessExpression(
		lowering.factory.NewThisExpression(),
		nil,
		lowering.factory.NewIdentifier("state"),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) stateWriteRoot(write StateWrite) *ast.Node {
	if write.RootAlias == "" {
		return lowering.stateRoot()
	}
	alias := lowering.factory.NewIdentifier(write.RootAlias)
	for _, binding := range lowering.derived {
		if binding.Component == write.Component && binding.Name == write.RootAlias {
			return lowering.derivedGet(alias)
		}
	}
	return alias
}

func (lowering *jsxLowering) stateWritePath(write StateWrite) []string {
	if write.RootAlias == "" || write.RootDepth >= len(write.Path) {
		return write.Path
	}
	return write.Path[write.RootDepth:]
}

func (lowering *jsxLowering) stateWritePathNode(write StateWrite) *ast.Node {
	path := lowering.stateWritePath(write)
	offset := 0
	if write.RootAlias != "" && write.RootDepth < len(write.Path) {
		offset = write.RootDepth
	}
	segments := make([]*ast.Node, 0, len(path))
	for index, segment := range path {
		if dynamic := write.DynamicSegments[offset+index]; dynamic != nil {
			segments = append(segments, lowering.visitor.VisitNode(dynamic))
			continue
		}
		segments = append(
			segments,
			lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(segments),
		false,
	)
}

func (lowering *jsxLowering) statePath(path []string) *ast.Node {
	segments := make([]*ast.Node, 0, len(path))
	for _, segment := range path {
		segments = append(
			segments,
			lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(segments),
		false,
	)
}

func compoundStateOperator(operator ast.Kind) (ast.Kind, bool) {
	operators := map[ast.Kind]ast.Kind{
		ast.KindPlusEqualsToken:                              ast.KindPlusToken,
		ast.KindMinusEqualsToken:                             ast.KindMinusToken,
		ast.KindAsteriskEqualsToken:                          ast.KindAsteriskToken,
		ast.KindSlashEqualsToken:                             ast.KindSlashToken,
		ast.KindPercentEqualsToken:                           ast.KindPercentToken,
		ast.KindAsteriskAsteriskEqualsToken:                  ast.KindAsteriskAsteriskToken,
		ast.KindLessThanLessThanEqualsToken:                  ast.KindLessThanLessThanToken,
		ast.KindGreaterThanGreaterThanEqualsToken:            ast.KindGreaterThanGreaterThanToken,
		ast.KindGreaterThanGreaterThanGreaterThanEqualsToken: ast.KindGreaterThanGreaterThanGreaterThanToken,
		ast.KindAmpersandEqualsToken:                         ast.KindAmpersandToken,
		ast.KindBarEqualsToken:                               ast.KindBarToken,
		ast.KindCaretEqualsToken:                             ast.KindCaretToken,
		ast.KindAmpersandAmpersandEqualsToken:                ast.KindAmpersandAmpersandToken,
		ast.KindBarBarEqualsToken:                            ast.KindBarBarToken,
		ast.KindQuestionQuestionEqualsToken:                  ast.KindQuestionQuestionToken,
	}
	result, exists := operators[operator]
	return result, exists
}

func indexStateWrites(writes []StateWrite) map[string]StateWrite {
	result := make(map[string]StateWrite, len(writes))
	for _, write := range writes {
		result[fmt.Sprintf("%d:%d", write.Start, write.Length)] = write
	}
	return result
}

func indexTasks(tasks []Task) map[string]Task {
	result := make(map[string]Task, len(tasks))
	for _, task := range tasks {
		result[fmt.Sprintf("%d:%d", task.Start, task.Length)] = task
	}
	return result
}

type derivedElisionCandidate struct {
	binding        ReactiveBinding
	declaration    *ast.Node
	reference      *ast.Node
	component      *ast.Node
	consumerSymbol ast.SymbolId
	renderConsumer bool
}

// planDerivedBindings separates durable shared cells from safe calculations
// that can live in their sole reactive view consumer without creating a new
// identity. The source declaration remains the semantic definition and
// inspection range; elision is only an emitted-runtime optimization.
func planDerivedBindings(
	sourceFile *ast.SourceFile,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
) (map[int]ReactiveBinding, map[int]ReactiveBinding) {
	declarations := make(map[int]*ast.Node)
	declarationSymbols := make(map[int]ast.SymbolId)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		name := node.AsVariableDeclaration().Name()
		if name != nil && ast.IsIdentifier(name) {
			declarations[name.Pos()] = node
			if typeChecker != nil {
				if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
					declarationSymbols[name.Pos()] = ast.GetSymbolId(symbol)
				}
			}
		}
		return true
	})
	retained := make(map[int]ReactiveBinding)
	if typeChecker == nil {
		for _, binding := range bindings {
			if binding.Provenance == "derived" && binding.SafeToReevaluate {
				if _, declared := declarations[binding.Start]; declared {
					retained[binding.Start] = binding
				}
			}
		}
		return retained, map[int]ReactiveBinding{}
	}
	components := make(map[string]*ast.Node)
	for _, component := range componentCandidates(sourceFile) {
		components[component.name] = component.node
	}
	candidates := make(map[ast.SymbolId]*derivedElisionCandidate)
	for _, binding := range bindings {
		if binding.Provenance != "derived" || !binding.SafeToReevaluate {
			continue
		}
		declaration := declarations[binding.Start]
		if declaration == nil {
			continue
		}
		retained[binding.Start] = binding
		if len(binding.References) != 1 ||
			!elidableDerivedValue(
				declaration.AsVariableDeclaration().Initializer,
				typeChecker,
			) {
			continue
		}
		symbol := declarationSymbols[binding.Start]
		component := components[binding.Component]
		if symbol == 0 || component == nil {
			continue
		}
		reference := derivedReferenceNode(
			component,
			symbol,
			binding.References[0],
			sourceFile,
			typeChecker,
		)
		if reference == nil {
			continue
		}
		if jsxTagNameReference(reference) {
			continue
		}
		candidates[symbol] = &derivedElisionCandidate{
			binding:     binding,
			declaration: declaration,
			reference:   reference,
			component:   component,
			renderConsumer: eagerRenderReference(
				reference,
				component,
				sourceFile,
				typeChecker,
			),
		}
	}
	for _, candidate := range candidates {
		if candidate.renderConsumer {
			continue
		}
		for current := candidate.reference.Parent; current != nil &&
			current != candidate.component; current = current.Parent {
			if !ast.IsVariableDeclaration(current) {
				continue
			}
			name := current.AsVariableDeclaration().Name()
			if name != nil && ast.IsIdentifier(name) {
				if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
					candidate.consumerSymbol = ast.GetSymbolId(symbol)
				}
			}
			break
		}
	}
	elidedSymbols := make(map[ast.SymbolId]struct{})
	changed := true
	for changed {
		changed = false
		for symbol, candidate := range candidates {
			if _, elided := elidedSymbols[symbol]; elided {
				continue
			}
			_, consumerElided := elidedSymbols[candidate.consumerSymbol]
			if !candidate.renderConsumer && !consumerElided {
				continue
			}
			elidedSymbols[symbol] = struct{}{}
			changed = true
		}
	}
	elided := make(map[int]ReactiveBinding, len(elidedSymbols))
	for symbol := range elidedSymbols {
		candidate := candidates[symbol]
		delete(retained, candidate.binding.Start)
		elided[candidate.binding.Start] = candidate.binding
	}
	return retained, elided
}

func jsxTagNameReference(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsJsxOpeningElement(parent) {
		return parent.AsJsxOpeningElement().TagName == node
	}
	if ast.IsJsxSelfClosingElement(parent) {
		return parent.AsJsxSelfClosingElement().TagName == node
	}
	return false
}

func derivedReferenceNode(
	component *ast.Node,
	symbol ast.SymbolId,
	span SourceSpan,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) *ast.Node {
	var result *ast.Node
	walkNode(component, func(node *ast.Node) bool {
		if result != nil || !ast.IsIdentifier(node) ||
			ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return result == nil
		}
		current := typeChecker.GetSymbolAtLocation(node)
		if current == nil || ast.GetSymbolId(current) != symbol {
			return true
		}
		start := scanner.SkipTrivia(sourceFile.Text(), node.Pos())
		if start == span.Start && node.End()-start == span.Length {
			result = node
			return false
		}
		return true
	})
	return result
}

func scalarDerivedType(value *checker.Type) bool {
	if value == nil {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		members := value.Types()
		if len(members) == 0 {
			return false
		}
		for _, member := range members {
			if !scalarDerivedType(member) {
				return false
			}
		}
		return true
	}
	scalars := checker.TypeFlagsStringLike |
		checker.TypeFlagsNumberLike |
		checker.TypeFlagsBooleanLike |
		checker.TypeFlagsBigIntLike |
		checker.TypeFlagsNull |
		checker.TypeFlagsUndefined
	return value.Flags()&scalars != 0
}

// elidableDerivedValue admits values whose identity does not depend on a fresh
// setup allocation. Type information is preferred, but isolated transforms do
// not necessarily load the Component declaration, so direct state/property
// reads and known scalar intrinsics also need a syntax-level proof.
func elidableDerivedValue(value *ast.Node, typeChecker *checker.Checker) bool {
	if value == nil {
		return false
	}
	if scalarDerivedType(typeChecker.GetTypeAtLocation(value)) {
		return true
	}
	switch {
	case ast.IsIdentifier(value),
		ast.IsPropertyAccessExpression(value),
		ast.IsElementAccessExpression(value):
		return true
	case ast.IsCallExpression(value):
		call := value.AsCallExpression()
		if ast.IsIdentifier(call.Expression) {
			_, scalar := safeDerivedScalarFunctions[call.Expression.Text()]
			return scalar
		}
		if !ast.IsPropertyAccessExpression(call.Expression) {
			return false
		}
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		switch method {
		case
			"every", "findIndex", "findLastIndex", "includes", "indexOf",
			"join", "lastIndexOf", "localeCompare", "reduce", "reduceRight",
			"some", "startsWith", "endsWith":
			return true
		}
	}
	return false
}

func nodeSpanKey(node *ast.Node) string {
	return fmt.Sprintf("%d:%d", node.Pos(), node.End()-node.Pos())
}

func (lowering *jsxLowering) runtimeImports(root *ast.Node) []*ast.Node {
	type importGroup struct {
		module     string
		specifiers []*ast.Node
	}
	groups := []importGroup{
		{module: "@exactjs/core/runtime/render"},
		{module: "@exactjs/core/runtime/reactivity"},
		{module: "@exactjs/core/runtime/tasks"},
		{module: "@exactjs/core/runtime/inspection"},
		{module: "@exactjs/core/runtime/registry"},
		{module: "@exactjs/core/runtime/enhancements"},
		{module: "@exactjs/core/runtime/dynamic-components"},
		{module: "@exactjs/core/runtime/logging"},
		{module: "@exactjs/core/runtime/localization"},
		{module: "@exactjs/dom/runtime/modal"},
		{module: "@exactjs/dom/runtime/unsafe-html"},
		{module: "@exactjs/dom/runtime/structural-boundaries"},
	}
	add := func(group int, imported string, local string) {
		groups[group].specifiers = append(
			groups[group].specifiers,
			lowering.importSpecifier(imported, local),
		)
	}
	helpers := []struct {
		imported string
		local    string
		group    int
	}{
		{"createCompiledVNode", lowering.names.element, 0},
		{"createCompiledComponentVNode", lowering.names.componentElement, 0},
		{"createCompiledRenderProgram", lowering.names.renderProgram, 0},
		{"createCompiledFragment", lowering.names.fragment, 0},
		{"createCompiledTarget", lowering.names.target, 0},
		{"createExpression", lowering.names.expression, 0},
		{"createForwardedExpression", lowering.names.forwardedExpression, 0},
		{"componentExecutionValueForHost", lowering.names.componentOutput, 2},
		{"createDynamicChild", lowering.names.dynamic, 0},
		{"createCompiledDynamicComponent", lowering.names.dynamicComponent, 6},
		{"createServerDynamicComponent", lowering.names.serverDynamicComponent, 6},
		{"dynamicComponentValue", lowering.names.dynamicComponentValue, 6},
		{"createServerBoundary", lowering.names.boundary, 0},
		{"markFiniteClientBoundary", lowering.names.finiteBoundary, 0},
		{"markIndependentAsyncSiblings", lowering.names.asyncSiblings, 0},
		{"createServerSlot", lowering.names.serverSlot, 0},
		{"createKeyedServerSlot", lowering.names.keyedServerSlot, 0},
		{"createDerived", lowering.names.derived, 1},
		{"writeReactiveLazy", lowering.names.write, 1},
		{"updateReactiveValue", lowering.names.update, 1},
		{"updateReactiveValueWithResult", lowering.names.updateResult, 1},
		{"deleteReactiveValue", lowering.names.delete, 1},
		{"mutateReactiveArray", lowering.names.arrayMutation, 1},
		{"mutateReactiveCollection", lowering.names.collectionMutation, 1},
		{"createCompiledComponentRegistry", lowering.names.componentRegistry, 4},
		{"createEnhancementNode", lowering.names.enhancements, 5},
		{"omitKnownProps", lowering.names.omitEnhancementProps, 5},
		{"componentLogMethod", lowering.names.componentLog, 7},
	}
	for _, helper := range helpers {
		used := containsIdentifier(root, helper.local)
		if helper.imported == "createDynamicChild" &&
			containsIdentifier(root, lowering.names.expression) {
			used = true
		}
		if used {
			add(helper.group, helper.imported, helper.local)
		}
	}
	taskHelperOrder := []string{
		"withAbortSignal",
		"ownTaskResource",
		"taskAnimationFrame",
		"taskFetch",
		"taskIdleCallback",
		"taskInterval",
		"taskObserver",
		"taskTimeout",
		"withTaskSignal",
		"combineTaskSignal",
		"taskAwait",
		"taskMutation",
		"stageTaskMutation",
		"mutateTaskCollection",
		"markComponentContinuationTask",
		"dispatchComponentContinuation",
		"registerComponentContinuationContexts",
		"markExactInspectionSource",
		"defineTask",
		"bindTaskForHost",
		"invokeTask",
		"activateTaskForHost",
	}
	for _, imported := range taskHelperOrder {
		if local, used := lowering.taskHelpers[imported]; used {
			if !containsIdentifier(root, local) {
				continue
			}
			group := 2
			if imported == "markExactInspectionSource" {
				group = 3
			}
			add(group, imported, local)
		}
	}
	interopUsed := lowering.interop != nil && containsIdentifier(root, lowering.names.interop)
	interactionUsed := containsInteractionRuntimeUse(root)
	localizationUsed := containsComponentLocalizationUse(root)
	modalBindingUsed := containsIdentifier(root, "__exactModalOpen")
	unsafeHTMLUsed := lowering.target != TargetServer && containsUnsafeHTMLCall(
		lowering.sourceFile,
		lowering.checker,
	)
	structuralBoundariesUsed := lowering.target != TargetServer &&
		(partitionUsesStructuralBoundaries(lowering.partitionPlan) ||
			containsCoreStructuralBoundaryImport(root, lowering.sourceFile, lowering.checker))
	result := make([]*ast.Node, 0, len(groups))
	for index, group := range groups {
		if len(group.specifiers) == 0 {
			if (index == 2 && (interopUsed || interactionUsed)) ||
				(group.module == "@exactjs/core/runtime/localization" && localizationUsed) ||
				(group.module == "@exactjs/dom/runtime/modal" && modalBindingUsed) ||
				(group.module == "@exactjs/dom/runtime/unsafe-html" && unsafeHTMLUsed) ||
				(group.module == "@exactjs/dom/runtime/structural-boundaries" && structuralBoundariesUsed) {
				declaration := lowering.factory.NewImportDeclaration(
					nil,
					nil,
					lowering.factory.NewStringLiteral(group.module, ast.TokenFlagsNone),
					nil,
				)
				ast.SetParentInChildren(declaration)
				result = append(result, declaration)
			}
			continue
		}
		declaration := lowering.factory.NewImportDeclaration(
			nil,
			lowering.factory.NewImportClause(
				ast.KindUnknown,
				nil,
				lowering.factory.NewNamedImports(
					lowering.factory.NewNodeList(group.specifiers),
				),
			),
			lowering.factory.NewStringLiteral(group.module, ast.TokenFlagsNone),
			nil,
		)
		ast.SetParentInChildren(declaration)
		result = append(result, declaration)
	}
	return result
}

func partitionUsesStructuralBoundaries(plan PartitionPlan) bool {
	for _, node := range plan.Nodes {
		if node.Kind == "readiness-boundary" ||
			(node.Kind == "region" && node.Reason == "Activity retention boundary") {
			return true
		}
	}
	return false
}

func containsCoreStructuralBoundaryImport(
	root *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	for local, reference := range bindings.byName {
		if reference.moduleSpecifier == "@exactjs/core" &&
			(reference.exportName == "Activity" || reference.exportName == "Suspense") &&
			containsIdentifier(root, local) {
			return true
		}
	}
	found := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(node, bindings, typeChecker)
		found = exists && reference.moduleSpecifier == "@exactjs/core" &&
			(reference.exportName == "Activity" || reference.exportName == "Suspense")
		return !found
	})
	return found
}

func containsUnsafeHTMLCall(sourceFile *ast.SourceFile, typeChecker *checker.Checker) bool {
	found := false
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(
			node.AsCallExpression().Expression,
			bindings,
			typeChecker,
		)
		found = exists && reference.moduleSpecifier == "@exactjs/core" &&
			reference.exportName == "unsafeHtml"
		return !found
	})
	return found
}

func containsComponentLocalizationUse(root *ast.Node) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) {
			return true
		}
		member := node.AsPropertyAccessExpression()
		found = member.Expression.Kind == ast.KindThisKeyword && member.Name().Text() == "intl"
		return !found
	})
	return found
}

func containsInteractionRuntimeUse(root *ast.Node) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsPropertyAssignment(node) {
			return true
		}
		propertyName := node.AsPropertyAssignment().Name()
		if !ast.IsIdentifier(propertyName) && !ast.IsStringLiteral(propertyName) {
			return true
		}
		name := propertyName.Text()
		found = jsxEventAttribute(name) || strings.HasPrefix(name, "__exactBind")
		return !found
	})
	return found
}

func (lowering *jsxLowering) interopImport(root *ast.Node) *ast.Node {
	if lowering.interop == nil ||
		lowering.interop.AdapterModule == "" ||
		lowering.interop.AdapterExport == "" ||
		!containsIdentifier(root, lowering.names.interop) {
		return nil
	}
	result := lowering.factory.NewImportDeclaration(
		nil,
		lowering.factory.NewImportClause(
			ast.KindUnknown,
			nil,
			lowering.factory.NewNamedImports(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.importSpecifier(
						lowering.interop.AdapterExport,
						lowering.names.interop,
					),
				}),
			),
		),
		lowering.factory.NewStringLiteral(
			lowering.interop.AdapterModule,
			ast.TokenFlagsNone,
		),
		nil,
	)
	ast.SetParentInChildren(result)
	return result
}

func containsIdentifier(root *ast.Node, name string) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) && node.Text() == name {
			found = true
			return false
		}
		return !found
	})
	return found
}

func (lowering *jsxLowering) importSpecifier(
	imported string,
	local string,
) *ast.Node {
	return lowering.factory.NewImportSpecifier(
		false,
		lowering.factory.NewIdentifier(imported),
		lowering.factory.NewIdentifier(local),
	)
}

func (lowering *jsxLowering) elementID(node *ast.Node) string {
	return exactStableID(
		lowering.sourceFile.FileName(),
		"element",
		lowering.nodeIDs[node],
	)
}

func (lowering *jsxLowering) dynamicID(node *ast.Node) string {
	return exactStableID(
		lowering.sourceFile.FileName(),
		"dynamic",
		lowering.nodeIDs[node],
	)
}

func allocateJSXRuntimeNames(sourceFile *ast.SourceFile) jsxRuntimeNames {
	used := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = struct{}{}
		}
		return true
	})
	allocate := func(base string) string {
		if _, exists := used[base]; !exists {
			used[base] = struct{}{}
			return base
		}
		for suffix := 1; ; suffix++ {
			candidate := fmt.Sprintf("%s_%d", base, suffix)
			if _, exists := used[candidate]; !exists {
				used[candidate] = struct{}{}
				return candidate
			}
		}
	}
	return jsxRuntimeNames{
		element:                allocate("__exactVNode"),
		componentElement:       allocate("__exactComponentVNode"),
		renderProgram:          allocate("__exactRenderProgram"),
		fragment:               allocate("__exactFragment"),
		target:                 allocate("__exactTarget"),
		expression:             allocate("__exactExpression"),
		forwardedExpression:    allocate("__exactForwardedExpression"),
		componentOutput:        allocate("__exactComponentOutput"),
		dynamic:                allocate("__exactDynamic"),
		dynamicComponent:       allocate("__exactDynamicComponent"),
		serverDynamicComponent: allocate("__exactServerDynamicComponent"),
		dynamicComponentValue:  allocate("__exactDynamicComponentValue"),
		boundary:               allocate("__exactBoundary"),
		finiteBoundary:         allocate("__exactFiniteBoundary"),
		asyncSiblings:          allocate("__exactAsyncSiblings"),
		serverSlot:             allocate("__exactServerSlot"),
		keyedServerSlot:        allocate("__exactKeyedServerSlot"),
		clientProps:            allocate("__exactElementProps"),
		derived:                allocate("__exactDerived"),
		write:                  allocate("__exactWrite"),
		update:                 allocate("__exactUpdate"),
		updateResult:           allocate("__exactUpdateResult"),
		abortOptions:           allocate("__exactAbortOptions"),
		taskSignal:             allocate("__exactSignal"),
		taskTimeout:            allocate("__exactTaskTimeout"),
		taskInterval:           allocate("__exactTaskInterval"),
		taskAnimation:          allocate("__exactTaskAnimationFrame"),
		taskIdle:               allocate("__exactTaskIdleCallback"),
		taskObserver:           allocate("__exactTaskObserver"),
		taskFetch:              allocate("__exactTaskFetch"),
		taskResource:           allocate("__exactTaskResource"),
		taskOptions:            allocate("__exactTaskOptionsSignal"),
		taskCombined:           allocate("__exactTaskCombinedSignal"),
		taskAwait:              allocate("__exactTaskAwait"),
		taskMutation:           allocate("__exactTaskMutation"),
		stageTaskMutation:      allocate("__exactStageTaskMutation"),
		taskCollectionMutation: allocate("__exactTaskCollectionMutation"),
		taskContinuation:       allocate("__exactContinuationTask"),
		dispatchContinuation:   allocate("__exactDispatchContinuation"),
		registerContexts:       allocate("__exactRegisterContinuationContexts"),
		inspectionSource:       allocate("__exactInspectionSource"),
		defineTask:             allocate("__exactDefineTask"),
		bindTask:               allocate("__exactBindTask"),
		invokeTask:             allocate("__exactInvokeTask"),
		activateTask:           allocate("__exactActivateTask"),
		delete:                 allocate("__exactDelete"),
		arrayMutation:          allocate("__exactArrayMutation"),
		collectionMutation:     allocate("__exactCollectionMutation"),
		componentRegistry:      allocate("__exactComponentRegistry"),
		enhancements:           allocate("__exactEnhancements"),
		omitEnhancementProps:   allocate("__exactOmitEnhancementProps"),
		componentLog:           allocate("__exactComponentLog"),
		interop:                allocate("__exactInteropComponent"),
	}
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

func expressionNodeIDs(sourceFile *ast.SourceFile) map[*ast.Node]string {
	result := make(map[*ast.Node]string)
	componentNames := make(map[*ast.Node]string)
	for _, candidate := range activeComponentCandidates(sourceFile) {
		componentNames[candidate.node] = candidate.name
	}
	var visit func(*ast.Node, string, bool)
	visit = func(node *ast.Node, path string, insideComponent bool) {
		if name, component := componentNames[node]; component &&
			!insideComponent {
			path = "component:" + name
			insideComponent = true
		}
		childIndex := 0
		node.ForEachChild(func(child *ast.Node) bool {
			childPath := fmt.Sprintf(
				"%s/%s:%d",
				path,
				strings.TrimPrefix(child.Kind.String(), "Kind"),
				childIndex,
			)
			childIndex++
			visit(child, childPath, insideComponent)
			return false
		})
		kind := strings.TrimPrefix(node.Kind.String(), "Kind")
		if node.Kind == ast.KindEndOfFile {
			kind = "EndOfFileToken"
		}
		result[node] = fmt.Sprintf(
			"%s:node:%s:%s",
			normalizedIdentityFilename(sourceFile.FileName()),
			path,
			kind,
		)
	}
	visit(sourceFile.AsNode(), "module", false)
	return result
}

func exactStableID(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, ":")))
	return "x" + base64.RawURLEncoding.EncodeToString(sum[:])[:22]
}

func jsxAttributeText(name *ast.Node) string {
	if ast.IsJsxNamespacedName(name) {
		namespaced := name.AsJsxNamespacedName()
		return namespaced.Namespace.Text() + ":" + namespaced.Name().Text()
	}
	return name.Text()
}

func jsxPropertyName(factory *printer.NodeFactory, name string) *ast.Node {
	if validIdentifier(name) {
		return factory.NewIdentifier(name)
	}
	return factory.NewStringLiteral(name, ast.TokenFlagsNone)
}

func validIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, character := range value {
		if index == 0 {
			if character != '_' && character != '$' &&
				!unicode.IsLetter(character) {
				return false
			}
			continue
		}
		if character != '_' && character != '$' &&
			!unicode.IsLetter(character) &&
			!unicode.IsDigit(character) {
			return false
		}
	}
	return true
}

func jsxCallbackExpression(node *ast.Node) bool {
	return ast.IsArrowFunction(node) || ast.IsFunctionExpression(node)
}

func normalizeJSXText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	if !strings.Contains(value, "\n") {
		return html.UnescapeString(value)
	}
	characters := []rune(value)
	content := strings.Join(strings.Fields(value), " ")
	if content == "" {
		return ""
	}
	if unicode.IsSpace(characters[0]) {
		content = " " + content
	}
	if unicode.IsSpace(characters[len(characters)-1]) {
		content += " "
	}
	return html.UnescapeString(content)
}

func normalizeJSXChildText(value string, index int, count int) string {
	text := normalizeJSXText(value)
	if strings.ContainsAny(value, "\r\n") {
		if index == 0 {
			text = strings.TrimLeftFunc(text, unicode.IsSpace)
		}
		if index == count-1 {
			text = strings.TrimRightFunc(text, unicode.IsSpace)
		}
		if strings.HasPrefix(text, " ") {
			trimmed := strings.TrimLeftFunc(text, unicode.IsSpace)
			for _, first := range trimmed {
				if strings.ContainsRune(".,;:!?%)]}»›。，、；：！？％）］｝", first) {
					text = trimmed
				}
				break
			}
		}
	}
	return text
}
