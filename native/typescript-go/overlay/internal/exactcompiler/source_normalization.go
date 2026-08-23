package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

type componentComputationLocals struct {
	props    string
	reactive map[string]struct{}
}

type componentComputationWrite struct {
	node *ast.Node
	path string
}

type componentComputationEffects struct {
	reactive bool
	reads    map[string]struct{}
	writes   []componentComputationWrite
}

type componentComputation struct {
	statement *ast.Node
	effects   componentComputationEffects
}

type setupAssignmentExecution struct {
	component string
	start     int
	end       int
	execution string
}

// normalizeAuthoredSource owns syntax normalization that must happen before
// TypeScript can bind the module. Raw application source enters the Go host;
// JavaScript never parses or reconstructs the compiler AST on the native path.
func normalizeAuthoredSource(fileName string, source string) (normalizedSource, error) {
	result := newNormalizedSource(source)
	result.apply(planPropPunning(fileName, result.text))
	result.apply(planCanonicalComponentReturns(fileName, result.text))
	for {
		destructuringEdits, err := planComponentStateDestructuring(
			fileName,
			result.text,
		)
		if err != nil {
			return normalizedSource{}, err
		}
		if len(destructuringEdits) == 0 {
			break
		}
		result.apply(destructuringEdits)
	}
	computationEdits, err := planComponentComputations(fileName, result.text)
	if err != nil {
		return normalizedSource{}, err
	}
	result.apply(computationEdits)
	return result, nil
}

// planCanonicalComponentReturns keeps direct-return component syntax as an
// authoring convenience while ensuring every compiled durable component
// reaches analysis and runtime with a synchronous render closure. Lexical
// micro-components remain direct view helpers and are intentionally excluded.
func planCanonicalComponentReturns(fileName string, source string) []sourceEdit {
	sourceFile := parseNormalizationSource(fileName, source)
	candidates := rawComponentCandidates(sourceFile)
	callables := make(map[string]*ast.Node)
	for _, candidate := range candidates {
		callables[candidate.name] = candidate.node
	}
	edits := []sourceEdit{}
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		if ast.IsArrowFunction(candidate.node) {
			body := unwrapRenderExpression(candidate.node.Body())
			if body != nil && !ast.IsBlock(body) &&
				!ast.IsArrowFunction(body) &&
				!ast.IsFunctionExpression(body) &&
				!obviouslyCallableReturn(body, callables) {
				edits = append(edits, sourceEdit{
					start: nodeTokenStart(sourceFile, body),
					end:   body.End(),
					text:  "() => (" + normalizationNodeText(sourceFile, body) + ")",
				})
			}
			continue
		}
		for _, returned := range directCallableReturns(candidate.node) {
			expression := unwrapRenderExpression(returned)
			if expression == nil || ast.IsArrowFunction(expression) ||
				ast.IsFunctionExpression(expression) ||
				ast.IsFunctionDeclaration(expression) ||
				obviouslyCallableReturn(expression, callables) {
				continue
			}
			edits = append(edits, sourceEdit{
				start: nodeTokenStart(sourceFile, expression),
				end:   expression.End(),
				text:  "() => (" + normalizationNodeText(sourceFile, expression) + ")",
			})
		}
	}
	return edits
}

// obviouslyCallableReturn preserves rejected callable syntax until semantic
// diagnostics run. It is not a render-resolution path: valid durable output is
// always normalized to a directly returned lexical arrow.
func obviouslyCallableReturn(
	expression *ast.Node,
	callables map[string]*ast.Node,
) bool {
	if ast.IsIdentifier(expression) {
		return callables[expression.Text()] != nil
	}
	if !ast.IsCallExpression(expression) {
		return false
	}
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return false
	}
	member := call.Expression.AsPropertyAccessExpression()
	return member.Name() != nil && member.Name().Text() == "bind"
}

func preprocessComponentComputations(
	fileName string,
	source string,
) (string, error) {
	edits, err := planComponentComputations(fileName, source)
	if err != nil {
		return "", err
	}
	return applySourceEdits(source, edits), nil
}

