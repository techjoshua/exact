package exactcompiler

import (
	"fmt"
	"html"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

type renderProgramContext struct {
	namespace string
	certain   bool
}

type renderProgramSlot struct {
	id             string
	kind           string
	path           []int
	node           int
	name           string
	list           bool
	directList     bool
	markerlessTail bool
	reader         *ast.Node
}

type renderProgramNode struct {
	id        int
	path      []int
	tag       string
	namespace string
}

type renderProgramBuild struct {
	template       strings.Builder
	serverSegment  strings.Builder
	serverSegments []string
	serverSlots    []int
	slots          []renderProgramSlot
	nodes          []renderProgramNode
	namespace      string
}

type renderProgramPropertyBinding struct {
	node         int
	slots        []int
	selectTarget bool
}

func (build *renderProgramBuild) propertyBindings() []renderProgramPropertyBinding {
	bindings := make([]renderProgramPropertyBinding, 0, len(build.slots))
	indexes := make(map[int]int)
	for index, slot := range build.slots {
		if slot.kind == "text" || slot.kind == "child" || slot.kind == "component" {
			continue
		}
		bindingIndex, exists := indexes[slot.node]
		if !exists {
			bindingIndex = len(bindings)
			indexes[slot.node] = bindingIndex
			bindings = append(bindings, renderProgramPropertyBinding{
				node:         slot.node,
				selectTarget: build.nodes[slot.node].tag == "select",
			})
		}
		bindings[bindingIndex].slots = append(bindings[bindingIndex].slots, index)
	}
	ordered := make([]renderProgramPropertyBinding, 0, len(bindings))
	for _, selectTarget := range []bool{false, true} {
		for _, binding := range bindings {
			if binding.selectTarget == selectTarget {
				ordered = append(ordered, binding)
			}
		}
	}
	return ordered
}

func (build *renderProgramBuild) write(value string) {
	build.template.WriteString(value)
	build.serverSegment.WriteString(value)
}

func (build *renderProgramBuild) serverSlot(index int) {
	build.serverSegments = append(build.serverSegments, build.serverSegment.String())
	build.serverSegment.Reset()
	build.serverSlots = append(build.serverSlots, index)
}

// markerlessTextSlot reports whether the serialized value is bounded by markup on both sides.
// In that shape the HTML parser cannot merge it with authored or adjacent dynamic text, so the
// client can claim the text directly at its compiled position without server comment delimiters.
func (build *renderProgramBuild) markerlessTextSlot(index int) bool {
	for position, slot := range build.serverSlots {
		if slot != index {
			continue
		}
		before := build.serverSegments[position]
		after := build.serverSegments[position+1]
		return strings.HasSuffix(before, ">") && strings.HasPrefix(after, "<")
	}
	return false
}

func (build *renderProgramBuild) textSlot(id string, path []int, reader *ast.Node) {
	index := len(build.slots)
	build.template.WriteString(fmt.Sprintf("<!---->\ue000exact:%d\ue001<!---->", index))
	build.serverSlot(index)
	mountPath := append([]int(nil), path...)
	mountPath[len(mountPath)-1]++
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "text", path: mountPath, reader: reader})
}

func (build *renderProgramBuild) childSlot(
	id string,
	path []int,
	reader *ast.Node,
	list bool,
	directList bool,
	markerlessTail bool,
) {
	index := len(build.slots)
	if !markerlessTail {
		build.template.WriteString(fmt.Sprintf("<!--exact:dynamic:%s--><!--/exact:dynamic:%s-->", html.EscapeString(id), html.EscapeString(id)))
	}
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{
		id: id, kind: "child", path: append([]int(nil), path...),
		list: list, directList: directList, markerlessTail: markerlessTail, reader: reader,
	})
}

func (build *renderProgramBuild) componentSlot(
	id string,
	path []int,
	reader *ast.Node,
	markerlessTail bool,
) {
	index := len(build.slots)
	if !markerlessTail {
		build.template.WriteString(fmt.Sprintf("<!--exact:dynamic:%s--><!--/exact:dynamic:%s-->", html.EscapeString(id), html.EscapeString(id)))
	}
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{
		id: id, kind: "component", path: append([]int(nil), path...),
		markerlessTail: markerlessTail, reader: reader,
	})
}

func (build *renderProgramBuild) propertySlot(id string, path []int, node int, name string, reader *ast.Node) {
	index := len(build.slots)
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: renderProgramSlotKind(name), path: append([]int(nil), path...), node: node, name: name, reader: reader})
}

