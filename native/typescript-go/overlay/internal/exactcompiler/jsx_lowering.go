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
	fragment               string
	expression             string
	dynamic                string
	boundary               string
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
	interactionAwait       string
	interactionMutation    string
	stageTaskMutation      string
	taskCollectionMutation string
	taskContinuation       string
	dispatchContinuation   string
	registerContexts       string
	inspectionSource       string
	taskOptions            string
	taskCombined           string
	delete                 string
	arrayMutation          string
	collectionMutation     string
	componentRegistry      string
	interop                string
}

type jsxLowering struct {
	sourceFile           *ast.SourceFile
	factory              *printer.NodeFactory
	visitor              *ast.NodeVisitor
	names                jsxRuntimeNames
	nodeIDs              map[*ast.Node]string
	writes               map[string]StateWrite
	tasks                map[string]Task
	actions              map[string]Action
	stateReads           []StateRead
	bindings             []ReactiveBinding
	formBindings         map[int]formBinding
	checker              *checker.Checker
	taskHelpers          map[string]string
	derived              map[int]ReactiveBinding
	target               Target
	serverComponents     bool
	instrumentInspection bool
	components           map[string]Component
	renderEdges          map[string]RenderEdge
	clientIslands        map[*ast.Node]clientElementIsland
	clientDefinitions    []*ast.Node
	captureValues        map[ast.SymbolId]string
	interop              *JSXInterop
	materializedNames    map[int]string
	contextWrites        map[string][]string
	collectionMaps       map[string]collectionMapPlan
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
	stateWrites []StateWrite,
	stateAliases []StateAlias,
	stateReads []StateRead,
	reactiveBindings []ReactiveBinding,
	formBindings map[int]formBinding,
	components []Component,
	tasks []Task,
	actions []Action,
	continuations []Continuation,
	clientIslands map[*ast.Node]clientElementIsland,
	target Target,
	serverComponents bool,
	instrumentInspection bool,
	typeChecker *checker.Checker,
	interop *JSXInterop,
) *ast.SourceFile {
	hasJSX := sourceFile.SubtreeFacts()&ast.SubtreeContainsJsx != 0
	hasReactiveCapture := strings.Contains(sourceFile.Text(), ".reactive")
	derived := indexDerivedBindings(sourceFile, reactiveBindings)
	if !hasJSX && len(stateWrites) == 0 && len(tasks) == 0 &&
		len(derived) == 0 && !hasReactiveCapture && len(components) == 0 {
		return sourceFile
	}
	lowering := &jsxLowering{
		sourceFile:           sourceFile,
		factory:              factory,
		names:                allocateJSXRuntimeNames(sourceFile),
		nodeIDs:              expressionNodeIDs(sourceFile),
		writes:               indexStateWrites(stateWrites),
		tasks:                indexTasks(tasks),
		actions:              indexActions(actions),
		stateReads:           stateReads,
		bindings:             reactiveBindings,
		formBindings:         formBindings,
		checker:              typeChecker,
		taskHelpers:          make(map[string]string),
		materializedNames:    make(map[int]string),
		derived:              derived,
		target:               target,
		serverComponents:     serverComponents,
		instrumentInspection: instrumentInspection,
		interop:              interop,
		components:           componentIndexByName(components),
		renderEdges:          indexRenderEdges(components),
		contextWrites:        indexContinuationContextWrites(continuations),
		collectionMaps:       make(map[string]collectionMapPlan),
		clientIslands:        clientIslands,
	}
	lowering.indexCollectionMaps()
	lowering.visitor = ast.NewNodeVisitor(
		lowering.visit,
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	transformed := lowering.visitor.VisitEachChild(sourceFile.AsNode()).AsSourceFile()
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
	runtimeImport := lowering.runtimeImport(transformed.AsNode())
	interopImport := lowering.interopImport(transformed.AsNode())
	statements := make([]*ast.Node, 0, len(transformed.Statements.Nodes)+2)
	insertion := 0
	for insertion < len(transformed.Statements.Nodes) &&
		isDirectiveStatement(transformed.Statements.Nodes[insertion]) {
		statements = append(statements, transformed.Statements.Nodes[insertion])
		insertion++
	}
	if runtimeImport != nil {
		statements = append(statements, runtimeImport)
	}
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
	if captured := lowering.lowerReactiveCapture(node); captured != nil {
		return captured
	}
	if compiled := lowering.lowerComponentRegistryCreation(node); compiled != nil {
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
		if _, action := actionFacets(node.AsCallExpression().Expression); action {
			analyzed, exists := lowering.actions[nodeSpanKey(node)]
			if exists {
				return lowering.lowerAction(node, &analyzed)
			}
			return lowering.lowerAction(node, nil)
		}
		if mapped := lowering.lowerAnnotatedMap(node); mapped != nil {
			return mapped
		}
	}
	if task, exists := lowering.tasks[nodeSpanKey(node)]; exists &&
		ast.IsCallExpression(node) {
		return lowering.lowerTask(node, task)
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
	work = lowering.manageTaskWork(work, task, 0)
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
	intrinsic := jsxIntrinsic(tagText)
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
	var emittedTag *ast.Node
	if intrinsic {
		emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
	} else {
		emittedTag = lowering.visitor.VisitNode(tag)
		if lowering.interop != nil && !lowering.localExactComponentTag(tag) {
			emittedTag = lowering.call(lowering.names.interop, []*ast.Node{emittedTag})
		}
	}
	arguments := []*ast.Node{
		emittedTag,
		lowering.props(
			opening.Attributes(),
			lowering.elementID(identityNode),
			intrinsic,
			tagText,
		),
	}
	arguments = append(arguments, lowering.children(children)...)
	element := lowering.call(lowering.names.element, arguments)
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
		for _, declaration := range candidate.Declarations {
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
	childrenValue, serverSlot := lowering.clientBoundaryChildren(children)
	if childrenValue != nil {
		props = lowering.appendObjectProperty(props, "children", childrenValue)
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
	return lowering.call(lowering.names.boundary, arguments)
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
	for _, child := range ast.GetSemanticJsxChildren(children.Nodes) {
		switch {
		case ast.IsJsxText(child):
			text := strings.Join(
				strings.Fields(child.AsJsxText().Text),
				" ",
			)
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
	for _, child := range ast.GetSemanticJsxChildren(children.Nodes) {
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
					initializer = lowering.reactiveExpression(
						expression,
						initializer,
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
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
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

func (lowering *jsxLowering) formBindingProperties(
	name string,
	initializer *ast.Node,
	attributes *ast.Node,
) []*ast.Node {
	if name != "value:input" && name != "value:change" &&
		name != "checked:change" {
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
	for _, child := range ast.GetSemanticJsxChildren(children.Nodes) {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXText(child.AsJsxText().Text)
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
			emitted := lowering.visitor.VisitNode(expression)
			if lowering.moduleDeclarativeCollection(expression) {
				result = append(result, emitted)
				continue
			}
			closure := lowering.reactiveClosure(expression)
			if closure == nil {
				closure = lowering.arrow(emitted)
			}
			result = append(
				result,
				lowering.call(
					lowering.names.dynamic,
					[]*ast.Node{
						closure,
						lowering.factory.NewStringLiteral(
							lowering.dynamicID(child),
							ast.TokenFlagsNone,
						),
					},
				),
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
	if lowering.checker == nil {
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
				text := sourceText(lowering.sourceFile, declaration)
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
			start := declaration.Pos()
			end := declaration.End()
			if start < 0 || end > len(lowering.sourceFile.Text()) || start >= end {
				continue
			}
			if exactKeyArgument.MatchString(
				lowering.sourceFile.Text()[start:end],
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
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		statement := declaration.Parent.Parent
		if statement != nil && statement.Parent == lowering.sourceFile.AsNode() {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) reactiveExpression(
	source *ast.Node,
	expression *ast.Node,
) *ast.Node {
	closure := lowering.reactiveClosure(source)
	if closure == nil {
		closure = lowering.arrow(expression)
	}
	return lowering.call(
		lowering.names.expression,
		[]*ast.Node{closure},
	)
}

type materializedRenderLocal struct {
	symbol      ast.SymbolId
	declaration *ast.Node
	name        string
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
		initializer := lowering.replaceMaterializedReferences(
			variable.Initializer,
			bySymbol,
		)
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
			return visitor.VisitEachChild(node)
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
	initializer := lowering.visitor.VisitNode(declaration.Initializer)
	value := lowering.call(
		lowering.names.derived,
		[]*ast.Node{lowering.arrow(initializer)},
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

func (lowering *jsxLowering) lowerAction(
	node *ast.Node,
	action *Action,
) *ast.Node {
	call := node.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
		return lowering.visitor.VisitEachChild(node)
	}
	arguments := append([]*ast.Node(nil), call.Arguments.Nodes...)
	work := arguments[1]
	if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
		return lowering.visitor.VisitEachChild(node)
	}
	dependencyCount := len(work.Parameters())
	if actionWorkHasContextParameter(work, lowering.sourceFile) {
		dependencyCount--
	}
	signal, work := lowering.taskSignalExpression(work, dependencyCount)
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
						"interactionMutation",
						lowering.names.interactionMutation,
						[]*ast.Node{signal, lowering.arrow(mutation)},
					)
				}
			}
			if ast.IsAwaitExpression(current) {
				value := visitor.VisitNode(current.AsAwaitExpression().Expression)
				return lowering.factory.NewAwaitExpression(
					lowering.taskHelperCall(
						"interactionAwait",
						lowering.names.interactionAwait,
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
	if action != nil && lowering.target == TargetClient &&
		action.Placement == "server" {
		arguments[1] = lowering.clientActionContinuationWork(
			action.ID,
			rewrittenWork,
		)
		if lowering.instrumentInspection {
			arguments[1] = lowering.inspectionSource(action.ID, arguments[1])
		}
		return lowering.factory.NewCallExpression(
			lowering.visitor.VisitNode(call.Expression),
			call.QuestionDotToken,
			call.TypeArguments,
			lowering.factory.NewNodeList(arguments),
			call.Flags,
		)
	}
	if action != nil &&
		(lowering.target == TargetServer ||
			lowering.target == TargetDefault) &&
		(action.Placement == "server" || action.Placement == "isomorphic") {
		if lowering.target == TargetServer && action.Placement == "server" {
			rewrittenWork = lowering.withoutActionOptimisticStatements(
				rewrittenWork,
			)
		}
		rewrittenWork = lowering.taskHelperCall(
			"markComponentContinuationTask",
			lowering.names.taskContinuation,
			[]*ast.Node{
				lowering.factory.NewStringLiteral(action.ID, ast.TokenFlagsNone),
				rewrittenWork,
			},
		)
	}
	if action != nil && lowering.instrumentInspection {
		rewrittenWork = lowering.inspectionSource(action.ID, rewrittenWork)
	}
	arguments[1] = rewrittenWork
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(call.Expression),
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList(arguments),
		call.Flags,
	)
}

func (lowering *jsxLowering) clientActionContinuationWork(
	id string,
	work *ast.Node,
) *ast.Node {
	args := lowering.factory.NewIdentifier("__exactActionArgs")
	context := lowering.factory.NewIdentifier("__exactActionContext")
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
			lowering.factory.NewThisExpression(),
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
						nil,
						contextValue,
					),
				}),
				ast.NodeFlagsConst,
			),
		),
	}
	if prelude := lowering.actionOptimisticPrelude(work, args, context); prelude != nil {
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
				nil,
				nil,
			),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) actionOptimisticPrelude(
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
		if actionOptimisticStatement(statement) {
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

func (lowering *jsxLowering) withoutActionOptimisticStatements(
	work *ast.Node,
) *ast.Node {
	body := work.Body()
	if body == nil || !ast.IsBlock(body) {
		return work
	}
	statements := []*ast.Node{}
	for _, statement := range body.AsBlock().Statements.Nodes {
		if !actionOptimisticStatement(statement) {
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

func actionOptimisticStatement(statement *ast.Node) bool {
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

func actionWorkHasContextParameter(
	work *ast.Node,
	sourceFile *ast.SourceFile,
) bool {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return false
	}
	last := parameters[len(parameters)-1]
	if strings.Contains(sourceText(sourceFile, last), "ActionContext") {
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
	if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		return lowering.visitor.VisitEachChild(node)
	}
	arguments := call.Arguments.Nodes
	work := arguments[len(arguments)-1]
	if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
		return lowering.visitor.VisitEachChild(node)
	}
	explicit := arguments[:len(arguments)-1]
	contextBindings := lowering.taskContextWriteBindings(work, task.ID)
	dependencies := []nativeTaskDependency{}
	nextArguments := []*ast.Node{}
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
		for _, dependency := range dependencies {
			nextArguments = append(
				nextArguments,
				lowering.componentReactive(dependency.expression),
			)
		}
	}
	rewrittenWork := lowering.rewriteTaskWork(
		work,
		dependencies,
		task,
		// Runtime task context follows every activation dependency, including
		// authored dependencies that do not appear in the inferred plan.
		len(nextArguments),
	)
	if lowering.target == TargetClient && task.Placement == "server" {
		if component, exists := lowering.components[task.Component]; exists &&
			component.Placement == "isomorphic" {
			rewrittenWork = lowering.clientContinuationWork(
				work,
				dependencies,
				len(nextArguments),
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
	authoredWork *ast.Node,
	dependencies []nativeTaskDependency,
	dependencyCount int,
	task Task,
	contextBindings []continuationContextBinding,
) *ast.Node {
	names := make([]string, dependencyCount)
	for index := range dependencies {
		if index < len(names) {
			names[index] = dependencies[index].parameter
		}
	}
	if len(dependencies) == 0 && dependencyCount != 0 {
		names = taskDependencyParameterNames(authoredWork, dependencyCount)
	}
	parameters := make([]*ast.Node, 0, len(names)+1)
	values := make([]*ast.Node, 0, len(names))
	for _, name := range names {
		identifier := lowering.factory.NewIdentifier(name)
		parameters = append(
			parameters,
			lowering.factory.NewParameterDeclaration(
				nil,
				nil,
				identifier,
				nil,
				nil,
				nil,
			),
		)
		values = append(values, lowering.factory.NewIdentifier(name))
	}
	signal := lowering.factory.NewIdentifier(lowering.names.taskSignal)
	parameters = append(
		parameters,
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			lowering.factory.NewBindingPattern(
				ast.KindObjectBindingPattern,
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewBindingElement(
						nil,
						lowering.factory.NewIdentifier("signal"),
						signal,
						nil,
					),
				}),
			),
			nil,
			nil,
			nil,
		),
	)
	dispatch := lowering.taskHelperCall(
		"dispatchComponentContinuation",
		lowering.names.dispatchContinuation,
		[]*ast.Node{
			lowering.factory.NewThisExpression(),
			lowering.factory.NewStringLiteral(task.ID, ast.TokenFlagsNone),
			lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			),
			signal,
			lowering.contextBindingArray(contextBindings),
		},
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList(parameters),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		dispatch,
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

func taskDependencyParameterNames(work *ast.Node, count int) []string {
	used := make(map[string]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = struct{}{}
		}
		return true
	})
	result := make([]string, count)
	for index := range result {
		base := "__exactDependency"
		if index != 0 {
			base += fmt.Sprintf("%d", index)
		}
		candidate := base
		for {
			if _, exists := used[candidate]; !exists {
				used[candidate] = struct{}{}
				result[index] = candidate
				break
			}
			candidate += "_"
		}
	}
	return result
}

func (lowering *jsxLowering) inferredTaskDependencies(
	task Task,
	work *ast.Node,
) []nativeTaskDependency {
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
			read.Start < work.Pos() ||
			read.Start+read.Length > work.End() {
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
			typeLocation := nodeAtSpan(work, read.Start, read.Length)
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
			work,
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
	rewritten = lowering.manageTaskWork(rewritten, task, dependencyCount)
	return lowering.visitor.VisitEachChild(rewritten)
}

func (lowering *jsxLowering) manageTaskWork(
	work *ast.Node,
	task Task,
	dependencyCount int,
) *ast.Node {
	if len(task.Resources) == 0 && len(task.SignalCalls) == 0 &&
		len(task.Writes) == 0 && !taskContainsAwait(work) {
		return work
	}
	signal, work := lowering.taskSignalExpression(
		work,
		dependencyCount,
	)
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
	return lowering.derivedGet(
		lowering.factory.NewIdentifier(write.RootAlias),
	)
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

func indexDerivedBindings(
	sourceFile *ast.SourceFile,
	bindings []ReactiveBinding,
) map[int]ReactiveBinding {
	declarations := make(map[int]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		name := node.AsVariableDeclaration().Name()
		if name != nil && ast.IsIdentifier(name) {
			declarations[name.Pos()] = struct{}{}
		}
		return true
	})
	result := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Provenance != "derived" || !binding.SafeToReevaluate {
			continue
		}
		if _, declared := declarations[binding.Start]; declared {
			result[binding.Start] = binding
		}
	}
	return result
}

func nodeSpanKey(node *ast.Node) string {
	return fmt.Sprintf("%d:%d", node.Pos(), node.End()-node.Pos())
}

func (lowering *jsxLowering) runtimeImport(root *ast.Node) *ast.Node {
	specifiers := []*ast.Node{}
	helpers := []struct {
		imported string
		local    string
	}{
		{"createCompiledVNode", lowering.names.element},
		{"createCompiledFragment", lowering.names.fragment},
		{"createExpression", lowering.names.expression},
		{"createDynamicChild", lowering.names.dynamic},
		{"createServerBoundary", lowering.names.boundary},
		{"createDerived", lowering.names.derived},
		{"writeReactiveLazy", lowering.names.write},
		{"updateReactiveValue", lowering.names.update},
		{"updateReactiveValueWithResult", lowering.names.updateResult},
		{"deleteReactiveValue", lowering.names.delete},
		{"mutateReactiveArray", lowering.names.arrayMutation},
		{"mutateReactiveCollection", lowering.names.collectionMutation},
		{"createCompiledComponentRegistry", lowering.names.componentRegistry},
	}
	for _, helper := range helpers {
		used := containsIdentifier(root, helper.local)
		if helper.imported == "createDynamicChild" &&
			containsIdentifier(root, lowering.names.expression) {
			used = true
		}
		if used {
			specifiers = append(
				specifiers,
				lowering.importSpecifier(helper.imported, helper.local),
			)
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
		"interactionAwait",
		"interactionMutation",
		"stageTaskMutation",
		"mutateTaskCollection",
		"markComponentContinuationTask",
		"dispatchComponentContinuation",
		"registerComponentContinuationContexts",
		"markExactInspectionSource",
	}
	for _, imported := range taskHelperOrder {
		if local, used := lowering.taskHelpers[imported]; used {
			if !containsIdentifier(root, local) {
				continue
			}
			specifiers = append(
				specifiers,
				lowering.importSpecifier(imported, local),
			)
		}
	}
	if len(specifiers) == 0 {
		return nil
	}
	result := lowering.factory.NewImportDeclaration(
		nil,
		lowering.factory.NewImportClause(
			ast.KindUnknown,
			nil,
			lowering.factory.NewNamedImports(
				lowering.factory.NewNodeList(specifiers),
			),
		),
		lowering.factory.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone),
		nil,
	)
	ast.SetParentInChildren(result)
	return result
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
		fragment:               allocate("__exactFragment"),
		expression:             allocate("__exactExpression"),
		dynamic:                allocate("__exactDynamic"),
		boundary:               allocate("__exactBoundary"),
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
		interactionAwait:       allocate("__exactInteractionAwait"),
		interactionMutation:    allocate("__exactInteractionMutation"),
		stageTaskMutation:      allocate("__exactStageTaskMutation"),
		taskCollectionMutation: allocate("__exactTaskCollectionMutation"),
		taskContinuation:       allocate("__exactContinuationTask"),
		dispatchContinuation:   allocate("__exactDispatchContinuation"),
		registerContexts:       allocate("__exactRegisterContinuationContexts"),
		inspectionSource:       allocate("__exactInspectionSource"),
		delete:                 allocate("__exactDelete"),
		arrayMutation:          allocate("__exactArrayMutation"),
		collectionMutation:     allocate("__exactCollectionMutation"),
		componentRegistry:      allocate("__exactComponentRegistry"),
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
	lines := strings.Split(value, "\n")
	result := make([]string, 0, len(lines))
	for index, line := range lines {
		switch {
		case len(lines) == 1:
		case index == 0:
			line = strings.TrimRightFunc(line, unicode.IsSpace)
		case index == len(lines)-1:
			line = strings.TrimLeftFunc(line, unicode.IsSpace)
		default:
			line = strings.TrimSpace(line)
		}
		if strings.TrimSpace(line) == "" {
			continue
		}
		result = append(result, html.UnescapeString(line))
	}
	if len(result) == 0 {
		return ""
	}
	if len(lines) == 1 {
		return result[0]
	}
	return strings.Join(result, " ")
}
