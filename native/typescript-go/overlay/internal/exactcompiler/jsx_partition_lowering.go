package exactcompiler

import (
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) serverPartitionRangeEdge(start int) (PartitionPlanEdge, bool) {
	placements := make(map[string]string, len(lowering.partitionPlan.Nodes))
	for _, node := range lowering.partitionPlan.Nodes {
		placements[node.ID] = node.Placement
	}
	best := PartitionPlanEdge{}
	for _, edge := range lowering.partitionPlan.Edges {
		parentPlacement := placements[edge.Parent]
		if edge.Start != start || parentPlacement == "server" || placements[edge.Child] != "server" ||
			(!lowering.serverComponents && parentPlacement != "client") {
			continue
		}
		if best.ID == "" || edge.Length < best.Length {
			best = edge
		}
	}
	return best, best.ID != ""
}

func (lowering *jsxLowering) clientPartitionSlot(
	opening *ast.Node,
	edge PartitionPlanEdge,
) *ast.Node {
	if edge.Kind == "keyed-item" {
		key := lowering.partitionKey(opening)
		if key != nil {
			return lowering.call(lowering.names.keyedServerSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(edge.Parent, ast.TokenFlagsNone),
				key,
			})
		}
	}
	return lowering.call(lowering.names.serverSlot, []*ast.Node{
		lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
	})
}

func (lowering *jsxLowering) serverPartitionSlot(
	opening *ast.Node,
	edge PartitionPlanEdge,
	child *ast.Node,
) *ast.Node {
	authority := lowering.partitionSlotReference(edge.ID)
	if edge.Kind == "keyed-item" {
		key := lowering.partitionKey(opening)
		if key != nil {
			return lowering.call(lowering.names.keyedServerSlot, []*ast.Node{
				lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(edge.Parent, ast.TokenFlagsNone),
				key,
				authority,
				child,
			})
		}
	}
	return lowering.call(lowering.names.serverSlot, []*ast.Node{
		lowering.factory.NewStringLiteral(edge.ID, ast.TokenFlagsNone),
		authority,
		child,
	})
}

func (lowering *jsxLowering) partitionKey(opening *ast.Node) *ast.Node {
	attributes := opening.Attributes()
	if attributes == nil {
		return nil
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		attribute := property.AsJsxAttribute()
		if attribute.Name().Text() != "key" || attribute.Initializer == nil {
			continue
		}
		initializer := attribute.Initializer
		if ast.IsStringLiteral(initializer) {
			return lowering.factory.NewStringLiteral(initializer.AsStringLiteral().Text, ast.TokenFlagsNone)
		}
		if ast.IsJsxExpression(initializer) && initializer.AsJsxExpression().Expression != nil {
			return lowering.visitor.VisitNode(initializer.AsJsxExpression().Expression)
		}
	}
	return nil
}

func (lowering *jsxLowering) clientComponentBoundary(
	opening *ast.Node,
	children *ast.NodeList,
	edge RenderEdge,
) *ast.Node {
	props := lowering.propsWithReactivity(
		opening.Attributes(),
		"",
		false,
		"",
		false,
	)
	finite := finiteJSXAttributes(opening.Attributes())
	childrenValue, serverSlot := lowering.clientBoundaryChildren(children)
	if childrenValue != nil {
		props = lowering.appendObjectProperty(props, "children", childrenValue)
	}
	if serverSlot {
		if slots := lowering.partitionSlotIDs(children); len(slots) != 0 {
			values := make([]*ast.Node, len(slots))
			for index, slot := range slots {
				values[index] = lowering.partitionSlotReference(slot)
			}
			props = lowering.appendObjectProperty(
				props,
				"__exactServerSlots",
				lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false),
			)
		}
	}
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(
			exactStableID(
				lowering.sourceFile.FileName(),
				edge.Name,
				"component-island",
				edge.NodeID,
			),
			ast.TokenFlagsNone,
		),
		lowering.factory.NewStringLiteral(edge.Name, ast.TokenFlagsNone),
		props,
	}
	if serverSlot {
		arguments = append(arguments, lowering.children(children)...)
	}
	boundary := lowering.call(lowering.names.boundary, arguments)
	if finite {
		return lowering.call(lowering.names.finiteBoundary, []*ast.Node{boundary})
	}
	return boundary
}

func finiteJSXAttributes(attributes *ast.Node) bool {
	if attributes == nil {
		return true
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			return false
		}
	}
	return true
}

func (lowering *jsxLowering) partitionSlotReference(edgeID string) *ast.Node {
	ownerComponentID := ""
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.ID != edgeID {
			continue
		}
		for _, node := range lowering.partitionPlan.Nodes {
			if node.ID != edge.Child {
				continue
			}
			for _, owner := range lowering.partitionPlan.Nodes {
				if owner.ID == node.OwnerComponent {
					ownerComponentID = owner.ComponentContract
					break
				}
			}
			break
		}
		break
	}
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("__exactServerSlot", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			property("planVersion", lowering.factory.NewNumericLiteral(strconv.Itoa(lowering.partitionPlan.Version), ast.TokenFlagsNone)),
			property("buildKey", lowering.factory.NewStringLiteral(lowering.partitionPlan.BuildKey, ast.TokenFlagsNone)),
			property("planEdgeId", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			property("ownerComponentId", lowering.factory.NewStringLiteral(ownerComponentID, ast.TokenFlagsNone)),
			property("discriminator", lowering.partitionSlotDiscriminator(edgeID)),
			property("generation", lowering.factory.NewNumericLiteral("1", ast.TokenFlagsNone)),
		}),
		false,
	)
}