func (lowering *jsxLowering) lowerRenderProgram(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	if _, explicit := lowering.explicitServerIsland(identityNode); explicit {
		return nil
	}
	// Generic component frames retain reactive stabilization semantics. Until their task surface is
	// compiler-closed, preserve the VNode representation that carries sibling independence through
	// the generic renderer. Direct frames capture every slot while child issuance is active below.
	if lowering.target == TargetServer &&
		!lowering.directServerArtifactComponent(identityNode) &&
		lowering.containsIndependentAsyncSiblings(children) {
		return nil
	}
	parentNamespace, certain := lowering.renderProgramParentNamespace(identityNode)
	if !certain {
		return nil
	}
	build := &renderProgramBuild{}
	if !lowering.appendRenderProgramElement(build, identityNode, opening, children, nil, parentNamespace) {
		return nil
	}
	if lowering.target == TargetServer && compilerClosedRenderProgram(build) {
		if owner, exists := lowering.directServerComponentOwner(identityNode); exists {
			lowering.closedServerWriters[owner] = struct{}{}
		}
	}
	build.serverSegments = append(build.serverSegments, build.serverSegment.String())
	programID := exactStableID(
		lowering.sourceFile.FileName(),
		"render-program",
		lowering.nodeIDs[identityNode],
	)
	program := lowering.renderProgramLiteral(programID, identityNode, build)
	programName, defined := lowering.renderProgramDefinitions[identityNode.Pos()]
	if !defined {
		programName = lowering.materializedName("render_program", identityNode.Pos())
		lowering.renderProgramDefinitions[identityNode.Pos()] = programName
		prepared := lowering.call(lowering.names.prepareRenderProgram, []*ast.Node{
			program,
		})
		lowering.renderProgramDefinitionNodes = append(
			lowering.renderProgramDefinitionNodes,
			namedRenderProgramDefinition{
				name: programName,
				node: lowering.factory.NewVariableStatement(
					nil,
					lowering.factory.NewVariableDeclarationList(
						lowering.factory.NewNodeList([]*ast.Node{
							lowering.factory.NewVariableDeclaration(
								lowering.factory.NewIdentifier(programName), nil, nil, prepared,
							),
						}),
						ast.NodeFlagsConst,
					),
				),
			},
		)
	}
	readers := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		reader := slot.reader
		// Planned slots execute inside runtime-owned reactions. A generic JSX expression wrapper
		// would allocate a second computed value every time the slot reader runs and retain it until
		// the whole component scope is disposed. Feed the wrapper's computation directly to the
		// render program instead.
		if ast.IsCallExpression(reader) {
			call := reader.AsCallExpression()
			if ast.IsIdentifier(call.Expression) &&
				call.Expression.Text() == lowering.names.expression &&
				call.Arguments != nil && len(call.Arguments.Nodes) == 1 &&
				ast.IsArrowFunction(call.Arguments.Nodes[0]) {
				closure := call.Arguments.Nodes[0]
				if !ast.IsBlock(closure.AsArrowFunction().Body) {
					if materialized := lowering.reactiveClosure(closure.AsArrowFunction().Body); materialized != nil {
						readers[index] = materialized
						continue
					}
				}
				readers[index] = closure
				continue
			}
		}
		readers[index] = lowering.reactiveClosure(reader)
		if readers[index] == nil {
			readers[index] = lowering.arrow(reader)
		}
	}
	for index, reader := range readers {
		readers[index] = lowering.preservePlannedPropertyNarrowing(reader)
	}
	var propertyWriter *ast.Node
	runtimeReaders := readers
	if lowering.target == TargetClient {
		propertyWriter = lowering.renderProgramPropertyWriter(build, readers)
		if propertyWriter != nil &&
			lowering.contractProjection != ComponentContractProjectionComplete {
			runtimeReaders = append([]*ast.Node(nil), readers...)
			for index, slot := range build.slots {
				if slot.kind != "text" && slot.kind != "child" && slot.kind != "component" {
					runtimeReaders[index] = nil
				}
			}
		}
	}
	arguments := []*ast.Node{
		lowering.factory.NewIdentifier(programName),
		lowering.renderProgramReaders(runtimeReaders),
	}
	if lowering.target != TargetServer {
		owner := lowering.factory.NewIdentifier("undefined")
		if lowering.hasLexicalComponentReceiver(identityNode) {
			owner = lowering.factory.NewThisExpression()
		}
		arguments = append(arguments, owner)
	}
	if lowering.target == TargetDefault {
		// Untargeted compiler inspection retains a materializable description. Executable browser
		// and server artifacts use only their target-specific compiled program and recover malformed
		// hydration at the root boundary without shipping a second component topology.
		lowering.renderProgramFallback = true
		fallback := lowering.lowerOpeningLike(identityNode, opening, children)
		lowering.renderProgramFallback = false
		arguments = append(arguments, lowering.arrow(fallback))
	}
	if propertyWriter != nil {
		if (lowering.target == TargetServer && len(arguments) == 2) ||
			(lowering.target != TargetServer && len(arguments) == 3) {
			arguments = append(arguments, lowering.factory.NewIdentifier("undefined"))
		}
		arguments = append(arguments, propertyWriter)
	}
	prepared := lowering.names.preparedRenderProgram
	if lowering.target == TargetServer {
		prepared = lowering.names.preparedServerProgram
		arguments[1] = lowering.renderProgramServerValues(runtimeReaders)
	}
	return lowering.call(prepared, arguments)
}

