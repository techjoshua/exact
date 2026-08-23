package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// componentExecutionMetadata emits the compact canonical subgraph on both
// target facets so each runtime can optimize without importing its opposite.
func componentExecutionMetadata(
	factory *printer.NodeFactory,
	execution ComponentExecution,
	compact bool,
) *ast.Node {
	ports := make([]*ast.Node, 0, len(execution.Ports))
	for _, port := range execution.Ports {
		ports = append(ports, contractArray(factory,
			contractString(factory, port.Kind),
			contractString(factory, port.Path),
			contractString(factory, port.Direction),
		))
	}
	transitions := make([]*ast.Node, 0, len(execution.Transitions))
	for _, transition := range execution.Transitions {
		transitions = append(transitions, contractArray(factory,
			contractString(factory, transition.ID),
			contractString(factory, transition.TaskID),
			contractString(factory, transition.Activation),
			contractString(factory, transition.Placement),
			contractString(factory, transition.Readiness),
			contractString(factory, transition.Concurrency),
			contractNumberArray(factory, transition.Inputs),
			contractNumberArray(factory, transition.Outputs),
		))
	}
	reactive := make([]*ast.Node, 0, len(execution.Reactive))
	for _, binding := range execution.Reactive {
		reactive = append(reactive, contractObject(factory, true,
			contractProperty(factory, "name", contractString(factory, binding.Name)),
			contractProperty(factory, "provenance", contractString(factory, binding.Provenance)),
			contractProperty(factory, "allocation", contractString(factory, binding.Allocation)),
			contractProperty(factory, "dependencies", stringMetadata(factory, binding.Dependencies)),
		))
	}
	properties := []*ast.Node{
		contractProperty(factory, "version", contractNumber(factory, execution.Version)),
		contractProperty(factory, "ports", contractArray(factory, ports...)),
		contractProperty(factory, "transitions", contractArray(factory, transitions...)),
	}
	if !compact {
		properties = append(properties, contractProperty(factory, "reactive", contractArray(factory, reactive...)))
	}
	return contractObject(factory, true, properties...)
}

// componentDefinitionMetadata emits the single compiler-owned executable description consumed
// while creating each durable state-machine instance.
func componentDefinitionMetadata(
	factory *printer.NodeFactory,
	instantiate *ast.Node,
	execution ComponentExecution,
	stateSlots []string,
	continuations []Continuation,
	hasResumption bool,
	hasInteractions bool,
	compatibility bool,
	dynamicComponents bool,
	collections bool,
	runtimeABI int,
	compact bool,
	updates *ast.Node,
) *ast.Node {
	state := append([]string{}, stateSlots...)
	tasks := []string{}
	capabilities := []string{}
	for _, transition := range execution.Transitions {
		tasks = append(tasks, transition.ID)
	}
	if len(tasks) != 0 {
		capabilities = append(capabilities, "tasks")
	}
	if len(continuations) != 0 {
		capabilities = append(capabilities, "continuations")
	}
	if hasResumption {
		capabilities = append(capabilities, "resumption")
	}
	if hasInteractions {
		capabilities = append(capabilities, "interactions")
	}
	if compatibility {
		capabilities = append(capabilities, "compatibility")
	}
	if dynamicComponents {
		capabilities = append(capabilities, "dynamic-components")
	}
	if collections {
		capabilities = append(capabilities, "collections")
	}
	reactive := make([]*ast.Node, 0, len(execution.Reactive))
	for _, binding := range execution.Reactive {
		reactive = append(reactive, contractObject(factory, true,
			contractProperty(factory, "name", contractString(factory, binding.Name)),
			contractProperty(factory, "provenance", contractString(factory, binding.Provenance)),
			contractProperty(factory, "allocation", contractString(factory, binding.Allocation)),
			contractProperty(factory, "dependencies", stringMetadata(factory, binding.Dependencies)),
		))
	}
	properties := []*ast.Node{
		contractProperty(factory, "version", contractNumber(factory, 1)),
		contractProperty(factory, "instantiate", instantiate),
		contractProperty(factory, "abi", contractNumber(factory, runtimeABI)),
		contractProperty(factory, "capabilities", stringMetadata(factory, capabilities)),
		contractProperty(factory, "state", stringMetadata(factory, state)),
	}
	if updates != nil {
		properties = append(properties, contractProperty(factory, "updates", updates))
	}
	if !compact {
		properties = append(properties,
			contractProperty(factory, "tasks", stringMetadata(factory, tasks)),
			contractProperty(factory, "reactive", contractArray(factory, reactive...)),
			contractProperty(factory, "render", contractString(factory, "returned-function")),
		)
	}
	return contractObject(factory, true, properties...)
}

