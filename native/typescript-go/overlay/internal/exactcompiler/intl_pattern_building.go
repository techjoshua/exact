package exactcompiler

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
)

func appendNativeIntlDescriptor(
	result *intlAnalysis,
	request Request,
	options intlAnalyzeOptions,
	sourceFile *ast.SourceFile,
	element *ast.Node,
	activation *ast.Node,
	sourceNode *ast.Node,
	ownerOrdinal int,
	ownerID string,
	occurrence int,
	target intlTarget,
	pattern []intlPatternNode,
	build *intlPatternBuild,
	name string,
	activationName string,
	explicit bool,
) {
	opening := element
	if ast.IsJsxElement(element) {
		opening = element.AsJsxElement().OpeningElement.AsNode()
	}
	parsedElementStart := scanner.SkipTrivia(sourceFile.Text(), element.Pos())
	elementStart := nearestIntlElementStart(request.Source, parsedElementStart, opening.TagName().Text())
	positionDelta := elementStart - parsedElementStart
	activationEnd := opening.TagName().End()
	if activation != nil {
		activationEnd = activation.End()
	}
	contentStart, contentEnd := intlChildrenSpan(nil, activationEnd)
	if ast.IsJsxElement(element) {
		jsx := element.AsJsxElement()
		contentStart, contentEnd = intlChildrenSpan(jsx.Children.Nodes, jsx.OpeningElement.End())
	}
	rangeNode := sourceNode
	rangeStart, rangeLength := contentStart, contentEnd-contentStart
	if rangeNode != nil {
		rangeStart = scanner.SkipTrivia(sourceFile.Text(), rangeNode.Pos())
		rangeLength = rangeNode.End() - rangeStart
	}
	rangeStart += positionDelta
	// All extension spans use the normalized source buffer; callers compose them
	// before ordinary compilation and the standard source map retains authorship.
	descriptorIndex := len(result.Descriptors)
	result.Descriptors = append(result.Descriptors, intlDescriptor{
		Protocol: 1, Owner: options.Owner, OwnerComponentID: ownerID,
		OccurrenceID: fmt.Sprintf("%s:%d", request.ID, occurrence), SourceLocale: options.SourceLocale,
		Target: target, Bindings: build.bindings, Source: pattern,
		Capabilities: intlPatternCapabilities(pattern), Name: name,
		SourceRange: intlSourceRange{File: request.ID, Start: rangeStart, Length: rangeLength},
	})
	result.DescriptorOwnerOrdinals = append(result.DescriptorOwnerOrdinals, ownerOrdinal)
	attributeStart, attributeLength := opening.TagName().End()+positionDelta, 0
	if activation != nil {
		attributeStart = scanner.SkipTrivia(sourceFile.Text(), activation.Pos()) + positionDelta
		attributeLength = activation.End() - scanner.SkipTrivia(sourceFile.Text(), activation.Pos())
		if activationName == "" && ast.IsJsxNamespacedName(activation.AsJsxAttribute().Name()) {
			activationName = activation.AsJsxAttribute().Name().AsJsxNamespacedName().Name().Text()
		}
	}
	attributes := []intlSpan{{Start: attributeStart, Length: attributeLength}}
	transferred := []intlSpan{}
	if target.Kind == "content" {
		if contentAttributes := intlContentAttributeSpans(opening.Attributes()); len(contentAttributes) > 0 {
			attributes = offsetIntlSpans(contentAttributes, positionDelta)
		}
		attributes = append(attributes, offsetIntlSpans(build.attributes, positionDelta)...)
		if !explicit {
			transferred = offsetIntlSpans(intlTransferredAttributeSpans(opening.Attributes()), positionDelta)
		}
	}
	result.Regions = append(result.Regions, intlRegion{
		DescriptorIndex: descriptorIndex,
		ActivationName:  activationName,
		Explicit:        explicit,
		Element:         intlSpan{Start: elementStart, Length: element.End() - parsedElementStart},
		Attribute:       intlSpan{Start: attributeStart, Length: attributeLength},
		Attributes:      attributes,
		Transferred:     transferred,
		Content:         intlSpan{Start: contentStart + positionDelta, Length: contentEnd - contentStart},
		Values:          offsetIntlSpans(build.values, positionDelta), Structures: offsetIntlStructures(build.structures, positionDelta),
		Evidence: offsetIntlEvidence(build.evidence, positionDelta),
	})
}

