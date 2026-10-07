package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
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
	sharedFacts ...*sourceAnalysisFacts,
) []Task {
	var facts *sourceAnalysisFacts
	if len(sharedFacts) != 0 {
		facts = sharedFacts[0]
	}
	var tasks []Task
	var taskPolicyBindings externalImportBindings
	if facts == nil {
		taskPolicyBindings = collectExternalImportBindings(sourceFile, typeChecker)
	} else {
		taskPolicyBindings = facts.imports
	}
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		invokedDefinitions := make(map[int]struct{})
		walkNode(candidate.node, func(node *ast.Node) bool {
			var call *ast.CallExpression
			var work *ast.Node
			var facets []string
			var ok bool
			if ast.IsCallExpression(node) {
				call = node.AsCallExpression()
				work, facets, ok = functionTaskActivation(
					node, call, candidate, sourceFile, typeChecker, callables, taskPolicyBindings,
				)
			} else {
				work, facets, ok = referencedFunctionTask(
					node, candidate, sourceFile, typeChecker, taskPolicyBindings,
				)
			}
			if !ok {
				return true
			}
			task := normalizeTaskFacets(candidate.name, facets)
			task.Start = node.Pos()
			task.Length = node.End() - node.Pos()
			task.FunctionDefined = true
			task.WorkStart = work.Pos()
			task.WorkLength = work.End() - work.Pos()
			if _, explicit := functionTaskPolicy(work, sourceFile, taskPolicyBindings); explicit &&
				(work.Pos() < candidate.node.Pos() || work.End() > candidate.node.End()) {
				task.Diagnostics = append(task.Diagnostics,
					"error: function-defined tasks must be declared inside their owning component. Call shared helpers from a component-owned task")
			}
			task.Invoked = call == nil || taskRegistrationInsideNestedFunction(node, candidate.node)
			task.ArgumentCount = len(work.Parameters())
			if _, explicit := functionTaskPolicy(work, sourceFile, taskPolicyBindings); explicit {
				task.ArgumentCount--
			}
			for _, parameter := range work.Parameters()[:task.ArgumentCount] {
				if parameter.AsParameterDeclaration().DotDotDotToken != nil {
					task.Diagnostics = append(task.Diagnostics, "error: compiler-managed task parameters require fixed argument positions. Pass rest values as one array input and spread them inside the task when calling an ordinary helper")
				}
			}
			if call != nil && call.Arguments != nil {
				task.ActivationArgumentCount = min(len(call.Arguments.Nodes), task.ArgumentCount)
			}
			for _, capture := range taskCaptureRanges(work, task.ArgumentCount) {
				task.CapturedParameters = append(task.CapturedParameters, capture.parameter)
			}
			if call != nil && call.Arguments != nil && len(call.Arguments.Nodes) > task.ArgumentCount {
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
			// Explicit policy overrides readiness inferred from an awaited activation.
			applyFunctionTaskPolicy(&task, work, sourceFile, taskPolicyBindings)
			if task.Progress {
				label := "progress"
				if work.Name() != nil {
					label = work.Name().Text()
				} else if binding := sourceCallableBinding(work); binding != nil {
					label = binding.Name().Text()
				}
				task.ProgressLabel = candidate.name + "." + label
				task.Diagnostics = append(task.Diagnostics, progressResultDiagnostics(work, candidate.node, typeChecker, callables)...)

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
					facts,
				)...,
			))
			if call != nil && !task.Invoked {
				task.ResultWritePath = taskResultWritePath(
					node,
					candidate.name,
					stateWrites,
				)
			}
			if len(task.ResultWritePath) != 0 {
				task.Writes = uniqueStateEffects(append(
					task.Writes,
					StateEffect{
						pathSegments: append([]string{}, task.ResultWritePath...),
						Path:         strings.Join(task.ResultWritePath, "."),
						Kind:         "write",
						Confidence:   "exact",
					},
				))
			}
			task.helperCaptures = taskHelperCaptures(work, candidate.node, sourceFile, typeChecker, reactiveBindings, facts)
			task.Contexts = []ContextEffect{}
			task.EffectSources = []EnvironmentEffectSource{}
			resources, signalCalls, resourceDiagnostics :=
				collectTaskResources(work, sourceFile, typeChecker)
			task.Resources = resources
			task.SignalCalls = signalCalls
			task.Diagnostics = append(task.Diagnostics, resourceDiagnostics...)
			snapshotReads := taskSnapshotReadRanges(work, sourceFile, typeChecker)
			task.ReactiveDependencies, task.Diagnostics = taskReactiveDependencies(
				work,
				candidate.name,
				reactiveBindings,
				typeChecker,
				task.Diagnostics,
				append(append([]taskCaptureRange{}, captureRanges...), snapshotReads...),
			)
			task.localReads = taskLocalReadRanges(work, candidate.name, stateReads, stateWrites)
			task.localReads = append(task.localReads, snapshotReads...)
			task.potentialLocalReads = taskPotentialLocalReadRanges(work, candidate.name, stateReads, stateWrites)
			dependencyExclusions := append(append([]taskCaptureRange{}, captureRanges...), task.localReads...)
			task.Dependencies = taskDependencyRecords(
				work,
				candidate.name,
				task.Reads,
				stateReads,
				task.ReactiveDependencies,
				reactiveBindings,
				typeChecker,
				dependencyExclusions,
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
							componentStateEffects(callable.StateReads),
							task.CapturedInputs,
							work,
							callables,
						)...,
					),
				)
				task.Writes = uniqueStateEffects(
					append(task.Writes, componentStateEffects(callable.StateWrites)...),
				)
				task.Contexts = taskBodyContextEffects(work, sourceFile, typeChecker, callables)
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

			task.potentialLocalReads = taskEffectLocalReadRanges(work, candidate.name, stateReads, task.Writes, task.potentialLocalReads)
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
					"error: task requests server placement but references browser-only globals"+placementDiagnosticContext(task.EffectSources),
				)
			}
			if task.RequestedPlacement == "client" && task.ServerEffects {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task requests client placement but references server-only imports"+placementDiagnosticContext(task.EffectSources),
				)
			}
			if task.EnvironmentEffect == "mixed" {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task has indivisible browser and server effects"+placementDiagnosticContext(task.EffectSources),
				)
			}
			if task.EnvironmentEffect == "unknown" &&
				task.RequestedPlacement == "" &&
				!task.BrowserEffects &&
				!task.ServerEffects &&
				opaquePlacement {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: task placement depends on an opaque call"+placementDiagnosticContext(task.EffectSources),
				)
			}
			if task.BrowserEffects && len(task.Writes) != 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task writes component state and references browser-only globals. The compiler places this work on the client",
				)
			}
			if task.RequestedPlacement == "" &&
				!task.BrowserEffects && !task.ServerEffects &&
				len(task.Writes) != 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task writes component state without environment-specific effects. The compiler permits server execution and skips completed initial work during hydration",
				)
			}
			if !task.BrowserEffects && !task.ServerEffects &&
				len(task.Writes) == 0 {
				task.Diagnostics = append(
					task.Diagnostics,
					"task has no detected state writes or environment-specific effects. The compiler places this lifecycle work on the client",
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
	tasks = reuseInvokedFunctionTaskDefinitions(tasks)
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
	var summary CallableSummary
	var exists bool
	if symbol != nil {
		summary, exists = callables.bySymbol[ast.GetSymbolId(symbol)]
	}
	if !exists {
		direct := unwrapRenderExpression(call.Expression)
		if isCallableNode(direct) {
			// An immediately invoked definition has no binding symbol, but owns
			// the same analyzed work and declarative policy as a named task.
			summary, exists = callables.byNode[direct]
		}
	}
	if !exists {
		summary, exists = ownedTaskLocalCallSummary(call.Expression, component.node, sourceFile, taskPolicyBindings, callables)
	}
	if !exists && symbol != nil {
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
	// A declaration or ambient signature can contribute placement facts, but it
	// has no executable body the compiler can schedule as component-owned work.
	// Keep its invocation in ordinary setup so lowering never manufactures a
	// task closure with a missing body.
	if work == nil || work == component.node || work.Body() == nil {
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
		len(componentStateEffects(summary.StateWrites)) != 0 ||
		len(summary.Contexts) != 0
	if !classified {
		return nil, nil, false
	}
	if nested && !explicit && !looksLikeTaskPolicy(work, sourceFile) {
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
	policyGroups := [][]string{
		{"client", "server"},
		{"parallel", "latest", "queue"},
		{"immediate", "normal", "deferred"},
		{"blocking", "nonblocking"},
	}
	for _, group := range policyGroups {
		selected := 0
		for _, facet := range group {
			count := taskPolicyFacetCount(work, facet)
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
				"error: task policy contains contradictory facets. Choose one placement, concurrency, and readiness policy for this task")
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
		if taskPolicyHasFacet(work, concurrency) {
			task.Concurrency = concurrency
		}
	}
	task.Progress = taskPolicyHasFacet(work, "progress")
	if task.Progress {
		if !taskPolicyHasFacet(work, "blocking") {
			task.Readiness = "nonblocking"
		}
		if !taskPolicyHasFacet(work, "client") || task.ArgumentCount != 1 {
			task.Diagnostics = append(task.Diagnostics, "error: progress requires client placement and exactly one snapshot parameter")
		}
		if !task.Invoked {
			task.Diagnostics = append(task.Diagnostics, "error: progress receivers cannot be activated during component setup. Declare a function task with TaskContext.client().progress() and call it from the producing task")
		}
		if taskPolicyHasFacet(work, "detached") || taskPolicyHasFacet(work, "key") || taskPolicyHasFacet(work, "queue") || taskPolicyHasFacet(work, "latest") || taskPolicyHasFacet(work, "parallel") {
			task.Diagnostics = append(task.Diagnostics, "error: progress receivers cannot use detached(), key(), queue(), latest(), or parallel(). Progress delivers the latest snapshot within its producing task lifetime. Remove those policy facets")
		}
	}
	task.Detached = taskPolicyHasFacet(work, "detached")
	if taskPolicyHasFacet(work, "immediate") {
		task.Priority = "immediate"
	}
	if taskPolicyHasFacet(work, "normal") {
		task.Priority = "normal"
	}
	if taskPolicyHasFacet(work, "nonblocking") {
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
		(strings.Contains(sourceText(sourceFile, parameters[len(parameters)-1]), "TaskContext") ||
			frameworkTaskPolicyRoot(final.Initializer, collectExternalImportBindings(sourceFile, nil)))
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
	parameter := final.AsParameterDeclaration()
	if parameter.Initializer == nil ||
		!frameworkTaskPolicyRoot(parameter.Initializer, bindings) {
		return nil, false
	}
	facets := []string{}
	for _, facet := range []string{
		"client", "server", "parallel", "latest", "queue",
		"immediate", "normal", "deferred", "blocking", "nonblocking", "detached",
	} {
		if taskPolicyHasFacet(work, facet) {
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
	for node != nil {
		node = unwrapRenderExpression(node)
		if !ast.IsCallExpression(node) {
			break
		}
		node = node.AsCallExpression().Expression
		if ast.IsPropertyAccessExpression(node) {
			node = node.AsPropertyAccessExpression().Expression
		}
	}
	if node == nil {
		return false
	}
	namespace := false
	if ast.IsPropertyAccessExpression(node) {
		member := node.AsPropertyAccessExpression()
		if member.Name().Text() != "TaskContext" {
			return false
		}
		node = member.Expression
		namespace = true
	}
	if !ast.IsIdentifier(node) {
		return false
	}
	reference, exists := bindings.byName[node.Text()]
	// Checked programs use lexical symbol identity so a local object cannot impersonate
	// an imported policy provider. Syntax-only candidate discovery retains name facts.
	if bindings.checker != nil {
		symbol := bindings.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return false
		}
		reference, exists = bindings.bySymbol[ast.GetSymbolId(symbol)]
	}
	return exists && reference.moduleSpecifier == "@exactjs/core" &&
		(namespace && reference.namespace || !namespace && reference.exportName == "TaskContext")
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

// taskResultWritePath recognizes the state destination of a setup task activation.
// Setup state belongs to the distributed transition. An event or another invoked task
// instead owns its ordinary assignment after awaiting the returned value.
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
			pathSegments: append([]string{}, read.Path...),
			Path:         strings.Join(read.Path, "."),
			Kind:         "read",
			Confidence:   read.Confidence,
		})
		receiver := taskOptionalReceiverRead(read, work)
		if receiver.Start != read.Start || receiver.Length != read.Length {
			effects = append(effects, StateEffect{
				pathSegments: append([]string{}, receiver.Path...),
				Path:         strings.Join(receiver.Path, "."), Kind: "read", Confidence: receiver.Confidence,
			})
		}
	}
	return uniqueStateEffects(effects)
}

func taskObjectAssignEffects(
	work *ast.Node,
	component componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	facts *sourceAnalysisFacts,
) []StateEffect {
	aliases := sourceStateAliases(component, typeChecker, facts)
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
			pathSegments: append([]string{}, path...),
			Path:         value,
			Kind:         "write",
			Confidence:   "broad",
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
		if containsString(write.Path, "*") || write.Operation == "array-mutation" || write.Operation == "opaque-mutation" {
			confidence = "broad"
		}
		effects = append(effects, StateEffect{
			pathSegments: append([]string{}, write.Path...),
			Path:         strings.Join(write.Path, "."),
			Kind:         "write",
			Confidence:   confidence,
			Operation:    stateEffectOperation(write.Operation),
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
				stateEffectPathContains(candidate, effect) {
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
		key := effect.Kind + ":" + stateEffectPathKey(effect) + ":" + effect.Operation + ":" +
			stateReceiverSignature(effect.Receiver)
		if _, exists := seen[key]; exists || (effect.Path == "" && effect.pathSegments == nil) {
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