const (
	componentABICompiledRender = 1 << iota
	componentABILifecycle
	componentABILists
	componentABITasks
)

// componentRuntimeABI compacts compiler-proven execution needs into the hot construction record.
func componentRuntimeABI(component Component, execution ComponentExecution, compatibility bool) int {
	abi := 0
	if component.CompiledRender {
		abi |= componentABICompiledRender
	}
	if component.Lifecycle {
		abi |= componentABILifecycle
	}
	if component.Lists {
		abi |= componentABILists
	}
	if len(execution.Transitions) != 0 || component.Interactions || compatibility {
		abi |= componentABITasks
	}
	return abi
}

// projectComponentExecution removes opposite-target transitions and compacts
// their now-unreachable ports before metadata reaches a physical artifact.
func projectComponentExecution(execution ComponentExecution, target Target) ComponentExecution {
	transitions := []ComponentTransition{}
	usedPorts := make(map[int]struct{})
	inputPorts := make(map[int]struct{})
	outputPorts := make(map[int]struct{})
	for _, transition := range execution.Transitions {
		if (target == TargetClient && transition.Placement == "server") ||
			(target == TargetServer && transition.Placement == "client") {
			continue
		}
		transitions = append(transitions, transition)
		for _, input := range transition.Inputs {
			usedPorts[input] = struct{}{}
			inputPorts[input] = struct{}{}
		}
		for _, output := range transition.Outputs {
			usedPorts[output] = struct{}{}
			outputPorts[output] = struct{}{}
		}
	}
	ports := []ComponentPort{}
	remap := make(map[int]int, len(usedPorts))
	for _, port := range execution.Ports {
		if _, used := usedPorts[port.Index]; !used {
			continue
		}
		oldIndex := port.Index
		port.Index = len(ports)
		remap[oldIndex] = port.Index
		_, input := inputPorts[oldIndex]
		_, output := outputPorts[oldIndex]
		switch {
		case input && output:
			port.Direction = "inout"
		case output:
			port.Direction = "output"
		default:
			port.Direction = "input"
		}
		ports = append(ports, port)
	}
	for index := range transitions {
		transitions[index].Inputs = remapComponentPorts(transitions[index].Inputs, remap)
		transitions[index].Outputs = remapComponentPorts(transitions[index].Outputs, remap)
	}
	return ComponentExecution{
		Version: execution.Version, Ports: ports, Transitions: transitions,
		Reactive: append([]ReactiveAllocation{}, execution.Reactive...),
	}
}

func remapComponentPorts(values []int, indexes map[int]int) []int {
	result := make([]int, 0, len(values))
	for _, value := range values {
		if mapped, exists := indexes[value]; exists {
			result = append(result, mapped)
		}
	}
	return result
}

func continuationDependencyMetadata(
	factory *printer.NodeFactory,
	dependencies []TaskDependency,
) []*ast.Node {
	values := make([]*ast.Node, 0, len(dependencies))
	for _, dependency := range dependencies {
		properties := []*ast.Node{
			contractProperty(factory, "index", contractNumber(factory, dependency.Index)),
			contractProperty(factory, "source", contractString(factory, dependency.Source)),
		}
		if dependency.Path != "" {
			properties = append(properties,
				contractProperty(factory, "path", contractString(factory, dependency.Path)),
			)
		}
		values = append(values, contractObject(factory, true, properties...))
	}
	return values
}

func contractNumber(factory *printer.NodeFactory, value int) *ast.Node {
	return factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
}

func contractNumberArray(factory *printer.NodeFactory, values []int) *ast.Node {
	nodes := make([]*ast.Node, 0, len(values))
	for _, value := range values {
		nodes = append(nodes, contractNumber(factory, value))
	}
	return contractArray(factory, nodes...)
}
