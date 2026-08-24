package exactcompiler

import (
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) directServerSetupTransition(
	task Task,
) (Component, ComponentTransition, bool) {
	if lowering.target != TargetServer || task.Invoked || task.Placement == "client" {
		return Component{}, ComponentTransition{}, false
	}
	component, exists := lowering.components[task.Component]
	if !exists || !component.DirectServer {
		return Component{}, ComponentTransition{}, false
	}
	for _, transition := range projectComponentExecution(component.Execution, TargetServer).Transitions {
		if transition.TaskID == task.ID && transition.Activation == "setup" &&
			!transition.DirectServerSetup {
			return component, transition, true
		}
	}
	return Component{}, ComponentTransition{}, false
}

// serverTaskSlice emits one module-static tuple referenced directly by generated setup. Input -1
// entries consume the authored value; non-negative entries await that compiler-selected output
// port. Output entries carry their state path so publication requires no per-request graph lookup.
func (lowering *jsxLowering) serverTaskSlice(
	task Task,
	component Component,
	transition ComponentTransition,
	argumentCount int,
) *ast.Node {
	if name, exists := lowering.serverTaskSlices[task.ID]; exists {
		return lowering.factory.NewIdentifier(name)
	}
	name := ""
	for candidate := len(lowering.serverTaskSlices) + 1; ; candidate++ {
		name = "__exact_server_task_slice_" + strconv.Itoa(candidate)
		if !containsIdentifier(lowering.sourceFile.AsNode(), name) {
			break
		}
	}
	lowering.serverTaskSlices[task.ID] = name
	produced := make(map[int]struct{})
	for _, candidate := range projectComponentExecution(component.Execution, TargetServer).Transitions {
		for _, port := range candidate.Outputs {
			produced[port] = struct{}{}
		}
	}
	inputs := make([]*ast.Node, argumentCount)
	for index := range inputs {
		port := -1
		if index < len(transition.Inputs) {
			if candidate := transition.Inputs[index]; candidate >= 0 {
				if _, predecessor := produced[candidate]; predecessor {
					port = candidate
				}
			}
		}
		inputs[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(port), ast.TokenFlagsNone)
	}
	outputs := make([]*ast.Node, 0, len(transition.Outputs))
	for _, output := range transition.Outputs {
		if output < 0 || output >= len(component.Execution.Ports) {
			continue
		}
		port := component.Execution.Ports[output]
		if port.Kind != "state" {
			continue
		}
		path := make([]*ast.Node, 0)
		for _, segment := range strings.Split(port.Path, ".") {
			if segment != "" {
				path = append(path, lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone))
			}
		}
		outputs = append(outputs, lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewNumericLiteral(strconv.Itoa(output), ast.TokenFlagsNone),
				lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(path), false),
			}),
			false,
		))
	}
	readiness := transition.Readiness
	if readiness == "" {
		readiness = "blocking"
	}
	slice := lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(inputs), false),
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(outputs), false),
			lowering.factory.NewStringLiteral(readiness, ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(lowering.functionTaskLabel(task), ast.TokenFlagsNone),
		}),
		false,
	)
	slice = lowering.factory.NewAsExpression(
		slice,
		lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("const"), nil),
	)
	definition := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					lowering.factory.NewIdentifier(name), nil, nil, slice,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	lowering.clientDefinitions = append(lowering.clientDefinitions, definition)
	return lowering.factory.NewIdentifier(name)
}