// Reports whether `this` reaches the JSX through arrows from a component receiver.
func (lowering *jsxLowering) hasLexicalComponentReceiver(node *ast.Node) bool {
	component, componentOwned := lowering.componentContaining(node)
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsArrowFunction(current) {
			if componentOwned && current.Parent != nil && ast.IsVariableDeclaration(current.Parent) {
				name := current.Parent.Name()
				if name != nil && callableNameText(name) == component.Name {
					return true
				}
			}
			continue
		}
		if ast.IsFunctionLike(current) {
			for _, parameter := range current.Parameters() {
				name := parameter.Name()
				if name != nil &&
					(name.Kind == ast.KindThisKeyword || ast.IsIdentifier(name) && name.Text() == "this") {
					return true
				}
			}
			if !componentOwned {
				return false
			}
			name := current.Name()
			if name == nil && current.Parent != nil && ast.IsVariableDeclaration(current.Parent) {
				name = current.Parent.Name()
			}
			return name != nil && callableNameText(name) == component.Name
		}
	}
	return false
}

// renderProgramServerValues evaluates compiler-ordered slots directly in the generated component.
// The former reader dispatcher existed only long enough for the runtime to call it once per slot;
// emitting its values removes that closure and duplicate invocation-local array construction.
func (lowering *jsxLowering) renderProgramServerValues(readers []*ast.Node) *ast.Node {
	values := make([]*ast.Node, len(readers))
	for index, reader := range readers {
		if reader == nil {
			values[index] = lowering.factory.NewIdentifier("undefined")
			continue
		}
		if ast.IsArrowFunction(reader) && !ast.IsBlock(reader.AsArrowFunction().Body) {
			values[index] = reader.AsArrowFunction().Body
			continue
		}
		values[index] = lowering.factory.NewCallExpression(
			reader,
			nil,
			nil,
			lowering.factory.NewNodeList(nil),
			ast.NodeFlagsNone,
		)
	}
	return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
}

// compilerClosedRenderProgram accepts only slots whose value kind is statically represented by
// the narrow renderer. General child expressions can produce structural/runtime VNodes that need
// the universal dispatcher, even though their surrounding intrinsic tree has a render program.
func compilerClosedRenderProgram(build *renderProgramBuild) bool {
	for _, slot := range build.slots {
		if slot.kind == "child" {
			return false
		}
	}
	return true
}

func (lowering *jsxLowering) directServerComponentOwner(node *ast.Node) (string, bool) {
	name := ""
	width := int(^uint(0) >> 1)
	for candidate, component := range lowering.components {
		if !component.TargetPlan.DirectServer || node.Pos() < component.Start ||
			node.End() > component.Start+component.Length || component.Length >= width {
			continue
		}
		name = candidate
		width = component.Length
	}
	return name, name != ""
}

func (lowering *jsxLowering) containsIndependentAsyncSiblings(children *ast.NodeList) bool {
	if children == nil {
		return false
	}
	if lowering.independentAsyncSiblings(children) {
		return true
	}
	for _, child := range ast.GetSemanticJsxChildren(children.Nodes) {
		if !ast.IsJsxElement(child) {
			continue
		}
		element := child.AsJsxElement()
		if jsxIntrinsic(sourceText(lowering.sourceFile, openingTag(element.OpeningElement))) &&
			lowering.containsIndependentAsyncSiblings(element.Children) {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) renderProgramPropertyWriter(
	build *renderProgramBuild,
	readers []*ast.Node,
) *ast.Node {
	bindings := build.propertyBindings()
	if len(bindings) == 0 {
		return nil
	}
	for _, binding := range bindings {
		for _, slot := range binding.slots {
			if !ast.IsArrowFunction(readers[slot]) || ast.IsBlock(readers[slot].AsArrowFunction().Body) {
				return nil
			}
		}
	}
	group := lowering.factory.NewIdentifier("__exactGroup")
	apply := lowering.factory.NewIdentifier("__exactApply")
	statements := make([]*ast.Node, 0, len(bindings))
	for groupIndex, binding := range bindings {
		assignments := make([]*ast.Node, 0, len(binding.slots))
		for _, slotIndex := range binding.slots {
			slot := build.slots[slotIndex]
			assignments = append(assignments, lowering.factory.NewExpressionStatement(
				lowering.factory.NewCallExpression(
					apply,
					nil,
					nil,
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewStringLiteral(slot.name, ast.TokenFlagsNone),
						readers[slotIndex].AsArrowFunction().Body,
					}),
					ast.NodeFlagsNone,
				),
			))
		}
		condition := lowering.binary(
			group,
			ast.KindEqualsEqualsEqualsToken,
			lowering.factory.NewNumericLiteral(strconv.Itoa(groupIndex), ast.TokenFlagsNone),
		)
		statements = append(statements, lowering.factory.NewIfStatement(
			condition,
			lowering.factory.NewBlock(lowering.factory.NewNodeList(assignments), true),
			nil,
		))
	}
	parameters := lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewParameterDeclaration(nil, nil, group, nil, nil, nil),
		lowering.factory.NewParameterDeclaration(nil, nil, apply, nil, nil, nil),
	})
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		parameters,
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true),
	)
}

