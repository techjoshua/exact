package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func (lowering *jsxLowering) lowerInvokedTaskOperationWork(
	work *ast.Node,
	operation InvokedTaskOperation,
) *ast.Node {
	frame := &mutationFrame{work: work}
	lowering.mutationFrames = append(lowering.mutationFrames, frame)
	defer func() { lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1] }()
	dependencyCount := len(operation.Arguments)
	hasAuthoredContext := len(work.Parameters()) > dependencyCount
	var context *ast.Node
	if lowering.taskWorkCallsDefinition(work) {
		context, work = lowering.ensureTaskContextParameter(work, dependencyCount)
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
			if !lowering.checking && ast.IsExpressionStatement(current) {
				expression := current.AsExpressionStatement().Expression
				if write, exists := lowering.writes[nodeSpanKey(expression)]; exists && containsEagerAwait(expression) {
					if suspended := lowering.lowerSuspendedStateWrite(expression, write, signal, false, visitor); suspended != nil {
						return lowering.factory.NewExpressionStatement(suspended)
					}
				}
				if write, exists := lowering.writes[nodeSpanKey(expression)]; exists &&
					write.Operation == "assignment" && ast.IsBinaryExpression(expression) &&
					expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken &&
					containsEagerAwait(expression) {
					return lowering.directTaskAssignment(
						visitor.VisitNode(expression.AsBinaryExpression().Right),
						visitor.VisitNode(expression.AsBinaryExpression().Left),
						write, expression.Pos(), false, signal,
					)
				}
			}
			if context != nil && ast.IsCallExpression(current) {
				call := current.AsCallExpression()
				if lowering.taskDefinitionCall(call.Expression) {
					arguments := []*ast.Node{context, visitor.VisitNode(call.Expression)}
					for _, argument := range callArguments(current) {
						arguments = append(arguments, visitor.VisitNode(argument))
					}
					return lowering.taskHelperCall("invokeTask", lowering.names.invokeTask, arguments)
				}
			}
			if write, exists := lowering.writes[nodeSpanKey(current)]; exists && !lowering.checking {
				if containsEagerAwait(current) {
					if suspended := lowering.lowerSuspendedStateWrite(current, write, signal, false, visitor); suspended != nil {
						return suspended
					}
				}
				// Invoked continuations publish collection deltas, just like activated tasks.
				// A generic state mutation updates only the request-local collection and loses
				// the delta required by the browser's collection write contract.
				if lowering.target == TargetServer && (write.Operation == "map-mutation" || write.Operation == "set-mutation") {
					return lowering.lowerServerTaskCollectionWrite(visitor.VisitEachChild(current), write, signal)
				}
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
	rewrittenWork := lowering.finishMutationFrame(lowering.visitor.VisitEachChild(visitor.VisitNode(work)), frame)
	if lowering.target == TargetClient && operation.Placement == "server" {
		rewrittenWork = lowering.clientInvokedTaskContinuationWork(
			operation,
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
	operation InvokedTaskOperation,
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
			lowering.factory.NewStringLiteral(operation.ID, ast.TokenFlagsNone),
			lowering.invokedTaskTransportArguments(args, operation),
			signal,
			lowering.contextBindingArray(lowering.continuationContextWriteBindings(operation.ID)),
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

// setupTaskResultInvocation plans argument preparation separately from publication.
type setupTaskResultInvocation struct {
	preparation []*ast.Node
	expression  *ast.Node
}

// stageTaskResult publishes a setup assignment through its owning activation.
// Proven synchronous scalar results retain synchronous publication. Client/default execution stages publication so an aborted generation
// cannot commit its result. Server executors already own cancellation and
// return the completed activation state, so they commit the write directly.
func (lowering *jsxLowering) stageTaskResult(work *ast.Node, path []string, staged, asynchronous bool) *ast.Node {
	return lowering.setupTaskResultPublication(path, staged, asynchronous, func(args, context *ast.Node) setupTaskResultInvocation {
		return setupTaskResultInvocation{expression: lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(work), nil, nil, lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewSpreadElement(args)}), ast.NodeFlagsNone)}
	})
}

// stageBoundTaskResult gives a setup caller its own publication without changing the shared callee.
func (lowering *jsxLowering) stageBoundTaskResult(callee *ast.Node, path []string, task Task, staged bool) *ast.Node {
	return lowering.setupTaskResultPublication(path, staged, true, func(args, context *ast.Node) setupTaskResultInvocation {
		inputValues := lowering.memberCall(args, "slice", lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone), lowering.factory.NewNumericLiteral("-1", ast.TokenFlagsNone))
		// The activation vector ends with its context. Recover the callee's checked tuple
		// after removing it, including optional inputs that are absent at this call site.
		if tuple, _ := lowering.taskCallableTypes(task); tuple != nil {
			inputValues = lowering.factory.NewAsExpression(lowering.factory.NewAsExpression(inputValues, lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), tuple)
		}
		// Copy the argument vector once, rather than once per forwarded parameter.
		inputs := lowering.factory.NewIdentifier("__exactTaskInputs")
		preparation := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(inputs, nil, nil, inputValues)}), ast.NodeFlagsConst))
		arguments := []*ast.Node{context, callee}
		for index := 0; index < task.ArgumentCount; index++ {
			arguments = append(arguments, lowering.taskCaptureArgument(inputs, index))
		}
		return setupTaskResultInvocation{preparation: []*ast.Node{preparation}, expression: lowering.taskHelperCall("invokeTask", lowering.names.invokeTask, arguments)}
	})
}

