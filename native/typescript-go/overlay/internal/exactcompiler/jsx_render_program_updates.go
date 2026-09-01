package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

type renderProgramDirectUpdate struct {
	kind         string
	index        int
	group        int
	firstSlot    int
	textPrefix   string
	textSuffix   string
	dependencies []componentUpdateDependency
	operand      *componentUpdateDependency
}

type componentUpdateDependency struct {
	source string
	slot   int
}

// directRenderProgramWiring emits immutable component-local claim and binding operations.
// Shared DOM executors retain mechanics without allocating one binder closure per component module.
func (lowering *jsxLowering) directRenderProgramWiring(
	build *renderProgramBuild,
	directUpdates []renderProgramDirectUpdate,
	componentReceipts map[int][]componentUpdateDependency,
	reactivePropertyGroups map[int]struct{},
	componentTarget *int,
	componentUpdates string,
	componentUpdate *componentUpdateBuild,
) *ast.Node {
	bindings := make([]*ast.Node, 0, len(build.slots)+2)
	emit := func(kind int, arguments ...*ast.Node) {
		bindings = append(bindings, lowering.renderProgramOperation(kind, arguments...))
	}
	listSlots := make([]*ast.Node, 0, len(build.slots))
	directText := make(map[int]renderProgramDirectUpdate, len(directUpdates))
	directChildren := make(map[int]struct{}, len(directUpdates))
	directProperties := make(map[int]struct{}, len(directUpdates))
	for _, update := range directUpdates {
		if update.kind == "text" {
			directText[update.index] = update
		} else if update.kind == "child" {
			directChildren[update.index] = struct{}{}
		} else {
			directProperties[update.group] = struct{}{}
		}
	}
	for index, slot := range build.slots {
		slotIndex := lowering.factory.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone)
		if slot.kind == "child" && slot.list {
			if slot.directList {
				emit(3, slotIndex)
			} else {
				listSlots = append(listSlots, slotIndex)
			}
			continue
		}
		switch slot.kind {
		case "text":
			if slot.textPrefix != "" || slot.textSuffix != "" {
				projection := []*ast.Node{
					lowering.factory.NewStringLiteral(slot.textPrefix, ast.TokenFlagsNone),
					lowering.factory.NewStringLiteral(slot.textSuffix, ast.TokenFlagsNone),
				}
				if update, exists := directText[index]; exists {
					projection = append(projection, lowering.factory.NewTrueExpression())
					if update.operand != nil {
						source := "0"
						if update.operand.source == "props" {
							source = "1"
						}
						projection = append(
							projection,
							lowering.factory.NewNumericLiteral(source, ast.TokenFlagsNone),
							lowering.factory.NewNumericLiteral(strconv.Itoa(update.operand.slot), ast.TokenFlagsNone),
						)
					}
				}
				emit(11, slotIndex, lowering.factory.NewArrayLiteralExpression(
					lowering.factory.NewNodeList(projection), false,
				))
				continue
			}
			arguments := []*ast.Node{slotIndex}
			if update, exists := directText[index]; exists && update.operand != nil {
				arguments = append(arguments, lowering.renderProgramOperand(*update.operand))
			}
			if _, direct := directText[index]; direct {
				if len(arguments) == 1 {
					arguments = append(arguments, lowering.factory.NewIdentifier("undefined"))
				}
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			emit(0, arguments...)
		case "child":
			arguments := []*ast.Node{slotIndex}
			_, directChild := directChildren[index]
			if directChild {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			emit(1, arguments...)
		case "component":
			if dependencies, closedComponent := componentReceipts[index]; closedComponent {
				// Compiler-proven component slots publish parent inputs straight into the retained
				// target artifact. They are not operations in the parent's dirty-mask program.
				bindings := make([]*ast.Node, 0, len(dependencies))
				propCount := 0
				for _, dependency := range dependencies {
					bindings = append(bindings, lowering.factory.NewArrayLiteralExpression(
						lowering.factory.NewNodeList([]*ast.Node{
							lowering.factory.NewNumericLiteral(strconv.Itoa(dependency.slot), ast.TokenFlagsNone),
						}),
						false,
					))
					if dependency.source == "props" {
						propCount++
					}
				}
				emit(
					2,
					slotIndex,
					lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(bindings), false),
					lowering.factory.NewNumericLiteral(strconv.Itoa(propCount), ast.TokenFlagsNone),
				)
			} else {
				emit(1, slotIndex)
			}
		}
	}
	if len(listSlots) != 0 {
		emit(
			4,
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(listSlots), false),
		)
	}
	for group, binding := range build.propertyBindings() {
		arguments := []*ast.Node{
			lowering.factory.NewNumericLiteral(strconv.Itoa(group), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.slots[0]), ast.TokenFlagsNone),
		}
		if _, reactive := reactivePropertyGroups[group]; reactive {
			emit(6, arguments...)
			continue
		}
		if _, direct := directProperties[group]; direct {
			arguments = append(arguments, lowering.factory.NewTrueExpression())
		}
		emit(5, arguments...)
	}
	if componentTarget != nil {
		kind := 7
		stateOnly := true
		for _, dependency := range componentUpdate.dependencies {
			if dependency.source != "state" {
				stateOnly = false
				break
			}
		}
		if stateOnly {
			kind = 9
		}
		if len(componentUpdate.operations) > 64 {
			kind = 8
			if stateOnly {
				kind = 10
			}
		}
		emit(
			kind,
			lowering.factory.NewNumericLiteral(strconv.Itoa(*componentTarget), ast.TokenFlagsNone),
			lowering.factory.NewIdentifier(componentUpdates),
		)
	}
	root := lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewStringLiteral(build.nodes[0].tag, ast.TokenFlagsNone),
		lowering.factory.NewStringLiteral(build.nodes[0].namespace, ast.TokenFlagsNone),
		lowering.factory.NewNumericLiteral(strconv.Itoa(len(build.nodes)), ast.TokenFlagsNone),
		lowering.factory.NewNumericLiteral(strconv.Itoa(len(build.slots)), ast.TokenFlagsNone),
	}), false)
	claims := lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(lowering.directRenderProgramClaims(build)), false,
	)
	return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
		root,
		claims,
		lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(bindings), false),
	}), false)
}