// Content translation reconstructs its intrinsic target. Other namespaced JSX
// capabilities therefore belong only to that reconstructed target; retaining
// them on the temporary source target would activate the same enhancement twice.
func intlTransferredAttributeSpans(attributes *ast.Node) []intlSpan {
	result := []intlSpan{}
	if attributes == nil {
		return result
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) || !ast.IsJsxNamespacedName(property.AsJsxAttribute().Name()) {
			continue
		}
		if property.AsJsxAttribute().Name().AsJsxNamespacedName().Namespace.Text() != "intl" {
			result = append(result, intlNodeSpan(property))
		}
	}
	return result
}

func intlContentAttributeSpans(attributes *ast.Node) []intlSpan {
	result := []intlSpan{}
	for _, name := range []string{
		"message", "plural", "select", "currency", "unit", "cldr", "display", "source-unit", "convert-to",
	} {
		if attribute := intlJSXAttribute(attributes, name); attribute != nil {
			result = append(result, intlNodeSpan(attribute))
		}
	}
	return result
}

func intlExplicitComponent(tag string) bool {
	switch tag {
	case "IntlMessage", "IntlPlural", "IntlSelect", "IntlCurrency", "IntlUnit":
		return true
	default:
		return false
	}
}

func intlExplicitActivationName(tag string, attributes *ast.Node) string {
	switch tag {
	case "IntlPlural":
		return "plural"
	case "IntlSelect":
		return "select"
	case "IntlCurrency":
		return "currency"
	case "IntlUnit":
		if intlJSXAttribute(attributes, "cldr") != nil || jsxAttribute(attributes, "", "cldr") != nil {
			return "cldr"
		}
		return "unit"
	default:
		if jsxAttribute(attributes, "", "plural") != nil {
			return "plural"
		}
		if jsxAttribute(attributes, "", "select") != nil {
			return "select"
		}
		return "message"
	}
}

func nearestIntlElementStart(source string, approximate int, tag string) int {
	pattern := regexp.MustCompile(`<` + regexp.QuoteMeta(tag) + `(?:\s|/?>)`)
	best, distance := approximate, len(source)+1
	for _, match := range pattern.FindAllStringIndex(source, -1) {
		candidateDistance := match[0] - approximate
		if candidateDistance < 0 {
			candidateDistance = -candidateDistance
		}
		if candidateDistance < distance {
			best, distance = match[0], candidateDistance
		}
	}
	return best
}

func offsetIntlSpans(spans []intlSpan, delta int) []intlSpan {
	result := make([]intlSpan, len(spans))
	for index, span := range spans {
		result[index] = intlSpan{Start: span.Start + delta, Length: span.Length}
	}
	return result
}

func offsetIntlEvidence(evidence []intlInferenceEvidence, delta int) []intlInferenceEvidence {
	result := make([]intlInferenceEvidence, len(evidence))
	for index, item := range evidence {
		result[index] = intlInferenceEvidence{
			Start: item.Start + delta, Length: item.Length, Kind: item.Kind, Detail: item.Detail,
		}
	}
	return result
}

func recordIntlExpressionInference(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	kind string,
	detail string,
	build *intlPatternBuild,
) {
	start := scanner.SkipTrivia(sourceFile.Text(), expression.Pos())
	recordIntlInference(start, expression.End()-start, kind, detail, build)
}

func recordIntlTextInference(
	sourceFile *ast.SourceFile,
	children []*ast.Node,
	label string,
	kind string,
	detail string,
	build *intlPatternBuild,
) {
	needle := strings.ToLower(label)
	semantic := ast.GetSemanticJsxChildren(children)
	for index := len(semantic) - 1; index >= 0; index-- {
		child := semantic[index]
		if !ast.IsJsxText(child) {
			continue
		}
		text := sourceText(sourceFile, child)
		offset := strings.LastIndex(strings.ToLower(text), needle)
		if offset >= 0 {
			recordIntlInference(child.Pos()+offset, len(label), kind, detail, build)
			return
		}
	}
}

