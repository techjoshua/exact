package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
)

var browserGlobals = map[string]struct{}{
	"window":                {},
	"document":              {},
	"navigator":             {},
	"location":              {},
	"history":               {},
	"localStorage":          {},
	"sessionStorage":        {},
	"HTMLElement":           {},
	"Element":               {},
	"Node":                  {},
	"MutationObserver":      {},
	"ResizeObserver":        {},
	"IntersectionObserver":  {},
	"requestAnimationFrame": {},
	"cancelAnimationFrame":  {},
	"requestIdleCallback":   {},
	"cancelIdleCallback":    {},
	"WebSocket":             {},
	"EventSource":           {},
	"BroadcastChannel":      {},
	"Worker":                {},
}

var serverGlobals = map[string]struct{}{
	"process":    {},
	"Buffer":     {},
	"require":    {},
	"__dirname":  {},
	"__filename": {},
}

var nodeBuiltinModules = map[string]struct{}{
	"assert":              {},
	"async_hooks":         {},
	"buffer":              {},
	"child_process":       {},
	"cluster":             {},
	"console":             {},
	"crypto":              {},
	"dgram":               {},
	"diagnostics_channel": {},
	"dns":                 {},
	"domain":              {},
	"events":              {},
	"fs":                  {},
	"http":                {},
	"http2":               {},
	"https":               {},
	"module":              {},
	"net":                 {},
	"os":                  {},
	"path":                {},
	"perf_hooks":          {},
	"process":             {},
	"punycode":            {},
	"querystring":         {},
	"readline":            {},
	"repl":                {},
	"sqlite":              {},
	"stream":              {},
	"string_decoder":      {},
	"sys":                 {},
	"timers":              {},
	"tls":                 {},
	"trace_events":        {},
	"tty":                 {},
	"url":                 {},
	"util":                {},
	"v8":                  {},
	"vm":                  {},
	"wasi":                {},
	"worker_threads":      {},
	"zlib":                {},
}