func (lowering *jsxLowering) directRenderProgramUpdates(
	build *renderProgramBuild,
) ([]renderProgramDirectUpdate, map[int][]componentUpdateDependency, map[int]struct{}) {
	updates := make([]renderProgramDirectUpdate, 0, len(build.slots))
	componentReceipts := make(map[int][]componentUpdateDependency)
	reactivePropertyGroups := make(map[int]struct{})
	for index, slot := range build.slots {
		if slot.kind == "text" {
			if dependencies, direct := lowering.directScalarProgramDependencies(slot.reader); direct {
				var operand *componentUpdateDependency
				if exact, exists := lowering.directRenderProgramOperand(slot.reader); exists {
					operand = &exact
				}
				updates = append(updates, renderProgramDirectUpdate{
					kind: "text", index: index, textPrefix: slot.textPrefix,
					textSuffix: slot.textSuffix, dependencies: dependencies, operand: operand,
				})
			}
			continue
		}
		if slot.kind == "component" {
			dependencies, closed := lowering.directComponentProgramReader(slot.reader)
			if closed {
				componentReceipts[index] = dependencies
			}
			continue
		}
		if slot.kind == "child" {
			dependencies, direct := lowering.directStructuralProgramDependencies(slot.reader)
			if direct {
				updates = append(updates, renderProgramDirectUpdate{
					kind: "child", index: index, dependencies: dependencies,
				})
			}
		}
	}
	for group, binding := range build.propertyBindings() {
		dependencies := []componentUpdateDependency{}
		direct := true
		for _, index := range binding.slots {
			slot := build.slots[index]
			slotDependencies, slotDirect := lowering.directScalarProgramDependencies(slot.reader)
			if slotDirect {
				dependencies = append(dependencies, slotDependencies...)
				continue
			}
			if lowering.directRenderProgramInertReader(slot) {
				continue
			}
			direct = false
			break
		}
		if direct && len(dependencies) != 0 {
			updates = append(updates, renderProgramDirectUpdate{
				kind: "properties", group: group, firstSlot: binding.slots[0],
				dependencies: uniqueSortedComponentUpdateDependencies(dependencies),
			})
		}
		if !direct {
			// Arbitrary authored JavaScript retains one compiler-selected focused reactive
			// property operation. It does not enter the generic property-binding topology.
			reactivePropertyGroups[group] = struct{}{}
		}
	}
	return updates, componentReceipts, reactivePropertyGroups
}

