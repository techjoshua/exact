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
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			facets, ok := taskFacets(call.Expression)
			if !ok {
				return true
			}
			if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
				return true
			}
			work := call.Arguments.Nodes[len(call.Arguments.Nodes)-1]
			if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
				return true
			}
			task := normalizeTaskFacets(candidate.name, facets)
			task.Start = node.Pos()
			task.Length = node.End() - node.Pos()
			if taskRegistrationInsideNestedFunction(node, candidate.node) {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: this.task() must be registered directly during component setup",
				)
			}
			task.Async = ast.HasSyntacticModifier(work, ast.ModifierFlagsAsync)
			if node.Parent != nil && ast.IsAwaitExpression(node.Parent) {
				task.Readiness = "blocking"
			}
			task.Reads = taskReadEffects(stateReads, candidate.name, work)
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
			)
			task.Dependencies = taskDependencyRecords(
				work,
				candidate.name,
				task.Reads,
				stateReads,
				task.ReactiveDependencies,
				reactiveBindings,
				typeChecker,
			)
			task.BrowserEffects, task.ServerEffects =
				taskEnvironmentEffects(work, sourceFile, typeChecker)
			if callable, exists := callables.byNode[work]; exists {
				task.Reads = uniqueStateEffects(
					append(task.Reads, callable.StateReads...),
				)
				task.Writes = uniqueStateEffects(
					append(task.Writes, callable.StateWrites...),
				)
				task.Contexts = append([]ContextEffect(nil), callable.Contexts...)
				task.EffectSources = append(
					[]EnvironmentEffectSource(nil),
					callable.EffectSources...,
				)
				task.BrowserEffects = containsEnvironment(
					callable.EffectSources,
					"browser",
				)
				task.ServerEffects = containsEnvironment(
					callable.EffectSources,
					"server",
				)
				task.EnvironmentEffect = callable.Effect
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
					"error: this.task.server() cannot reference browser-only globals",
				)
			}
			if task.RequestedPlacement == "client" && task.ServerEffects {
				task.Diagnostics = append(
					task.Diagnostics,
					"error: this.task.client() cannot reference server-only imports",
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
					"task placement forced by this.task."+
						task.RequestedPlacement+"()",
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

// taskResultWritePath recognizes `state.path = await this.task(...)`. The
// assignment is part of the distributed continuation contract rather than a
// client-side Promise write, so its path must travel with the task.
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

func normalizeTaskFacets(component string, facets []string) Task {
	task := Task{
		Component:            component,
		Facets:               append([]string(nil), facets...),
		Priority:             "normal",
		Readiness:            "nonblocking",
		EnvironmentEffect:    "neutral",
		ReactiveDependencies: []string{},
		Dependencies:         []TaskDependency{},
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
				"error: this.task.%s() repeats the %s facet",
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
					"error: this.task.%s() requests both client and server placement",
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
				"error: unsupported this.task() facet %s",
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
) []TaskDependency {
	required := make(map[string]struct{}, len(requiredReads))
	for _, read := range requiredReads {
		if read.Kind == "read" {
			required[read.Path] = struct{}{}
		}
	}
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
		path := strings.Join(read.Path, ".")
		if _, needed := required[path]; !needed {
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
					"error: task reads derived local %s, which cannot be safely reevaluated; capture an explicit reactive value or move the effectful expression into this.task()",
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
	effects := make([]StateEffect, 0)
	for _, read := range reads {
		if read.Component != component ||
			read.Start < work.Pos() ||
			read.Start+read.Length > work.End() {
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
		})
	}
	return uniqueStateEffects(effects)
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
		key := effect.Kind + ":" + effect.Path + ":" +
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

func taskDiagnostics(sourceFile *ast.SourceFile, tasks []Task) []Diagnostic {
	var diagnostics []Diagnostic
	for _, task := range tasks {
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