func recordIntlInference(start int, length int, kind string, detail string, build *intlPatternBuild) {
	if length <= 0 || kind == "" {
		return
	}
	for _, existing := range build.evidence {
		if existing.Start == start && existing.Length == length && existing.Kind == kind {
			return
		}
	}
	build.evidence = append(build.evidence, intlInferenceEvidence{
		Start: start, Length: length, Kind: kind, Detail: detail,
	})
}

func offsetIntlStructures(structures []intlStructureRegion, delta int) []intlStructureRegion {
	result := make([]intlStructureRegion, len(structures))
	for index, structure := range structures {
		result[index] = intlStructureRegion{
			Element:    intlSpan{Start: structure.Element.Start + delta, Length: structure.Element.Length},
			Content:    intlSpan{Start: structure.Content.Start + delta, Length: structure.Content.Length},
			Attributes: offsetIntlSpans(structure.Attributes, delta),
			Opaque:     structure.Opaque,
		}
	}
	return result
}

func intlJSXAttribute(attributes *ast.Node, name string) *ast.Node {
	return jsxAttribute(attributes, "intl", name)
}

func jsxAttribute(attributes *ast.Node, namespace string, name string) *ast.Node {
	if attributes == nil {
		return nil
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		declaration := property.AsJsxAttribute()
		attributeName := declaration.Name()
		if namespace == "" {
			if !ast.IsJsxNamespacedName(attributeName) && attributeName.Text() == name {
				return property
			}
		} else if ast.IsJsxNamespacedName(attributeName) {
			namespaced := attributeName.AsJsxNamespacedName()
			if namespaced.Namespace.Text() == namespace && namespaced.Name().Text() == name {
				return property
			}
		}
	}
	return nil
}

var intlPropertyNames = map[string]struct{}{
	"alt": {}, "title": {}, "placeholder": {}, "aria-label": {},
	"aria-description": {}, "aria-roledescription": {}, "aria-valuetext": {},
}

func intlPropertyAttributes(attributes *ast.Node) []*ast.Node {
	result := []*ast.Node{}
	if attributes == nil {
		return result
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) || !ast.IsJsxNamespacedName(property.AsJsxAttribute().Name()) {
			continue
		}
		name := property.AsJsxAttribute().Name().AsJsxNamespacedName()
		if name.Namespace.Text() != "intl" {
			continue
		}
		if _, supported := intlPropertyNames[name.Name().Text()]; supported {
			result = append(result, property)
		}
	}
	return result
}

func buildIntlProperty(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	fallback *ast.Node,
	activation *ast.Node,
	ordinalMarkers []string,
	ordinalWrappers []intlOrdinalWrapper,
) ([]intlPatternNode, *intlPatternBuild, bool) {
	build := newIntlPatternBuild(ordinalMarkers, ordinalWrappers)
	if fallback == nil {
		return nil, build, false
	}
	initializer := fallback.AsJsxAttribute().Initializer
	if initializer == nil {
		return nil, build, false
	}
	if ast.IsStringLiteral(initializer) {
		if initializer.AsStringLiteral().Text == "" {
			return nil, build, false
		}
		return []intlPatternNode{{Kind: "text", Value: initializer.AsStringLiteral().Text}}, build, true
	}
	if !ast.IsJsxExpression(initializer) || initializer.AsJsxExpression().Expression == nil {
		return nil, build, false
	}
	pattern, supported := buildIntlExpression(
		sourceFile,
		typeChecker,
		initializer.AsJsxExpression().Expression,
		build,
	)
	role := intlStaticAttributeString(activation)
	if supported && strings.HasPrefix(role, "display-name:") && len(pattern) == 1 && pattern[0].Kind == "value" {
		domain := intlDisplayNameDomain(strings.TrimPrefix(role, "display-name:"))
		if domain == "" {
			return nil, build, false
		}
		binding := pattern[0].Binding
		pattern = []intlPatternNode{{
			Kind: "format", Bindings: []int{binding},
			Formatter: map[string]any{"kind": "display-name", "domain": domain, "options": map[string]any{}},
		}}
	}
	return pattern, build, supported && len(pattern) != 0
}

func intlDisplayNameDomain(value string) string {
	switch value {
	case "language", "languageCode":
		return "language"
	case "region", "regionCode":
		return "region"
	case "script", "scriptCode":
		return "script"
	case "currency", "currencyCode":
		return "currency"
	case "calendar", "calendarCode":
		return "calendar"
	case "dateTimeField":
		return "dateTimeField"
	default:
		return ""
	}
}