// setupTaskResultPublication publishes a settled result through the caller's lifetime.
func (lowering *jsxLowering) setupTaskResultPublication(path []string, staged, asynchronous bool, invoke func(*ast.Node, *ast.Node) setupTaskResultInvocation) *ast.Node {
	args := lowering.factory.NewIdentifier("__exactTaskArgs")
	result := lowering.factory.NewIdentifier("__exactTaskResult")
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
	// Every runtime invocation appends its context, even when an authored input is undefined.
	// Dynamic tuple indexing otherwise leaks that input's optionality into generated context access.
	context = lowering.factory.NewNonNullExpression(context, ast.NodeFlagsNone)
	prepared := invoke(args, context)
	invocation := prepared.expression
	if asynchronous {
		invocation = lowering.factory.NewAwaitExpression(invocation)
	}
	resultDeclaration := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					result,
					nil,
					nil,
					invocation,
				),
			}),
			ast.NodeFlagsConst,
		),
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
		helper, name := "stageTaskMutation", lowering.names.stageTaskMutation
		if !asynchronous {
			helper, name = "taskMutation", lowering.names.taskMutation
		}
		publication = lowering.taskHelperCall(
			helper,
			name,
			[]*ast.Node{signal, lowering.arrow(write)},
		)
	}
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList(append(prepared.preparation, resultDeclaration,
			lowering.factory.NewExpressionStatement(publication),
			lowering.factory.NewReturnStatement(result))),
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
	var modifiers *ast.ModifierList
	if asynchronous {
		modifiers = lowering.factory.NewModifierList([]*ast.Node{lowering.factory.NewModifier(ast.KindAsyncKeyword)})
	}
	return lowering.factory.NewArrowFunction(
		modifiers,
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
			lowering.localizedTransportArguments(args, task.localization),
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
	tasks []Task,
	policies policyAnalysis,
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
	// Server-only setup still publishes shared context into SSR resumptions,
	// even when its browser continuation is omitted from the artifact.
	for _, task := range tasks {
		for _, effect := range task.Contexts {
			if effect.Kind == "write" && contextResidency(effect.Token, policies) == "shared" {
				result[task.ID] = append(result[task.ID], effect.Token)
			}
		}
	}
	return result
}