// preservePlannedPropertyNarrowing retains the source checker proof when a derived object read is
// moved from its authored conditional branch into an independently scheduled property slot.
func (lowering *jsxLowering) preservePlannedPropertyNarrowing(root *ast.Node) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			updated := visitor.VisitEachChild(node)
			if !ast.IsPropertyAccessExpression(updated) {
				return updated
			}
			property := updated.AsPropertyAccessExpression()
			if !ast.IsCallExpression(property.Expression) {
				return updated
			}
			call := property.Expression.AsCallExpression()
			if !ast.IsPropertyAccessExpression(call.Expression) ||
				call.Expression.AsPropertyAccessExpression().Name().Text() != "get" {
				return updated
			}
			return lowering.factory.NewPropertyAccessExpression(
				lowering.factory.NewNonNullExpression(property.Expression, ast.NodeFlagsNone),
				property.QuestionDotToken,
				property.Name(),
				property.Flags,
			)
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	return visitor.VisitNode(root)
}

// renderProgramReaders combines multi-slot readers into one component-local dispatcher. Each slot
// still executes under its own reactive observation; only the JavaScript function definitions are
// shared, avoiding a branch for the common zero- and one-slot programs.
func (lowering *jsxLowering) renderProgramReaders(readers []*ast.Node) *ast.Node {
	omitted := false
	active := 0
	for _, reader := range readers {
		if reader == nil {
			omitted = true
			continue
		}
		active++
	}
	if active == 0 {
		return lowering.factory.NewArrayLiteralExpression(nil, false)
	}
	if omitted {
		for _, reader := range readers {
			if reader != nil && (!ast.IsArrowFunction(reader) || ast.IsBlock(reader.AsArrowFunction().Body)) {
				members := make([]*ast.Node, len(readers))
				for index, candidate := range readers {
					if candidate == nil {
						members[index] = lowering.factory.NewIdentifier("undefined")
					} else {
						members[index] = candidate
					}
				}
				return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(members), false)
			}
		}
		index := lowering.factory.NewIdentifier("__exactSlot")
		value := lowering.factory.NewIdentifier("undefined")
		for readerIndex := len(readers) - 1; readerIndex >= 0; readerIndex-- {
			reader := readers[readerIndex]
			if reader == nil {
				continue
			}
			value = lowering.conditional(
				lowering.binary(
					index,
					ast.KindEqualsEqualsEqualsToken,
					lowering.factory.NewNumericLiteral(strconv.Itoa(readerIndex), ast.TokenFlagsNone),
				),
				reader.AsArrowFunction().Body,
				value,
			)
		}
		parameter := lowering.factory.NewParameterDeclaration(nil, nil, index, nil, nil, nil)
		return lowering.factory.NewArrowFunction(
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{parameter}),
			nil,
			nil,
			lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
			value,
		)
	}
	if len(readers) <= 1 {
		return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(readers), false)
	}
	for _, reader := range readers {
		if !ast.IsArrowFunction(reader) || ast.IsBlock(reader.AsArrowFunction().Body) {
			return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(readers), false)
		}
	}
	index := lowering.factory.NewIdentifier("__exactSlot")
	value := readers[len(readers)-1].AsArrowFunction().Body
	for readerIndex := len(readers) - 2; readerIndex >= 0; readerIndex-- {
		value = lowering.conditional(
			lowering.binary(
				index,
				ast.KindEqualsEqualsEqualsToken,
				lowering.factory.NewNumericLiteral(strconv.Itoa(readerIndex), ast.TokenFlagsNone),
			),
			readers[readerIndex].AsArrowFunction().Body,
			value,
		)
	}
	parameter := lowering.factory.NewParameterDeclaration(nil, nil, index, nil, nil, nil)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{parameter}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		value,
	)
}

