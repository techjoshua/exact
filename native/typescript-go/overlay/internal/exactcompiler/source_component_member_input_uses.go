package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type sourceComponentMemberInput struct {
	operation *ast.Node
	target    *ast.Symbol
	attribute string
	member    string
}

// componentMemberInput finds an original setup or reactive producer Get. Restrict
// the delivery to one unmodified props occurrence so the input cannot escape or
// be replaced before the selected descriptor is reached.
func componentMemberInput(record projectComponent, facts []*callableFacts, owner *sourceValueOwner, c *checker.Checker) sourceComponentMemberInput {
	if record.component.Placement != "unknown" || record.component.RenderCapability.Client == "unsupported" {
		return sourceComponentMemberInput{}
	}
	component := record.candidate.node
	target := resolvedCallableSymbol(callableDeclarationSymbol(component, c), c)
	props := componentPropsSymbol(component, c)
	if target == nil || owner.bindingWritten(target) || props == nil || props.ValueDeclaration == nil || props.ValueDeclaration.Initializer() != nil || owner.bindingWritten(props) {
		return sourceComponentMemberInput{}
	}
	var input sourceComponentMemberInput
	for _, fact := range facts {
		for _, effect := range fact.summary.EffectSources {
			field := effect.fieldOrigin
			if field == nil || field.slot != props.ValueDeclaration || !effect.provenanceIncomplete || !effect.Opaque {
				continue
			}
			if effect.fieldForwarded {
				if !effect.componentReactiveField || enclosingCallableNode(field.declaration) != component {
					continue
				}
			} else if field.declaration != component || field.consumer != component {
				continue
			}
			operation := field.operation
			if operation == nil || !ast.IsPropertyAccessExpression(operation) {
				continue
			}
			base, member := accessorReceiver(operation)
			base = unwrapSourceCallableReference(base)
			attribute, receiver, direct := directPropsRead(base)
			if !direct || member == "" || c.GetSymbolAtLocation(receiver) != props {
				continue
			}
			read, write := accessorEvaluationMode(operation)
			if !read || write || input.operation != nil && input.operation != operation {
				return sourceComponentMemberInput{}
			}
			input = sourceComponentMemberInput{operation, target, attribute, member}
		}
	}
	if input.operation == nil {
		return input
	}
	receiver := unwrapSourceCallableReference(input.operation.Expression()).Expression()
	closed := true
	walkNode(component.Body(), func(node *ast.Node) bool {
		if !closed || node == receiver || !ast.IsIdentifier(node) {
			return closed
		}
		switch node.Text() {
		case "arguments", "eval":
			closed = false
		case receiver.Text():
			closed = c.GetSymbolAtLocation(node) != props
		}
		return closed
	})
	if !closed {
		return sourceComponentMemberInput{}
	}
	return input
}

// applyComponentMemberInputUses consumes declaration-local Gets at their linked
// JSX site. The getter and input recipe belong to this parent use only.
func applyComponentMemberInputUses(project *projectState, records []projectComponent, matches map[*ast.Node][]*callableFacts, callables callableAnalysis, c *checker.Checker) {
	if callables.owner == nil || callables.owner.values == nil {
		return
	}
	demands := make(map[string]sourceComponentMemberInput)
	for _, record := range records {
		if demand := componentMemberInput(record, matches[record.candidate.node], callables.owner.values, c); demand.operation != nil {
			demands[record.component.ID] = demand
		}
	}
	if len(demands) == 0 {
		return
	}
	for i := range records {
		record := &records[i]
		if record.component.Placement != "isomorphic" {
			continue
		}
		var edges map[string]*RenderEdge
		for j := range record.component.RenderEdges {
			edge := &record.component.RenderEdges[j]
			if _, known := demands[edge.ComponentID]; known {
				if edges == nil {
					edges = make(map[string]*RenderEdge)
				}
				edges[edge.Path] = edge
			}
		}
		if len(edges) == 0 {
			continue
		}
		for _, render := range projectComponentRenders(project, record.sourceFile) {
			if render.component.node != record.candidate.node || render.micro {
				continue
			}
			root := unwrapRenderExpression(render.callable.Body())
			if root == nil || !ast.IsJsxElement(root) || !jsxIntrinsic(openingTag(root.AsJsxElement().OpeningElement).Text()) {
				continue
			}
			walkNode(root, func(site *ast.Node) bool {
				// Only follow rendered JSX children. Expressions, callbacks and
				// component-owned children have separate evaluation contexts.
				if ast.IsJsxElement(site) {
					return jsxIntrinsic(openingTag(site.AsJsxElement().OpeningElement).Text())
				}
				if !ast.IsJsxSelfClosingElement(site) {
					return false
				}
				edge := edges[strconv.Itoa(site.Pos())]
				if edge == nil {
					return true
				}
				demand := demands[edge.ComponentID]
				tag := openingTag(site)
				if !ast.IsIdentifier(tag) || resolvedCallableSymbol(c.GetSymbolAtLocation(tag), c) != demand.target {
					return false
				}
				if getter := componentMemberInputGetter(site, demand, c); getter != nil {
					if summary, ok := callables.byNode[getter]; ok {
						// Known browser work excludes SSR even alongside unrelated uncertainty.
						// The child's standalone capabilities and the getter's original effects stay intact.
						targets := artifactTargetsFor(summary.Effect, summary.EffectSources)
						if len(targets) == 1 && targets[0] == "client" {
							edge.clientInputOwner = root.AsJsxElement().OpeningElement
							edge.Placement, edge.Boundary = "client", "client"
						}
					}
				}
				return false
			})
		}
	}
}