// collectTasks resolves the order-independent facets on component-owned task
// registrations. Work-body effects remain owned by later policy passes.
func collectTasks(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
	stateWrites []StateWrite,
	reactiveBindings []ReactiveBinding,
	callables callableAnalysis,
) []Task {
	var tasks []Task
	taskPolicyBindings := collectExternalImportBindings(sourceFile, typeChecker)
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		invokedDefinitions := make(map[int]struct{})
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			work, facets, ok := functionTaskActivation(
				node,
				call,
				candidate,
				sourceFile,
				typeChecker,
				callables,
				taskPolicyBindings,
			)
			if !ok {
				return true
			}
			task := normalizeTaskFacets(candidate.name, facets)
			task.Start = node.Pos()
			task.Length = node.End() - node.Pos()
			task.FunctionDefined = true
			task.WorkStart = work.Pos()
			task.WorkLength = work.End() - work.Pos()
			task.Invoked = taskRegistrationInsideNestedFunction(node, candidate.node)
			applyFunctionTaskPolicy(&task, work, sourceFile, taskPolicyBindings)
			task.ArgumentCount = len(work.Parameters())
			if _, explicit := functionTaskPolicy(work, sourceFile, taskPolicyBindings); explicit {
				task.ArgumentCount--
			}
			if call.Arguments != nil {
				task.ActivationArgumentCount = min(len(call.Arguments.Nodes), task.ArgumentCount)
			}
			for _, capture := range taskCaptureRanges(work, task.ArgumentCount) {
				task.CapturedParameters = append(task.CapturedParameters, capture.parameter)
			}
			if call.Arguments != nil && len(call.Arguments.Nodes) > task.ArgumentCount {
				task.Diagnostics = append(task.Diagnostics,
					"error: application calls must omit the compiler-supplied TaskContext argument")
			}
			if task.Invoked {
				if _, duplicate := invokedDefinitions[task.WorkStart]; duplicate {
					return true
				}
				invokedDefinitions[task.WorkStart] = struct{}{}
			}
			task.Async = ast.HasSyntacticModifier(work, ast.ModifierFlagsAsync)
			if node.Parent != nil && ast.IsAwaitExpression(node.Parent) {
				task.Readiness = "blocking"
			}
			captureRanges := []taskCaptureRange{}
			captureRanges = taskCaptureRanges(work, task.ArgumentCount)
			task.CapturedInputs = collectTaskCapturedInputs(
				work,
				task.ArgumentCount,
				candidate.name,
				sourceFile,
				stateReads,
				reactiveBindings,
				typeChecker,
			)
			task.Reads = taskReadEffectsExcluding(
				stateReads,
				candidate.name,
				work,
				captureRanges,
			)
			task.Writes = taskWriteEffects(stateWrites, candidate.name, work)
			task.Writes = uniqueStateEffects(append(
				task.Writes,
				taskObjectAssignEffects(
					work,
					candidate,
					sourceFile,
					typeChecker,
				)...,
			))
			task.ResultWritePath = taskResultWritePath(
				node,
				candidate.name,
				stateWrites,
			)
			if len(task.ResultWritePath) != 0 {
				task.Writes = uniqueStateEffects(append(
					task.Writes,
					StateEffect{
						Path:       strings.Join(task.ResultWritePath, "."),
						Kind:       "write",
						Confidence: "exact",
					},
				))
			}
			task.Contexts = []ContextEffect{}
			task.EffectSources = []EnvironmentEffectSource{}
			resources, signalCalls, resourceDiagnostics :=
				collectTaskResources(work, sourceFile, typeChecker)
			task.Resources = resources
			task.SignalCalls = signalCalls
			task.Diagnostics = append(task.Diagnostics, resourceDiagnostics...)
			task.ReactiveDependencies, task.Diagnostics = taskReactiveDependencies(
				work,
				candidate.name,
				reactiveBindings,
				typeChecker,
				task.Diagnostics,
				captureRanges,
			)
			task.Dependencies = taskDependencyRecords(
				work,
				candidate.name,
				task.Reads,
				stateReads,
				task.ReactiveDependencies,
				reactiveBindings,
				typeChecker,
				captureRanges,
			)
			if !task.Invoked && call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
				task.Dependencies = functionTaskActivationDependencies(
					call,
					task.ArgumentCount,
					sourceFile,
				)
			}
			task.BrowserEffects, task.ServerEffects =
				taskEnvironmentEffects(work, sourceFile, typeChecker)
			if callable, exists := callables.byNode[work]; exists {
				task.Reads = uniqueStateEffects(
					append(
						task.Reads,
						taskCallableReadsWithoutCapturedDefaults(
							task.Reads,
							callable.StateReads,
							task.CapturedInputs,
							work,
							callables,
						)...,
					),
				)
				task.Writes = uniqueStateEffects(
					append(task.Writes, callable.StateWrites...),
				)
				task.Contexts = append([]ContextEffect(nil), callable.Contexts...)
				task.EffectSources = append(
					[]EnvironmentEffectSource(nil),
					callable.EffectSources...,
				)
				task.EffectSources = excludeChildTaskEffects(
					work,
					task.EffectSources,
					sourceFile,
					typeChecker,
					callables,
					taskPolicyBindings,
				)
				task.BrowserEffects = containsEnvironment(
					task.EffectSources,
					"browser",
				)
				task.ServerEffects = containsEnvironment(
					task.EffectSources,
					"server",
				)
				task.EnvironmentEffect = environmentEffectFor(task.EffectSources)
			}
			switch {
			case task.EnvironmentEffect != "neutral" && task.EnvironmentEffect != "":
				// The completed callable graph owns transitive placement.
			case task.BrowserEffects && task.ServerEffects:
				task.EnvironmentEffect = "mixed"
			case task.BrowserEffects:
				task.EnvironmentEffect = "browser"
			case task.ServerEffects:
				task.EnvironmentEffect = "server"
			default:
				task.EnvironmentEffect = "neutral"
			}
			opaquePlacement := task.EnvironmentEffect == "unknown" &&
				containsOpaqueEnvironment(task.EffectSources)
			if task.RequestedPlacement != "" {
				task.Placement = task.RequestedPlacement
			} else if task.EnvironmentEffect == "browser" {
				task.Placement = "client"
			} else if task.EnvironmentEffect == "server" {
				task.Placement = "server"
			} else if task.EnvironmentEffect == "unknown" && task.ServerEffects &&
				!task.BrowserEffects {
				task.Placement = "server"
			} else if task.EnvironmentEffect == "unknown" && task.BrowserEffects &&
				!task.ServerEffects {
				task.Placement = "client"
			} else if task.EnvironmentEffect == "mixed" {
				task.Placement = "unknown"
			} else if opaquePlacement {
				task.Placement = "unknown"
			} else if len(task.Writes) != 0 {
				task.Placement = "isomorphic"
			} else {
				task.Placement = "client"
			}
			if task.RequestedPlacement == "server" && task.BrowserEffects {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task requests server placement but references browser-only globals",
				)
			}
			if task.RequestedPlacement == "client" && task.ServerEffects {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task requests client placement but references server-only imports",
				)
			}
			if task.EnvironmentEffect == "mixed" {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task has indivisible browser and server effects",
				)
			}
			if task.EnvironmentEffect == "unknown" &&
				task.RequestedPlacement == "" &&
				!task.BrowserEffects &&
				!task.ServerEffects &&
				opaquePlacement {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task placement depends on an opaque call",
				)
			}
			if task.BrowserEffects && len(task.Writes) != 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task writes component state and references browser-only globals; classify as client and split at this boundary",
				)
			}
			if task.RequestedPlacement == "" &&
				!task.BrowserEffects && !task.ServerEffects &&
				len(task.Writes) != 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task writes component state without environment-specific effects; classify as isomorphic so SSR can run it and hydration can skip duplicate initial work",
				)
			}
			if !task.BrowserEffects && !task.ServerEffects &&
				len(task.Writes) == 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task has no detected state writes or environment-specific effects; classify as client lifecycle work",
				)
			}
			if task.RequestedPlacement != "" {
				task.Diagnostics = append(
					task.Diagnostics,
					"task placement explicitly requested as "+task.RequestedPlacement,
				)
			}
			tasks = append(tasks, task)
			return true
		})
	}
	sort.Slice(tasks, func(left int, right int) bool {
		return tasks[left].Start < tasks[right].Start
	})
	return tasks
}