// renderProgramParentNamespace resolves the concrete DOM namespace inherited by
// a planned region from intrinsic JSX ancestors. A component ancestor makes the
// eventual insertion point component-defined, so that region stays on the
// generic renderer where namespace inheritance is resolved at mount time.
func (lowering *jsxLowering) renderProgramParentNamespace(node *ast.Node) (string, bool) {
	if lowering.renderProgramContexts == nil {
		lowering.renderProgramContexts = make(map[int]renderProgramContext)
		walkNode(lowering.sourceFile.AsNode(), func(candidate *ast.Node) bool {
			if ast.IsJsxElement(candidate) || ast.IsJsxSelfClosingElement(candidate) {
				namespace, certain := lowering.renderProgramSourceParentNamespace(candidate)
				lowering.renderProgramContexts[candidate.Pos()] = renderProgramContext{
					namespace: namespace,
					certain:   certain,
				}
			}
			return true
		})
	}
	if context, exists := lowering.renderProgramContexts[node.Pos()]; exists {
		return context.namespace, context.certain
	}
	return lowering.renderProgramSourceParentNamespace(node)
}

func (lowering *jsxLowering) renderProgramSourceParentNamespace(node *ast.Node) (string, bool) {
	tags := make([]string, 0, 2)
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsJsxElement(current) {
			continue
		}
		tag := sourceText(lowering.sourceFile, openingTag(current.AsJsxElement().OpeningElement))
		if tag == "_" {
			continue
		}
		if !jsxIntrinsic(tag) {
			return "", false
		}
		tags = append(tags, tag)
	}
	parentNamespace := "html"
	for index := len(tags) - 1; index >= 0; index-- {
		tag := tags[index]
		namespace := renderProgramNamespace(tag, parentNamespace)
		parentNamespace = renderProgramChildNamespace(tag, namespace)
	}
	return parentNamespace, true
}