func newIntlPatternBuild(
	ordinalMarkers []string,
	ordinalWrappers []intlOrdinalWrapper,
) *intlPatternBuild {
	markers := make(map[string]struct{}, len(ordinalMarkers))
	for _, marker := range ordinalMarkers {
		markers[marker] = struct{}{}
	}
	return &intlPatternBuild{
		bindings: []intlBinding{}, values: []intlSpan{},
		structures: []intlStructureRegion{}, evidence: []intlInferenceEvidence{}, identities: map[string]int{},
		ordinalMarkers: markers, ordinalWrappers: append([]intlOrdinalWrapper(nil), ordinalWrappers...),
	}
}

// newIntlMessagePatternBuild owns all analyzer policy needed while nested
// formatter and selector enhancements contribute to one lexical message.
func newIntlMessagePatternBuild(options intlAnalyzeOptions) *intlPatternBuild {
	build := newIntlPatternBuild(options.OrdinalMarkers, options.OrdinalWrappers)
	build.sourceLocale = options.SourceLocale
	build.unitLabels = options.UnitLabels
	build.currencyLabels = options.CurrencyLabels
	build.defaultCurrency = options.DefaultCurrencyLabels
	return build
}

func intlStaticAttributeString(attribute *ast.Node) string {
	if attribute == nil {
		return ""
	}
	initializer := attribute.AsJsxAttribute().Initializer
	if initializer != nil && ast.IsStringLiteral(initializer) {
		return initializer.AsStringLiteral().Text
	}
	return ""
}

func intlStaticObjectName(attribute *ast.Node) string {
	return intlStaticObjectString(attribute, "name")
}

func intlStaticObjectString(attribute *ast.Node, name string) string {
	if attribute == nil {
		return ""
	}
	initializer := attribute.AsJsxAttribute().Initializer
	if initializer == nil || !ast.IsJsxExpression(initializer) {
		return ""
	}
	expression := unwrapRenderExpression(initializer.AsJsxExpression().Expression)
	if expression == nil || !ast.IsObjectLiteralExpression(expression) {
		return ""
	}
	for _, property := range expression.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) || property.AsPropertyAssignment().Name().Text() != name {
			continue
		}
		value := unwrapRenderExpression(property.AsPropertyAssignment().Initializer)
		if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
			return value.Text()
		}
	}
	return ""
}

func intlPropertyDescriptorName(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	activation *ast.Node,
	propertyName string,
) string {
	if explicit := intlStaticObjectName(activation); explicit != "" {
		return explicit
	}
	if parent := intlNearestContentMessageName(node, sourceFile); parent != "" {
		return parent + "_" + propertyName
	}
	return ""
}

func intlNearestContentMessageName(node *ast.Node, sourceFile *ast.SourceFile) string {
	for current := node; current != nil; current = current.Parent {
		var opening *ast.Node
		switch {
		case ast.IsJsxElement(current):
			opening = current.AsJsxElement().OpeningElement.AsNode()
		case ast.IsJsxSelfClosingElement(current):
			opening = current
		default:
			continue
		}
		tag := sourceText(sourceFile, opening.TagName())
		if intlExplicitComponent(tag) {
			name := intlStaticAttributeString(jsxAttribute(opening.Attributes(), "", "name"))
			if name != "" {
				return name
			}
			return ""
		}
		message := intlJSXAttribute(opening.Attributes(), "message")
		if message == nil {
			continue
		}
		return intlStaticAttributeString(message)
	}
	return ""
}

func intlPatternCapabilities(pattern []intlPatternNode) []string {
	capabilities := map[string]struct{}{}
	var visit func([]intlPatternNode)
	visit = func(nodes []intlPatternNode) {
		for _, node := range nodes {
			switch node.Kind {
			case "element":
				capabilities["element"] = struct{}{}
				visit(node.Nodes)
			case "opaque":
				capabilities["opaque"] = struct{}{}
			case "select":
				capabilities[node.Selection] = struct{}{}
				for _, candidate := range node.Cases {
					visit(candidate.Value)
				}
				visit(node.Fallback)
			case "format":
				if kind, valid := node.Formatter["kind"].(string); valid {
					capabilities[kind] = struct{}{}
				}
			}
		}
	}
	visit(pattern)
	result := make([]string, 0, len(capabilities))
	for capability := range capabilities {
		result = append(result, capability)
	}
	sort.Strings(result)
	return result
}