// componentMemberInputGetter links a definite JSX input to its own getter only
// when the entire input construction can be omitted from the server receipt.
func componentMemberInputGetter(site *ast.Node, demand sourceComponentMemberInput, c *checker.Checker) *ast.Node {
	selection := selectComponentCallableInput(site, demand.attribute)
	if selection.unknown || len(selection.values) != 1 {
		return nil
	}
	literal := unwrapSourceCallableReference(selection.values[0])
	if literal == nil || !ast.IsObjectLiteralExpression(literal) {
		return nil
	}
	var getter *ast.Node
	for _, property := range literal.AsObjectLiteralExpression().Properties.Nodes {
		name := property.Name()
		if name == nil || !ast.IsIdentifier(name) {
			return nil
		}
		if name.Text() == demand.member {
			if getter != nil || !ast.IsGetAccessorDeclaration(property) {
				return nil
			}
			getter = property
		}
	}
	if getter == nil || !componentMemberInputAttributesInert(site.Attributes(), literal, c) {
		return nil
	}
	return getter
}

// componentMemberInputAttributesInert guards the input-free placeholder. A
// definite final write only proves selection; overwritten attributes and spread
// copies still execute. Key, ref and children also carry receipt semantics.
func componentMemberInputAttributesInert(attributes, selected *ast.Node, c *checker.Checker) bool {
	for _, attribute := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(attribute) {
			spread := unwrapSourceCallableReference(attribute.AsJsxSpreadAttribute().Expression)
			if spread == nil || !ast.IsObjectLiteralExpression(spread) || !componentMemberInputRecordInert(spread, nil, true, c) {
				return false
			}
			continue
		}
		if !ast.IsIdentifier(attribute.Name()) {
			return false
		}
		switch jsxAttributeText(attribute.Name()) {
		case "key", "ref", "children":
			return false
		}
		if init := attribute.AsJsxAttribute().Initializer; init != nil && ast.IsJsxExpression(init) &&
			!componentMemberInputValueInert(init.AsJsxExpression().Expression, selected, false, c) {
			return false
		}
	}
	return true
}

// componentMemberInputRecordInert accepts plain record construction. A JSX
// spread also reads each copied property, so its top-level accessors are excluded.
// Only the selected record may use the existing scalar state capture.
func componentMemberInputRecordInert(literal, selected *ast.Node, copied bool, c *checker.Checker) bool {
	for _, property := range literal.AsObjectLiteralExpression().Properties.Nodes {
		name := property.Name()
		if name == nil || !ast.IsIdentifier(name) || name.Text() == "__proto__" {
			return false
		}
		if copied {
			switch name.Text() {
			case "key", "ref", "children":
				return false
			}
		} else if ast.IsGetAccessorDeclaration(property) {
			continue
		}
		if !ast.IsPropertyAssignment(property) || !componentMemberInputValueInert(property.Initializer(), selected, literal == selected, c) {
			return false
		}
	}
	return true
}

func componentMemberInputValueInert(expression, selected *ast.Node, readsSelectedState bool, c *checker.Checker) bool {
	value := unwrapSourceCallableReference(expression)
	if value == nil {
		return false
	}
	switch value.Kind {
	case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	case ast.KindObjectLiteralExpression:
		return componentMemberInputRecordInert(value, selected, false, c)
	case ast.KindPropertyAccessExpression:
		if !readsSelectedState {
			return false
		}
		receiver := directStateReadReceiver(value)
		return receiver != nil && ast.IsPropertyAccessExpression(receiver) &&
			intrinsicConstructionScalar(c.GetTypeAtLocation(value), c)
	default:
		return false
	}
}
