package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

type componentInputUpdateOperation struct {
	bit        int
	dependency nativeTaskDependency
	parameter  string
	statement  *ast.Node
}

type componentInputUpdateBuild struct {
	component  Component
	name       string
	bindings   map[int][]uint32
	operations []componentInputUpdateOperation
}

// registerComponentInputUpdate moves one compiler-proven top-level prop relationship out of the
// task activation topology. Nested reads retain their computation owner because their dependency
// identity cannot be represented by a root prop slot alone.
func (lowering *jsxLowering) registerComponentInputUpdate(
	task Task,
	work *ast.Node,
	dependencies []nativeTaskDependency,
	rewrittenWork *ast.Node,
	contextBindings []continuationContextBinding,
) (*ast.Node, bool) {
	if lowering.target != TargetClient ||
		(lowering.contractProjection != ComponentContractProjectionHydrate &&
			lowering.contractProjection != ComponentContractProjectionClient) ||
		!strings.HasPrefix(lowering.functionTaskLabel(task), "__exactComponentComputation_") ||
		task.Async || task.Invoked || task.Detached ||
		len(contextBindings) != 0 || len(task.ResultWritePath) != 0 ||
		len(dependencies) != 1 {
		return nil, false
	}
	component, exists := lowering.components[task.Component]
	if !exists {
		return nil, false
	}
	dependencySlot, exact := lowering.exactComponentInputPropSlot(component, task, dependencies[0])
	if !exact {
		return nil, false
	}
	if componentInputWorkContainsCall(work) || !ast.IsArrowFunction(rewrittenWork) {
		return nil, false
	}
	parameters := rewrittenWork.Parameters()
	body := rewrittenWork.Body()
	if len(parameters) < 1 || parameters[0].Name() == nil ||
		!ast.IsIdentifier(parameters[0].Name()) || body == nil || !ast.IsBlock(body) ||
		len(body.AsBlock().Statements.Nodes) != 1 {
		return nil, false
	}
	statement := body.AsBlock().Statements.Nodes[0]
	if !lowering.directComponentInputStateWrite(statement) {
		return nil, false
	}
	build := lowering.componentInputUpdates[component.Name]
	if build == nil {
		build = &componentInputUpdateBuild{
			component: component,
			name:      lowering.materializedName("component_inputs", -component.Start-1),
			bindings:  make(map[int][]uint32),
		}
		lowering.componentInputUpdates[component.Name] = build
	}
	if len(build.operations) >= 64 {
		return nil, false
	}
	bit := len(build.operations)
	word := bit / 32
	masks := build.bindings[dependencySlot]
	for len(masks) <= word {
		masks = append(masks, 0)
	}
	masks[word] |= uint32(1) << (bit % 32)
	build.bindings[dependencySlot] = masks
	build.operations = append(build.operations, componentInputUpdateOperation{
		bit:        bit,
		dependency: dependencies[0],
		parameter:  parameters[0].Name().Text(),
		statement:  lowering.rebindComponentInputStatement(statement),
	})
	lowering.componentInputTaskIDs[task.ID] = struct{}{}
	low, high := uint32(0), uint32(0)
	if bit < 32 {
		low = uint32(1) << bit
	} else {
		high = uint32(1) << (bit - 32)
	}
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewIdentifier(build.name),
			nil,
			lowering.factory.NewIdentifier("apply"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.factory.NewThisExpression(),
			lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(low), 10), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(high), 10), ast.TokenFlagsNone),
		}),
		ast.NodeFlagsNone,
	), true
}

func omitComponentInputTaskTransitions(
	components []Component,
	continuations []Continuation,
	taskIDs map[string]struct{},
) ([]Component, []Continuation) {
	retainedContinuations := make([]Continuation, 0, len(continuations))
	for _, continuation := range continuations {
		if _, omitted := taskIDs[continuation.TaskID]; !omitted {
			retainedContinuations = append(retainedContinuations, continuation)
		}
	}
	filter := func(execution ComponentExecution) ComponentExecution {
		transitions := make([]ComponentTransition, 0, len(execution.Transitions))
		for _, transition := range execution.Transitions {
			if _, omitted := taskIDs[transition.TaskID]; !omitted {
				transitions = append(transitions, transition)
			}
		}
		execution.Transitions = transitions
		return execution
	}
	for index := range components {
		components[index].Execution = filter(components[index].Execution)
		components[index].TargetPlan.ClientExecution = filter(
			components[index].TargetPlan.ClientExecution,
		)
	}
	return components, retainedContinuations
}

func (lowering *jsxLowering) exactComponentInputPropSlot(
	component Component,
	task Task,
	dependency nativeTaskDependency,
) (int, bool) {
	if len(task.Dependencies) != 1 || task.Dependencies[0].Source != "props" {
		return 0, false
	}
	componentNode := componentSourceNode(lowering.sourceFile, component)
	propsName := componentPropsParameterName(componentNode)
	if propsName == "" {
		return 0, false
	}
	text := strings.TrimSpace(sourceText(lowering.sourceFile, dependency.expression))
	for slot, name := range component.PropsSlots {
		expected := propsName + "." + name
		if text == expected {
			return slot, true
		}
	}
	return 0, false
}

func componentInputWorkContainsCall(work *ast.Node) bool {
	found := false
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) {
			found = true
			return false
		}
		return !found
	})
	return found
}

