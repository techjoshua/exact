package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

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
		if lowering.taskOptimisticStatement(statement) {
			// The alias declaration remains server work. Invoke the proven capability
			// through the supplied context rather than capturing that server local.
			call := unwrapRenderExpression(statement.AsExpressionStatement().Expression).AsCallExpression()
			parameters := work.Parameters()
			if len(parameters) != 0 && ast.IsIdentifier(parameters[len(parameters)-1].Name()) {
				callee := lowering.factory.NewPropertyAccessExpression(parameters[len(parameters)-1].Name(), nil, lowering.factory.NewIdentifier("optimistic"), ast.NodeFlagsNone)
				statement = lowering.factory.NewExpressionStatement(lowering.factory.UpdateCallExpression(call, callee, call.QuestionDotToken, call.TypeArguments, call.Arguments, call.Flags))
			}
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
	arguments := []*ast.Node{}
	// Expand the fixed argument vector by index. Spreading an untyped vector into
	// a fixed signature loses TypeScript tuple checking, including zero-argument tasks.
	for index := 0; index < len(work.Parameters())-1; index++ {
		arguments = append(arguments, lowering.taskCaptureArgument(args, index))
	}
	arguments = append(arguments, context)
	return lowering.factory.NewExpressionStatement(
		lowering.factory.NewCallExpression(
			lowering.factory.NewParenthesizedExpression(prelude),
			nil,
			nil,
			lowering.factory.NewNodeList(arguments),
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
		if !lowering.taskOptimisticStatement(statement) {
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

// taskOptimisticStatement moves only the framework capability's selected method.
// Helpers with the same name retain their authored placement and execution order.
func (lowering *jsxLowering) taskOptimisticStatement(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := unwrapRenderExpression(statement.AsExpressionStatement().Expression)
	if !ast.IsCallExpression(expression) || lowering.checker == nil {
		return false
	}
	// Rewritten task bodies contain synthesized wrappers. Signature identity must
	// be checked against the authored call, before mutation lowering replaces it.
	authored := nodeAtSpan(lowering.sourceFile.AsNode(), expression.Pos(), expression.End()-expression.Pos())
	if authored != nil && ast.IsExpressionStatement(authored) {
		authored = authored.AsExpressionStatement().Expression
	}
	if authored != nil {
		authored = unwrapRenderExpression(authored)
	}
	return isTaskOptimisticCapabilityCall(authored, lowering.checker)
}

// isTaskOptimisticCapabilityCall selects the framework declaration, including callable aliases.
func isTaskOptimisticCapabilityCall(authored *ast.Node, typeChecker *checker.Checker) bool {
	return isTaskContextCapabilityCall(authored, typeChecker, "optimistic")
}

// Task capabilities are selected by their framework method declaration, never receiver spelling.
func isTaskContextCapabilityCall(authored *ast.Node, typeChecker *checker.Checker, method string) bool {
	if authored == nil || !ast.IsCallExpression(authored) || typeChecker == nil {
		return false
	}
	// Inspect callable types without checking call arguments or solving generic
	// overloads. Flow-narrowed aliases must retain their selected method signatures.
	callable := typeChecker.GetTypeAtLocation(authored.AsCallExpression().Expression)
	signatures := typeChecker.GetSignaturesOfType(callable, checker.SignatureKindCall)
	if len(signatures) != 0 {
		possibleCapability := false
		for _, candidate := range signatures {
			declaration := candidate.Declaration()
			// Composite and synthetic signatures stay conservative.
			if declaration == nil || taskContextCapabilityDeclaration(declaration, method) {
				possibleCapability = true
				break
			}
		}
		if !possibleCapability {
			return false
		}
	}
	signature := typeChecker.GetResolvedSignature(authored)
	return signature != nil && taskContextCapabilityDeclaration(signature.Declaration(), method)
}

// Only the framework's TaskContext method declaration owns the capability.
// Source identity is checked after structural rejection to keep ordinary calls cheap.
func taskContextCapabilityDeclaration(declaration *ast.Node, method string) bool {
	if declaration == nil {
		return false
	}
	if declaration.Kind != ast.KindMethodSignature || declaration.Name() == nil || (!ast.IsIdentifier(declaration.Name()) && !ast.IsStringLiteral(declaration.Name())) || declaration.Name().Text() != method {
		return false
	}
	parent := declaration.Parent
	if parent == nil || !ast.IsInterfaceDeclaration(parent) || parent.Name().Text() != "TaskContext" {
		return false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil {
		return false
	}
	name := strings.ReplaceAll(source.FileName(), `\`, "/")
	return strings.Contains(name, "/packages/core/") || strings.Contains(name, "/@exactjs/core/")
}

func (lowering *jsxLowering) manageTaskWork(
	work *ast.Node,
	task Task,
	dependencyCount int,
	callsTaskDefinition bool,
	directServer bool,
) *ast.Node {
	nativeCleanup := taskContainsNativeCleanup(work)
	if len(task.Resources) == 0 && len(task.SignalCalls) == 0 &&
		len(task.Writes) == 0 && !taskContainsAwait(work) &&
		!callsTaskDefinition && !nativeCleanup {
		return work
	}
	var signal *ast.Node
	var context *ast.Node
	resourcePlan := newTaskResourceLoweringPlan(task.Resources, task.SignalCalls)
	if callsTaskDefinition || len(resourcePlan.releases) != 0 {
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
	var pendingState *ast.Node
	if lowering.taskNeedsPendingState(task) {
		pendingState = lowering.factory.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactTaskState_%d", task.WorkStart)))
	}
	lowering.pendingStates = append(lowering.pendingStates, pendingState)
	defer func() { lowering.pendingStates = lowering.pendingStates[:len(lowering.pendingStates)-1] }()
	locals := &blockingTaskLocals{writes: map[string]*blockingTaskLocal{}, reads: map[string]*blockingTaskLocal{}}
	if pendingState == nil {
		locals = lowering.planBlockingTaskLocals(task)
	}
	lowering.blockingLocals = append(lowering.blockingLocals, locals)
	defer func() { lowering.blockingLocals = lowering.blockingLocals[:len(lowering.blockingLocals)-1] }()
	var visitor *ast.NodeVisitor
	mutationSignal := signal
	// Proven synchronous value propagation has no authored cancellation boundary.
	// Authored tasks still fence writes in callbacks even without an await expression.
	if task.CompilerComputation && !task.Async && !taskContainsAwait(work) {
		mutationSignal = nil
	}
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsMethodDeclaration(node) || ast.IsGetAccessorDeclaration(node) || ast.IsSetAccessorDeclaration(node) || ast.IsConstructorDeclaration(node) {
				// Method definitions are not executions of the surrounding task. Computed names
				// still evaluate here, while parameter defaults and bodies belong to their call.
				definition := ast.NewNodeVisitor(visitor.Visit, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{
					VisitParameters:   func(nodes *ast.ParameterList, _ *ast.NodeVisitor) *ast.ParameterList { return nodes },
					VisitFunctionBody: func(body *ast.BlockOrExpression, _ *ast.NodeVisitor) *ast.BlockOrExpression { return body },
				})
				return definition.VisitEachChild(node)
			}
			if released := lowering.lowerTaskResourceRelease(node, signal, pendingState, visitor, resourcePlan); released != nil {
				return released
			}

			if pendingState != nil {
				if ast.IsExpressionStatement(node) {
					expression := node.AsExpressionStatement().Expression
					if _, exists := lowering.writes[nodeSpanKey(expression)]; exists {
						return lowering.factory.NewExpressionStatement(visitor.VisitNode(expression))
					}
				}
				if operation := lowering.pendingStateOperation(node, pendingState, visitor); operation != nil {
					return operation
				}
			}
			if local := locals.reads[nodeSpanKey(node)]; local != nil && !identifierIsWriteTarget(node) && !isDeleteOperand(node) {
				return lowering.blockingLocalRead(local, visitor.VisitEachChild(node))
			}

			if !lowering.checking && mutationSignal != nil && !directServer && task.Readiness == "blocking" && lowering.target != TargetServer {
				if write, exists := lowering.writes[nodeSpanKey(node)]; exists && (ast.IsBinaryExpression(node) || ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node)) {
					if expression := lowering.lowerSuspendedStateWrite(node, write, mutationSignal, true, visitor); expression != nil {
						return expression
					}
				}
			}
			if !lowering.checking && ast.IsExpressionStatement(node) {
				expression := node.AsExpressionStatement().Expression
				if write, exists := lowering.writes[nodeSpanKey(expression)]; exists {
					if containsEagerAwait(expression) {
						if suspended := lowering.lowerSuspendedStateWrite(expression, write, mutationSignal, !directServer && task.Readiness == "blocking" && lowering.target != TargetServer, visitor); suspended != nil {
							return lowering.factory.NewExpressionStatement(suspended)
						}
					}
					if write.Operation == "assignment" &&
						ast.IsBinaryExpression(expression) &&
						expression.AsBinaryExpression().OperatorToken.Kind ==
							ast.KindEqualsToken {
						value := visitor.VisitNode(
							expression.AsBinaryExpression().Right,
						)
						if lowering.target == TargetServer ||
							(task.Readiness != "blocking" && !task.Progress) {
							return lowering.directTaskAssignment(
								value,
								visitor.VisitNode(expression.AsBinaryExpression().Left),
								write,
								expression.Pos(),
								directServer,
								mutationSignal,
							)
						}
						return lowering.stagedTaskAssignment(
							value,
							write,
							signal,
							expression.Pos(),
						)
					}
					if !directServer && lowering.target != TargetServer && task.Readiness == "blocking" {
						if update := lowering.lowerBlockingConsumedUpdate(expression, write, signal, visitor); update != nil {
							return update
						}
					}
					if directServer {
						if write.Operation == "map-mutation" || write.Operation == "set-mutation" {
							return lowering.factory.NewExpressionStatement(lowering.lowerServerTaskCollectionWrite(expression, write, signal))
						}
						mutation := visitor.VisitEachChild(expression)
						if write.Operation == "array-mutation" {
							mutation = lowering.lowerStateWrite(mutation, write)
						}
						return lowering.factory.NewExpressionStatement(lowering.fenceTaskMutation(mutation, mutationSignal))
					}
					if lowering.target != TargetServer && (task.Readiness == "blocking" || task.Progress) && (write.Operation == "array-mutation" || write.Operation == "map-mutation" || write.Operation == "set-mutation") {
						if captured := lowering.stagedTaskCollectionArguments(expression, write, signal, visitor); captured != nil {
							return captured
						}
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
							(task.Readiness != "blocking" && !task.Progress) {
							return lowering.factory.NewExpressionStatement(lowering.fenceTaskMutation(mutation, mutationSignal))
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
			if !lowering.checking && mutationSignal != nil {
				if write, exists := lowering.writes[nodeSpanKey(node)]; exists && containsEagerAwait(node) {
					if suspended := lowering.lowerSuspendedStateWrite(node, write, mutationSignal, false, visitor); suspended != nil {
						return suspended
					}
				}
				if write, exists := lowering.writes[nodeSpanKey(node)]; exists && !containsEagerAwait(node) {
					mutation := visitor.VisitEachChild(node)
					if !directServer {
						mutation = lowering.lowerStateWrite(mutation, write)
					}
					if mutation != nil {
						return lowering.fenceTaskMutation(mutation, mutationSignal)
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
			if resource := lowering.lowerPlannedTaskResource(node, signal, context, visitor, directServer, resourcePlan); resource != nil {
				return resource
			}

			if ast.IsAwaitExpression(node) {
				argument := visitor.VisitNode(node.AsAwaitExpression().Expression)
				if directServer {
					return lowering.factory.NewAwaitExpression(
						lowering.call(lowering.names.serverTaskAwait, []*ast.Node{signal, argument}),
					)
				}
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
	if pendingState != nil {
		root := lowering.factory.NewPropertyAccessExpression(lowering.factory.NewThisExpression(), nil, lowering.factory.NewIdentifier("state"), ast.NodeFlagsNone)
		initializer := lowering.taskHelperCall("createTaskState", lowering.names.createTaskState, []*ast.Node{signal, root})
		declaration := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(pendingState, nil, nil, initializer)}), ast.NodeFlagsConst))
		statements := []*ast.Node{declaration}
		if ast.IsBlock(body) {
			statements = append(statements, body.AsBlock().Statements.Nodes...)
		} else {
			statements = append(statements, lowering.factory.NewReturnStatement(body))
		}
		body = lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	}

	if nativeCleanup && !lowering.checking {
		body = lowering.taskNativeCleanupBody(body, signal)
	}
	return lowering.updateTaskWorkBody(work, body)
}

// fenceTaskMutation preserves cancellation ownership even when authored catch/finally code
// consumes cancellation or a deferred callback runs after its owning generation is cancelled.
func (lowering *jsxLowering) fenceTaskMutation(mutation *ast.Node, signal *ast.Node) *ast.Node {
	if signal == nil {
		return mutation
	}
	return lowering.taskHelperCall("taskMutation", lowering.names.taskMutation, []*ast.Node{signal, lowering.arrow(mutation)})
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

func (lowering *jsxLowering) taskDefinitionCall(expression *ast.Node) bool {
	task, found := lowering.taskDefinitionAtCall(expression)
	return found && !task.Progress && !(lowering.target == TargetServer && task.Placement == "client")
}

func (lowering *jsxLowering) taskDefinitionAtCall(expression *ast.Node) (task Task, found bool) {
	if expression == nil ||
		expression.Pos() < 0 ||
		expression.End() < expression.Pos() ||
		expression.End() > len(lowering.sourceFile.Text()) {
		return Task{}, false
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
		task, found = lowering.taskDefinitions[ast.GetSymbolId(symbol)]
		return task, found
	}
	if ast.IsIdentifier(expression) {
		task, found = lowering.taskDefinitionNames[expression.Text()]
	}
	return task, found
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
		context := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactTaskContext"))
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
	context := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactTaskContext"))
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
	if !ast.IsCallExpression(node) {
		return nil
	}
	call := node.AsCallExpression()
	method := lowering.stateMutationMethod(call.Expression)
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
	result := lowering.taskHelperCall(
		"mutateTaskCollection",
		lowering.names.taskCollectionMutation,
		[]*ast.Node{
			signal,
			lowering.stateWriteRoot(write),
			lowering.stateWritePathNode(write),
			lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone),
			method,
			lowering.arrow(
				lowering.factory.NewArrayLiteralExpression(
					lowering.factory.NewNodeList(arguments),
					false,
				),
			),
		},
	)
	return lowering.typedMutationResult(node, result)
}

func (lowering *jsxLowering) directTaskAssignment(
	value *ast.Node,
	target *ast.Node,
	writeEffect StateWrite,
	position int,
	directServer bool,
	signal *ast.Node,
) *ast.Node {
	value = lowering.contextualAssignmentValue(value, writeEffect)
	writeValue := value
	statements := []*ast.Node{}
	if containsEagerAwait(value) {
		local := lowering.factory.NewIdentifier(
			lowering.uniqueMutationName(fmt.Sprintf("__exactTaskMutation_%d", position)),
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
	var write *ast.Node
	if directServer {
		write = lowering.factory.NewBinaryExpression(
			nil,
			target,
			nil,
			lowering.factory.NewToken(ast.KindEqualsToken),
			writeValue,
		)
	} else {
		name, reference := lowering.stateWriteReferenceForWrite(
			writeEffect,
			lowering.names.write,
			lowering.names.writeState,
		)
		argument := lowering.arrow(writeValue)
		if name == lowering.names.writeState {
			argument = writeValue
		}
		write = lowering.call(
			name,
			[]*ast.Node{
				lowering.stateWriteRoot(writeEffect),
				reference,
				argument,
			},
		)
	}
	statements = append(
		statements,
		lowering.factory.NewExpressionStatement(lowering.fenceTaskMutation(write, signal)),
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
	value = lowering.contextualAssignmentValue(value, writeEffect)
	writeValue := value
	statements := []*ast.Node{}
	var local *blockingTaskLocal
	if len(lowering.blockingLocals) > 0 {
		local = lowering.blockingLocals[len(lowering.blockingLocals)-1].writes[fmt.Sprintf("%d:%d", writeEffect.Start, writeEffect.Length)]
	}
	// Publication owns the write, never evaluation of its authored RHS. Capture even
	// when no later state read requires a compiler-local pending cell.
	{
		local := lowering.factory.NewIdentifier(
			lowering.uniqueMutationName(fmt.Sprintf("__exactTaskMutation_%d", position)),
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
							lowering.mutationFacts.at(SourceSpan{Start: writeEffect.Start, Length: writeEffect.Length}).destination,
							value,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
		writeValue = local
	}
	if local != nil {
		statements = append(statements, lowering.factory.NewExpressionStatement(lowering.rememberBlockingLocal(local, writeValue)))
	}
	name, reference := lowering.stateWriteReferenceForWrite(
		writeEffect,
		lowering.names.write,
		lowering.names.writeState,
	)
	argument := lowering.arrow(writeValue)
	if name == lowering.names.writeState {
		argument = writeValue
	}
	write := lowering.call(
		name,
		[]*ast.Node{
			lowering.stateWriteRoot(writeEffect),
			reference,
			argument,
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
	directServer bool,
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
	abortHelper, abortName := "withAbortSignal", lowering.names.abortOptions
	optionsHelper, optionsName := "withTaskSignal", lowering.names.taskOptions
	combinedHelper, combinedName := "combineTaskSignal", lowering.names.taskCombined
	if signalCall.ExistingOnly {
		abortHelper, abortName = "withExistingAbortSignal", lowering.names.cleanupAbortOptions
		optionsHelper, optionsName = "withExistingTaskSignal", lowering.names.cleanupTaskOptions
		combinedHelper, combinedName = "combineExistingTaskSignal", lowering.names.cleanupTaskCombined
	}
	switch {
	case signalCall.EventOptions:
		arguments[signalCall.Parameter] = lowering.taskHelperCall(
			abortHelper,
			abortName,
			[]*ast.Node{existing, signal},
		)
	case signalCall.Mode == "options":
		arguments[signalCall.Parameter] = lowering.taskHelperCall(
			optionsHelper,
			optionsName,
			[]*ast.Node{existing, signal},
		)
	default:
		if directServer && !signalCall.ExistingOnly && (isUndefinedIdentifier(existing) || sameSimpleExpression(existing, signal)) {
			arguments[signalCall.Parameter] = signal
		} else {
			combined := []*ast.Node{signal}
			if !isUndefinedIdentifier(existing) {
				combined = append(combined, existing)
			}
			arguments[signalCall.Parameter] = lowering.taskHelperCall(
				combinedHelper,
				combinedName,
				combined,
			)
		}
	}
	if directServer && lowering.importedTaskRuntimeHelper(call.Expression, "taskTimeout") {
		return lowering.call(lowering.names.serverTaskTimeout, arguments)
	}
	return lowering.factory.NewCallExpression(
		call.Expression,
		call.QuestionDotToken,
		call.TypeArguments,
		lowering.factory.NewNodeList(arguments),
		call.Flags,
	)
}

func sameSimpleExpression(left *ast.Node, right *ast.Node) bool {
	if left == nil || right == nil || left.Kind != right.Kind {
		return false
	}
	if ast.IsIdentifier(left) {
		return left.Text() == right.Text()
	}
	if left.Kind == ast.KindThisKeyword {
		return true
	}
	if ast.IsPropertyAccessExpression(left) {
		leftAccess := left.AsPropertyAccessExpression()
		rightAccess := right.AsPropertyAccessExpression()
		return leftAccess.Name().Text() == rightAccess.Name().Text() &&
			sameSimpleExpression(leftAccess.Expression, rightAccess.Expression)
	}
	return false
}

func (lowering *jsxLowering) importedTaskRuntimeHelper(
	expression *ast.Node,
	exportName string,
) bool {
	if lowering.checker == nil {
		return false
	}
	reference, exists := externalImportForExpression(
		expression,
		lowering.externalImports,
		lowering.checker,
	)
	if !exists || reference.exportName != exportName {
		return false
	}
	switch reference.moduleSpecifier {
	case "@exactjs/core", "@exactjs/core/tasks", "@exactjs/core/tasks/v1":
		return true
	default:
		return false
	}
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
	context *ast.Node,
	visitor *ast.NodeVisitor,
	directServer bool,
) *ast.Node {
	visited := visitor.VisitEachChild(node)
	switch resource.Kind {
	case "timeout":
		if directServer {
			return lowering.call(
				lowering.names.serverTaskTimeout,
				append([]*ast.Node{signal}, callArguments(visited)...),
			)
		}
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
		if len(resource.ReleaseCalls) != 0 {
			arguments[0] = context
			return lowering.taskHelperCall("ownReleasableTaskResource", lowering.names.taskReleasableResource, arguments)
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
