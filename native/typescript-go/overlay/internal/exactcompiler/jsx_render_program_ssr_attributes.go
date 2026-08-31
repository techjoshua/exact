package exactcompiler

import (
	"html"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
)

// captureRootSsrAttributes records the closed root plan used when no target contribution changes
// the compiler-created prop bag. Unprovable property sources retain generic traversal.
func (lowering *jsxLowering) captureRootSsrAttributes(
	build *renderProgramBuild,
	attributes *ast.Node,
	tag string,
	generatedRootAttributes bool,
) {
	build.rootSsrClosed = true
	if generatedRootAttributes {
		build.rootSsrPlan = append(build.rootSsrPlan, compiledSsrAttribute(tag, "data-exact-id"))
	}
	if attributes == nil {
		return
	}
	if len(lowering.enhancementImports.applications[attributes.Pos()].components) != 0 {
		build.rootSsrClosed = false
		return
	}
	conditionalClasses := jsxHasConditionalClassName(attributes)
	classNameEmitted := false
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if conditionalClasses && jsxClassNameContribution(property) {
			if !classNameEmitted {
				build.rootSsrPlan = append(build.rootSsrPlan, compiledSsrAttribute(tag, "className"))
				classNameEmitted = true
			}
			continue
		}
		if ast.IsJsxSpreadAttribute(property) || !ast.IsJsxAttribute(property) {
			build.rootSsrClosed = false
			return
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if ast.IsJsxNamespacedName(attribute.Name()) || name == "ref" {
			build.rootSsrClosed = false
			return
		}
		if name == "key" || interactiveJSXAttribute(name) {
			continue
		}
		if _, exists := lowering.componentBindings[property.Pos()]; exists {
			build.rootSsrClosed = false
			return
		}
		if lowering.serverFormBindingProperty(name, attribute.Initializer) != nil {
			build.rootSsrClosed = false
			return
		}
		attributeName, value, static := staticRenderProgramAttribute(name, attribute.Initializer)
		if static {
			build.rootStaticHtml += ` ` + attributeName + `="` + html.EscapeString(value) + `"`
			build.rootStaticKeys = append(build.rootStaticKeys, name)
			continue
		}
		if attribute.Initializer != nil && ast.IsJsxExpression(attribute.Initializer) &&
			attribute.Initializer.AsJsxExpression().Expression == nil {
			continue
		}
		build.rootSsrPlan = append(build.rootSsrPlan, compiledSsrAttribute(tag, name))
	}
}

func compiledSsrAttribute(tag string, name string) renderProgramSsrAttribute {
	kind := 0
	switch renderProgramSlotKind(name) {
	case "class":
		kind = 1
	case "style":
		kind = 2
	case "url":
		kind = 3
	}
	if name == "srcdoc" || name == "srcDoc" {
		kind = 4
	} else if tag == "input" && name == "value" {
		kind = 6
	}
	attribute := name
	if name == "className" {
		attribute = "class"
	} else if name == "commandFor" {
		attribute = "commandfor"
	} else if tag == "script" {
		switch name {
		case "crossOrigin":
			attribute = "crossorigin"
		case "fetchPriority":
			attribute = "fetchpriority"
		case "noModule":
			attribute = "nomodule"
		case "referrerPolicy":
			attribute = "referrerpolicy"
		}
	}
	return renderProgramSsrAttribute{kind: kind, property: name, attribute: attribute}
}

func (lowering *jsxLowering) renderProgramSsrRootStatic(build *renderProgramBuild) *ast.Node {
	array := func(values []*ast.Node) *ast.Node {
		return lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)
	}
	keys := make([]*ast.Node, len(build.rootStaticKeys))
	for index, key := range build.rootStaticKeys {
		keys[index] = lowering.factory.NewStringLiteral(key, ast.TokenFlagsNone)
	}
	root := []*ast.Node{
		lowering.factory.NewStringLiteral(build.rootStaticHtml, ast.TokenFlagsNone),
		array(keys),
	}
	if build.rootSsrClosed {
		plan := make([]*ast.Node, len(build.rootSsrPlan))
		for index, operation := range build.rootSsrPlan {
			plan[index] = array([]*ast.Node{
				lowering.factory.NewNumericLiteral(strconv.Itoa(operation.kind), ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(operation.property, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(operation.attribute, ast.TokenFlagsNone),
			})
		}
		root = append(root, array(plan))
	}
	return array(root)
}
