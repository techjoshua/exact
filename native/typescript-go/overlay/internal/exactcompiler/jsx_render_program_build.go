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

// renderProgramBuild owns the finite intrinsic topology and its parallel server segments.
type renderProgramBuild struct {
	template       strings.Builder
	serverSegment  strings.Builder
	serverSegments []string
	serverSlots    []int
	slots          []renderProgramSlot
	nodes          []renderProgramNode
	namespace      string
	declineReason  string
	rootAttributes *ast.Node
	rootStaticHtml string
	rootStaticKeys []string
	nextMarker     int
}

func (build *renderProgramBuild) decline(reason string) bool {
	if build.declineReason == "" {
		build.declineReason = reason
	}
	return false
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

// markerlessTextSlot reports whether static markup prevents a dynamic scalar from merging. The
// template is target-neutral; serverSegments also contain target-only attribute slots and cannot
// define a client/server hydration contract.
func (build *renderProgramBuild) markerlessTextSlot(index int) bool {
	placeholder := fmt.Sprintf("<!---->\ue000exact:%d\ue001<!---->", index)
	template := build.template.String()
	position := strings.Index(template, placeholder)
	if position < 0 {
		return false
	}
	before := template[:position]
	after := template[position+len(placeholder):]
	return strings.HasSuffix(before, ">") && strings.HasPrefix(after, "<")
}

func (build *renderProgramBuild) textSlot(id string, path []int, reader *ast.Node) {
	index := len(build.slots)
	id = strconv.FormatInt(int64(build.nextMarker), 36)
	build.nextMarker++
	build.template.WriteString(fmt.Sprintf("<!---->\ue000exact:%d\ue001<!---->", index))
	build.serverSlot(index)
	mountPath := append([]int(nil), path...)
	mountPath[len(mountPath)-1]++
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "text", path: mountPath, reader: reader})
}

func (build *renderProgramBuild) childSlot(id string, path []int, reader *ast.Node, list bool, directList bool, markerlessTail bool) {
	index := len(build.slots)
	id = strconv.FormatInt(int64(build.nextMarker), 36)
	build.nextMarker++
	if !markerlessTail {
		build.template.WriteString(fmt.Sprintf("<!--x:%s--><!--/x:%s-->", id, id))
	}
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "child", path: append([]int(nil), path...), list: list, directList: directList, markerlessTail: markerlessTail, reader: reader})
}

func (build *renderProgramBuild) componentSlot(id string, path []int, reader *ast.Node, markerlessTail bool) {
	index := len(build.slots)
	id = strconv.FormatInt(int64(build.nextMarker), 36)
	build.nextMarker++
	if !markerlessTail {
		build.template.WriteString(fmt.Sprintf("<!--x:%s--><!--/x:%s-->", id, id))
	}
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "component", path: append([]int(nil), path...), markerlessTail: markerlessTail, reader: reader})
}

func (build *renderProgramBuild) propertySlot(id string, path []int, node int, name string, reader *ast.Node) {
	index := len(build.slots)
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: renderProgramSlotKind(name), path: append([]int(nil), path...), node: node, name: name, reader: reader})
}

func (build *renderProgramBuild) spreadSlot(id string, path []int, node int, reader *ast.Node) {
	index := len(build.slots)
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{id: id, kind: "spread", path: append([]int(nil), path...), node: node, reader: reader})
}

// rootAttributesSlot keeps the server component's first intrinsic properties together so the
// server target can compose an active semantic-target layer without rediscovering component
// topology or parsing generated markup.
func (build *renderProgramBuild) rootAttributesSlot(path []int, node int, tag string, reader *ast.Node) {
	index := len(build.slots)
	build.serverSlot(index)
	build.slots = append(build.slots, renderProgramSlot{
		kind: "root-attributes", path: append([]int(nil), path...), node: node, name: tag, reader: reader,
	})
}

// captureRootStaticAttributes records literal attributes that the server target can publish
// without re-running native attribute normalization. The authored prop bag remains available for
// the uncommon semantic-target composition path.
func (build *renderProgramBuild) captureRootStaticAttributes(attributes *ast.Node) {
	if attributes == nil {
		return
	}
	conditionalClasses := jsxHasConditionalClassName(attributes)
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if conditionalClasses && (name == "class" || name == "className") {
			continue
		}
		attributeName, value, static := staticRenderProgramAttribute(name, attribute.Initializer)
		if !static {
			continue
		}
		build.rootStaticHtml += ` ` + attributeName + `="` + html.EscapeString(value) + `"`
		build.rootStaticKeys = append(build.rootStaticKeys, name)
	}
}