func excludeChildTaskEffects(
	work *ast.Node,
	sources []EnvironmentEffectSource,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	callables callableAnalysis,
	taskPolicyBindings externalImportBindings,
) []EnvironmentEffectSource {
	children := make(map[string]struct{})
	walkNode(work.Body(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		symbol := resolvedCallableSymbol(
			callTargetSymbol(node.AsCallExpression().Expression, typeChecker),
			typeChecker,
		)
		if symbol == nil {
			return true
		}
		summary, exists := callables.bySymbol[ast.GetSymbolId(symbol)]
		var child *ast.Node
		if exists {
			child = callableNodeForSummary(callables, summary.ID)
		}
		if child == nil {
			for _, declaration := range symbol.Declarations {
				if !ast.IsVariableDeclaration(declaration) {
					continue
				}
				initializer := declaration.AsVariableDeclaration().Initializer
				if initializer == nil {
					continue
				}
				if candidate, found := callables.byNode[initializer]; found {
					summary, child, exists = candidate, initializer, true
					break
				}
			}
		}
		if exists && child != nil {
			if _, explicit := functionTaskPolicy(
				child,
				sourceFile,
				taskPolicyBindings,
			); explicit {
				children[summary.Name] = struct{}{}
			}
		}
		return true
	})
	if len(children) == 0 {
		return sources
	}
	filtered := make([]EnvironmentEffectSource, 0, len(sources))
	for _, source := range sources {
		childBoundary := false
		for _, segment := range source.Path[1:] {
			if _, child := children[segment]; child {
				childBoundary = true
				break
			}
		}
		if childBoundary {
			continue
		}
		filtered = append(filtered, source)
	}
	return filtered
}

func callableNodeForSummary(
	callables callableAnalysis,
	id string,
) *ast.Node {
	for index := range callables.facts {
		if callables.facts[index].summary.ID == id {
			return callables.facts[index].node
		}
	}
	return nil
}

func functionTaskActivationDependencies(
	call *ast.CallExpression,
	argumentCount int,
	sourceFile *ast.SourceFile,
) []TaskDependency {
	if call.Arguments == nil || argumentCount == 0 {
		return nil
	}
	count := min(argumentCount, len(call.Arguments.Nodes))
	result := make([]TaskDependency, 0, count)
	for index, argument := range call.Arguments.Nodes[:count] {
		path := strings.TrimSpace(sourceText(sourceFile, argument))
		source := "derived"
		switch {
		case strings.HasPrefix(path, "this.state."):
			source = "state"
		case strings.HasPrefix(path, "props."):
			source = "props"
		}
		result = append(result, TaskDependency{
			Index:  index,
			Source: source,
			Path:   path,
		})
	}
	return result
}

// functionTaskActivation recognizes a setup-scope call to a local function
// whose effects or final TaskContext parameter classify it as task work.
func functionTaskActivation(
	node *ast.Node,
	call *ast.CallExpression,
	component componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	callables callableAnalysis,
	taskPolicyBindings externalImportBindings,
) (*ast.Node, []string, bool) {
	nested := taskRegistrationInsideNestedFunction(node, component.node)
	symbol := resolvedCallableSymbol(
		callTargetSymbol(call.Expression, typeChecker),
		typeChecker,
	)
	if symbol == nil {
		return nil, nil, false
	}
	summary, exists := callables.bySymbol[ast.GetSymbolId(symbol)]
	if !exists {
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer == nil ||
				(!ast.IsArrowFunction(initializer) &&
					!ast.IsFunctionExpression(initializer)) {
				continue
			}
			if candidate, found := callables.byNode[initializer]; found {
				summary, exists = candidate, true
				break
			}
		}
	}
	if !exists {
		return nil, nil, false
	}
	var work *ast.Node
	for index := range callables.facts {
		fact := &callables.facts[index]
		if fact.summary.ID == summary.ID {
			work = fact.node
			break
		}
	}
	if work == nil || work == component.node {
		return nil, nil, false
	}
	facets, explicit := functionTaskPolicy(
		work,
		sourceFile,
		taskPolicyBindings,
	)
	if !nested && !explicit && setupCallConsumesSynchronousResult(node) {
		return nil, nil, false
	}
	classified := explicit || looksLikeTaskPolicy(work, sourceFile) ||
		summary.Effect != "" && summary.Effect != "neutral" ||
		len(summary.StateWrites) != 0 ||
		len(summary.Contexts) != 0
	if !classified {
		return nil, nil, false
	}
	if nested && !explicit {
		return nil, nil, false
	}
	return work, facets, true
}