// directRenderProgramOperand accepts only a complete indexed state or prop read. Derived and
// arbitrary expressions keep their executable reader and reactive computation ownership.
func (lowering *jsxLowering) directRenderProgramOperand(
	node *ast.Node,
) (componentUpdateDependency, bool) {
	for node != nil {
		switch {
		case ast.IsParenthesizedExpression(node):
			node = node.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(node):
			node = node.AsAsExpression().Expression
		case ast.IsSatisfiesExpression(node):
			node = node.AsSatisfiesExpression().Expression
		case ast.IsNonNullExpression(node):
			node = node.AsNonNullExpression().Expression
		case ast.IsArrowFunction(node) && !ast.IsBlock(node.AsArrowFunction().Body):
			node = node.AsArrowFunction().Body
		case ast.IsCallExpression(node):
			call := node.AsCallExpression()
			if ast.IsIdentifier(call.Expression) && call.Expression.Text() == lowering.names.readState &&
				call.Arguments != nil && len(call.Arguments.Nodes) == 2 &&
				ast.IsNumericLiteral(call.Arguments.Nodes[1]) {
				slot, error := strconv.Atoi(call.Arguments.Nodes[1].Text())
				if error != nil {
					return componentUpdateDependency{}, false
				}
				source := "props"
				receiver := call.Arguments.Nodes[0]
				if ast.IsPropertyAccessExpression(receiver) {
					member := receiver.AsPropertyAccessExpression()
					if member.Expression.Kind == ast.KindThisKeyword && member.Name() != nil &&
						member.Name().Text() == "state" {
						source = "state"
					} else {
						return componentUpdateDependency{}, false
					}
				} else if !ast.IsIdentifier(receiver) {
					return componentUpdateDependency{}, false
				}
				return componentUpdateDependency{source: source, slot: slot}, true
			}
			if !ast.IsIdentifier(call.Expression) ||
				call.Expression.Text() != lowering.names.expression ||
				call.Arguments == nil || len(call.Arguments.Nodes) != 1 ||
				!ast.IsArrowFunction(call.Arguments.Nodes[0]) ||
				ast.IsBlock(call.Arguments.Nodes[0].AsArrowFunction().Body) {
				return lowering.directRenderProgramDependency(node)
			}
			node = call.Arguments.Nodes[0].AsArrowFunction().Body
		default:
			return lowering.directRenderProgramDependency(node)
		}
	}
	return componentUpdateDependency{}, false
}

func (lowering *jsxLowering) renderProgramOperand(
	operand componentUpdateDependency,
) *ast.Node {
	source := "0"
	if operand.source == "props" {
		source = "1"
	}
	return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewNumericLiteral(source, ast.TokenFlagsNone),
		lowering.factory.NewNumericLiteral(strconv.Itoa(operand.slot), ast.TokenFlagsNone),
	}), false)
}

func (lowering *jsxLowering) directComponentProgramReader(
	node *ast.Node,
) ([]componentUpdateDependency, bool) {
	if node == nil {
		return nil, false
	}
	value := unwrapRenderExpression(node)
	if !ast.IsCallExpression(value) {
		return nil, false
	}
	component := value.AsCallExpression()
	if !ast.IsIdentifier(component.Expression) ||
		component.Expression.Text() != lowering.names.componentReceipt ||
		component.Arguments == nil || len(component.Arguments.Nodes) < 2 {
		return nil, false
	}
	dependencies := []componentUpdateDependency{}
	supported := true
	// Every supplied component input, including children, belongs to the atomic prop receipt.
	// Walk all receipt operands so a retained child receives one finalized batch while a replaced
	// generation keeps its previously delivered values.
	for _, operand := range component.Arguments.Nodes[1:] {
		walkNode(operand, func(current *ast.Node) bool {
			if dependency, direct := lowering.directRenderProgramDependency(current); direct {
				dependencies = append(dependencies, dependency)
				return false
			}
			// Callback bodies are deferred component work. Their reads belong to the callback's
			// interaction/task execution, not to the eager prop description that publishes the function.
			if ast.IsFunctionLike(current) && lowering.authoredSourceNode(current) {
				return false
			}
			if ast.IsCallExpression(current) {
				call := current.AsCallExpression()
				if !ast.IsIdentifier(call.Expression) || !lowering.generatedComponentReaderCall(call.Expression.Text()) {
					supported = false
					return false
				}
			}
			if ast.IsTaggedTemplateExpression(current) || ast.IsAwaitExpression(current) {
				supported = false
				return false
			}
			return true
		})
	}
	dependencies = uniqueSortedComponentUpdateDependencies(dependencies)
	return dependencies, supported
}

