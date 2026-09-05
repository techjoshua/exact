package exactcompiler

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

type componentUpdateOperation struct {
	target int
	bit    int
	update renderProgramDirectUpdate
}

type componentUpdateBuild struct {
	component    Component
	name         string
	bindings     map[string][]uint32
	dependencies map[string]componentUpdateDependency
	binders      []*ast.Node
	targets      int
	operations   []componentUpdateOperation
}

// registerComponentUpdates assigns component-wide target and dirty-bit identities to one region.
func (lowering *jsxLowering) registerComponentUpdates(
	identityNode *ast.Node,
	updates []renderProgramDirectUpdate,
) (int, string, *componentUpdateBuild, bool) {
	if len(updates) == 0 {
		return 0, "", nil, false
	}
	component, exists := lowering.componentContaining(identityNode)
	if !exists {
		return 0, "", nil, false
	}
	build := lowering.componentUpdates[component.Name]
	if build == nil {
		build = &componentUpdateBuild{
			component:    component,
			name:         lowering.materializedName("component_updates", component.Start),
			bindings:     make(map[string][]uint32),
			dependencies: make(map[string]componentUpdateDependency),
		}
		lowering.componentUpdates[component.Name] = build
	}
	target := build.targets
	build.targets++
	for _, update := range updates {
		bit := len(build.operations)
		build.operations = append(build.operations, componentUpdateOperation{
			target: target,
			bit:    bit,
			update: update,
		})
		for _, dependency := range update.dependencies {
			key := dependency.source + "\x00" + strconv.Itoa(dependency.slot)
			word := bit / 32
			masks := build.bindings[key]
			for len(masks) <= word {
				masks = append(masks, 0)
			}
			masks[word] |= uint32(1) << (bit % 32)
			build.bindings[key] = masks
			build.dependencies[key] = dependency
		}
	}
	return target, build.name, build, true
}

// componentContaining returns the narrowest durable component span that owns a JSX region.
func (lowering *jsxLowering) componentContaining(node *ast.Node) (Component, bool) {
	var selected Component
	found := false
	for _, component := range lowering.components {
		if node.Pos() < component.Start || node.End() > component.Start+component.Length {
			continue
		}
		if !found || component.Length < selected.Length {
			selected = component
			found = true
		}
	}
	return selected, found
}