// setupCallConsumesSynchronousResult distinguishes ordinary setup
// initialization from an activation declaration. Inferred task activation
// cannot synchronously provide the value of a scheduled generation, so calls
// used as setup values must retain ordinary JavaScript semantics. An authored
// TaskContext remains authoritative and is validated by the task pipeline.
func setupCallConsumesSynchronousResult(call *ast.Node) bool {
	current := call
	for current.Parent != nil && ast.IsParenthesizedExpression(current.Parent) {
		current = current.Parent
	}
	if current.Parent == nil {
		return false
	}
	if ast.IsAwaitExpression(current.Parent) || ast.IsVoidExpression(current.Parent) {
		return false
	}
	return !ast.IsExpressionStatement(current.Parent)
}

func applyFunctionTaskPolicy(
	task *Task,
	work *ast.Node,
	sourceFile *ast.SourceFile,
	bindings externalImportBindings,
) {
	if task.Invoked {
		task.Concurrency = "parallel"
	} else {
		task.Concurrency = "latest"
	}
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return
	}
	if _, valid := functionTaskPolicy(work, sourceFile, bindings); !valid {
		if looksLikeTaskPolicy(work, sourceFile) {
			task.Diagnostics = append(
				task.Diagnostics,
				"error: task policy must be rooted at TaskContext imported from @exactjs/core",
			)
		}
		return
	}
	text := sourceText(sourceFile, parameters[len(parameters)-1])
	policyGroups := [][]string{
		{"client", "server"},
		{"parallel", "latest", "queue"},
		{"immediate", "normal", "deferred"},
		{"blocking", "nonblocking"},
	}
	for _, group := range policyGroups {
		selected := 0
		for _, facet := range group {
			count := strings.Count(text, "."+facet+"(")
			if count > 1 {
				task.Diagnostics = append(task.Diagnostics,
					"error: task policy repeats the "+facet+" facet")
			}
			if count != 0 {
				selected++
			}
		}
		if selected > 1 {
			task.Diagnostics = append(task.Diagnostics,
				"error: task policy contains contradictory facets")
		}
	}
	final := parameters[len(parameters)-1].AsParameterDeclaration()
	if final.Initializer != nil {
		walkNode(final.Initializer, func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			if !ast.IsPropertyAccessExpression(call.Expression) ||
				call.Arguments == nil ||
				len(call.Arguments.Nodes) != 1 {
				return true
			}
			member := call.Expression.AsPropertyAccessExpression()
			if member.Name() != nil && member.Name().Text() == "key" {
				task.KeyStart = call.Arguments.Nodes[0].Pos()
				task.KeyLength = call.Arguments.Nodes[0].End() -
					call.Arguments.Nodes[0].Pos()
				return false
			}
			return true
		})
	}
	for _, concurrency := range []string{"parallel", "latest", "queue"} {
		if strings.Contains(text, "."+concurrency+"(") {
			task.Concurrency = concurrency
		}
	}
	task.Detached = strings.Contains(text, ".detached(")
	if strings.Contains(text, ".immediate(") {
		task.Priority = "immediate"
	}
	if strings.Contains(text, ".normal(") {
		task.Priority = "normal"
	}
	if strings.Contains(text, ".nonblocking(") {
		task.Readiness = "nonblocking"
	}
}

func looksLikeTaskPolicy(work *ast.Node, sourceFile *ast.SourceFile) bool {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return false
	}
	final := parameters[len(parameters)-1].AsParameterDeclaration()
	return final.Initializer != nil &&
		strings.Contains(sourceText(sourceFile, parameters[len(parameters)-1]), "TaskContext")
}

func functionTaskPolicy(
	work *ast.Node,
	sourceFile *ast.SourceFile,
	bindings externalImportBindings,
) ([]string, bool) {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return nil, false
	}
	final := parameters[len(parameters)-1]
	text := sourceText(sourceFile, final)
	parameter := final.AsParameterDeclaration()
	if !strings.Contains(text, "TaskContext") ||
		parameter.Initializer == nil ||
		!frameworkTaskPolicyRoot(parameter.Initializer, bindings) {
		return nil, false
	}
	facets := []string{}
	for _, facet := range []string{
		"client", "server", "parallel", "latest", "queue",
		"immediate", "normal", "deferred", "blocking", "nonblocking", "detached",
	} {
		if strings.Contains(text, "."+facet+"(") {
			switch facet {
			case "client", "server", "deferred", "blocking":
				facets = append(facets, facet)
			}
		}
	}
	return facets, true
}