func planComponentComputations(
	fileName string,
	source string,
) ([]sourceEdit, error) {
	sourceFile := parseNormalizationSource(fileName, source)
	environment := componentComputationEnvironmentBindings(sourceFile)
	edits := []sourceEdit{}
	var normalizationError error
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if normalizationError != nil {
			return false
		}
		if !isComponentComputationFunction(node, sourceFile) {
			return true
		}
		if err := planComponentComputationEdits(
			sourceFile,
			node,
			environment,
			&edits,
		); err != nil {
			normalizationError = err
		}
		return false
	})
	if normalizationError != nil {
		return nil, normalizationError
	}
	return edits, nil
}

// collectAuthoredSetupAssignmentExecutions retains the semantic distinction
// that computation normalization would otherwise lower into generated tasks.
func collectAuthoredSetupAssignmentExecutions(
	fileName string,
	source string,
) []setupAssignmentExecution {
	sourceFile := parseNormalizationSource(fileName, source)
	environment := componentComputationEnvironmentBindings(sourceFile)
	executions := []setupAssignmentExecution{}
	for _, candidate := range componentCandidates(sourceFile) {
		body := candidate.node.Body()
		if body == nil || !ast.IsBlock(body) {
			continue
		}
		statements := append([]*ast.Node(nil), body.AsBlock().Statements.Nodes...)
		if len(statements) != 0 && ast.IsReturnStatement(statements[len(statements)-1]) {
			statements = statements[:len(statements)-1]
		}
		locals := analyzeComponentComputationLocals(candidate.node, statements, environment)
		for _, statement := range statements {
			if len(collectDirectComponentAwaits(statement)) != 0 {
				continue
			}
			effects := inspectComponentComputationStatement(statement, locals)
			if len(effects.writes) == 0 {
				continue
			}
			execution := "initialization"
			if effects.reactive && !isComponentStateInitialization(statement) {
				execution = "deferred-reactive"
			}
			executions = append(executions, setupAssignmentExecution{
				component: candidate.name,
				start:     statement.Pos(),
				end:       statement.End(),
				execution: execution,
			})
		}
	}
	return executions
}

func applySetupAssignmentExecutions(
	writes []StateWrite,
	executions []setupAssignmentExecution,
) {
	for index := range writes {
		write := &writes[index]
		if write.Operation != "assignment" {
			continue
		}
		for _, execution := range executions {
			if write.Component == execution.component &&
				write.Start < execution.end &&
				execution.start < write.Start+write.Length {
				write.SetupExecution = execution.execution
				break
			}
		}
	}
}

func planComponentComputationEdits(
	sourceFile *ast.SourceFile,
	component *ast.Node,
	environment map[string]struct{},
	edits *[]sourceEdit,
) error {
	body := component.Body()
	if body == nil || !ast.IsBlock(body) {
		return nil
	}
	statements := append([]*ast.Node(nil), body.AsBlock().Statements.Nodes...)
	var renderReturn *ast.Node
	if len(statements) != 0 && ast.IsReturnStatement(statements[len(statements)-1]) {
		renderReturn = statements[len(statements)-1]
		statements = statements[:len(statements)-1]
	}
	if len(statements) == 0 {
		return nil
	}
	asyncModifier := componentAsyncModifier(component)
	hasRawAwait := false
	for _, statement := range statements {
		if len(collectDirectComponentAwaits(statement)) != 0 {
			hasRawAwait = true
		}
	}
	// Setup-level await is eXact component syntax even when the outer definition is not authored
	// `async`: lower it into the compiler-owned blocking continuation and keep the component's
	// runtime construction contract synchronous.
	if hasRawAwait {
		return planAsyncComponentComputation(
			sourceFile,
			statements,
			renderReturn,
			asyncModifier,
			edits,
		)
	}

	locals := analyzeComponentComputationLocals(component, statements, environment)
	computations := []componentComputation{}
	for _, statement := range statements {
		if isComponentStateInitialization(statement) {
			continue
		}
		effects := inspectComponentComputationStatement(statement, locals)
		if len(effects.writes) != 0 && effects.reactive {
			computations = append(computations, componentComputation{
				statement: statement,
				effects:   effects,
			})
		}
	}
	if err := validateSynchronousComputationCycles(sourceFile, computations); err != nil {
		return err
	}
	for _, computation := range computations {
		start := nodeTokenStart(sourceFile, computation.statement)
		name := fmt.Sprintf("__exactComponentComputation_%d", start)
		*edits = append(
			*edits,
			sourceEdit{
				start: start,
				end:   start,
				text:  "function " + name + "() { ",
				order: 0,
			},
			sourceEdit{
				start: computation.statement.End(),
				end:   computation.statement.End(),
				text:  " } " + name + "();",
				order: 1,
			},
		)
	}
	return nil
}

