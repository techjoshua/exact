package exactcompiler

import (
	"sort"
	"strconv"
	"strings"
)

// attachComponentExecutionPlans derives compact local ports and invocation
// wiring after continuation placement and policy analysis have completed.
func attachComponentExecutionPlans(
	components []Component,
	continuations []Continuation,
	tasks []Task,
	bindings []ReactiveBinding,
) {
	planned := make(map[string]struct{}, len(continuations))
	componentIDs := make(map[string]string, len(components))
	for _, component := range components {
		componentIDs[component.Name] = component.ID
	}
	for _, continuation := range continuations {
		planned[continuation.ID] = struct{}{}
	}
	for _, task := range tasks {
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
				ID:          continuation.ID,
				TaskID:      continuation.TaskID,
				Activation:  activation,
				Placement:   continuation.Placement,
				Readiness:   continuation.Readiness,
				Concurrency: continuation.Concurrency,
				Inputs:      inputs,
				Outputs:     outputs,
			})
		}
		component.Execution = plan
	}
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
