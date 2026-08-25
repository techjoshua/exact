package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// attachComponentStateSlots assigns deterministic top-level storage indexes
// from semantic state reads and writes, including compiler-resolved aliases.
func attachComponentStateSlots(
	components []Component,
	reads []StateRead,
	writes []StateWrite,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) {
	byComponent := make(map[string]map[string]struct{}, len(components))
	add := func(component string, path []string) {
		if component == "" || len(path) == 0 || path[0] == "" {
			return
		}
		keys := byComponent[component]
		if keys == nil {
			keys = make(map[string]struct{})
			byComponent[component] = keys
		}
		keys[path[0]] = struct{}{}
	}
	for _, read := range reads {
		add(read.Component, read.Path)
	}
	for _, write := range writes {
		add(write.Component, write.Path)
	}
	for index := range components {
		keys := byComponent[components[index].Name]
		if len(keys) == 0 {
			continue
		}
		slots := make([]string, 0, len(keys))
		for key := range keys {
			slots = append(slots, key)
		}
		sort.Strings(slots)
		components[index].StateSlots = slots
		components[index].Collections = componentNeedsCollections(
			components[index], sourceFile, typeChecker,
		)
	}
}

// componentNeedsCollections proves the narrow state/props lane from complete declared shapes.
// Opaque/indexed types and recursive graphs beyond the analysis bound retain general interception.
func componentNeedsCollections(
	component Component,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	if component.DynamicComponents {
		return true
	}
	for _, signal := range component.Signals {
		if signal == "getContext" || signal == "hasContext" || signal == "setContext" {
			return true
		}
	}
	if sourceFile == nil || typeChecker == nil {
		return true
	}
	var stateType *checker.Type
	var componentNode *ast.Node
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if node.Pos() == component.Start && node.End() == component.Start+component.Length {
			componentNode = node
		}
		if node.Pos() < component.Start || node.End() > component.Start+component.Length {
			return true
		}
		if !ast.IsPropertyAccessExpression(node) {
			return true
		}
		member := node.AsPropertyAccessExpression()
		if member.Expression.Kind == ast.KindThisKeyword && member.Name() != nil &&
			member.Name().Text() == "state" {
			stateType = typeChecker.GetTypeAtLocation(node)
			return false
		}
		return true
	})
	if len(component.StateSlots) != 0 && stateType == nil {
		return true
	}
	seen := make(map[*checker.Type]struct{})
	for _, key := range component.StateSlots {
		if !objectArrayStateType(
			typeChecker.GetTypeOfPropertyOfType(stateType, key), typeChecker, seen, 0,
		) {
			return true
		}
	}
	if componentNode == nil {
		return true
	}
	for _, parameter := range componentNode.Parameters() {
		name := parameter.Name()
		if name != nil && ast.IsIdentifier(name) && name.Text() == "this" {
			continue
		}
		if !objectArrayStateType(typeChecker.GetTypeAtLocation(parameter), typeChecker, seen, 0) {
			return true
		}
	}
	return false
}

func objectArrayStateType(
	value *checker.Type,
	typeChecker *checker.Checker,
	seen map[*checker.Type]struct{},
	depth int,
) bool {
	if value == nil || depth > 32 || value.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		for _, member := range value.Distributed() {
			if !objectArrayStateType(member, typeChecker, seen, depth+1) {
				return false
			}
		}
		return true
	}
	if _, exists := seen[value]; exists {
		return true
	}
	seen[value] = struct{}{}
	display := typeChecker.TypeToString(value)
	if strings.Contains(display, "Map<") || strings.Contains(display, "Set<") ||
		strings.Contains(display, "ReadonlyMap<") || strings.Contains(display, "ReadonlySet<") {
		return false
	}
	if value.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsBooleanLike|
		checker.TypeFlagsBigIntLike|checker.TypeFlagsESSymbolLike|checker.TypeFlagsNull|
		checker.TypeFlagsUndefined) != 0 {
		return true
	}
	if element := typeChecker.GetElementTypeOfArrayType(value); element != nil {
		return objectArrayStateType(element, typeChecker, seen, depth+1)
	}
	if len(typeChecker.GetSignaturesOfType(value, checker.SignatureKindCall)) != 0 {
		return true
	}
	if len(typeChecker.GetIndexInfosOfType(value)) != 0 {
		return false
	}
	for _, property := range typeChecker.GetPropertiesOfType(value) {
		if !objectArrayStateType(typeChecker.GetTypeOfSymbol(property), typeChecker, seen, depth+1) {
			return false
		}
	}
	return true
}

// attachComponentExecutionPlans derives compact local ports and invocation
// wiring after continuation placement and policy analysis have completed.
func attachComponentExecutionPlans(
	components []Component,
	continuations []Continuation,
	tasks []Task,
	bindings []ReactiveBinding,
) {
	planned := make(map[string]struct{}, len(continuations))
	tasksByID := make(map[string]Task, len(tasks))
	componentIDs := make(map[string]string, len(components))
	for _, component := range components {
		componentIDs[component.Name] = component.ID
	}
	for _, continuation := range continuations {
		planned[continuation.ID] = struct{}{}
	}
	for _, task := range tasks {
		tasksByID[task.ID] = task
		if _, exists := planned[task.ID]; exists ||
			(task.Placement != "client" && task.Placement != "server" && task.Placement != "isomorphic") {
			continue
		}
		componentID, exists := componentIDs[task.Component]
		if !exists {
			continue
		}
		continuations = append(continuations, componentExecutionContinuation(task, componentID))
	}
	for componentIndex := range components {
		component := &components[componentIndex]
		plan := ComponentExecution{
			Version:     1,
			Ports:       []ComponentPort{},
			Transitions: []ComponentTransition{},
			Reactive:    componentReactiveAllocations(component.Name, bindings),
		}
		portIndexes := make(map[string]int)
		for _, continuation := range continuations {
			if continuation.ComponentID != component.ID {
				continue
			}
			inputs := continuationInputPorts(&plan, portIndexes, continuation)
			outputs := continuationOutputPorts(&plan, portIndexes, continuation)
			activation := "setup"
			if continuation.Invocation != nil {
				activation = "interaction"
			}
			plan.Transitions = append(plan.Transitions, ComponentTransition{
				ID:                continuation.ID,
				TaskID:            continuation.TaskID,
				Activation:        activation,
				Placement:         continuation.Placement,
				Readiness:         continuation.Readiness,
				Concurrency:       continuation.Concurrency,
				Inputs:            inputs,
				Outputs:           outputs,
				DirectServerSetup: directServerSetupComputation(tasksByID[continuation.TaskID]),
			})
		}
		component.Execution = plan
	}
}

