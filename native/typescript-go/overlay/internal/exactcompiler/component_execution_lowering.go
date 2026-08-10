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
) *ast.Node {
	ports := make([]*ast.Node, 0, len(execution.Ports))
	for _, port := range execution.Ports {
		ports = append(ports, contractObject(factory, true,
			contractProperty(factory, "index", contractNumber(factory, port.Index)),
			contractProperty(factory, "kind", contractString(factory, port.Kind)),
			contractProperty(factory, "path", contractString(factory, port.Path)),
			contractProperty(factory, "direction", contractString(factory, port.Direction)),
		))
	}
	transitions := make([]*ast.Node, 0, len(execution.Transitions))
	for _, transition := range execution.Transitions {
		transitions = append(transitions, contractObject(factory, true,
			contractProperty(factory, "id", contractString(factory, transition.ID)),
			contractProperty(factory, "taskId", contractString(factory, transition.TaskID)),
			contractProperty(factory, "activation", contractString(factory, transition.Activation)),
			contractProperty(factory, "placement", contractString(factory, transition.Placement)),
			contractProperty(factory, "readiness", contractString(factory, transition.Readiness)),
			contractProperty(factory, "concurrency", contractString(factory, transition.Concurrency)),
			contractProperty(factory, "inputs", contractNumberArray(factory, transition.Inputs)),
			contractProperty(factory, "outputs", contractNumberArray(factory, transition.Outputs)),
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
	return contractObject(factory, true,
		contractProperty(factory, "version", contractNumber(factory, execution.Version)),
		contractProperty(factory, "ports", contractArray(factory, ports...)),
		contractProperty(factory, "transitions", contractArray(factory, transitions...)),
		contractProperty(factory, "reactive", contractArray(factory, reactive...)),
	)
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
