package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/nodebuilder"
)

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
	directServer bool,
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
		directServer,
	)
	return lowering.visitor.VisitEachChild(rewritten)
}