func buildIntlChildren(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	children []*ast.Node,
	build *intlPatternBuild,
) ([]intlPatternNode, bool) {
	result := []intlPatternNode{}
	semantic := ast.GetSemanticJsxChildren(children)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				result = append(result, intlPatternNode{Kind: "text", Value: text})
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			nodes, supported := buildIntlExpression(sourceFile, typeChecker, expression, build)
			if !supported {
				return nil, false
			}
			result = append(result, nodes...)
		case ast.IsJsxElement(child):
			node, supported := buildIntlElement(sourceFile, typeChecker, child, build)
			if !supported {
				return nil, false
			}
			result = append(result, node)
		default:
			return nil, false
		}
	}
	return applyIntlOrdinalWrappers(result, build), true
}

func applyIntlOrdinalWrappers(
	nodes []intlPatternNode,
	build *intlPatternBuild,
) []intlPatternNode {
	if len(build.ordinalWrappers) == 0 || len(nodes) == 0 {
		return nodes
	}
	result := make([]intlPatternNode, 0, len(nodes))
	for index := 0; index < len(nodes); index++ {
		node := nodes[index]
		if node.Kind != "value" {
			result = append(result, node)
			continue
		}
		matched := false
		for _, wrapper := range build.ordinalWrappers {
			before := ""
			if wrapper.Prefix != "" {
				if index == 0 || nodes[index-1].Kind != "text" {
					continue
				}
				before, _ = nodes[index-1].Value.(string)
				if !strings.HasSuffix(before, wrapper.Prefix) {
					continue
				}
			}
			after := ""
			if wrapper.Suffix != "" {
				if index+1 >= len(nodes) || nodes[index+1].Kind != "text" {
					continue
				}
				after, _ = nodes[index+1].Value.(string)
				if !strings.HasPrefix(after, wrapper.Suffix) {
					continue
				}
			}
			if wrapper.Prefix != "" {
				remaining := strings.TrimSuffix(before, wrapper.Prefix)
				if len(result) > 0 {
					if remaining == "" {
						result = result[:len(result)-1]
					} else {
						result[len(result)-1].Value = remaining
					}
				}
			}
			fallback := make([]intlPatternNode, 0, 3)
			if wrapper.Prefix != "" {
				fallback = append(fallback, intlPatternNode{Kind: "text", Value: wrapper.Prefix})
			}
			fallback = append(fallback, node)
			if wrapper.Suffix != "" {
				fallback = append(fallback, intlPatternNode{Kind: "text", Value: wrapper.Suffix})
			}
			binding := node.Binding
			build.bindings[binding].Kind = "selector"
			build.bindings[binding].Type = "number"
			result = append(result, intlPatternNode{
				Kind: "select", Binding: binding, Selection: "plural-ordinal",
				Cases: []intlPatternCase{}, Fallback: fallback,
			})
			if wrapper.Suffix != "" {
				remaining := strings.TrimPrefix(after, wrapper.Suffix)
				index++
				if remaining != "" {
					result = append(result, intlPatternNode{Kind: "text", Value: remaining})
				}
			}
			matched = true
			break
		}
		if !matched {
			result = append(result, node)
		}
	}
	return result
}