func (lowering *jsxLowering) appendRenderProgramElement(
	build *renderProgramBuild,
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	path []int,
	parentNamespace string,
) bool {
	tag := sourceText(lowering.sourceFile, openingTag(opening))
	if !jsxIntrinsic(tag) || unsupportedPlannedHost(tag) {
		return false
	}
	namespace := renderProgramNamespace(tag, parentNamespace)
	if len(path) == 0 {
		build.namespace = namespace
	}
	nodeIndex := len(build.nodes)
	build.nodes = append(build.nodes, renderProgramNode{
		id: nodeIndex, path: append([]int(nil), path...), tag: tag, namespace: namespace,
	})
	build.write("<" + tag)
	if !lowering.appendRenderProgramAttributes(build, opening.Attributes(), tag, path, nodeIndex) {
		return false
	}
	build.write(">")
	domIndex := 0
	semantic := ast.GetSemanticJsxChildren(nil)
	if children != nil {
		semantic = ast.GetSemanticJsxChildren(children.Nodes)
	}
	for childIndex, child := range semantic {
		childPath := append(append([]int(nil), path...), domIndex)
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text == "" {
				continue
			}
			build.write(html.EscapeString(text))
			domIndex++
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			if expression.SubtreeFacts()&ast.SubtreeContainsJsx != 0 || !lowering.scalarRenderProgramExpression(expression) {
				// The generated SSR executor delegates the owned value back to ordinary recursive
				// child rendering, so both targets can retain the same compiler-proven boundary.
				if lowering.target != TargetClient && lowering.target != TargetServer {
					return false
				}
				list := lowering.renderProgramListExpression(expression)
				directList := list && lowering.directRenderProgramKeyedMap(expression)
				markerlessTail := noRenderedProgramChildrenAfter(semantic, childIndex)
				lowering.renderProgramChildDepth++
				if list {
					lowering.renderProgramListDepth++
				}
				reader := lowering.visitor.VisitNode(expression)
				if list {
					lowering.renderProgramListDepth--
				}
				lowering.renderProgramChildDepth--
				build.childSlot(
					lowering.dynamicID(child), childPath, reader, list, directList, markerlessTail,
				)
				if !markerlessTail {
					domIndex += 2
				}
				continue
			}
			build.textSlot(lowering.dynamicID(child), childPath, lowering.visitor.VisitNode(expression))
			domIndex += 3
		case ast.IsJsxElement(child):
			element := child.AsJsxElement()
			childTag := openingTag(element.OpeningElement)
			if !jsxIntrinsic(sourceText(lowering.sourceFile, childTag)) {
				if !lowering.plannedComponentChild(childTag) {
					return false
				}
				if lowering.target != TargetClient && lowering.target != TargetServer {
					return false
				}
				markerlessTail := noRenderedProgramChildrenAfter(semantic, childIndex)
				build.componentSlot(
					lowering.dynamicID(child), childPath, lowering.visitor.VisitNode(child), markerlessTail,
				)
				if !markerlessTail {
					domIndex += 2
				}
				continue
			}
			if island, explicit := lowering.explicitServerIsland(child); explicit {
				markerlessTail := noRenderedProgramChildrenAfter(semantic, childIndex)
				build.childSlot(
					lowering.dynamicID(child),
					childPath,
					lowering.lowerServerClientIsland(
						child,
						element.OpeningElement,
						element.Children,
						island,
					),
					false,
					false,
					markerlessTail,
				)
				if !markerlessTail {
					domIndex += 2
				}
				continue
			}
			if !lowering.appendRenderProgramElement(build, child, element.OpeningElement, element.Children, childPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
		case ast.IsJsxSelfClosingElement(child):
			childTag := openingTag(child)
			if !jsxIntrinsic(sourceText(lowering.sourceFile, childTag)) {
				if !lowering.plannedComponentChild(childTag) {
					return false
				}
				if lowering.target != TargetClient && lowering.target != TargetServer {
					return false
				}
				markerlessTail := noRenderedProgramChildrenAfter(semantic, childIndex)
				build.componentSlot(
					lowering.dynamicID(child), childPath, lowering.visitor.VisitNode(child), markerlessTail,
				)
				if !markerlessTail {
					domIndex += 2
				}
				continue
			}
			if island, explicit := lowering.explicitServerIsland(child); explicit {
				markerlessTail := noRenderedProgramChildrenAfter(semantic, childIndex)
				build.childSlot(
					lowering.dynamicID(child),
					childPath,
					lowering.lowerServerClientIsland(child, child, nil, island),
					false,
					false,
					markerlessTail,
				)
				if !markerlessTail {
					domIndex += 2
				}
				continue
			}
			if !lowering.appendRenderProgramElement(build, child, child, nil, childPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
		default:
			return false
		}
	}
	if !voidElement(tag) {
		build.write("</" + tag + ">")
	}
	return true
}

// plannedComponentChild keeps statically resolved native components in an explicit compiler-owned
// lifecycle slot. The component still owns its durable state machine; only the surrounding intrinsic
// host no longer falls back to generic VNode construction.
func (lowering *jsxLowering) plannedComponentChild(tag *ast.Node) bool {
	if lowering.declarativeRenderDepth > 0 ||
		(lowering.renderProgramListDepth == 0 && componentChildInsideMap(tag)) ||
		!ast.IsIdentifier(tag) {
		return false
	}
	return lowering.localExactComponentTag(tag)
}

func componentChildInsideMap(node *ast.Node) bool {
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsCallExpression(current) {
			continue
		}
		expression := current.AsCallExpression().Expression
		if ast.IsPropertyAccessExpression(expression) &&
			expression.AsPropertyAccessExpression().Name().Text() == "map" {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) renderProgramListExpression(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if ast.IsPropertyAccessExpression(call.Expression) &&
		call.Expression.AsPropertyAccessExpression().Name().Text() == "map" {
		return true
	}
	plan, exists := lowering.collectionMaps[nodeSpanKey(node)]
	return exists && plan.keyed
}

func renderProgramNamespace(tag string, parent string) string {
	if tag == "svg" {
		return "svg"
	}
	if tag == "math" {
		return "mathml"
	}
	if parent == "svg" {
		return "svg"
	}
	if parent == "mathml" {
		return "mathml"
	}
	return "html"
}

func renderProgramChildNamespace(tag string, namespace string) string {
	if namespace == "svg" && tag == "foreignObject" {
		return "html"
	}
	return namespace
}

func (lowering *jsxLowering) appendRenderProgramAttributes(
	build *renderProgramBuild,
	attributes *ast.Node,
	tag string,
	path []int,
	node int,
) bool {
	if attributes == nil {
		return true
	}
	application := lowering.enhancementImports.applications[attributes.Pos()]
	if len(application.components) != 0 {
		return false
	}
	conditionalClasses := jsxHasConditionalClassName(attributes)
	classNameEmitted := false
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if conditionalClasses && jsxClassNameContribution(property) {
			if !classNameEmitted {
				build.propertySlot(
					lowering.dynamicID(property),
					path,
					node,
					"className",
					lowering.lowerClassNameValue(attributes, false),
				)
				classNameEmitted = true
			}
			continue
		}
		if ast.IsJsxSpreadAttribute(property) || !ast.IsJsxAttribute(property) {
			return false
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if name == "key" || name == "data-exact-id" {
			return false
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			return false
		}
		bindingProperties := lowering.formBindingProperties(name, attribute.Initializer, attributes)
		if lowering.target == TargetServer {
			if serverProperty := lowering.serverFormBindingProperty(name, attribute.Initializer); serverProperty != nil {
				bindingProperties = []*ast.Node{serverProperty}
			}
		}
		if len(bindingProperties) != 0 {
			for _, bindingProperty := range bindingProperties {
				assignment := bindingProperty.AsPropertyAssignment()
				build.propertySlot(
					lowering.dynamicID(property),
					path,
					node,
					assignment.Name().Text(),
					assignment.Initializer,
				)
			}
			continue
		}
		// Server render programs preserve the DOM structure that the paired client
		// artifact hydrates, but client-owned behavior has no server serialization
		// semantics. Excluding it here also prevents per-request construction of
		// event handlers and ref callbacks that the SSR writer would discard.
		if lowering.target == TargetServer && interactiveJSXAttribute(name) {
			continue
		}
		if ast.IsJsxNamespacedName(attribute.Name()) {
			return false
		}
		if attributeName, value, static := staticRenderProgramAttribute(name, attribute.Initializer); static {
			build.write(` ` + attributeName + `="` + html.EscapeString(value) + `"`)
			continue
		}
		reader := lowering.jsxAttributeInitializer(attribute, tag, name, false)
		if reader != nil {
			if lowering.target != TargetServer && jsxEventAttribute(name) {
				expression := attribute.Initializer.AsJsxExpression().Expression
				if jsxEventOmitsArgument(expression, lowering.checker) {
					name = "__exactClosedInteraction:" + name
				} else {
					name = "__exactDirectInteraction:" + name
				}
			}
			build.propertySlot(lowering.dynamicID(property), path, node, name, reader)
		}
	}
	return true
}

// staticRenderProgramAttribute recognizes source literals whose DOM property and SSR attribute
// semantics are identical. Values that need URL policy, event installation, form binding, object
// normalization, or custom-element property assignment deliberately remain runtime operations.
func staticRenderProgramAttribute(name string, initializer *ast.Node) (string, string, bool) {
	if initializer == nil || !ast.IsStringLiteral(initializer) {
		return "", "", false
	}
	attributeName := name
	switch name {
	case "className":
		attributeName = "class"
	case "htmlFor":
		attributeName = "for"
	case "id", "class", "for", "title", "role", "type", "name", "value", "placeholder",
		"autocomplete", "inputmode", "pattern", "min", "max", "step", "width", "height",
		"colspan", "rowspan", "scope", "kind", "label", "media", "rel", "target", "download",
		"crossorigin", "referrerpolicy", "fetchpriority", "loading", "decoding", "dir", "lang":
		// These literal values have native attribute semantics in both template parsing and SSR.
	default:
		if !strings.HasPrefix(name, "data-") && !strings.HasPrefix(name, "aria-") {
			return "", "", false
		}
	}
	return attributeName, initializer.AsStringLiteral().Text, true
}

func renderProgramSlotKind(name string) string {
	switch name {
	case "class", "className":
		return "class"
	case "style":
		return "style"
	case "href", "src", "srcSet", "action", "formAction", "poster", "cite", "data":
		return "url"
	default:
		return "property"
	}
}

func (lowering *jsxLowering) scalarRenderProgramExpression(expression *ast.Node) bool {
	// Type queries are valid only for nodes from the bound source tree. Reactive
	// lowering can revisit synthetic expressions whose parent chain is incomplete.
	for current := expression; current != nil; current = current.Parent {
		if current == lowering.sourceFile.AsNode() {
			return scalarDerivedType(lowering.checker.GetTypeAtLocation(expression))
		}
	}
	return false
}

func voidElement(tag string) bool {
	switch tag {
	case "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr":
		return true
	}
	return false
}

func unsupportedPlannedHost(tag string) bool {
	switch tag {
	case "html", "head", "body", "script", "style", "title", "template", "annotation-xml":
		return true
	}
	return false
}

func (lowering *jsxLowering) renderProgramLiteral(
	id string,
	identityNode *ast.Node,
	build *renderProgramBuild,
) *ast.Node {
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	array := func(values []*ast.Node) *ast.Node {
		return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
	}
	path := func(values []int) *ast.Node {
		items := make([]*ast.Node, len(values))
		for index, value := range values {
			items[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
		}
		return array(items)
	}
	slots := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		members := []*ast.Node{lowering.factory.NewStringLiteral(slot.kind, ast.TokenFlagsNone)}
		if slot.kind == "text" {
			members = append(members, lowering.factory.NewStringLiteral(slot.id, ast.TokenFlagsNone), path(slot.path))
			if build.markerlessTextSlot(index) {
				members = append(members, lowering.factory.NewTrueExpression())
			}
		} else if slot.kind == "child" || slot.kind == "component" {
			members = append(members, lowering.factory.NewStringLiteral(slot.id, ast.TokenFlagsNone))
		} else {
			members = append(members, lowering.factory.NewNumericLiteral(strconv.Itoa(slot.node), ast.TokenFlagsNone), lowering.factory.NewStringLiteral(slot.name, ast.TokenFlagsNone))
		}
		slots[index] = array(members)
	}
	textBindings := make([]*ast.Node, 0, len(build.slots))
	listSlots := make([]int, 0, len(build.slots))
	directListSlots := make([]int, 0, len(build.slots))
	for index, slot := range build.slots {
		if slot.kind == "child" && slot.list {
			if slot.directList {
				directListSlots = append(directListSlots, index)
			} else {
				listSlots = append(listSlots, index)
			}
			continue
		}
		if slot.kind == "text" || slot.kind == "child" || slot.kind == "component" {
			textBindings = append(textBindings, array([]*ast.Node{
				lowering.factory.NewStringLiteral(slot.kind, ast.TokenFlagsNone),
				lowering.factory.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone),
			}))
			continue
		}
	}
	bindings := append([]*ast.Node(nil), textBindings...)
	if len(listSlots) != 0 {
		indexes := make([]*ast.Node, len(listSlots))
		for index, slot := range listSlots {
			indexes[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone)
		}
		bindings = append(bindings, array([]*ast.Node{
			lowering.factory.NewStringLiteral("lists", ast.TokenFlagsNone),
			array(indexes),
		}))
	}
	for _, binding := range build.propertyBindings() {
		indexes := make([]*ast.Node, len(binding.slots))
		for index, slot := range binding.slots {
			indexes[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone)
		}
		bindings = append(bindings, array([]*ast.Node{
			lowering.factory.NewStringLiteral("properties", ast.TokenFlagsNone),
			array(indexes),
		}))
	}
	nodes := make([]*ast.Node, len(build.nodes))
	for index, node := range build.nodes {
		members := []*ast.Node{
			lowering.factory.NewNumericLiteral(strconv.Itoa(node.id), ast.TokenFlagsNone),
			lowering.factory.NewStringLiteral(node.tag, ast.TokenFlagsNone),
		}
		if node.namespace != build.namespace {
			members = append(members, lowering.factory.NewStringLiteral(node.namespace, ast.TokenFlagsNone))
		}
		nodes[index] = array(members)
	}
	members := []*ast.Node{
		property("version", lowering.factory.NewNumericLiteral("4", ast.TokenFlagsNone)),
		property("id", lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone)),
		property("namespace", lowering.factory.NewStringLiteral(build.namespace, ast.TokenFlagsNone)),
	}
	directUpdates := []renderProgramDirectUpdate{}
	var componentTarget *int
	componentUpdates := ""
	if lowering.target == TargetClient {
		directUpdates = lowering.directRenderProgramUpdates(build)
		if target, updates, registered := lowering.registerComponentUpdates(identityNode, directUpdates); registered {
			componentTarget = &target
			componentUpdates = updates
		}
	}
	if lowering.target != TargetServer {
		members = append(members, property("template", lowering.factory.NewStringLiteral(build.template.String(), ast.TokenFlagsNone)))
	}
	if lowering.target == TargetClient {
		if len(bindings) != 0 || len(directListSlots) != 0 || len(build.nodes) > 1 {
			members = append(members, property("bind", lowering.directRenderProgramBinder(build, directUpdates, componentTarget, componentUpdates)))
		} else {
			members = append(
				members,
				property("root", array([]*ast.Node{
					lowering.factory.NewStringLiteral(build.nodes[0].tag, ast.TokenFlagsNone),
				})),
				property("work", array([]*ast.Node{
					lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone),
					lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone),
				})),
			)
		}
		members = append(members, property("directClaims", lowering.factory.NewTrueExpression()))
		if len(listSlots) != 0 {
			members = append(members, property("listBindings", lowering.factory.NewTrueExpression()))
		}
		if len(directListSlots) != 0 {
			mask := uint64(0)
			compact := true
			for _, slot := range directListSlots {
				if slot >= 31 {
					compact = false
					break
				}
				mask |= uint64(1) << slot
			}
			var value *ast.Node
			if compact {
				value = lowering.factory.NewNumericLiteral(strconv.FormatUint(mask, 10), ast.TokenFlagsNone)
			} else {
				indexes := make([]*ast.Node, len(directListSlots))
				for index, slot := range directListSlots {
					indexes[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone)
				}
				value = array(indexes)
			}
			members = append(members, property("keyedChildren", value))
		}
		if len(directUpdates) != 0 && componentTarget == nil {
			members = append(members, property("update", lowering.directRenderProgramUpdater(directUpdates)))
		}
		if lowering.contractProjection == ComponentContractProjectionComplete {
			members = append(members, property("ssr", lowering.directRenderProgramSsrWriter(build)))
		}
	} else if lowering.target == TargetServer {
		members = append(members, property("ssr", lowering.directRenderProgramSsrWriter(build)))
	} else {
		members = append(
			members,
			property("slots", array(slots)),
			property("nodes", array(nodes)),
			property("bindings", array(bindings)),
			property("ssr", lowering.directRenderProgramSsrWriter(build)),
		)
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(members), false)
}