func (lowering *jsxLowering) partitionSlotDiscriminator(edgeID string) *ast.Node {
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	single := func() *ast.Node {
		return lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral("single", ast.TokenFlagsNone)),
			}),
			false,
		)
	}
	var template PartitionPlanNode
	edgeKind := ""
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.ID != edgeID {
			continue
		}
		edgeKind = edge.Kind
		for _, node := range lowering.partitionPlan.Nodes {
			if node.ID == edge.Child {
				template = node
				break
			}
		}
		break
	}
	if edgeKind == "branch" {
		return lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				property("kind", lowering.factory.NewStringLiteral("branch", ast.TokenFlagsNone)),
				property("branch", lowering.factory.NewStringLiteral(edgeID, ast.TokenFlagsNone)),
			}),
			false,
		)
	}
	if template.Kind != "conditional-template" {
		return single()
	}
	var conditional *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsConditionalExpression(node) && node.Pos() == template.Start {
			conditional = node
			return false
		}
		return conditional == nil
	})
	if conditional == nil {
		return single()
	}
	value := conditional.AsConditionalExpression()
	trueBranch := lowering.partitionBranchEdgeID(template.ID, value.WhenTrue.Pos())
	falseBranch := lowering.partitionBranchEdgeID(template.ID, value.WhenFalse.Pos())
	if trueBranch == "" || falseBranch == "" {
		return single()
	}
	branch := lowering.conditional(
		lowering.visitor.VisitNode(value.Condition),
		lowering.factory.NewStringLiteral(trueBranch, ast.TokenFlagsNone),
		lowering.factory.NewStringLiteral(falseBranch, ast.TokenFlagsNone),
	)
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("kind", lowering.factory.NewStringLiteral("branch", ast.TokenFlagsNone)),
			property("branch", branch),
		}),
		false,
	)
}

func (lowering *jsxLowering) partitionBranchEdgeID(parent string, start int) string {
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.Parent == parent && edge.Kind == "branch" && edge.Start == start {
			return edge.ID
		}
	}
	return ""
}

func (lowering *jsxLowering) partitionSlotIDs(children *ast.NodeList) []string {
	if children == nil {
		return nil
	}
	result := []string{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for _, child := range semantic {
		start, end := child.Pos(), child.End()
		switch {
		case ast.IsJsxText(child):
			if normalizeJSXText(child.AsJsxText().Text) == "" {
				continue
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			start, end = expression.Pos(), expression.End()
		}
		id := lowering.partitionRangeEdgeID(start, end)
		if id == "" {
			return nil
		}
		result = append(result, id)
	}
	return result
}

func (lowering *jsxLowering) partitionRangeEdgeID(start int, end int) string {
	best := ""
	bestWidth := int(^uint(0) >> 1)
	for _, edge := range lowering.partitionPlan.Edges {
		if edge.Kind == "component" || edge.Kind == "enhancement" || edge.Length <= 0 ||
			edge.Start < start || edge.Start+edge.Length > end {
			continue
		}
		width := edge.Length
		if edge.Start == start && width < bestWidth {
			best, bestWidth = edge.ID, width
		}
	}
	return best
}

func (lowering *jsxLowering) clientBoundaryChildren(
	children *ast.NodeList,
) (*ast.Node, bool) {
	if children == nil {
		return nil, false
	}
	if jsxChildrenRequireServerSlot(children) {
		return nil, true
	}
	values := []*ast.Node{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				values = append(
					values,
					lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone),
				)
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression != nil {
				values = append(values, lowering.visitor.VisitNode(expression))
			}
		}
	}
	switch len(values) {
	case 0:
		return nil, false
	case 1:
		return values[0], false
	default:
		return lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList(values),
			false,
		), false
	}
}

func jsxChildrenRequireServerSlot(children *ast.NodeList) bool {
	if children == nil {
		return false
	}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for _, child := range semantic {
		if ast.IsJsxText(child) {
			continue
		}
		if ast.IsJsxExpression(child) {
			expression := child.AsJsxExpression().Expression
			if expression == nil ||
				expression.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
				continue
			}
		}
		return true
	}
	return false
}

func (lowering *jsxLowering) appendObjectProperty(
	object *ast.Node,
	name string,
	value *ast.Node,
) *ast.Node {
	literal := object.AsObjectLiteralExpression()
	properties := append([]*ast.Node(nil), literal.Properties.Nodes...)
	properties = append(
		properties,
		lowering.property(lowering.factory.NewIdentifier(name), value),
	)
	return lowering.factory.UpdateObjectLiteralExpression(
		literal,
		lowering.factory.NewNodeList(properties),
		literal.MultiLine,
	)
}