// emitComponentUpdateDefinitions appends one immutable generated update program per component.
func (lowering *jsxLowering) emitComponentUpdateDefinitions() map[string]string {
	components := make([]string, 0, len(lowering.componentUpdates))
	for component, build := range lowering.componentUpdates {
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
		build := lowering.componentUpdates[component]
		name := build.name
		names[component] = name
		lowering.clientDefinitions = append(lowering.clientDefinitions,
			lowering.factory.NewVariableStatement(
				nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							lowering.factory.NewIdentifier(name), nil, nil,
							lowering.componentUpdateDefinition(build),
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
	}
	return names
}

// componentUpdateDefinition emits fixed dependency masks and direct target operations.
func (lowering *jsxLowering) componentUpdateDefinition(build *componentUpdateBuild) *ast.Node {
	array := func(values []*ast.Node) *ast.Node {
		return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
	}
	keys := make([]string, 0, len(build.bindings))
	for key := range build.bindings {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	wordCount := (len(build.operations) + 31) / 32
	if wordCount < 2 {
		wordCount = 2
	}
	stateOnly := true
	for _, dependency := range build.dependencies {
		if dependency.source != "state" {
			stateOnly = false
			break
		}
	}
	binderName := lowering.names.bindComponentUpdate
	if stateOnly {
		binderName = lowering.names.bindStateComponentUpdate
	}
	if wordCount > 2 {
		binderName = lowering.names.bindWideComponentUpdate
		if stateOnly {
			binderName = lowering.names.bindWideStateUpdate
		}
	}
	for _, binder := range build.binders {
		binder.AsIdentifier().Text = binderName
	}
	bindings := make([]*ast.Node, 0, len(keys))
	propBindings := 0
	for _, key := range keys {
		masks := build.bindings[key]
		dependency := build.dependencies[key]
		if dependency.source == "props" {
			propBindings++
		}
		values := make([]*ast.Node, 1, wordCount+1)
		values[0] = lowering.factory.NewNumericLiteral(strconv.Itoa(dependency.slot), ast.TokenFlagsNone)
		for word := 0; word < wordCount; word++ {
			var mask uint32
			if word < len(masks) {
				mask = masks[word]
			}
			values = append(values,
				lowering.factory.NewNumericLiteral(strconv.FormatUint(uint64(mask), 10), ast.TokenFlagsNone),
			)
		}
		bindings = append(bindings, array(values))
	}
	properties := []*ast.Node{
		lowering.property(
			lowering.factory.NewIdentifier("bindings"),
			lowering.factory.NewAsExpression(
				array(bindings),
				lowering.factory.NewTypeReferenceNode(
					lowering.factory.NewIdentifier("const"),
					nil,
				),
			),
		),
	}
	if propBindings != 0 {
		properties = append(properties, lowering.property(
			lowering.factory.NewIdentifier("props"),
			lowering.factory.NewNumericLiteral(strconv.Itoa(propBindings), ast.TokenFlagsNone),
		))
	}
	if wordCount > 2 {
		properties = append(properties, lowering.property(
			lowering.factory.NewIdentifier("words"),
			lowering.factory.NewNumericLiteral(strconv.Itoa(wordCount), ast.TokenFlagsNone),
		))
	}
	properties = append(properties,
		lowering.property(lowering.factory.NewIdentifier("apply"), lowering.componentUpdateApply(build)),
	)
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
}

// componentUpdateApply emits one target guard followed by direct dirty operations for that region.
func (lowering *jsxLowering) componentUpdateApply(build *componentUpdateBuild) *ast.Node {
	targets := lowering.factory.NewIdentifier("__exactTargets")
	dirtyLow := lowering.factory.NewIdentifier("__exactDirtyLow")
	dirtyHigh := lowering.factory.NewIdentifier("__exactDirtyHigh")
	dirtyWords := lowering.factory.NewIdentifier("__exactDirtyWords")
	statements := make([]*ast.Node, 0, build.targets)
	for targetIndex := 0; targetIndex < build.targets; targetIndex++ {
		target := lowering.factory.NewIdentifier("__exactTarget" + strconv.Itoa(targetIndex))
		body := []*ast.Node{
			lowering.factory.NewVariableStatement(nil,
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							target, nil, nil,
							lowering.factory.NewElementAccessExpression(
								targets,
								nil,
								lowering.factory.NewNumericLiteral(strconv.Itoa(targetIndex), ast.TokenFlagsNone),
								ast.NodeFlagsNone,
							),
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		}
		operations := make([]*ast.Node, 0)
		for _, operation := range build.operations {
			if operation.target != targetIndex {
				continue
			}
			operations = append(operations,
				lowering.directUpdateStatement(target, dirtyLow, dirtyHigh, dirtyWords, operation.bit, operation.update),
			)
		}
		body = append(body, lowering.factory.NewIfStatement(
			target,
			lowering.factory.NewBlock(lowering.factory.NewNodeList(operations), true),
			nil,
		))
		statements = append(statements, body...)
	}
	declarations := []*ast.Node{
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			targets,
			nil,
			lowering.factory.NewArrayTypeNode(
				lowering.factory.NewKeywordTypeNode(ast.KindObjectKeyword),
			),
			nil,
		),
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			dirtyLow,
			nil,
			lowering.factory.NewKeywordTypeNode(ast.KindNumberKeyword),
			nil,
		),
		lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			dirtyHigh,
			nil,
			lowering.factory.NewKeywordTypeNode(ast.KindNumberKeyword),
			nil,
		),
	}
	if len(build.operations) > 64 {
		declarations = append(declarations, lowering.factory.NewParameterDeclaration(
			nil,
			nil,
			dirtyWords,
			nil,
			lowering.factory.NewTypeReferenceNode(
				lowering.factory.NewIdentifier("Uint32Array"),
				nil,
			),
			nil,
		))
	}
	return lowering.factory.NewArrowFunction(
		nil, nil, lowering.factory.NewNodeList(declarations), nil, nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}