func frameworkTaskPolicyRoot(
	node *ast.Node,
	bindings externalImportBindings,
) bool {
	for ast.IsCallExpression(node) {
		node = node.AsCallExpression().Expression
		if ast.IsPropertyAccessExpression(node) {
			node = node.AsPropertyAccessExpression().Expression
		}
	}
	if !ast.IsIdentifier(node) {
		return false
	}
	reference, exists := bindings.byName[node.Text()]
	return exists &&
		reference.moduleSpecifier == "@exactjs/core" &&
		reference.exportName == "TaskContext"
}

func taskRegistrationInsideNestedFunction(
	call *ast.Node,
	component *ast.Node,
) bool {
	for current := call.Parent; current != nil && current != component; current = current.Parent {
		if isCallableNode(current) {
			return true
		}
	}
	return false
}

// taskResultWritePath recognizes assignment from an awaited task invocation.
// The assignment is part of the distributed continuation contract rather than
// a client-side Promise write, so its path must travel with the task.
func taskResultWritePath(
	call *ast.Node,
	component string,
	stateWrites []StateWrite,
) []string {
	for _, write := range stateWrites {
		if write.Component != component ||
			write.Operation != "assignment" ||
			write.Start > call.Pos() ||
			write.Start+write.Length < call.End() {
			continue
		}
		return append([]string(nil), write.Path...)
	}
	return nil
}

func containsOpaqueEnvironment(sources []EnvironmentEffectSource) bool {
	for _, source := range sources {
		if source.Opaque {
			return true
		}
	}
	return false
}

func taskFacets(expression *ast.Node) ([]string, bool) {
	var reversed []string
	for ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() == nil {
			return nil, false
		}
		if member.Name().Text() == "task" &&
			member.Expression.Kind == ast.KindThisKeyword {
			facets := make([]string, len(reversed))
			for index := range reversed {
				facets[len(reversed)-index-1] = reversed[index]
			}
			return facets, true
		}
		reversed = append(reversed, member.Name().Text())
		expression = member.Expression
	}
	return nil, false
}

func actionFacets(expression *ast.Node) ([]string, bool) {
	var reversed []string
	for ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() == nil {
			return nil, false
		}
		if member.Name().Text() == "action" &&
			member.Expression.Kind == ast.KindThisKeyword {
			facets := make([]string, len(reversed))
			for index := range reversed {
				facets[len(reversed)-index-1] = reversed[index]
			}
			return facets, true
		}
		reversed = append(reversed, member.Name().Text())
		expression = member.Expression
	}
	return nil, false
}

func normalizeTaskFacets(component string, facets []string) Task {
	task := Task{
		Component:            component,
		Facets:               append([]string(nil), facets...),
		Priority:             "normal",
		Readiness:            "nonblocking",
		EnvironmentEffect:    "neutral",
		ReactiveDependencies: []string{},
		Dependencies:         []TaskDependency{},
		CapturedInputs:       []TaskCapturedInput{},
		CapturedParameters:   []int{},
		Reads:                []StateEffect{},
		Writes:               []StateEffect{},
		Contexts:             []ContextEffect{},
		EffectSources:        []EnvironmentEffectSource{},
		Resources:            []TaskResource{},
		SignalCalls:          []TaskSignalCall{},
		Diagnostics:          []string{},
	}
	seen := make(map[string]struct{}, len(facets))
	for _, facet := range facets {
		if _, duplicate := seen[facet]; duplicate {
			task.Diagnostics = append(task.Diagnostics, fmt.Sprintf(
				"error: task policy %s repeats the %s facet",
				joinTaskFacets(facets),
				facet,
			))
			continue
		}
		seen[facet] = struct{}{}
		switch facet {
		case "client", "server":
			if task.RequestedPlacement != "" && task.RequestedPlacement != facet {
				task.Diagnostics = append(task.Diagnostics, fmt.Sprintf(
					"error: task policy %s requests both client and server placement",
					joinTaskFacets(facets),
				))
			}
			task.RequestedPlacement = facet
		case "deferred":
			task.Priority = "deferred"
		case "blocking":
			task.Readiness = "blocking"
		default:
			task.Diagnostics = append(task.Diagnostics, fmt.Sprintf(
				"error: unsupported task policy facet %s",
				facet,
			))
		}
	}
	return task
}

func containsEnvironment(values []EnvironmentEffectSource, expected string) bool {
	for _, value := range values {
		if value.Environment == expected {
			return true
		}
	}
	return false
}

