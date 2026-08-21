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
	id            string
	kind          string
	path          []int
	hydrationPath []int
	name          string
	reader        *ast.Node
}

type renderProgramNode struct {
	id            string
	path          []int
	hydrationPath []int
	tag           string
	namespace     string
}

type renderProgramSsrOperation struct {
	kind  string
	index int
}

type renderProgramBuild struct {
	template      strings.Builder
	part          strings.Builder
	parts         []string
	ssrPart       strings.Builder
	ssrParts      []string
	ssrOperations []renderProgramSsrOperation
	slots         []renderProgramSlot
	nodes         []renderProgramNode
	namespace     string
}

func (build *renderProgramBuild) write(value string) {
	build.template.WriteString(value)
	build.part.WriteString(value)
	build.ssrPart.WriteString(value)
}

func (build *renderProgramBuild) ssrOperation(kind string, index int) {
	build.ssrParts = append(build.ssrParts, build.ssrPart.String())
	build.ssrPart.Reset()
	build.ssrOperations = append(build.ssrOperations, renderProgramSsrOperation{kind: kind, index: index})
}

func (build *renderProgramBuild) textSlot(id string, path []int, hydrationPath []int, reader *ast.Node) {
	index := len(build.slots)
	build.template.WriteString(fmt.Sprintf("<!---->\ue000exact:%d\ue001<!---->", index))
	build.parts = append(build.parts, build.part.String())
	build.part.Reset()
	build.ssrOperation("slot", index)
	mountPath := append([]int(nil), path...)
	mountPath[len(mountPath)-1]++
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "text", path: mountPath, hydrationPath: append([]int(nil), hydrationPath...), reader: reader})
}

func (build *renderProgramBuild) propertySlot(id string, path []int, hydrationPath []int, name string, reader *ast.Node) {
	index := len(build.slots)
	build.parts = append(build.parts, build.part.String())
	build.part.Reset()
	build.ssrOperation("slot", index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: renderProgramSlotKind(name), path: append([]int(nil), path...), hydrationPath: append([]int(nil), hydrationPath...), name: name, reader: reader})
}

func (lowering *jsxLowering) lowerRenderProgram(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	parentNamespace, certain := lowering.renderProgramParentNamespace(identityNode)
	if !certain {
		return nil
	}
	build := &renderProgramBuild{}
	if !lowering.appendRenderProgramElement(build, identityNode, opening, children, nil, nil, parentNamespace) {
		return nil
	}
	build.parts = append(build.parts, build.part.String())
	build.ssrParts = append(build.ssrParts, build.ssrPart.String())
	programID := exactStableID(
		lowering.sourceFile.FileName(),
		"render-program",
		lowering.nodeIDs[identityNode],
	)
	program := lowering.renderProgramLiteral(programID, build)
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
		readers[index] = lowering.reactiveClosure(slot.reader)
		if readers[index] == nil {
			readers[index] = lowering.arrow(slot.reader)
		}
	}
	arguments := []*ast.Node{
		lowering.factory.NewIdentifier(programName),
		lowering.renderProgramReaders(readers),
	}
	if lowering.target != TargetClient ||
		lowering.contractProjection == ComponentContractProjectionComplete {
		// Server and universal artifacts can enter React-compatible SSR or recover one malformed
		// region locally. A client artifact already has root-level hydration recovery, so retaining
		// a duplicate generic VNode factory for every compiler-closed region only adds parse, heap,
		// and construction work to the successful path.
		lowering.renderProgramFallback = true
		fallback := lowering.lowerOpeningLike(identityNode, opening, children)
		lowering.renderProgramFallback = false
		arguments = append(arguments, lowering.arrow(fallback))
	}
	return lowering.call(lowering.names.preparedRenderProgram, arguments)
}