func componentAsyncModifier(component *ast.Node) *ast.Node {
	modifiers := component.Modifiers()
	if modifiers == nil {
		return nil
	}
	for _, modifier := range modifiers.Nodes {
		if modifier.Kind == ast.KindAsyncKeyword {
			return modifier
		}
	}
	return nil
}

func isComponentStateInitialization(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	return ast.IsBinaryExpression(expression) &&
		expression.AsBinaryExpression().OperatorToken.Kind ==
			ast.KindQuestionQuestionEqualsToken &&
		len(componentComputationStateTargets(
			expression.AsBinaryExpression().Left,
		)) != 0
}

func validateSynchronousComputationCycles(
	sourceFile *ast.SourceFile,
	computations []componentComputation,
) error {
	writes := []componentComputationWrite{}
	for _, computation := range computations {
		for _, write := range computation.effects.writes {
			if write.path != "" {
				writes = append(writes, write)
			}
		}
	}
	nodes := []string{}
	seen := map[string]struct{}{}
	for _, write := range writes {
		if _, exists := seen[write.path]; exists {
			continue
		}
		seen[write.path] = struct{}{}
		nodes = append(nodes, write.path)
	}
	edges := map[string]map[string]struct{}{}
	for _, path := range nodes {
		edges[path] = map[string]struct{}{}
	}
	for _, computation := range computations {
		for _, write := range computation.effects.writes {
			if write.path == "" {
				continue
			}
			for read := range computation.effects.reads {
				for _, target := range nodes {
					if componentComputationPathsOverlap(read, target) {
						edges[write.path][target] = struct{}{}
					}
				}
			}
		}
	}
	active := map[string]struct{}{}
	complete := map[string]struct{}{}
	var visit func(string) bool
	visit = func(path string) bool {
		if _, exists := active[path]; exists {
			return true
		}
		if _, exists := complete[path]; exists {
			return false
		}
		active[path] = struct{}{}
		for dependency := range edges[path] {
			if visit(dependency) {
				return true
			}
		}
		delete(active, path)
		complete[path] = struct{}{}
		return false
	}
	for _, path := range nodes {
		if !visit(path) {
			continue
		}
		var location *ast.Node
		for _, write := range writes {
			if write.path == path {
				location = write.node
				break
			}
		}
		return componentComputationError(
			sourceFile,
			location,
			fmt.Sprintf(
				"error: derived state assignment involving %s creates a reactive dependency cycle; wrap one read in peek(() => ...) for a snapshot or move deliberate feedback into a local task function with a final TaskContext policy parameter",
				path,
			),
		)
	}
	return nil
}

func componentComputationPathsOverlap(left string, right string) bool {
	return left == right ||
		strings.HasPrefix(left, right+".") ||
		strings.HasPrefix(right, left+".")
}

func analyzeComponentComputationLocals(
	component *ast.Node,
	statements []*ast.Node,
	environment map[string]struct{},
) componentComputationLocals {
	locals := componentComputationLocals{
		reactive: make(map[string]struct{}, len(environment)),
	}
	for name := range environment {
		locals.reactive[name] = struct{}{}
	}
	for _, parameter := range component.Parameters() {
		name := parameter.Name()
		if name == nil || name.Kind == ast.KindThisKeyword ||
			(ast.IsIdentifier(name) && name.Text() == "this") {
			continue
		}
		names := componentBindingNames(name)
		for _, binding := range names {
			locals.reactive[binding] = struct{}{}
		}
		if ast.IsIdentifier(name) {
			locals.props = name.Text()
		}
		break
	}
	changed := true
	for changed {
		changed = false
		for _, statement := range statements {
			if !ast.IsVariableStatement(statement) {
				continue
			}
			list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			for _, declarationNode := range list.Declarations.Nodes {
				declaration := declarationNode.AsVariableDeclaration()
				name := declaration.Name()
				if name == nil || !ast.IsIdentifier(name) ||
					declaration.Initializer == nil {
					continue
				}
				if _, exists := locals.reactive[name.Text()]; exists {
					continue
				}
				if containsComponentReactiveRead(declaration.Initializer, locals) {
					locals.reactive[name.Text()] = struct{}{}
					changed = true
				}
			}
		}
	}
	return locals
}