func (lowering *jsxLowering) directComponentInputStateWrite(statement *ast.Node) bool {
	if !ast.IsExpressionStatement(statement) {
		return false
	}
	expression := statement.AsExpressionStatement().Expression
	if !ast.IsCallExpression(expression) {
		return false
	}
	call := expression.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.Expression.Text() != lowering.names.writeState ||
		call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
		return false
	}
	root := call.Arguments.Nodes[0]
	return ast.IsPropertyAccessExpression(root) &&
		root.AsPropertyAccessExpression().Expression.Kind == ast.KindThisKeyword &&
		root.AsPropertyAccessExpression().Name().Text() == "state"
}

func (lowering *jsxLowering) rebindComponentInputStatement(statement *ast.Node) *ast.Node {
	instance := lowering.factory.NewIdentifier("__exactInstance")
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if node.Kind == ast.KindThisKeyword {
			return instance
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(statement)
}

// emitComponentInputUpdateDefinitions publishes one immutable receiver plan per eligible component.
func (lowering *jsxLowering) emitComponentInputUpdateDefinitions() map[string]string {
	components := make([]string, 0, len(lowering.componentInputUpdates))
	for component, build := range lowering.componentInputUpdates {
		if len(build.operations) != 0 {
			components = append(components, component)
		}
	}
	sort.Strings(components)
	if len(components) == 0 {
		return nil
	}
	names := make(map[string]string, len(components))
	for _, component := range components {
		build := lowering.componentInputUpdates[component]
		names[component] = build.name
		lowering.clientDefinitions = append(lowering.clientDefinitions,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							lowering.factory.NewIdentifier(build.name), nil, nil,
							lowering.componentInputUpdateDefinition(build),
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
	}
	return names
}

func (lowering *jsxLowering) componentInputUpdateDefinition(
	build *componentInputUpdateBuild,
) *ast.Node {
	slots := make([]int, 0, len(build.bindings))
	for slot := range build.bindings {
		slots = append(slots, slot)
	}
	sort.Ints(slots)
	bindings := make([]*ast.Node, 0, len(slots))
	for _, slot := range slots {
		masks := build.bindings[slot]
		low, high := uint32(0), uint32(0)
		if len(masks) > 0 {
			low = masks[0]
		}
		if len(masks) > 1 {
			high = masks[1]
		}
		bindings = append(bindings, lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone),
				lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(low), 10), ast.TokenFlagsNone),
				lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(high), 10), ast.TokenFlagsNone),
			}),
			false,
		))
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.property(
				lowering.factory.NewIdentifier("bindings"),
				lowering.factory.NewAsExpression(
					lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(bindings), false),
					lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("const"), nil),
				),
			),
			lowering.property(
				lowering.factory.NewIdentifier("apply"),
				lowering.componentInputUpdateApply(build),
			),
		}),
		false,
	)
}

func (lowering *jsxLowering) componentInputUpdateApply(build *componentInputUpdateBuild) *ast.Node {
	instance := lowering.factory.NewIdentifier("__exactInstance")
	dirtyLow := lowering.factory.NewIdentifier("__exactDirtyLow")
	dirtyHigh := lowering.factory.NewIdentifier("__exactDirtyHigh")
	statements := []*ast.Node{}
	componentNode := componentSourceNode(lowering.sourceFile, build.component)
	propsName := componentPropsParameterName(componentNode)
	if propsName == "" {
		propsName = "__exactProps"
	}
	statements = append(statements, lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					lowering.factory.NewIdentifier(propsName), nil, nil,
					lowering.factory.NewPropertyAccessExpression(
						instance, nil, lowering.factory.NewIdentifier("props"), ast.NodeFlagsNone,
					),
				),
			}),
			ast.NodeFlagsConst,
		),
	))
	for _, operation := range build.operations {
		word := dirtyLow
		if operation.bit >= 32 {
			word = dirtyHigh
		}
		mask := uint32(1) << (operation.bit % 32)
		condition := lowering.factory.NewBinaryExpression(
			nil,
			lowering.factory.NewParenthesizedExpression(
				lowering.factory.NewBinaryExpression(
					nil, word, nil, lowering.factory.NewToken(ast.KindAmpersandToken),
					lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(mask), 10), ast.TokenFlagsNone),
				),
			),
			nil,
			lowering.factory.NewToken(ast.KindExclamationEqualsEqualsToken),
			lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
		)
		dependency := lowering.visitor.VisitNode(operation.dependency.expression)
		body := lowering.factory.NewBlock(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableStatement(
					nil,
					lowering.factory.NewVariableDeclarationList(
						lowering.factory.NewNodeList([]*ast.Node{
							lowering.factory.NewVariableDeclaration(
								lowering.factory.NewIdentifier(operation.parameter), nil, nil, dependency,
							),
						}),
						ast.NodeFlagsConst,
					),
				),
				operation.statement,
			}),
			true,
		)
		statements = append(statements, lowering.factory.NewIfStatement(condition, body, nil))
	}
	parameter := func(name *ast.Node, kind ast.Kind) *ast.Node {
		return lowering.factory.NewParameterDeclaration(
			nil, nil, name, nil, lowering.factory.NewKeywordTypeNode(kind), nil,
		)
	}
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			parameter(instance, ast.KindAnyKeyword),
			parameter(dirtyLow, ast.KindNumberKeyword),
			parameter(dirtyHigh, ast.KindNumberKeyword),
		}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}
