package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

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
	if lowering.target == TargetClient &&
		lowering.contractProjection == ComponentContractProjectionHydrate &&
		task.Placement == "server" && !task.Invoked {
		// Same-build hydration resumes the state published by server setup. A setup-only
		// server task has no client invocation path, so retaining a dispatch stub would
		// rerun work already completed for this response and pull transport machinery in.
		return lowering.factory.NewVoidExpression(
			lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
		)
	}
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
	directServerComputation := lowering.target == TargetServer &&
		directServerSetupComputation(task) && len(contextBindings) == 0
	directComponent, directTransition, directServerSlice :=
		lowering.directServerSetupTransition(task)
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
			if directServerComputation || directServerSlice {
				nextArguments = append(nextArguments, visited)
			} else {
				nextArguments = append(
					nextArguments,
					lowering.componentReactive(visited),
				)
			}
		}
	} else {
		dependencies = lowering.inferredTaskDependencies(task, work)
		argumentOffset = len(dependencies)
		for _, dependency := range dependencies {
			if directServerComputation || directServerSlice {
				nextArguments = append(
					nextArguments,
					lowering.visitor.VisitNode(dependency.expression),
				)
			} else {
				nextArguments = append(
					nextArguments,
					lowering.componentReactive(dependency.expression),
				)
			}
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
		directServerComputation || directServerSlice,
	)
	if directServerComputation {
		arguments := append([]*ast.Node{}, nextArguments...)
		arguments = append(arguments, lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.property(
					lowering.factory.NewIdentifier("signal"),
					lowering.factory.NewVoidExpression(
						lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
					),
				),
			}),
			false,
		))
		return lowering.factory.NewCallExpression(
			lowering.factory.NewParenthesizedExpression(rewrittenWork),
			nil,
			nil,
			lowering.factory.NewNodeList(arguments),
			ast.NodeFlagsNone,
		)
	}
	if directServerSlice {
		slice := lowering.serverTaskSlice(
			task,
			directComponent,
			directTransition,
			runtimeArgumentCount,
		)
		return lowering.call(
			lowering.names.activateServerTask,
			append(
				[]*ast.Node{
					lowering.factory.NewThisExpression(),
					slice,
					lowering.factory.NewStringLiteral(task.ID, ast.TokenFlagsNone),
					rewrittenWork,
				},
				nextArguments...,
			),
		)
	}
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
		if lowering.contractProjection == ComponentContractProjectionHydrate &&
			strings.HasPrefix(lowering.functionTaskLabel(task), "__exactComponentComputation_") &&
			!task.Async && len(contextBindings) == 0 && len(task.ResultWritePath) == 0 {
			return lowering.taskHelperCall(
				"activateComputationForHost",
				lowering.names.activateComputation,
				append(
					[]*ast.Node{lowering.factory.NewThisExpression(), rewrittenWork},
					nextArguments...,
				),
			)
		}
		if lowering.usesCompiledClientLatestLane(task, work, captureArguments) {
			return lowering.taskHelperCall(
				"activateCompiledClientLatestTaskForHost",
				lowering.names.activateCompiledLatest,
				append(
					[]*ast.Node{
						lowering.factory.NewThisExpression(),
						lowering.factory.NewStringLiteral(
							lowering.functionTaskLabel(task),
							ast.TokenFlagsNone,
						),
						rewrittenWork,
					},
					nextArguments...,
				),
			)
		}
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
	if lowering.target == TargetServer && task.Placement == "client" {
		return lowering.factory.NewVariableStatement(
			nil,
			lowering.factory.NewVariableDeclarationList(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.factory.NewVariableDeclaration(
						declaration.Name(), nil, nil, lowering.inertClientTaskCallable(),
					),
				}),
				ast.NodeFlagsConst,
			),
		)
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
	if lowering.target == TargetServer && task.Placement == "client" {
		return lowering.factory.UpdateVariableDeclaration(
			declaration,
			name,
			declaration.ExclamationToken,
			declaration.Type,
			lowering.inertClientTaskCallable(),
		)
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

// inertClientTaskCallable preserves a referenced callback's identity in server-rendered props
// without retaining its browser-only body, task policy, host binding, or TaskContext defaults.
// Calls to a client-placed task are separately projected out of server setup; this callable is
// therefore only a value placeholder for markup/component composition that cannot execute there.
func (lowering *jsxLowering) inertClientTaskCallable() *ast.Node {
	return lowering.arrow(
		lowering.factory.NewVoidExpression(
			lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
		),
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
	useCompiledLatest := lowering.usesCompiledClientLatestLane(task, work, captureArguments)
	if operation != nil &&
		(operation.Placement == "server" || operation.Placement == "isomorphic") {
		work = lowering.lowerInvokedTaskOperationWork(work, *operation)
	} else {
		work = lowering.rewriteTaskWork(work, nil, task, dependencyCount, false)
	}
	if (operation == nil || operation.Placement == "client") && useCompiledLatest {
		return lowering.taskHelperCall(
			"bindCompiledClientLatestTaskForHost",
			lowering.names.bindCompiledLatest,
			[]*ast.Node{
				lowering.factory.NewThisExpression(),
				lowering.factory.NewStringLiteral(name, ast.TokenFlagsNone),
				work,
			},
		)
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

// usesCompiledClientLatestLane selects the fixed runtime only when the compiler has proved the
// complete policy and the task body cannot request the universal optimistic transaction surface.
// Callers also exclude default-argument capture and transport operations before using this path.
func (lowering *jsxLowering) usesCompiledClientLatestLane(
	task Task,
	work *ast.Node,
	captureArguments *ast.Node,
) bool {
	if lowering.target != TargetClient ||
		lowering.contractProjection == ComponentContractProjectionComplete ||
		task.RequestedPlacement != "client" ||
		task.Concurrency != "latest" ||
		task.Priority != "normal" ||
		task.Readiness != "nonblocking" ||
		task.Detached || task.KeyLength != 0 || captureArguments != nil ||
		len(task.ResultWritePath) != 0 {
		return false
	}
	if !lowering.functionTaskHasCallOnlyReferences(task) {
		return false
	}
	optimistic := false
	walkNode(work, func(node *ast.Node) bool {
		if ast.IsPropertyAccessExpression(node) &&
			node.AsPropertyAccessExpression().Name().Text() == "optimistic" {
			optimistic = true
			return false
		}
		return !optimistic
	})
	return !optimistic
}

// functionTaskHasCallOnlyReferences keeps callable identity and status observation on the
// universal ABI. The compact lane is valid only when every reference invokes the local function.
func (lowering *jsxLowering) functionTaskHasCallOnlyReferences(task Task) bool {
	var declarationName *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() != task.WorkStart || node.End()-node.Pos() != task.WorkLength {
			return declarationName == nil
		}
		if ast.IsFunctionDeclaration(node) {
			declarationName = node.Name()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			declarationName = node.Parent.AsVariableDeclaration().Name()
		}
		return false
	})
	if declarationName == nil || !ast.IsIdentifier(declarationName) {
		return false
	}
	symbol := resolvedCallableSymbol(
		lowering.checker.GetSymbolAtLocation(declarationName),
		lowering.checker,
	)
	if symbol == nil {
		return false
	}
	symbolID := ast.GetSymbolId(symbol)
	callOnly := true
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !callOnly || node == declarationName || !ast.IsIdentifier(node) {
			return callOnly
		}
		candidate := resolvedCallableSymbol(
			lowering.checker.GetSymbolAtLocation(node),
			lowering.checker,
		)
		if candidate == nil || ast.GetSymbolId(candidate) != symbolID {
			return true
		}
		parent := node.Parent
		if parent == nil || !ast.IsCallExpression(parent) ||
			parent.AsCallExpression().Expression != node {
			callOnly = false
			return false
		}
		return true
	})
	return callOnly
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
		false,
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

func indexTasks(tasks []Task) map[string]Task {
	result := make(map[string]Task, len(tasks))
	for _, task := range tasks {
		result[fmt.Sprintf("%d:%d", task.Start, task.Length)] = task
	}
	return result
}
