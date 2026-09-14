package exactcompiler

import (
	"strconv"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// nativePropNames derives platform property casing from the project's DOM library and JSX
// contract. Component and custom-element property names are never rewritten by this policy.
func nativePropNames(node *ast.Node, tag string, typeChecker *checker.Checker) (map[string]string, bool) {
	names := make(map[string]string)
	platform := false
	for _, tableName := range []string{"HTMLElementTagNameMap", "SVGElementTagNameMap", "MathMLElementTagNameMap"} {
		table := typeChecker.ResolveName(tableName, node, ast.SymbolFlagsType, false)
		if table == nil {
			continue
		}
		entry := typeChecker.GetPropertyOfType(typeChecker.GetDeclaredTypeOfSymbol(table), tag)
		if entry == nil {
			continue
		}
		platform = true
		if tableName == "SVGElementTagNameMap" {
			style := typeChecker.ResolveName("CSSStyleDeclaration", node, ast.SymbolFlagsType, false)
			if style != nil {
				for _, property := range typeChecker.GetPropertiesOfType(typeChecker.GetDeclaredTypeOfSymbol(style)) {
					if property.Flags&ast.SymbolFlagsMethod == 0 {
						names[strings.ToLower(property.Name)] = property.Name
					}
				}
			}
		}
		// Symbol flags distinguish DOM methods without resolving unrelated callback types.
		for _, property := range typeChecker.GetPropertiesOfType(typeChecker.GetTypeOfSymbolAtLocation(entry, node)) {
			if property.Flags&ast.SymbolFlagsMethod == 0 {
				names[strings.ToLower(property.Name)] = property.Name
			}
		}
	}
	for _, name := range []string{"class", "className", "style", "key", "ref", "children", "srcdoc", "command", "commandFor", "defaultValue", "defaultChecked", "disabled", "checked", "value", "for", "xmlns", "xmlnsXlink", "xlinkHref"} {
		names[strings.ToLower(name)] = name
	}
	// HTMLMetaElement does not expose the charset attribute as an IDL property.
	if tag == "meta" {
		names["charset"] = "charSet"
	}
	return names, platform
}

// Event spellings are shared by native intrinsics. Resolve the mapped JSX event surface once
// per source, rather than instantiating it for every tag and again during diagnostics.
func nativeEventPropNames(node *ast.Node, typeChecker *checker.Checker) map[string]string {
	names := make(map[string]string)
	for _, entry := range typeChecker.GetJsxIntrinsicTagNamesAt(node) {
		for _, property := range typeChecker.GetPropertiesOfType(typeChecker.GetTypeOfSymbolAtLocation(entry, node)) {
			if strings.HasPrefix(property.Name, "on") {
				names[strings.ToLower(property.Name)] = property.Name
			}
		}
		if len(names) != 0 {
			break
		}
	}
	return names
}

// planNativePropCasing runs before analysis so event placement and every static HTML fast path
// see the same canonical spelling. Source-edit mapping preserves authored diagnostic positions.
func planNativePropCasing(source *ast.SourceFile, typeChecker *checker.Checker) []sourceEdit {
	if usesForeignJSXRuntime(source) {
		return nil
	}
	var edits []sourceEdit
	edited := make(map[int]bool)
	cache := make(map[string]map[string]string)
	var eventNames map[string]string
	canonicalName := func(node *ast.Node, authored string, names map[string]string) string {
		if strings.HasPrefix(strings.ToLower(authored), "on") {
			if eventNames == nil {
				eventNames = nativeEventPropNames(node, typeChecker)
			}
			return canonicalNativePropName(authored, eventNames)
		}
		return canonicalNativePropName(authored, names)
	}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxOpeningElement(node) && !ast.IsJsxSelfClosingElement(node) {
			return true
		}
		tag := sourceText(source, openingTag(node))
		if !jsxIntrinsic(tag) || strings.Contains(tag, "-") || node.Attributes() == nil || len(node.Attributes().AsJsxAttributes().Properties.Nodes) == 0 {
			return true
		}
		names := cache[tag]
		if names == nil {
			names, _ = nativePropNames(node, tag, typeChecker)
			cache[tag] = names
		}
		for _, property := range node.Attributes().AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				expression := property.AsJsxSpreadAttribute().Expression
				members, reason := finiteIslandSpread(source, expression, typeChecker, nil)
				if reason != "" {
					continue
				}
				// A proven immutable literal binding may also feed a component or custom element.
				// Rename this delivery, never the shared declaration. The proof excludes getters,
				// mutation and escaping bags, so these property reads preserve value ownership.
				if ast.IsIdentifier(expression) {
					var fields []string
					changed := false
					for _, member := range members {
						canonical := canonicalName(node, member.name, names)
						if canonical == "" {
							canonical = member.name
						}
						changed = changed || canonical != member.name
						fields = append(fields, strconv.Quote(canonical)+": "+expression.Text()+"["+strconv.Quote(member.name)+"]")
					}
					if changed {
						edits = append(edits, sourceEdit{start: nodeTokenStart(source, expression), end: expression.End(), text: "{" + strings.Join(fields, ", ") + "}"})
					}
					continue
				}
				for _, member := range members {
					canonical := canonicalName(node, member.name, names)
					if canonical == "" || canonical == member.name || member.value == nil {
						continue
					}
					declaration := member.value.Parent
					if declaration == nil || (!ast.IsPropertyAssignment(declaration) && !ast.IsShorthandPropertyAssignment(declaration)) {
						continue
					}
					if declaration.Pos() < expression.Pos() || declaration.End() > expression.End() {
						continue
					}
					name := declaration.Name()
					if name == nil || edited[name.Pos()] {
						continue
					}
					text := canonical
					if !validIdentifier(text) {
						text = strconv.Quote(text)
					}
					if ast.IsShorthandPropertyAssignment(declaration) {
						text += ": " + member.name
					}
					edits = append(edits, sourceEdit{start: nodeTokenStart(source, name), end: name.End(), text: text})
					edited[name.Pos()] = true
				}
				continue
			}
			if !ast.IsJsxAttribute(property) {
				continue
			}
			name := property.AsJsxAttribute().Name()
			if ast.IsJsxNamespacedName(name) {
				continue
			}
			authored := name.Text()
			canonical := canonicalName(node, authored, names)
			if canonical != "" && canonical != authored {
				edits = append(edits, sourceEdit{start: nodeTokenStart(source, name), end: name.End(), text: canonical})
			}
		}
		return true
	})
	return edits
}

func canonicalNativePropName(authored string, names map[string]string) string {
	canonical := names[strings.ToLower(authored)]
	if strings.HasPrefix(strings.ToLower(authored), "on") && len(authored) > 2 &&
		(canonical == "" || canonical[2] >= 'a' && canonical[2] <= 'z') {
		return "on" + strings.ToUpper(authored[2:3]) + authored[3:]
	}
	return canonical
}