func buildIntlElement(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	child *ast.Node,
	build *intlPatternBuild,
) (intlPatternNode, bool) {
	element := child.AsJsxElement()
	tag := sourceText(sourceFile, element.OpeningElement.TagName())
	attributes := element.OpeningElement.Attributes()
	activationName, activation, activationSupported := intlNestedContentActivation(attributes)
	if !activationSupported || intlJSXAttribute(attributes, "message") != nil {
		return intlPatternNode{}, false
	}
	fragment := intlJSXAttribute(element.OpeningElement.Attributes(), "fragment")
	fragmentName := intlStaticAttributeString(fragment)
	if fragment != nil && (!validIntlFragmentName(fragmentName) || (tag != "_" && !jsxIntrinsic(tag))) {
		return intlPatternNode{}, false
	}
	metadata := intlActivationAttributeSpans(attributes, activationName)
	if fragment != nil {
		metadata = append(metadata, intlNodeSpan(fragment))
	}
	build.attributes = append(build.attributes, metadata...)
	contentStart, contentEnd := intlChildrenSpan(element.Children.Nodes, element.OpeningElement.End())
	elementStart := scanner.SkipTrivia(sourceFile.Text(), child.Pos())
	if fragment != nil && tag == "_" && activation == nil {
		binding := len(build.bindings)
		build.bindings = append(build.bindings, intlBinding{
			Index: binding, Kind: "opaque", Type: "opaque-structure", Name: fragmentName, ExactlyOnce: true,
		})
		build.structures = append(build.structures, intlStructureRegion{
			Element:    intlSpan{Start: elementStart, Length: child.End() - elementStart},
			Content:    intlSpan{Start: contentStart, Length: contentEnd - contentStart},
			Attributes: metadata, Opaque: true,
		})
		return intlPatternNode{Kind: "opaque", Binding: binding, Name: fragmentName}, true
	}
	if tag != "_" && !jsxIntrinsic(tag) {
		return intlPatternNode{}, false
	}
	nested, supported := buildIntlContribution(
		sourceFile, typeChecker, element.Children.Nodes, attributes, activationName, activation, build,
	)
	if !supported {
		return intlPatternNode{}, false
	}
	if tag == "_" {
		if len(nested) != 1 {
			return intlPatternNode{}, false
		}
		return nested[0], true
	}
	bindingName := tag
	if fragmentName != "" {
		bindingName = fragmentName
	}
	binding := len(build.bindings)
	build.bindings = append(build.bindings, intlBinding{
		Index: binding, Kind: "element", Type: "structure", Name: bindingName, ExactlyOnce: true,
	})
	build.structures = append(build.structures, intlStructureRegion{
		Element:    intlSpan{Start: elementStart, Length: child.End() - elementStart},
		Content:    intlSpan{Start: contentStart, Length: contentEnd - contentStart},
		Attributes: metadata,
	})
	return intlPatternNode{Kind: "element", Binding: binding, Nodes: nested}, true
}

// buildIntlContribution lowers one nested role into its enclosing message plan.
// A role with no activation is ordinary lexical message content.
func buildIntlContribution(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	children []*ast.Node,
	attributes *ast.Node,
	activationName string,
	activation *ast.Node,
	build *intlPatternBuild,
) ([]intlPatternNode, bool) {
	switch activationName {
	case "currency":
		return buildIntlCurrencyInto(
			sourceFile, children, attributes, activation, build.sourceLocale,
			build.currencyLabels, build.defaultCurrency, build,
		)
	case "unit", "cldr":
		return buildIntlUnitInto(
			sourceFile, children, attributes, activation, build.sourceLocale, build.unitLabels, build,
		)
	case "plural", "select":
		selector := intlActivationValueExpression(activation)
		if selector == nil || !intlScalarExpression(selector) {
			return nil, false
		}
		fallback, supported := buildIntlChildren(sourceFile, typeChecker, children, build)
		if !supported || len(fallback) == 0 {
			return nil, false
		}
		bindingType, selection := "string", "exact"
		if activationName == "plural" {
			bindingType, selection = "number", "plural-cardinal"
		}
		binding := registerIntlSelector(sourceFile, selector, bindingType, build)
		// An explicit role often surrounds the source-language conditional for
		// the same selector. Retain that decision once instead of exposing a
		// redundant selector nested inside an empty outer fallback.
		if len(fallback) == 1 && fallback[0].Kind == "select" &&
			fallback[0].Binding == binding && fallback[0].Selection == selection &&
			fallback[0].RangeBinding == nil {
			return fallback, true
		}
		return []intlPatternNode{{
			Kind: "select", Binding: binding, Selection: selection,
			Cases: []intlPatternCase{}, Fallback: fallback,
		}}, true
	default:
		return buildIntlChildren(sourceFile, typeChecker, children, build)
	}
}