func taskDependencyRecords(
	work *ast.Node,
	component string,
	requiredReads []StateEffect,
	stateReads []StateRead,
	reactiveNames []string,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
	excluded []taskCaptureRange,
) []TaskDependency {
	required := make(map[string]struct{}, len(requiredReads))
	for _, read := range requiredReads {
		if read.Kind == "read" {
			required[read.Path] = struct{}{}
		}
	}
	updateTargets := stateUpdateTargetSpans(work)
	type positionedDependency struct {
		position   int
		dependency TaskDependency
	}
	positioned := []positionedDependency{}
	seenPaths := make(map[string]struct{})
	stateCaptureSpans := make([][2]int, 0)
	for _, read := range stateReads {
		if read.Component != component ||
			read.Start < work.Pos() ||
			read.Start+read.Length > work.End() {
			continue
		}
		if spanInsideTaskCapture(read.Start, read.Start+read.Length, excluded) {
			continue
		}
		path := strings.Join(read.Path, ".")
		if _, needed := required[path]; !needed {
			continue
		}
		if _, updated := updateTargets[[2]int{read.Start, read.Start + read.Length}]; updated {
			continue
		}
		key := path
		if read.Confidence != "exact" {
			key = fmt.Sprintf("%s@%d", path, read.Start)
		}
		if _, duplicate := seenPaths[key]; duplicate {
			continue
		}
		seenPaths[key] = struct{}{}
		stateCaptureSpans = append(
			stateCaptureSpans,
			[2]int{read.Start, read.Start + read.Length},
		)
		positioned = append(positioned, positionedDependency{
			position: read.Start,
			dependency: TaskDependency{
				Source: "state",
				Path:   "this.state." + path,
			},
		})
	}
	byName := make(map[string]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == component {
			byName[binding.Name] = binding
		}
	}
	for _, name := range reactiveNames {
		binding, exists := byName[name]
		if !exists {
			continue
		}
		source := binding.Provenance
		switch source {
		case "state", "props", "context", "derived":
		default:
			source = "derived"
		}
		position := reactiveDependencyReferenceStart(
			work,
			binding,
			typeChecker,
		)
		contained := false
		for _, span := range stateCaptureSpans {
			if position >= span[0] && position < span[1] {
				contained = true
				break
			}
		}
		if contained {
			continue
		}
		positioned = append(positioned, positionedDependency{
			position: position,
			dependency: TaskDependency{
				Source:       source,
				Path:         binding.Name,
				ContextToken: binding.ContextToken,
			},
		})
	}
	sort.SliceStable(positioned, func(left int, right int) bool {
		return positioned[left].position < positioned[right].position
	})
	result := make([]TaskDependency, len(positioned))
	for index := range positioned {
		result[index] = positioned[index].dependency
		result[index].Index = index
	}
	return result
}

// stateUpdateTargetSpans separates mutation input from scheduling input.
// Increment and decrement still read their previous value for effect and
// continuation contracts, but subscribing a task to the value it increments
// would make the task immediately invalidate itself.
func stateUpdateTargetSpans(work *ast.Node) map[[2]int]struct{} {
	result := make(map[[2]int]struct{})
	walkNode(work, func(node *ast.Node) bool {
		var operand *ast.Node
		switch {
		case ast.IsPrefixUnaryExpression(node):
			expression := node.AsPrefixUnaryExpression()
			if expression.Operator == ast.KindPlusPlusToken ||
				expression.Operator == ast.KindMinusMinusToken {
				operand = expression.Operand
			}
		case ast.IsPostfixUnaryExpression(node):
			expression := node.AsPostfixUnaryExpression()
			if expression.Operator == ast.KindPlusPlusToken ||
				expression.Operator == ast.KindMinusMinusToken {
				operand = expression.Operand
			}
		}
		if operand != nil {
			result[[2]int{operand.Pos(), operand.End()}] = struct{}{}
		}
		return true
	})
	return result
}

func reactiveDependencyReferenceStart(
	work *ast.Node,
	binding ReactiveBinding,
	typeChecker *checker.Checker,
) int {
	position := work.End()
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		for _, declaration := range symbol.Declarations {
			name := declaration.Name()
			if name != nil && name.Pos() == binding.Start && node.Pos() < position {
				position = node.Pos()
			}
		}
		return true
	})
	return position
}

func taskReactiveDependencies(
	work *ast.Node,
	component string,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
	diagnostics []string,
	excluded []taskCaptureRange,
) ([]string, []string) {
	byStart := make(map[int]ReactiveBinding)
	for _, binding := range bindings {
		if binding.Component == component && reactiveProvenance(binding.Provenance) {
			byStart[binding.Start] = binding
		}
	}
	var dependencies []string
	seen := make(map[int]struct{})
	walkNode(work, func(node *ast.Node) bool {
		if spanInsideTaskCapture(node.Pos(), node.End(), excluded) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		for _, declaration := range symbol.Declarations {
			name := declaration.Name()
			if name == nil {
				continue
			}
			binding, exists := byStart[name.Pos()]
			if !exists {
				continue
			}
			if name.Pos() >= work.Pos() && name.End() <= work.End() {
				// A binding declared by the task body (including a nested event
				// callback) is generation-local work, not an activation input.
				break
			}
			if _, duplicate := seen[binding.Start]; duplicate {
				break
			}
			seen[binding.Start] = struct{}{}
			dependencies = append(dependencies, binding.Name)
			if binding.Provenance == "derived" && !binding.SafeToReevaluate {
				diagnostics = append(diagnostics, fmt.Sprintf(
					"error: task reads derived local %s, which cannot be safely reevaluated; capture an explicit reactive value or move the effectful expression into the task function body",
					binding.Name,
				))
			}
			break
		}
		return true
	})
	return dependencies, diagnostics
}