// renderProgramReaders combines multi-slot readers into one component-local dispatcher. Each slot
// still executes under its own reactive observation; only the JavaScript function definitions are
// shared, avoiding a branch for the common zero- and one-slot programs.
func (lowering *jsxLowering) renderProgramReaders(readers []*ast.Node) *ast.Node {
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
	hydrationPath []int,
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
		id: lowering.elementID(identityNode), path: append([]int(nil), path...), hydrationPath: append([]int(nil), hydrationPath...), tag: tag, namespace: namespace,
	})
	build.ssrOperation("node-open", nodeIndex)
	build.write("<" + tag + ` data-exact-id="` + html.EscapeString(lowering.elementID(identityNode)) + `"`)
	if !lowering.appendRenderProgramAttributes(build, opening.Attributes(), tag, path, hydrationPath) {
		return false
	}
	build.write(">")
	domIndex := 0
	hydrationIndex := 0
	semantic := ast.GetSemanticJsxChildren(nil)
	if children != nil {
		semantic = ast.GetSemanticJsxChildren(children.Nodes)
	}
	for childIndex, child := range semantic {
		childPath := append(append([]int(nil), path...), domIndex)
		childHydrationPath := append(append([]int(nil), hydrationPath...), hydrationIndex)
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text == "" {
				continue
			}
			build.write(html.EscapeString(text))
			domIndex++
			hydrationIndex++
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			if expression.SubtreeFacts()&ast.SubtreeContainsJsx != 0 ||
				!lowering.scalarRenderProgramExpression(expression) {
				return false
			}
			build.textSlot(lowering.dynamicID(child), childPath, childHydrationPath, lowering.visitor.VisitNode(expression))
			domIndex += 3
			hydrationIndex += 3
		case ast.IsJsxElement(child):
			element := child.AsJsxElement()
			childHydrationPath[len(childHydrationPath)-1]++
			if !lowering.appendRenderProgramElement(build, child, element.OpeningElement, element.Children, childPath, childHydrationPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
			hydrationIndex += 3
		case ast.IsJsxSelfClosingElement(child):
			childHydrationPath[len(childHydrationPath)-1]++
			if !lowering.appendRenderProgramElement(build, child, child, nil, childPath, childHydrationPath, renderProgramChildNamespace(tag, namespace)) {
				return false
			}
			domIndex++
			hydrationIndex += 3
		default:
			return false
		}
	}
	if !voidElement(tag) {
		build.write("</" + tag + ">")
	}
	build.ssrOperation("node-close", nodeIndex)
	return true
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
	hydrationPath []int,
) bool {
	if attributes == nil {
		return true
	}
	application := lowering.enhancementImports.applications[attributes.Pos()]
	if len(application.components) != 0 || jsxHasConditionalClassName(attributes) {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) || !ast.IsJsxAttribute(property) {
			return false
		}
		attribute := property.AsJsxAttribute()
		if ast.IsJsxNamespacedName(attribute.Name()) {
			return false
		}
		name := jsxAttributeText(attribute.Name())
		if name == "key" || name == "data-exact-id" {
			return false
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			return false
		}
		if len(lowering.formBindingProperties(name, attribute.Initializer, attributes)) != 0 {
			return false
		}
		if attributeName, value, static := staticRenderProgramAttribute(name, attribute.Initializer); static {
			build.write(` ` + attributeName + `="` + html.EscapeString(value) + `"`)
			continue
		}
		reader := lowering.jsxAttributeInitializer(attribute, tag, name, false)
		if reader != nil {
			build.propertySlot(lowering.dynamicID(property), path, hydrationPath, name, reader)
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

func (lowering *jsxLowering) renderProgramLiteral(id string, build *renderProgramBuild) *ast.Node {
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
	parts := make([]*ast.Node, len(build.parts))
	for index, value := range build.parts {
		parts[index] = lowering.factory.NewStringLiteral(value, ast.TokenFlagsNone)
	}
	slots := make([]*ast.Node, len(build.slots))
	for index, slot := range build.slots {
		members := []*ast.Node{lowering.factory.NewStringLiteral(slot.kind, ast.TokenFlagsNone)}
		if slot.kind == "text" {
			members = append(members, lowering.factory.NewStringLiteral(slot.id, ast.TokenFlagsNone), path(slot.path), path(slot.hydrationPath))
		} else {
			members = append(members, path(slot.path), path(slot.hydrationPath), lowering.factory.NewStringLiteral(slot.name, ast.TokenFlagsNone))
		}
		slots[index] = array(members)
	}
	type propertyBinding struct {
		path         string
		slots        []int
		selectTarget bool
	}
	textBindings := make([]*ast.Node, 0, len(build.slots))
	propertyBindings := make([]propertyBinding, 0, len(build.slots))
	propertyBindingIndexes := make(map[string]int)
	tagsByPath := make(map[string]string, len(build.nodes))
	for _, node := range build.nodes {
		tagsByPath[fmt.Sprint(node.path)] = node.tag
	}
	for index, slot := range build.slots {
		if slot.kind == "text" {
			textBindings = append(textBindings, array([]*ast.Node{
				lowering.factory.NewStringLiteral("text", ast.TokenFlagsNone),
				lowering.factory.NewNumericLiteral(strconv.Itoa(index), ast.TokenFlagsNone),
			}))
			continue
		}
		key := fmt.Sprint(slot.path)
		bindingIndex, exists := propertyBindingIndexes[key]
		if !exists {
			bindingIndex = len(propertyBindings)
			propertyBindingIndexes[key] = bindingIndex
			propertyBindings = append(propertyBindings, propertyBinding{
				path:         key,
				selectTarget: tagsByPath[key] == "select",
			})
		}
		propertyBindings[bindingIndex].slots = append(propertyBindings[bindingIndex].slots, index)
	}
	bindings := append([]*ast.Node(nil), textBindings...)
	for _, selectTarget := range []bool{false, true} {
		for _, binding := range propertyBindings {
			if binding.selectTarget != selectTarget {
				continue
			}
			indexes := make([]*ast.Node, len(binding.slots))
			for index, slot := range binding.slots {
				indexes[index] = lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone)
			}
			bindings = append(bindings, array([]*ast.Node{
				lowering.factory.NewStringLiteral("properties", ast.TokenFlagsNone),
				array(indexes),
			}))
		}
	}
	nodes := make([]*ast.Node, len(build.nodes))
	for index, node := range build.nodes {
		members := []*ast.Node{
			lowering.factory.NewStringLiteral(node.id, ast.TokenFlagsNone),
			path(node.path),
			path(node.hydrationPath),
			lowering.factory.NewStringLiteral(node.tag, ast.TokenFlagsNone),
		}
		if node.namespace != build.namespace {
			members = append(members, lowering.factory.NewStringLiteral(node.namespace, ast.TokenFlagsNone))
		}
		nodes[index] = array(members)
	}
	members := []*ast.Node{
		property("version", lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
		property("id", lowering.factory.NewStringLiteral(id, ast.TokenFlagsNone)),
		property("namespace", lowering.factory.NewStringLiteral(build.namespace, ast.TokenFlagsNone)),
		property("template", lowering.factory.NewStringLiteral(build.template.String(), ast.TokenFlagsNone)),
		property("slots", array(slots)), property("bindings", array(bindings)), property("nodes", array(nodes)),
	}
	if lowering.target != TargetClient || lowering.contractProjection == ComponentContractProjectionComplete {
		members = append(members, property("parts", array(parts)))
	}
	if lowering.target == TargetServer {
		ssrParts := make([]*ast.Node, len(build.ssrParts))
		for index, value := range build.ssrParts {
			ssrParts[index] = lowering.factory.NewStringLiteral(value, ast.TokenFlagsNone)
		}
		ssrOperations := make([]*ast.Node, len(build.ssrOperations))
		for index, operation := range build.ssrOperations {
			ssrOperations[index] = lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral(operation.kind, ast.TokenFlagsNone)),
				property("index", lowering.factory.NewNumericLiteral(strconv.Itoa(operation.index), ast.TokenFlagsNone)),
			}), false)
		}
		members = append(members, property("ssrParts", array(ssrParts)), property("ssrOperations", array(ssrOperations)))
	}
	return lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(members), false)
}
