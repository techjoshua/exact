package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"html"
	"strconv"
	"strings"
)

// appendRenderProgramAttributes lowers source attributes into static markup or owned runtime slots.
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
	if lowering.target == TargetDefault && len(application.components) != 0 {
		// Untargeted inspection records enhancement facts; executable attachment is selected only
		// after a concrete client or server target is known.
		return build.decline("untargeted-enhancement-inspection")
	}
	if lowering.target == TargetServer && jsxAttributesContainSpread(attributes) {
		return lowering.appendServerSpreadAttributes(build, attributes, tag, path, node)
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
					lowering.lowerClassNameValue(attributes, false, true),
				)
				classNameEmitted = true
			}
			continue
		}
		if ast.IsJsxSpreadAttribute(property) {
			expression := property.AsJsxSpreadAttribute().Expression
			reader := lowering.visitor.VisitNode(expression)
			if plan, exists := lowering.enhancementImports.spreads[property.Pos()]; exists {
				keys := make([]*ast.Node, 0, len(plan.keys))
				for _, key := range plan.keys {
					keys = append(keys, lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone))
				}
				reader = lowering.call(lowering.names.omitEnhancementProps, []*ast.Node{
					reader,
					lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(keys), false),
				})
			}
			build.spreadSlot(lowering.dynamicID(property), path, node, reader)
			continue
		}
		if !ast.IsJsxAttribute(property) {
			return build.decline("unknown-attribute")
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if ast.IsJsxNamespacedName(attribute.Name()) {
			prefix := attribute.Name().AsJsxNamespacedName().Namespace.Text()
			if _, enhancement := lowering.enhancementImports.bindings[prefix]; enhancement {
				continue
			}
		}
		if name == "key" {
			// Collection lowering publishes key identity on the prepared program value. A key does not
			// describe a host property and must never enter the template or property writer.
			continue
		}
		if name == "data-exact-id" {
			return build.decline("reserved-attribute-" + name)
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			return build.decline("component-binding-attribute")
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
			return build.decline("namespaced-attribute")
		}
		if _, serialized, static := lowering.plannedStaticRenderProgramAttribute(tag, name, attribute.Initializer); static {
			build.write(serialized)
			continue
		}
		reader := lowering.jsxAttributeInitializer(attribute, tag, name, false)
		// Materialize against the authored tree before transformed expressions lose their
		// parent chain. Planned readers still own the sole reactive evaluation.
		if lowering.target != TargetServer && !interactiveJSXAttribute(name) &&
			attribute.Initializer != nil && ast.IsJsxExpression(attribute.Initializer) {
			expression := attribute.Initializer.AsJsxExpression().Expression
			locals := lowering.reactiveClosureLocals(expression)
			value := lowering.preserveContextualCallbackTypes(expression, tag, name)
			if closure := lowering.materializedClosure(value, locals); closure != nil {
				reader = lowering.call(lowering.names.expression, []*ast.Node{closure})
			}
		}
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
func staticRenderProgramAttribute(tag string, name string, initializer *ast.Node) (string, string, bool) {
	if !strings.Contains(tag, "-") && initializer == nil && name == "required" {
		return name, ` required`, true
	}
	if initializer != nil && ast.IsJsxExpression(initializer) {
		expression := initializer.AsJsxExpression().Expression
		if !strings.Contains(tag, "-") && name == "maxLength" && ast.IsNumericLiteral(expression) {
			value, error := strconv.ParseFloat(expression.Text(), 64)
			if error == nil {
				return name, ` maxLength="` + strconv.FormatFloat(value, 'f', -1, 64) + `"`, true
			}
		}
		return "", "", false
	}
	if initializer == nil || !ast.IsStringLiteral(initializer) {
		return "", "", false
	}
	if tag == "meta" && (name == "charSet" || name == "charset" || name == "content") {
		return name, ` ` + name + `="` + html.EscapeString(initializer.AsStringLiteral().Text) + `"`, true
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
	return attributeName, ` ` + attributeName + `="` + html.EscapeString(initializer.AsStringLiteral().Text) + `"`, true
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