// intlNestedContentActivation returns the one specialized role owned by a
// nested range. More than one role is ambiguous and therefore unsupported.
func intlNestedContentActivation(attributes *ast.Node) (string, *ast.Node, bool) {
	var name string
	var activation *ast.Node
	for _, candidate := range []string{"plural", "select", "currency", "unit", "cldr"} {
		if value := intlJSXAttribute(attributes, candidate); value != nil {
			if activation != nil {
				return "", nil, false
			}
			name, activation = candidate, value
		}
	}
	return name, activation, true
}

func intlActivationValueExpression(attribute *ast.Node) *ast.Node {
	if attribute == nil {
		return nil
	}
	initializer := attribute.AsJsxAttribute().Initializer
	if initializer == nil || !ast.IsJsxExpression(initializer) {
		return nil
	}
	expression := unwrapRenderExpression(initializer.AsJsxExpression().Expression)
	if expression == nil || !ast.IsObjectLiteralExpression(expression) {
		return expression
	}
	for _, property := range expression.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(property) && property.AsPropertyAssignment().Name().Text() == "value" {
			return unwrapRenderExpression(property.AsPropertyAssignment().Initializer)
		}
	}
	return nil
}

func intlNodeSpan(node *ast.Node) intlSpan {
	start := node.Pos()
	return intlSpan{Start: start, Length: node.End() - start}
}

func intlActivationAttributeSpans(attributes *ast.Node, activationName string) []intlSpan {
	names := []string{}
	switch activationName {
	case "currency":
		names = []string{"currency", "display"}
	case "unit", "cldr":
		names = []string{"unit", "cldr", "source-unit", "convert-to"}
	case "plural", "select":
		names = []string{activationName}
	}
	result := []intlSpan{}
	for _, name := range names {
		if attribute := intlJSXAttribute(attributes, name); attribute != nil {
			start := attribute.Pos()
			result = append(result, intlSpan{Start: start, Length: attribute.End() - start})
		}
	}
	return result
}