func taskEnvironmentEffects(
	work *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (bool, bool) {
	browser := false
	server := false
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		name := node.Text()
		symbol := typeChecker.GetSymbolAtLocation(node)
		if _, candidate := browserGlobals[name]; candidate &&
			symbolIsOutsideSource(symbol, sourceFile) {
			browser = true
		}
		if _, candidate := serverGlobals[name]; candidate &&
			symbolIsOutsideSource(symbol, sourceFile) {
			server = true
		}
		if serverOnlyImportSymbol(symbol) {
			server = true
		}
		return true
	})
	return browser, server
}

func isStaticPropertyName(node *ast.Node) bool {
	return node.Parent != nil &&
		ast.IsPropertyAccessExpression(node.Parent) &&
		node.Parent.AsPropertyAccessExpression().Name() == node
}

func symbolIsOutsideSource(symbol *ast.Symbol, sourceFile *ast.SourceFile) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if ast.GetSourceFileOfNode(declaration) == sourceFile {
			return false
		}
	}
	return true
}

func serverOnlyImportSymbol(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		typeOnly := false
		for current := declaration; current != nil; current = current.Parent {
			if ast.IsImportSpecifier(current) &&
				current.AsImportSpecifier().IsTypeOnly {
				typeOnly = true
			}
			if ast.IsImportClause(current) &&
				current.AsImportClause().PhaseModifier == ast.KindTypeKeyword {
				typeOnly = true
			}
			if ast.IsImportDeclaration(current) {
				if typeOnly {
					return false
				}
				return serverOnlyModule(
					current.AsImportDeclaration().ModuleSpecifier.Text(),
				)
			}
			if ast.IsSourceFile(current) {
				break
			}
		}
	}
	return false
}

func serverOnlyModule(specifier string) bool {
	if strings.HasPrefix(specifier, "node:") {
		return true
	}
	root := specifier
	if slash := strings.IndexByte(root, '/'); slash >= 0 {
		root = root[:slash]
	}
	_, builtin := nodeBuiltinModules[root]
	return builtin
}

func taskReadEffects(reads []StateRead, component string, work *ast.Node) []StateEffect {
	return taskReadEffectsExcluding(reads, component, work, nil)
}

func taskReadEffectsExcluding(
	reads []StateRead,
	component string,
	work *ast.Node,
	excluded []taskCaptureRange,
) []StateEffect {
	effects := make([]StateEffect, 0)
	for _, read := range reads {
		if read.Component != component ||
			read.Start < work.Pos() ||
			read.Start+read.Length > work.End() {
			continue
		}
		if spanInsideTaskCapture(read.Start, read.Start+read.Length, excluded) {
			continue
		}
		effects = append(effects, StateEffect{
			Path:       strings.Join(read.Path, "."),
			Kind:       "read",
			Confidence: read.Confidence,
		})
	}
	return uniqueStateEffects(effects)
}

func taskObjectAssignEffects(
	work *ast.Node,
	component componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []StateEffect {
	aliases := collectComponentStateAliases(component, typeChecker)
	effects := []StateEffect{}
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if !ast.IsPropertyAccessExpression(call.Expression) ||
			call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			return true
		}
		member := call.Expression.AsPropertyAccessExpression()
		if member.Name() == nil || member.Name().Text() != "assign" ||
			!ast.IsIdentifier(member.Expression) ||
			member.Expression.Text() != "Object" {
			return true
		}
		objectSymbol := typeChecker.GetSymbolAtLocation(member.Expression)
		if !symbolIsOutsideSource(objectSymbol, sourceFile) {
			return true
		}
		path, ok := statePath(
			call.Arguments.Nodes[0],
			aliases.bySymbol,
			typeChecker,
			true,
		)
		if !ok {
			return true
		}
		value := strings.Join(path, ".")
		if value == "" {
			value = "*"
		}
		effects = append(effects, StateEffect{
			Path:       value,
			Kind:       "write",
			Confidence: "broad",
		})
		return true
	})
	return effects
}

func taskWriteEffects(writes []StateWrite, component string, work *ast.Node) []StateEffect {
	effects := make([]StateEffect, 0)
	for _, write := range writes {
		if write.Component != component ||
			write.Start < work.Pos() ||
			write.Start+write.Length > work.End() {
			continue
		}
		confidence := "exact"
		if containsString(write.Path, "*") || write.Operation == "array-mutation" {
			confidence = "broad"
		}
		effects = append(effects, StateEffect{
			Path:       strings.Join(write.Path, "."),
			Kind:       "write",
			Confidence: confidence,
			Operation:  stateEffectOperation(write.Operation),
		})
	}
	return uniqueStateEffects(effects)
}

