package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
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

func (lowering *jsxLowering) manageTaskWork(
	work *ast.Node,
	task Task,
	dependencyCount int,
	callsTaskDefinition bool,
	directServer bool,
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
								visitor.VisitNode(expression.AsBinaryExpression().Left),
								write,
								expression.Pos(),
								directServer,
							)
						}
						return lowering.stagedTaskAssignment(
							value,
							write,
							signal,
							expression.Pos(),
						)
					}
					if directServer {
						return visitor.VisitEachChild(node)
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
					directServer,
				)
			}
			if signalCall, exists := signals[nodeSpanKey(node)]; exists {
				return lowering.lowerTaskSignalCall(
					node,
					signalCall,
					signal,
					visitor,
					directServer,
				)
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
	target *ast.Node,
	writeEffect StateWrite,
	position int,
	directServer bool,
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
		write = lowering.call(
			name,
			[]*ast.Node{
				lowering.stateWriteRoot(writeEffect),
				reference,
				lowering.arrow(writeValue),
			},
		)
	}
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
	name, reference := lowering.stateWriteReferenceForWrite(
		writeEffect,
		lowering.names.write,
		lowering.names.writeState,
	)
	write := lowering.call(
		name,
		[]*ast.Node{
			lowering.stateWriteRoot(writeEffect),
			reference,
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
		if directServer && (isUndefinedIdentifier(existing) || sameSimpleExpression(existing, signal)) {
			arguments[signalCall.Parameter] = signal
		} else {
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
		collectExternalImportBindings(lowering.sourceFile, lowering.checker),
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