func validIntlFragmentName(name string) bool {
	matched, _ := regexp.MatchString(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`, name)
	return matched
}

func buildIntlExpression(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	expression *ast.Node,
	build *intlPatternBuild,
) ([]intlPatternNode, bool) {
	expression = unwrapRenderExpression(expression)
	if ast.IsStringLiteral(expression) || ast.IsNoSubstitutionTemplateLiteral(expression) {
		if expression.Text() == "" {
			return []intlPatternNode{}, true
		}
		return []intlPatternNode{{Kind: "text", Value: expression.Text()}}, true
	}
	if ast.IsTemplateExpression(expression) {
		template := expression.AsTemplateExpression()
		result := []intlPatternNode{}
		if template.Head.Text() != "" {
			result = append(result, intlPatternNode{Kind: "text", Value: template.Head.Text()})
		}
		for _, rawSpan := range template.TemplateSpans.Nodes {
			span := rawSpan.AsTemplateSpan()
			nested, supported := buildIntlExpression(sourceFile, typeChecker, span.Expression, build)
			if !supported {
				return nil, false
			}
			result = append(result, nested...)
			if span.Literal.Text() != "" {
				result = append(result, intlPatternNode{Kind: "text", Value: span.Literal.Text()})
			}
		}
		return result, true
	}
	if relative, supported := analyzeIntlRelativeDuration(sourceFile, expression); supported {
		recordIntlExpressionInference(sourceFile, expression, "relative-duration", "Relative duration projection inferred from authored branches", build)
		binding := registerIntlTypedScalar(sourceFile, relative.value, "temporal-duration", build)
		return []intlPatternNode{{
			Kind: "format", Bindings: []int{binding},
			Formatter: map[string]any{
				"kind": "relative-duration", "fields": relative.fields, "zero": relative.zero,
				"options": map[string]any{"numeric": "always"},
			},
		}}, true
	}
	if relative, supported := analyzeIntlLocalRelativeDuration(sourceFile, expression); supported {
		recordIntlExpressionInference(sourceFile, expression, "relative-duration", "Relative duration projection inferred from helper implementation", build)
		binding := registerIntlTypedScalar(sourceFile, relative.value, "temporal-duration", build)
		return []intlPatternNode{{
			Kind: "format", Bindings: []int{binding},
			Formatter: map[string]any{
				"kind": "relative-duration", "fields": relative.fields, "zero": relative.zero,
				"options": map[string]any{"numeric": "always"},
			},
		}}, true
	}
	if plural, supported := analyzeIntlPluralRuleLookup(typeChecker, expression); supported {
		recordIntlExpressionInference(sourceFile, expression, plural.selection, "Plural selection inferred from Intl.PluralRules", build)
		binding := registerIntlSelector(sourceFile, plural.selectors[0], "number", build)
		node := intlPatternNode{
			Kind: "select", Binding: binding, Selection: plural.selection,
			Cases: plural.cases, Fallback: plural.fallback,
		}
		if len(plural.selectors) == 2 {
			rangeBinding := registerIntlSelector(sourceFile, plural.selectors[1], "number", build)
			node.RangeBinding = &rangeBinding
		}
		return []intlPatternNode{node}, true
	}
	if ordinal, supported := analyzeIntlOrdinalMarker(sourceFile, expression, build.ordinalMarkers); supported {
		recordIntlExpressionInference(sourceFile, expression, "plural-ordinal", "Ordinal selection inferred from authored suffix branches", build)
		binding := registerIntlSelector(sourceFile, ordinal.selector, "number", build)
		return []intlPatternNode{{
			Kind: "select", Binding: binding, Selection: "plural-ordinal",
			Cases: ordinal.cases, Fallback: []intlPatternNode{{Kind: "text", Value: ordinal.fallback}},
		}}, true
	}
	if ast.IsConditionalExpression(expression) {
		conditional := expression.AsConditionalExpression()
		selection, supported := analyzeIntlSelection(sourceFile, typeChecker, conditional.Condition)
		if !supported {
			return nil, false
		}
		whenTrue, trueSupported := buildIntlExpression(sourceFile, typeChecker, conditional.WhenTrue, build)
		whenFalse, falseSupported := buildIntlExpression(sourceFile, typeChecker, conditional.WhenFalse, build)
		if !trueSupported || !falseSupported {
			return nil, false
		}
		recordIntlExpressionInference(sourceFile, conditional.Condition, selection.selection, "Selection inferred from authored fallback condition", build)
		binding := registerIntlSelector(sourceFile, selection.selector, selection.bindingType, build)
		return []intlPatternNode{{
			Kind: "select", Binding: binding, Selection: selection.selection,
			Cases: []intlPatternCase{{Key: selection.trueKey, Value: whenTrue}}, Fallback: whenFalse,
		}}, true
	}
	if value, unit, options, supported := analyzeIntlRelativeTime(expression); supported {
		recordIntlExpressionInference(sourceFile, expression, "relative-time", "Relative-time formatting inferred from Intl.RelativeTimeFormat", build)
		binding := registerIntlTypedScalar(sourceFile, value, "number", build)
		unitBinding := registerIntlTypedScalar(sourceFile, unit, "string", build)
		return []intlPatternNode{{
			Kind: "format", Bindings: []int{binding},
			Formatter: map[string]any{
				"kind": "relative-time", "unitBinding": unitBinding, "options": options,
			},
		}}, true
	}
	if values, bindingType, formatter, supported := analyzeNativeIntlFormatter(expression, typeChecker); supported {
		kind, _ := formatter["kind"].(string)
		recordIntlExpressionInference(sourceFile, expression, kind, "Formatting inferred from the native Intl expression", build)
		bindings := make([]int, 0, len(values))
		for _, value := range values {
			bindings = append(bindings, registerIntlTypedScalar(sourceFile, value, bindingType, build))
		}
		return []intlPatternNode{{Kind: "format", Bindings: bindings, Formatter: formatter}}, true
	}
	if intlTemporalExpressionKind(expression, typeChecker) == "temporal-duration" {
		recordIntlExpressionInference(sourceFile, expression, "duration", "Duration formatting inferred from the Temporal.Duration value", build)
		binding := registerIntlTypedScalar(sourceFile, expression, "temporal-duration", build)
		return []intlPatternNode{{
			Kind: "format", Bindings: []int{binding},
			Formatter: map[string]any{"kind": "duration", "options": map[string]any{}},
		}}, true
	}
	if !intlScalarExpression(expression) {
		return nil, false
	}
	binding := registerIntlScalar(sourceFile, expression, build)
	return []intlPatternNode{{Kind: "value", Binding: binding}}, true
}