func stateEffectOperation(operation string) string {
	switch operation {
	case "map-mutation":
		return "map"
	case "set-mutation":
		return "set"
	default:
		return ""
	}
}

func minimalStateEffects(effects []StateEffect) []StateEffect {
	unique := uniqueStateEffects(effects)
	sort.SliceStable(unique, func(left int, right int) bool {
		return len(strings.Split(unique[left].Path, ".")) <
			len(strings.Split(unique[right].Path, "."))
	})
	result := make([]StateEffect, 0, len(unique))
	for index, effect := range unique {
		covered := false
		for candidateIndex, candidate := range unique {
			if candidateIndex == index {
				continue
			}
			if stateReceiverSignature(effect.Receiver) ==
				stateReceiverSignature(candidate.Receiver) &&
				effect.Path != candidate.Path &&
				strings.HasPrefix(effect.Path, candidate.Path+".") {
				covered = true
				break
			}
		}
		if !covered {
			result = append(result, effect)
		}
	}
	return result
}

func uniqueStateEffects(effects []StateEffect) []StateEffect {
	seen := make(map[string]struct{}, len(effects))
	result := make([]StateEffect, 0, len(effects))
	for _, effect := range effects {
		key := effect.Kind + ":" + effect.Path + ":" + effect.Operation + ":" +
			stateReceiverSignature(effect.Receiver)
		if _, exists := seen[key]; exists || effect.Path == "" {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, effect)
	}
	return result
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func joinTaskFacets(facets []string) string {
	result := ""
	for index, facet := range facets {
		if index != 0 {
			result += "."
		}
		result += facet
	}
	return result
}

func taskDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	tasks []Task,
	stateWrites []StateWrite,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, task := range tasks {
		if task.Placement == "server" || task.Placement == "isomorphic" {
			workStart, workLength := task.Start, task.Length
			if task.FunctionDefined {
				workStart, workLength = task.WorkStart, task.WorkLength
			}
			for _, write := range task.Writes {
				if !strings.Contains(write.Path, "*") {
					continue
				}
				diagnostics = append(diagnostics, Diagnostic{
					Severity: "error",
					Code:     "EXACT2001",
					Message: "error: a server continuation cannot publish a state write through a dynamic computed path (" +
						write.Path + "); write an enclosing statically named state value or keep the mutation client-side",
					Start:  task.Start,
					Length: task.Length,
				})
			}
			for _, write := range stateWrites {
				if write.Operation != "map-mutation" ||
					write.Start < workStart ||
					write.Start+write.Length > workStart+workLength {
					continue
				}
				if key := collectionMutationKeyAt(
					sourceFile,
					write,
				); key != nil && definitelyNonTransportableMapKey(
					typeChecker.TypeToString(typeChecker.GetTypeAtLocation(key)),
				) {
					diagnostics = append(diagnostics, Diagnostic{
						Severity: "error",
						Code:     "EXACT2001",
						Message: "error: a server continuation Map key must be null, boolean, a finite number, or a string; received " +
							typeChecker.TypeToString(typeChecker.GetTypeAtLocation(key)),
						Start:  key.Pos(),
						Length: key.End() - key.Pos(),
					})
				}
			}
		}
		for _, message := range task.Diagnostics {
			if !strings.HasPrefix(message, "error:") {
				continue
			}
			start := task.Start
			if sourceFile != nil {
				start = scanner.SkipTrivia(sourceFile.Text(), start)
			}
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2001",
				Message:  message,
				Start:    start,
				Length:   task.Length,
			})
		}
	}
	return diagnostics
}

func collectionMutationKeyAt(
	sourceFile *ast.SourceFile,
	write StateWrite,
) *ast.Node {
	var key *ast.Node
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() != write.Start || node.End()-node.Pos() != write.Length ||
			!ast.IsCallExpression(node) {
			return key == nil
		}
		call := node.AsCallExpression()
		if call.Arguments != nil && len(call.Arguments.Nodes) > 0 {
			key = call.Arguments.Nodes[0]
		}
		return false
	})
	return key
}

func definitelyNonTransportableMapKey(display string) bool {
	trimmed := strings.TrimSpace(display)
	return strings.HasPrefix(trimmed, "{") ||
		strings.HasPrefix(trimmed, "[") ||
		strings.HasPrefix(trimmed, "Map<") ||
		strings.HasPrefix(trimmed, "Set<") ||
		strings.HasPrefix(trimmed, "Array<") ||
		strings.Contains(trimmed, "=>") ||
		trimmed == "symbol" ||
		trimmed == "bigint" ||
		trimmed == "undefined"
}