// generatedComponentReaderCall identifies compiler-owned operation/reader construction. These calls
// allocate inert descriptions or lazy expressions; they do not execute authored component work.
func (lowering *jsxLowering) generatedComponentReaderCall(name string) bool {
	return name == lowering.names.componentReceipt ||
		name == lowering.names.intrinsicElement ||
		name == lowering.names.keyedChild ||
		name == lowering.names.preparedRenderProgram ||
		name == lowering.names.expression ||
		name == lowering.names.forwardedExpression ||
		name == lowering.names.indexedExpression ||
		name == lowering.names.enhancements
}

// directScalarProgramDependencies closes over scalar expressions composed from compiler-indexed
// top-level state and prop reads. The generated component update reruns the authored reader when
// any input slot changes, so expressions such as `state.first + state.last` need no retained
// runtime watcher. Expressions without a complete indexed input set remain on the focused reactive
// lane.
func (lowering *jsxLowering) directScalarProgramDependencies(
	node *ast.Node,
) ([]componentUpdateDependency, bool) {
	if node == nil {
		return nil, false
	}
	dependencies := []componentUpdateDependency{}
	supported := true
	walkNode(node, func(current *ast.Node) bool {
		if dependency, direct := lowering.directRenderProgramDependency(current); direct {
			dependencies = append(dependencies, dependency)
			return false
		}
		// An arbitrary call can observe a reactive source which is not represented by the indexed
		// component inputs also present in the expression (for example an enhancement activation).
		// Keep that expression on the focused reactive lane so the call's complete dependency graph
		// is retained.
		if ast.IsCallExpression(current) {
			supported = false
			return false
		}
		if ast.IsTaggedTemplateExpression(current) {
			supported = false
			return false
		}
		if ast.IsAwaitExpression(current) {
			supported = false
			return false
		}
		if ast.IsFunctionLike(current) {
			supported = false
			return false
		}
		if ast.IsPropertyAccessExpression(current) {
			expression := current.AsPropertyAccessExpression().Expression
			if _, direct := lowering.directRenderProgramDependency(expression); direct {
				// A top-level indexed prop or state slot does not publish mutation versions for
				// properties of the reactive object stored in that slot. Keep nested reads on the
				// focused reaction so an in-place mutation cannot be mistaken for an unchanged
				// parent receipt.
				supported = false
				return false
			}
		}
		if ast.IsElementAccessExpression(current) {
			expression := current.AsElementAccessExpression().Expression
			if _, direct := lowering.directRenderProgramDependency(expression); direct {
				supported = false
				return false
			}
		}
		return true
	})
	dependencies = uniqueSortedComponentUpdateDependencies(dependencies)
	return dependencies, supported && len(dependencies) != 0
}

func (lowering *jsxLowering) directRenderProgramInertReader(slot renderProgramSlot) bool {
	if slot.reader == nil {
		return false
	}
	if strings.HasPrefix(slot.name, "__exact") {
		return true
	}
	if !lowering.authoredSourceNode(slot.reader) {
		return false
	}
	// Deferred inline callbacks are inert as values even when their bodies read component state.
	// Named callbacks and method references have no reactive source span inside the identifier, so
	// they fall through to the same inert result without a type-checker query per binding slot.
	if ast.IsFunctionLike(unwrapRenderExpression(slot.reader)) {
		return true
	}
	return !lowering.hasReactiveComponentCapture(slot.reader)
}