func inspectComponentComputationStatement(
	statement *ast.Node,
	locals componentComputationLocals,
) componentComputationEffects {
	effects := componentComputationEffects{
		reads:  map[string]struct{}{},
		writes: []componentComputationWrite{},
	}
	var visit func(*ast.Node, bool)
	visit = func(node *ast.Node, assignmentTarget bool) {
		if node == nil ||
			(node != statement && ast.IsFunctionLike(node)) ||
			isComponentObservationBoundary(node) {
			return
		}
		if ast.IsBinaryExpression(node) {
			binary := node.AsBinaryExpression()
			if binary.OperatorToken.Kind >= ast.KindFirstAssignment &&
				binary.OperatorToken.Kind <= ast.KindLastAssignment {
				for _, target := range componentComputationStateTargets(binary.Left) {
					path, _ := componentComputationStatePath(target)
					effects.writes = append(effects.writes, componentComputationWrite{
						node: target,
						path: path,
					})
				}
				visit(binary.Left, true)
				visit(binary.Right, false)
				return
			}
		}
		var operand *ast.Node
		if ast.IsPrefixUnaryExpression(node) {
			unary := node.AsPrefixUnaryExpression()
			if unary.Operator == ast.KindPlusPlusToken ||
				unary.Operator == ast.KindMinusMinusToken {
				operand = unary.Operand
			}
		} else if ast.IsPostfixUnaryExpression(node) {
			unary := node.AsPostfixUnaryExpression()
			if unary.Operator == ast.KindPlusPlusToken ||
				unary.Operator == ast.KindMinusMinusToken {
				operand = unary.Operand
			}
		}
		if operand != nil {
			if path, ok := componentComputationStatePath(operand); ok {
				effects.writes = append(effects.writes, componentComputationWrite{
					node: operand,
					path: path,
				})
			}
			visit(operand, true)
			return
		}
		if path, ok := componentComputationStatePath(node); ok && !assignmentTarget {
			effects.reactive = true
			effects.reads[path] = struct{}{}
			return
		}
		if isComponentGetContextCall(node) {
			effects.reactive = true
		}
		if ast.IsIdentifier(node) && !assignmentTarget &&
			!isNonReferenceComponentIdentifier(node) {
			if node.Text() == locals.props {
				effects.reactive = true
			}
			if _, exists := locals.reactive[node.Text()]; exists {
				effects.reactive = true
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child, assignmentTarget)
			return false
		})
	}
	visit(statement, false)
	return effects
}

func containsComponentReactiveRead(
	root *ast.Node,
	locals componentComputationLocals,
) bool {
	found := false
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		if node == nil || found ||
			(node != root && ast.IsFunctionLike(node)) ||
			isComponentObservationBoundary(node) {
			return
		}
		if _, ok := componentComputationStatePath(node); ok ||
			isComponentGetContextCall(node) {
			found = true
			return
		}
		if ast.IsIdentifier(node) && !isNonReferenceComponentIdentifier(node) {
			if node.Text() == locals.props {
				found = true
				return
			}
			if _, exists := locals.reactive[node.Text()]; exists {
				found = true
				return
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child)
			return false
		})
	}
	visit(root)
	return found
}

func isComponentObservationBoundary(node *ast.Node) bool {
	if isComponentPeekCall(node) {
		return true
	}
	_, logging := canonicalComponentLogLevel(node)
	return logging
}