// directServerSetupComputation recognizes compiler-created synchronous value propagation. An
// authored server task stays on the scheduled lane even when its current implementation is small.
func directServerSetupComputation(task Task) bool {
	return task.CompilerComputation && !task.Async && !task.Invoked && !task.Detached &&
		(task.Placement == "server" || task.Placement == "isomorphic") &&
		task.EnvironmentEffect == "neutral" && len(task.Contexts) == 0 &&
		len(task.Resources) == 0 && len(task.SignalCalls) == 0 &&
		len(task.ResultWritePath) == 0
}

func componentExecutionContinuation(task Task, componentID string) Continuation {
	concurrency := task.Concurrency
	if concurrency == "" {
		concurrency = "parallel"
	}
	serverContexts := []ContextEffect{}
	contextWrites := []ContextEffect{}
	for _, context := range task.Contexts {
		if context.Kind == "read" {
			serverContexts = append(serverContexts, context)
		} else if context.Kind == "write" {
			contextWrites = append(contextWrites, context)
		}
	}
	continuation := Continuation{
		ID: task.ID, TaskID: task.ID, ComponentID: componentID, Placement: task.Placement,
		Readiness: task.Readiness, Concurrency: concurrency,
		Activation: ContinuationActivation{
			Dependencies:   append([]TaskDependency{}, task.Dependencies...),
			ServerContexts: serverContexts,
		},
		Effects: ContinuationEffects{
			StateWrites:   append([]StateEffect{}, task.Writes...),
			ContextWrites: contextWrites,
		},
	}
	if task.Invoked {
		continuation.Invocation = &ContinuationInvocation{Concurrency: concurrency}
	}
	return continuation
}

func continuationInputPorts(
	plan *ComponentExecution,
	indexes map[string]int,
	continuation Continuation,
) []int {
	inputs := []int{}
	for _, dependency := range continuation.Activation.Dependencies {
		path := dependency.Path
		if path == "" {
			path = dependency.Source + ":" + strconv.Itoa(dependency.Index)
		}
		inputs = append(inputs, executionPort(plan, indexes, dependency.Source, path, "input"))
	}
	for _, context := range append(
		append([]ContextEffect{}, continuation.Activation.ServerContexts...),
		continuation.Activation.PublicContexts...,
	) {
		inputs = append(inputs, executionPort(plan, indexes, "context", context.Token, "input"))
	}
	return uniqueInts(inputs)
}

func continuationOutputPorts(
	plan *ComponentExecution,
	indexes map[string]int,
	continuation Continuation,
) []int {
	outputs := []int{}
	for _, effect := range continuation.Effects.StateWrites {
		outputs = append(outputs, executionPort(plan, indexes, "state", effect.Path, "output"))
	}
	for _, context := range append(
		append([]ContextEffect{}, continuation.Effects.ContextWrites...),
		continuation.Effects.ServerContextWrites...,
	) {
		outputs = append(outputs, executionPort(plan, indexes, "context", context.Token, "output"))
	}
	return uniqueInts(outputs)
}

func executionPort(
	plan *ComponentExecution,
	indexes map[string]int,
	kind string,
	path string,
	direction string,
) int {
	path = strings.TrimPrefix(path, "this.state.")
	key := kind + "\x00" + path
	if index, exists := indexes[key]; exists {
		current := plan.Ports[index].Direction
		if current != direction && current != "inout" {
			plan.Ports[index].Direction = "inout"
		}
		return index
	}
	index := len(plan.Ports)
	indexes[key] = index
	plan.Ports = append(plan.Ports, ComponentPort{
		Index: index, Kind: kind, Path: path, Direction: direction,
	})
	return index
}

func componentReactiveAllocations(
	component string,
	bindings []ReactiveBinding,
) []ReactiveAllocation {
	result := []ReactiveAllocation{}
	for _, binding := range bindings {
		if binding.Component != component {
			continue
		}
		allocation := reactiveAllocationKind(binding)
		result = append(result, ReactiveAllocation{
			Name:         binding.Name,
			Provenance:   binding.Provenance,
			Allocation:   allocation,
			Dependencies: append([]string{}, binding.Dependencies...),
		})
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left].Name < result[right].Name
	})
	return result
}

func reactiveAllocationKind(binding ReactiveBinding) string {
	switch binding.Provenance {
	case "state", "props", "context", "cell":
		return "live-slot"
	case "snapshot":
		return "snapshot"
	case "derived":
		if binding.SafeToReevaluate && len(binding.References) <= 1 {
			return "inline"
		}
		return "computed"
	default:
		return "constant"
	}
}

func uniqueInts(values []int) []int {
	seen := make(map[int]struct{}, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