// continuationContextWriteBindings materializes only analyzed shared writes.
// The write contract survives reused call wrappers, helper calls and omitted
// browser continuations, so lowering must not rediscover it from a rewritten body.
func (lowering *jsxLowering) continuationContextWriteBindings(taskID string) []continuationContextBinding {
	result := []continuationContextBinding{}
	seen := make(map[string]struct{})
	for _, name := range lowering.contextWrites[taskID] {
		if _, duplicate := seen[name]; duplicate {
			continue
		}
		seen[name] = struct{}{}
		parts := strings.Split(name, ".")
		token := lowering.factory.NewIdentifier(parts[0])
		for _, part := range parts[1:] {
			token = lowering.factory.NewPropertyAccessExpression(token, nil, lowering.factory.NewIdentifier(part), ast.NodeFlagsNone)
		}
		result = append(result, continuationContextBinding{name: name, token: token})
	}
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
		if spanInsideTaskCapture(read.Start, read.Start+read.Length, task.localReads) {
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
		// Capture an optional read's receiver, leaving the chain in its work body.
		// Capturing its partial result would lose the absent-receiver short circuit.
		read = taskOptionalReceiverRead(read, analysisWork)
		read = taskComputedReceiverRead(read, analysisWork)
		path = strings.Join(read.Path, ".")
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
			liveExpression := typeLocation
			// Exact path reconstruction loses optional access. Preparation must keep
			// the authored short circuit before a later invocation changes its base.
			if typeLocation != nil && typeLocation.Flags&ast.NodeFlagsOptionalChain != 0 {
				expression = typeLocation
			}
			if projected := lowering.projectTaskStateRead(typeLocation, analysisWork, false); projected != nil {
				liveExpression = projected
			}
			if projected := lowering.projectTaskStateRead(typeLocation, analysisWork, true); projected != nil {
				expression = projected
			}
			if read.Confidence != "exact" {
				expression = typeLocation
				if expression == nil {
					continue
				}
			}
			result = append(result, nativeTaskDependency{
				parameter:      allocate(index),
				liveExpression: liveExpression,
				expression:     expression,
				typeNode:       lowering.taskDependencyType(typeLocation),
				readSpans:      make(map[string]struct{}),
				captureStart:   read.Start,
				captureEnd:     read.Start + read.Length,
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
		captures := taskBindingCaptures(analysisWork, binding, lowering.checker)
		if len(captures) == 0 {
			expression := lowering.factory.NewIdentifier(name)
			if _, derived := lowering.derived[binding.Start]; derived {
				expression = lowering.derivedGet(expression)
			}
			result = append(result, nativeTaskDependency{
				parameter: allocate(len(result)), expression: expression,
				typeNode:     lowering.taskDependencyType(expression),
				bindingStart: binding.Start, bindingName: name,
				readSpans: make(map[string]struct{}),
			})
			continue
		}
		for _, capture := range captures {
			expression := capture.expression
			start, end := expression.Pos(), expression.End()
			if captureContainedByTaskDependency(start, end, result) {
				continue
			}
			result = append(result, nativeTaskDependency{
				parameter: allocate(len(result)), expression: expression,
				typeNode:  lowering.taskDependencyType(expression),
				readSpans: capture.readSpans, captureStart: start, captureEnd: end,
			})
		}
	}
	return result
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
	frame := &mutationFrame{work: work}
	lowering.mutationFrames = append(lowering.mutationFrames, frame)
	defer func() { lowering.mutationFrames = lowering.mutationFrames[:len(lowering.mutationFrames)-1] }()
	replacements := make(map[string]string)
	liveValues := make(map[string]*ast.Node)
	liveTypes := make(map[string]*ast.Node)
	for _, dependency := range dependencies {
		for span := range dependency.readSpans {
			replacements[span] = dependency.parameter
			liveValues[span] = dependency.liveExpression
			if liveValues[span] == nil {
				liveValues[span] = dependency.expression
			}
			liveTypes[span] = dependency.typeNode
		}
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsTypeNode(node) {
				// Type annotations have no runtime captures. Synthesized type members
				// also need not have source parents for declaration-name classification.
				return node
			}
			if parameter := lowering.taskCallbackParameterType(node, visitor); parameter != nil {
				return parameter
			}
			if parameter, exists := replacements[nodeSpanKey(node)]; exists {
				// Dependency reads must never replace an authored assignment reference.
				// Its receiver can still be projected or captured while the final slot remains writable.
				if pendingReadIsWriteTarget(node) {
					if projected := lowering.projectTaskStateRead(node, work, false); projected != nil {
						return projected
					}
					return visitor.VisitEachChild(node)
				}
				if spanInsideTaskCapture(node.Pos(), node.End(), task.potentialLocalReads) {
					// A live read still needs its state projection when the executor leaves the
					// setup lexical scope. Retaining a captured alias would reference an absent local.
					value := liveValues[nodeSpanKey(node)]
					if value != nil {
						typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending
						if typeNode == nil {
							typeNode = liveTypes[nodeSpanKey(node)]
						}
						if typeNode != nil && !optionalChainContinuesThrough(node.Parent, node) {
							// An assertion inside a continuing chain adds parentheses and
							// ends native short circuiting. Its live source already owns its type.
							value = lowering.factory.NewAsExpression(value, typeNode)
						}
						return value
					}
					return visitor.VisitEachChild(node)
				}
				replacement := lowering.factory.NewIdentifier(parameter)
				replacement.Loc = node.Loc
				return replacement
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
	return lowering.finishMutationFrame(lowering.visitor.VisitEachChild(rewritten), frame)
}

// Captures are evaluated by the invoking owner for each generation, after authored arguments.
func (lowering *jsxLowering) invokedTaskTransportArguments(args *ast.Node, operation InvokedTaskOperation) *ast.Node {
	if len(operation.captures) == 0 {
		return lowering.localizedTransportArguments(args, operation.localization)
	}
	values := []*ast.Node{lowering.factory.NewSpreadElement(args)}
	for _, capture := range operation.captures {
		values = append(values, lowering.visitor.VisitNode(capture.expression))
	}
	return lowering.localizedTransportArguments(lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false), operation.localization)
}