func componentComputationEnvironmentBindings(
	sourceFile *ast.SourceFile,
) map[string]struct{} {
	bindings := make(map[string]struct{}, len(browserGlobals))
	for name := range browserGlobals {
		bindings[name] = struct{}{}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !ast.IsStringLiteral(declaration.ModuleSpecifier) ||
			!serverOnlyModule(declaration.ModuleSpecifier.Text()) ||
			declaration.ImportClause == nil {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause.Name() != nil {
			bindings[clause.Name().Text()] = struct{}{}
		}
		named := clause.NamedBindings
		if named == nil {
			continue
		}
		if ast.IsNamespaceImport(named) {
			bindings[named.Name().Text()] = struct{}{}
			continue
		}
		for _, element := range named.AsNamedImports().Elements.Nodes {
			name := element.Name()
			if name != nil {
				bindings[name.Text()] = struct{}{}
			}
		}
	}
	return bindings
}

func isComponentGetContextCall(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	expression := node.AsCallExpression().Expression
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	return member.Expression.Kind == ast.KindThisKeyword &&
		member.Name() != nil &&
		member.Name().Text() == "getContext"
}

func isComponentPeekCall(node *ast.Node) bool {
	return ast.IsCallExpression(node) &&
		ast.IsIdentifier(node.AsCallExpression().Expression) &&
		node.AsCallExpression().Expression.Text() == "peek"
}

func isNonReferenceComponentIdentifier(node *ast.Node) bool {
	if ast.IsDeclarationName(node) {
		return true
	}
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsPropertyAccessExpression(parent) &&
		parent.AsPropertyAccessExpression().Name() == node {
		return true
	}
	if ast.IsPropertyAssignment(parent) &&
		parent.AsPropertyAssignment().Name() == node {
		return true
	}
	return false
}

func componentComputationStatePath(node *ast.Node) (string, bool) {
	segments := []string{}
	current := node
	for ast.IsPropertyAccessExpression(current) ||
		ast.IsElementAccessExpression(current) {
		if ast.IsPropertyAccessExpression(current) {
			member := current.AsPropertyAccessExpression()
			if member.Expression.Kind == ast.KindThisKeyword &&
				member.Name() != nil &&
				member.Name().Text() == "state" {
				path := "this.state"
				if len(segments) != 0 {
					path += "." + strings.Join(segments, ".")
				}
				return path, true
			}
			if member.Name() == nil {
				return "", false
			}
			segments = append([]string{member.Name().Text()}, segments...)
			current = member.Expression
			continue
		}
		member := current.AsElementAccessExpression()
		argument := member.ArgumentExpression
		if argument == nil ||
			(!ast.IsStringLiteral(argument) &&
				!ast.IsNumericLiteral(argument)) {
			return "", false
		}
		segments = append([]string{argument.Text()}, segments...)
		current = member.Expression
	}
	return "", false
}

func componentComputationStateTargets(node *ast.Node) []*ast.Node {
	if _, ok := componentComputationStatePath(node); ok {
		return []*ast.Node{node}
	}
	if ast.IsArrayLiteralExpression(node) {
		result := []*ast.Node{}
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			if ast.IsOmittedExpression(element) {
				continue
			}
			if ast.IsSpreadElement(element) {
				result = append(
					result,
					componentComputationStateTargets(
						element.AsSpreadElement().Expression,
					)...,
				)
				continue
			}
			result = append(result, componentComputationStateTargets(element)...)
		}
		return result
	}
	if ast.IsObjectLiteralExpression(node) {
		result := []*ast.Node{}
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsPropertyAssignment(property) {
				result = append(
					result,
					componentComputationStateTargets(
						property.AsPropertyAssignment().Initializer,
					)...,
				)
			} else if ast.IsShorthandPropertyAssignment(property) {
				result = append(result, componentComputationStateTargets(property.Name())...)
			} else if ast.IsSpreadAssignment(property) {
				result = append(
					result,
					componentComputationStateTargets(
						property.AsSpreadAssignment().Expression,
					)...,
				)
			}
		}
		return result
	}
	return nil
}