// authoredSourceNode distinguishes authored deferred functions from compiler-generated reader
// closures. Generated forwarding closures intentionally participate in eager prop dependencies.
func (lowering *jsxLowering) authoredSourceNode(node *ast.Node) bool {
	// Updated authored nodes can be detached from their original parent chain while retaining the
	// parser-assigned source interval. Compiler-created reader closures have synthesized intervals.
	if node != nil && node.Pos() >= 0 && node.End() > node.Pos() &&
		node.End() <= lowering.sourceFile.AsNode().End() {
		return true
	}
	for current := node; current != nil; current = current.Parent {
		if current == lowering.sourceFile.AsNode() {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) directRenderProgramDependency(
	node *ast.Node,
) (componentUpdateDependency, bool) {
	if node == nil {
		return componentUpdateDependency{}, false
	}
	if read, exists := lowering.indexedStateReads[node]; exists {
		return componentUpdateDependency{source: "state", slot: read.slot}, true
	}
	if read, exists := lowering.indexedPropsReads[node]; exists {
		return componentUpdateDependency{source: "props", slot: read.slot}, true
	}
	// Readers which have not yet been visited still use their source node. The state-slot index
	// already joins exact semantic reads to the containing component, so use its constant-time
	// span lookup instead of rescanning every state read and component layout for every AST node.
	if read, exists := lowering.stateReadSlots[nodeSpanKey(node)]; exists &&
		scalarDerivedType(lowering.checker.GetTypeAtLocation(node)) {
		return componentUpdateDependency{source: "state", slot: read.slot}, true
	}
	return componentUpdateDependency{}, false
}

// directStructuralProgramDependencies accepts a compiler-owned conditional range when every call
// in its discriminator is one of the indexed state/props reads already linked to the component.
// Branch-local programs retain their own generated updates and are intentionally not dependencies
// of the outer range identity.
func (lowering *jsxLowering) directStructuralProgramDependencies(
	node *ast.Node,
) ([]componentUpdateDependency, bool) {
	if node == nil {
		return nil, false
	}
	control := unwrapRenderExpression(node)
	if ast.IsConditionalExpression(control) {
		control = unwrapRenderExpression(control.AsConditionalExpression().Condition)
	}
	dependencies := []componentUpdateDependency{}
	supported := true
	walkNode(control, func(current *ast.Node) bool {
		if dependency, direct := lowering.directRenderProgramDependency(current); direct {
			dependencies = append(dependencies, dependency)
			return false
		}
		if ast.IsCallExpression(current) || ast.IsTaggedTemplateExpression(current) ||
			ast.IsAwaitExpression(current) || ast.IsFunctionLike(current) {
			supported = false
			return false
		}
		return true
	})
	dependencies = uniqueSortedComponentUpdateDependencies(dependencies)
	return dependencies, supported && len(dependencies) != 0
}

func uniqueSortedComponentUpdateDependencies(
	values []componentUpdateDependency,
) []componentUpdateDependency {
	seen := make(map[string]componentUpdateDependency, len(values))
	for _, value := range values {
		seen[value.source+"\x00"+strconv.Itoa(value.slot)] = value
	}
	keys := make([]string, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]componentUpdateDependency, 0, len(keys))
	for _, key := range keys {
		result = append(result, seen[key])
	}
	return result
}

func (lowering *jsxLowering) directUpdateStatement(
	target *ast.Node,
	dirtyLow *ast.Node,
	dirtyHigh *ast.Node,
	dirtyWords *ast.Node,
	bit int,
	update renderProgramDirectUpdate,
) *ast.Node {
	dirty := dirtyLow
	mask := uint32(1) << (bit % 32)
	if bit >= 64 {
		dirty = lowering.factory.NewElementAccessExpression(
			dirtyWords,
			nil,
			lowering.factory.NewNumericLiteral(strconv.Itoa(bit/32-2), ast.TokenFlagsNone),
			ast.NodeFlagsNone,
		)
	} else if bit >= 32 {
		dirty = dirtyHigh
	}
	condition := lowering.binary(
		lowering.binary(
			dirty,
			ast.KindAmpersandToken,
			lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(mask), 10), ast.TokenFlagsNone),
		),
		ast.KindExclamationEqualsEqualsToken,
		lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
	)
	helper := lowering.names.applyProgramText
	arguments := []*ast.Node{
		target,
		lowering.factory.NewNumericLiteral(strconv.Itoa(update.index), ast.TokenFlagsNone),
	}
	if update.kind == "text" && update.operand != nil {
		source := "0"
		if update.operand.source == "props" {
			source = "1"
		}
		arguments = append(arguments,
			lowering.factory.NewNumericLiteral(source, ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(update.operand.slot), ast.TokenFlagsNone),
		)
	}
	if update.kind == "text" && (update.textPrefix != "" || update.textSuffix != "") {
		if update.operand == nil {
			arguments = append(
				arguments,
				lowering.factory.NewIdentifier("undefined"),
				lowering.factory.NewIdentifier("undefined"),
			)
		}
		arguments = append(
			arguments,
			lowering.factory.NewStringLiteral(update.textPrefix, ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(update.textSuffix, ast.TokenFlagsNone),
		)
	}
	if update.kind == "properties" {
		helper = lowering.names.applyProgramProperties
		arguments = []*ast.Node{
			target,
			lowering.factory.NewNumericLiteral(strconv.Itoa(update.group), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(update.firstSlot), ast.TokenFlagsNone),
		}
	} else if update.kind == "child" {
		helper = lowering.names.applyProgramChild
	} else if update.kind == "component-receipt" {
		helper = lowering.names.applyComponentReceipt
		arguments = []*ast.Node{target}
	}
	return lowering.factory.NewIfStatement(
		condition,
		lowering.factory.NewExpressionStatement(lowering.call(helper, arguments)),
		nil,
	)
}
