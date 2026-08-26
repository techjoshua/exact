package exactcompiler

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type renderProgramDirectUpdate struct {
	kind         string
	index        int
	group        int
	firstSlot    int
	dependencies []componentUpdateDependency
}

type componentUpdateDependency struct {
	source string
	slot   int
}

// directRenderProgramBinder emits the exact client binding calls in browser-safe application order.
// Shared DOM operations retain the mechanics; the compiled component owns all topology and wiring.
func (lowering *jsxLowering) directRenderProgramBinder(
	build *renderProgramBuild,
	directUpdates []renderProgramDirectUpdate,
	componentTarget *int,
	componentUpdates string,
	componentUpdate *componentUpdateBuild,
) *ast.Node {
	target := lowering.factory.NewIdentifier(lowering.names.bindingTarget)
	statements := make([]*ast.Node, 0, len(build.slots)+2)
	call := func(helper string, arguments ...*ast.Node) {
		statements = append(statements, lowering.factory.NewExpressionStatement(
			lowering.call(helper, append([]*ast.Node{target}, arguments...)),
		))
	}
	claimStatements := lowering.directRenderProgramClaims(build, target)
	claimStatements = append(claimStatements, lowering.factory.NewReturnStatement(nil))
	statements = append(statements, lowering.factory.NewIfStatement(
		lowering.call(lowering.names.beginProgramClaims, []*ast.Node{
			target,
			lowering.factory.NewStringLiteral(build.nodes[0].tag, ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(build.nodes[0].namespace, ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(len(build.nodes)), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(len(build.slots)), ast.TokenFlagsNone),
		}),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(claimStatements), true),
		nil,
	))
	listSlots := make([]*ast.Node, 0, len(build.slots))
	directText := make(map[int]struct{}, len(directUpdates))
	directChildren := make(map[int]struct{}, len(directUpdates))
	directProperties := make(map[int]struct{}, len(directUpdates))
	for _, update := range directUpdates {
		if update.kind == "text" {
			directText[update.index] = struct{}{}
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
				call(lowering.names.bindProgramKeyedChild, slotIndex)
			} else {
				listSlots = append(listSlots, slotIndex)
			}
			continue
		}
		switch slot.kind {
		case "text":
			arguments := []*ast.Node{slotIndex}
			if _, direct := directText[index]; direct {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			call(lowering.names.bindProgramText, arguments...)
		case "child", "component":
			arguments := []*ast.Node{slotIndex}
			if _, direct := directChildren[index]; direct {
				arguments = append(arguments, lowering.factory.NewTrueExpression())
			}
			call(lowering.names.bindProgramChild, arguments...)
		}
	}
	if len(listSlots) != 0 {
		call(
			lowering.names.bindProgramLists,
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(listSlots), false),
		)
	}
	for group, binding := range build.propertyBindings() {
		arguments := []*ast.Node{
			lowering.factory.NewNumericLiteral(strconv.Itoa(group), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(binding.slots[0]), ast.TokenFlagsNone),
		}
		if _, direct := directProperties[group]; direct {
			arguments = append(arguments, lowering.factory.NewTrueExpression())
		}
		call(lowering.names.bindProgramProperties, arguments...)
	}
	if componentTarget != nil {
		binder := lowering.factory.NewIdentifier(lowering.names.bindComponentUpdate)
		componentUpdate.binders = append(componentUpdate.binders, binder)
		statements = append(statements, lowering.factory.NewExpressionStatement(
			lowering.factory.NewCallExpression(
				binder,
				nil,
				nil,
				lowering.factory.NewNodeList([]*ast.Node{
					target,
					lowering.factory.NewNumericLiteral(strconv.Itoa(*componentTarget), ast.TokenFlagsNone),
					lowering.factory.NewIdentifier(componentUpdates),
				}),
				ast.NodeFlagsNone,
			),
		))
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, target, nil, nil, nil)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}

func (lowering *jsxLowering) directRenderProgramUpdates(
	build *renderProgramBuild,
) []renderProgramDirectUpdate {
	updates := make([]renderProgramDirectUpdate, 0, len(build.slots))
	for index, slot := range build.slots {
		if slot.kind == "text" {
			if dependency, direct := lowering.directRenderProgramDependency(slot.reader); direct {
				updates = append(updates, renderProgramDirectUpdate{
					kind: "text", index: index, dependencies: []componentUpdateDependency{dependency},
				})
			}
			continue
		}
		if slot.kind == "child" || slot.kind == "component" {
			if dependencies, direct := lowering.directStructuralProgramDependencies(slot.reader); direct {
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
			if dependency, direct := lowering.directRenderProgramDependency(slot.reader); direct {
				dependencies = append(dependencies, dependency)
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
	}
	return updates
}

func (lowering *jsxLowering) directRenderProgramInertReader(slot renderProgramSlot) bool {
	if slot.reader == nil {
		return false
	}
	if strings.HasPrefix(slot.name, "__exact") {
		return true
	}
	bound := false
	for current := slot.reader; current != nil; current = current.Parent {
		if current == lowering.sourceFile.AsNode() {
			bound = true
			break
		}
	}
	if !bound {
		return false
	}
	if len(lowering.checker.GetSignaturesOfType(
		lowering.checker.GetTypeAtLocation(slot.reader),
		checker.SignatureKindCall,
	)) != 0 {
		return true
	}
	return !lowering.hasReactiveComponentCapture(slot.reader)
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
	for _, read := range lowering.stateReads {
		if read.Confidence != "exact" || len(read.Path) != 1 ||
			read.Start != node.Pos() || read.Length != node.End()-node.Pos() {
			continue
		}
		if scalarDerivedType(lowering.checker.GetTypeAtLocation(node)) {
			component, exists := lowering.componentContaining(node)
			if !exists {
				return componentUpdateDependency{}, false
			}
			for slot, key := range component.StateSlots {
				if key == read.Path[0] {
					return componentUpdateDependency{source: "state", slot: slot}, true
				}
			}
		}
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
	if update.kind == "properties" {
		helper = lowering.names.applyProgramProperties
		arguments = []*ast.Node{
			target,
			lowering.factory.NewNumericLiteral(strconv.Itoa(update.group), ast.TokenFlagsNone),
			lowering.factory.NewNumericLiteral(strconv.Itoa(update.firstSlot), ast.TokenFlagsNone),
		}
	} else if update.kind == "child" {
		helper = lowering.names.applyProgramChild
	}
	return lowering.factory.NewIfStatement(
		condition,
		lowering.factory.NewExpressionStatement(lowering.call(helper, arguments)),
		nil,
	)
}