func isComponentComputationFunction(
	node *ast.Node,
	sourceFile *ast.SourceFile,
) bool {
	if !ast.IsFunctionDeclaration(node) &&
		!ast.IsFunctionExpression(node) &&
		!ast.IsArrowFunction(node) {
		return false
	}
	if hasComponentReceiver(node, sourceFile) {
		return true
	}
	if ast.IsArrowFunction(node) {
		return false
	}
	name := node.Name()
	return name != nil &&
		componentName(name.Text()) &&
		node.Body() != nil &&
		containsJSX(node.Body())
}

func visitDirectComponentSyntax(root *ast.Node, visit func(*ast.Node)) {
	var walk func(*ast.Node)
	walk = func(node *ast.Node) {
		if node == nil || (node != root && ast.IsFunctionLike(node)) {
			return
		}
		visit(node)
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(root)
}

func collectDirectComponentAwaits(root *ast.Node) []*ast.Node {
	result := []*ast.Node{}
	// A task or callback declaration is setup data; its internal awaits do not make the containing
	// component definition asynchronous. Only await executed directly by setup belongs here.
	if isCallableNode(root) {
		return result
	}
	visitDirectComponentSyntax(root, func(node *ast.Node) {
		if ast.IsAwaitExpression(node) {
			result = append(result, node)
		}
	})
	return result
}

func planAsyncComponentComputation(
	sourceFile *ast.SourceFile,
	setupStatements []*ast.Node,
	renderReturn *ast.Node,
	asyncModifier *ast.Node,
	edits *[]sourceEdit,
) error {
	statements := asyncComponentRegion(setupStatements)
	if err := validateAsyncComponentRegion(
		sourceFile,
		statements,
		renderReturn,
	); err != nil {
		return err
	}
	first := statements[0]
	last := statements[len(statements)-1]
	name := fmt.Sprintf("__exactComponentSetupTask_%d", nodeTokenStart(sourceFile, first))
	planned := []sourceEdit{
		sourceEdit{
			start: 0,
			end:   0,
			text:  "import { TaskContext as __exactTaskContext } from \"@exactjs/core\"; ",
			order: -1,
		},
		sourceEdit{
			start: nodeTokenStart(sourceFile, first),
			end:   nodeTokenStart(sourceFile, first),
			text: "async function " + name +
				"(__exactComponentTaskContext: __exactTaskContext = __exactTaskContext.server().blocking()) { ",
			order: 0,
		},
		sourceEdit{
			start: last.End(),
			end:   last.End(),
			text:  " } " + name + "();",
			order: 1,
		},
	}
	if asyncModifier != nil {
		planned = append(planned, sourceEdit{
			start: nodeTokenStart(sourceFile, asyncModifier),
			end:   asyncModifier.End(),
			text:  "",
		})
	}
	*edits = append(*edits, planned...)
	for _, statement := range statements {
		visitDirectComponentSyntax(statement, func(node *ast.Node) {
			if !ast.IsCatchClause(node) {
				return
			}
			block := node.AsCatchClause().Block.AsNode()
			start := nodeTokenStart(sourceFile, block) + 1
			*edits = append(*edits, sourceEdit{
				start: start,
				end:   start,
				text: " if (__exactComponentTaskContext.signal.aborted) " +
					"throw __exactComponentTaskContext.signal.reason;",
				order: 0,
			})
		})
	}
	return nil
}

func asyncComponentRegion(statements []*ast.Node) []*ast.Node {
	firstAwait := -1
	for index, statement := range statements {
		if len(collectDirectComponentAwaits(statement)) != 0 {
			firstAwait = index
			break
		}
	}
	if firstAwait < 0 {
		return statements
	}
	start := firstAwait
	for index := firstAwait - 1; index >= 0; index-- {
		statement := statements[index]
		if isFrameworkSetupRegistration(statement) ||
			hasDirectComponentStateWrite(statement) {
			break
		}
		start = index
	}
	return statements[start:]
}

func hasDirectComponentStateWrite(statement *ast.Node) bool {
	found := false
	visitDirectComponentSyntax(statement, func(node *ast.Node) {
		if found || !ast.IsBinaryExpression(node) {
			return
		}
		binary := node.AsBinaryExpression()
		if binary.OperatorToken.Kind >= ast.KindFirstAssignment &&
			binary.OperatorToken.Kind <= ast.KindLastAssignment &&
			len(componentComputationStateTargets(binary.Left)) != 0 {
			found = true
		}
	})
	return found
}

func isFrameworkSetupRegistration(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	if !ast.IsCallExpression(expression) {
		return false
	}
	callee := expression.AsCallExpression().Expression
	if !ast.IsPropertyAccessExpression(callee) {
		return false
	}
	member := callee.AsPropertyAccessExpression()
	if member.Expression.Kind != ast.KindThisKeyword || member.Name() == nil {
		return false
	}
	switch member.Name().Text() {
	case "onMount", "onRender", "onUnmount", "onActivate",
		"onDeactivate", "setContext":
		return true
	default:
		return false
	}
}

func validateAsyncComponentRegion(
	sourceFile *ast.SourceFile,
	statements []*ast.Node,
	renderReturn *ast.Node,
) error {
	reads := map[string]struct{}{}
	writes := []componentComputationWrite{}
	for _, statement := range statements {
		effects := inspectComponentComputationStatement(
			statement,
			componentComputationLocals{reactive: map[string]struct{}{}},
		)
		for path := range effects.reads {
			reads[path] = struct{}{}
		}
		writes = append(writes, effects.writes...)
	}
	for _, write := range writes {
		if _, exists := reads[write.path]; write.path != "" && exists {
			return componentComputationError(
				sourceFile,
				write.node,
				fmt.Sprintf(
					"error: async derived state assignment to %s reads its own target and would create a reactive cycle; use a local intermediate, peek(() => ...) for a snapshot, or a local task function with a final TaskContext policy parameter",
					write.path,
				),
			)
		}
	}

	setupBindings := map[string]*ast.Node{}
	for _, statement := range statements {
		var regionError error
		visitDirectComponentSyntax(statement, func(node *ast.Node) {
			if regionError != nil {
				return
			}
			if ast.IsVariableDeclaration(node) {
				for _, name := range componentBindingNames(node.Name()) {
					setupBindings[name] = node
				}
			}
			if node != statement && ast.IsReturnStatement(node) {
				expression := node.AsReturnStatement().Expression
				if expression != nil &&
					(isComponentRenderValue(expression) || containsJSX(expression)) {
					regionError = componentComputationError(
						sourceFile,
						node,
						"error: an async component may not select its render function from inside the managed continuation; assign the awaited result to this.state and return one final render function",
					)
				}
			}
		})
		if regionError != nil {
			return regionError
		}
	}
	if renderReturn == nil ||
		renderReturn.AsReturnStatement().Expression == nil ||
		len(setupBindings) == 0 {
		return nil
	}
	var escaped string
	walkNode(renderReturn.AsReturnStatement().Expression, func(node *ast.Node) bool {
		if escaped != "" {
			return false
		}
		if ast.IsIdentifier(node) &&
			!isNonReferenceComponentIdentifier(node) {
			if _, exists := setupBindings[node.Text()]; exists {
				escaped = node.Text()
				return false
			}
		}
		return true
	})
	if escaped != "" {
		return componentComputationError(
			sourceFile,
			setupBindings[escaped],
			fmt.Sprintf(
				"error: async component local %s escapes into the render function before its continuation settles; assign the value to this.state instead",
				escaped,
			),
		)
	}
	return nil
}

func componentBindingNames(name *ast.Node) []string {
	if name == nil {
		return nil
	}
	if ast.IsIdentifier(name) {
		return []string{name.Text()}
	}
	result := []string{}
	if ast.IsArrayBindingPattern(name) {
		for _, element := range name.AsBindingPattern().Elements.Nodes {
			if ast.IsOmittedExpression(element) {
				continue
			}
			result = append(result, componentBindingNames(element.Name())...)
		}
	} else if ast.IsObjectBindingPattern(name) {
		for _, element := range name.AsBindingPattern().Elements.Nodes {
			result = append(result, componentBindingNames(element.Name())...)
		}
	}
	return result
}

func isComponentRenderValue(expression *ast.Node) bool {
	return ast.IsArrowFunction(expression) || ast.IsFunctionExpression(expression)
}
