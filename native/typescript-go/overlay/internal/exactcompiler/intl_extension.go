package exactcompiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
	"golang.org/x/text/language"
)

const intlAnalyzeNamespace = "@exactjs/intl/analyze-v1"

type intlAnalyzeOptions struct {
	Owner                 string                       `json:"owner"`
	SourceLocale          string                       `json:"sourceLocale"`
	UnitLabels            map[string]string            `json:"unitLabels,omitempty"`
	CurrencyLabels        map[string]intlCurrencyLabel `json:"currencyLabels,omitempty"`
	DefaultCurrencyLabels []string                     `json:"defaultCurrencyLabels,omitempty"`
	OrdinalMarkers        []string                     `json:"ordinalMarkers,omitempty"`
	OrdinalWrappers       []intlOrdinalWrapper         `json:"ordinalWrappers,omitempty"`
}

type intlCurrencyLabel struct {
	Currency string `json:"currency"`
	Display  string `json:"display"`
}

type intlOrdinalWrapper struct {
	Prefix string `json:"prefix"`
	Suffix string `json:"suffix"`
}

type intlAnalysis struct {
	Protocol                int              `json:"protocol"`
	Descriptors             []intlDescriptor `json:"descriptors"`
	DescriptorOwnerOrdinals []int            `json:"descriptorOwnerOrdinals"`
	Regions                 []intlRegion     `json:"regions"`
	Untranslated            []intlSpan       `json:"untranslated"`
	Diagnostics             []intlDiagnostic `json:"diagnostics"`
	ClientRequirements      []string         `json:"clientRequirements"`
}

type intlDescriptor struct {
	Protocol         int               `json:"protocol"`
	Owner            string            `json:"owner"`
	OwnerComponentID string            `json:"ownerComponentId"`
	OccurrenceID     string            `json:"occurrenceId"`
	SourceLocale     string            `json:"sourceLocale"`
	Target           intlTarget        `json:"target"`
	Bindings         []intlBinding     `json:"bindings"`
	Source           []intlPatternNode `json:"source"`
	Capabilities     []string          `json:"capabilities"`
	Name             string            `json:"name,omitempty"`
	SourceRange      intlSourceRange   `json:"sourceRange"`
}

type intlTarget struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
}

type intlBinding struct {
	Index       int    `json:"index"`
	Kind        string `json:"kind"`
	Type        string `json:"type"`
	Name        string `json:"name,omitempty"`
	ExactlyOnce bool   `json:"exactlyOnce,omitempty"`
}

type intlPatternNode struct {
	Kind         string            `json:"kind"`
	Value        any               `json:"value,omitempty"`
	Binding      int               `json:"binding,omitempty"`
	RangeBinding *int              `json:"rangeBinding,omitempty"`
	Name         string            `json:"name,omitempty"`
	Nodes        []intlPatternNode `json:"-"`
	Selection    string            `json:"selection,omitempty"`
	Cases        []intlPatternCase `json:"cases,omitempty"`
	Fallback     []intlPatternNode `json:"fallback,omitempty"`
	Bindings     []int             `json:"bindings,omitempty"`
	Formatter    map[string]any    `json:"formatter,omitempty"`
}

type intlPatternCase struct {
	Key   string            `json:"key"`
	Value []intlPatternNode `json:"value"`
}

func (node intlPatternNode) MarshalJSON() ([]byte, error) {
	switch node.Kind {
	case "text":
		return json.Marshal(struct {
			Kind  string `json:"kind"`
			Value any    `json:"value"`
		}{node.Kind, node.Value})
	case "value":
		return json.Marshal(struct {
			Kind    string `json:"kind"`
			Binding int    `json:"binding"`
		}{node.Kind, node.Binding})
	case "element":
		return json.Marshal(struct {
			Kind    string            `json:"kind"`
			Binding int               `json:"binding"`
			Value   []intlPatternNode `json:"value"`
		}{node.Kind, node.Binding, node.Nodes})
	case "opaque":
		return json.Marshal(struct {
			Kind    string `json:"kind"`
			Binding int    `json:"binding"`
			Name    string `json:"name"`
		}{node.Kind, node.Binding, node.Name})
	case "select":
		return json.Marshal(struct {
			Kind         string            `json:"kind"`
			Binding      int               `json:"binding"`
			RangeBinding *int              `json:"rangeBinding,omitempty"`
			Selection    string            `json:"selection"`
			Cases        []intlPatternCase `json:"cases"`
			Fallback     []intlPatternNode `json:"fallback"`
		}{node.Kind, node.Binding, node.RangeBinding, node.Selection, node.Cases, node.Fallback})
	case "format":
		return json.Marshal(struct {
			Kind      string         `json:"kind"`
			Bindings  []int          `json:"bindings"`
			Formatter map[string]any `json:"formatter"`
		}{node.Kind, node.Bindings, node.Formatter})
	}
	type alias intlPatternNode
	return json.Marshal(alias(node))
}

type intlSourceRange struct {
	File   string `json:"file"`
	Start  int    `json:"start"`
	Length int    `json:"length"`
}

type intlRegion struct {
	DescriptorIndex int                     `json:"descriptorIndex"`
	ActivationName  string                  `json:"activationName"`
	Explicit        bool                    `json:"explicit,omitempty"`
	Element         intlSpan                `json:"element"`
	Attribute       intlSpan                `json:"attribute"`
	Attributes      []intlSpan              `json:"attributes"`
	Transferred     []intlSpan              `json:"transferred,omitempty"`
	Content         intlSpan                `json:"content"`
	Values          []intlSpan              `json:"values"`
	Structures      []intlStructureRegion   `json:"structures"`
	Evidence        []intlInferenceEvidence `json:"evidence"`
}

type intlInferenceEvidence struct {
	Start  int    `json:"start"`
	Length int    `json:"length"`
	Kind   string `json:"kind"`
	Detail string `json:"detail"`
}

type intlStructureRegion struct {
	Element    intlSpan   `json:"element"`
	Content    intlSpan   `json:"content"`
	Attributes []intlSpan `json:"attributes,omitempty"`
	Opaque     bool       `json:"opaque,omitempty"`
}

type intlSpan struct {
	Start  int `json:"start"`
	Length int `json:"length"`
}

type intlDiagnostic struct {
	File    string `json:"file"`
	Start   int    `json:"start"`
	Length  int    `json:"length"`
	Message string `json:"message"`
}

type intlPatternBuild struct {
	bindings        []intlBinding
	values          []intlSpan
	structures      []intlStructureRegion
	attributes      []intlSpan
	evidence        []intlInferenceEvidence
	identities      map[string]int
	ordinalMarkers  map[string]struct{}
	ordinalWrappers []intlOrdinalWrapper
	sourceLocale    string
	unitLabels      map[string]string
	currencyLabels  map[string]intlCurrencyLabel
	defaultCurrency []string
}

func executeNativeExtension(
	request Request,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (any, error) {
	if request.Extension.Namespace != intlAnalyzeNamespace {
		return nil, fmt.Errorf("unsupported native extension namespace %q", request.Extension.Namespace)
	}
	return analyzeIntlSourceNative(request, sourceFile, typeChecker)
}

func analyzeIntlSourceNative(
	request Request,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (intlAnalysis, error) {
	options := intlAnalyzeOptions{}
	raw, err := json.Marshal(request.Extension.Payload)
	if err != nil {
		return intlAnalysis{}, fmt.Errorf("could not decode intl analyzer options: %w", err)
	}
	if err = json.Unmarshal(raw, &options); err != nil {
		return intlAnalysis{}, fmt.Errorf("could not decode intl analyzer options: %w", err)
	}
	if options.Owner == "" || options.SourceLocale == "" {
		return intlAnalysis{}, fmt.Errorf("intl analyzer requires owner and sourceLocale")
	}
	if len(options.UnitLabels) > 512 {
		return intlAnalysis{}, fmt.Errorf("intl analyzer source-locale unit profile is too large")
	}
	for label, unit := range options.UnitLabels {
		if strings.TrimSpace(label) == "" || len(label) > 128 || !intlSupportedUnit(unit) {
			return intlAnalysis{}, fmt.Errorf("intl analyzer source-locale unit profile is invalid")
		}
	}
	if len(options.CurrencyLabels) > 1024 {
		return intlAnalysis{}, fmt.Errorf("intl analyzer source-locale currency profile is too large")
	}
	for label, evidence := range options.CurrencyLabels {
		currencyCode, _ := regexp.MatchString(`^[A-Z]{3}$`, evidence.Currency)
		if strings.TrimSpace(label) == "" || len(label) > 256 || !currencyCode ||
			(evidence.Display != "symbol" && evidence.Display != "name") {
			return intlAnalysis{}, fmt.Errorf("intl analyzer source-locale currency profile is invalid")
		}
	}
	if len(options.DefaultCurrencyLabels) > 32 {
		return intlAnalysis{}, fmt.Errorf("intl analyzer source-language default-currency profile is too large")
	}
	for _, label := range options.DefaultCurrencyLabels {
		if strings.TrimSpace(label) == "" || len(label) > 64 {
			return intlAnalysis{}, fmt.Errorf("intl analyzer source-language default-currency profile is invalid")
		}
	}
	if len(options.OrdinalMarkers) > 64 {
		return intlAnalysis{}, fmt.Errorf("intl analyzer source-language ordinal profile is too large")
	}
	for _, marker := range options.OrdinalMarkers {
		if marker == "" || len(marker) > 128 {
			return intlAnalysis{}, fmt.Errorf("intl analyzer source-language ordinal profile is invalid")
		}
	}
	if len(options.OrdinalWrappers) > 32 {
		return intlAnalysis{}, fmt.Errorf("intl analyzer source-language ordinal-wrapper profile is too large")
	}
	for _, wrapper := range options.OrdinalWrappers {
		if (wrapper.Prefix == "" && wrapper.Suffix == "") || len(wrapper.Prefix) > 64 || len(wrapper.Suffix) > 64 {
			return intlAnalysis{}, fmt.Errorf("intl analyzer source-language ordinal-wrapper profile is invalid")
		}
	}
	components := collectComponents(sourceFile)
	assignComponentIDs(sourceFile, components, request.ID)
	result := intlAnalysis{
		Protocol:                1,
		Descriptors:             []intlDescriptor{},
		DescriptorOwnerOrdinals: []int{},
		Regions:                 []intlRegion{},
		Untranslated:            []intlSpan{},
		Diagnostics:             []intlDiagnostic{},
		ClientRequirements:      []string{},
	}
	localeDiagnosticSpans := map[string]struct{}{}
	occurrence := 0
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var opening *ast.Node
		var children []*ast.Node
		switch {
		case ast.IsJsxElement(node):
			element := node.AsJsxElement()
			opening, children = element.OpeningElement.AsNode(), element.Children.Nodes
		case ast.IsJsxSelfClosingElement(node):
			opening = node
		default:
			return true
		}
		tag := sourceText(sourceFile, opening.TagName())
		if activation := intlJSXAttribute(opening.Attributes(), "locale"); activation != nil {
			intlAppendLocaleActivationDiagnostic(&result, request.ID, sourceFile, activation)
		}
		if intlHasActivation(tag, opening.Attributes()) {
			intlAppendLocaleDiagnostics(
				&result, request.ID, sourceFile, typeChecker, node, options.SourceLocale, localeDiagnosticSpans,
			)
		}
		if intlExplicitComponent(tag) {
			if !ast.IsJsxElement(node) {
				return false
			}
			ownerOrdinal, ownerID := intlOwner(node, components)
			activationName := intlExplicitActivationName(tag, opening.Attributes())
			activation := intlJSXAttribute(opening.Attributes(), activationName)
			if activation == nil {
				activation = jsxAttribute(opening.Attributes(), "", activationName)
			}
			build := newIntlMessagePatternBuild(options)
			pattern, supported := buildIntlContribution(
				sourceFile, typeChecker, children, opening.Attributes(), activationName, activation, build,
			)
			if !supported || len(pattern) == 0 {
				result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
					File: request.ID, Start: scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
					Length:  node.End() - scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
					Message: fmt.Sprintf("%s contains an unsupported explicit intl message", tag),
				})
				return false
			}
			name := ""
			if nameAttribute := jsxAttribute(opening.Attributes(), "", "name"); nameAttribute != nil {
				name = intlStaticAttributeString(nameAttribute)
			}
			appendNativeIntlDescriptor(
				&result, request, options, sourceFile, node, activation, nil,
				ownerOrdinal, ownerID, occurrence, intlTarget{Kind: "content"}, pattern, build, name,
				activationName, true,
			)
			occurrence++
			return false
		}
		if !jsxIntrinsic(tag) && tag != "_" {
			for _, activation := range intlPropertyAttributes(opening.Attributes()) {
				name := activation.AsJsxAttribute().Name().AsJsxNamespacedName().Name().Text()
				result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
					File: request.ID, Start: scanner.SkipTrivia(sourceFile.Text(), activation.Pos()),
					Length:  activation.End() - scanner.SkipTrivia(sourceFile.Text(), activation.Pos()),
					Message: fmt.Sprintf("intl:%s is supported only on a direct intrinsic", name),
				})
			}
			return true
		}
		ownerOrdinal, ownerID := intlOwner(node, components)
		if !ast.IsJsxElement(node) {
			return true
		}
		messageActivation := intlJSXAttribute(opening.Attributes(), "message")
		activationName, specializedActivation, specializedSupported := intlNestedContentActivation(opening.Attributes())
		if !specializedSupported {
			result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
				File: request.ID, Start: scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
				Length:  node.End() - scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
				Message: "One content range cannot declare more than one intl selector or formatter role",
			})
			return false
		}
		if messageActivation == nil && specializedActivation == nil {
			return true
		}
		build := newIntlMessagePatternBuild(options)
		pattern, supported := buildIntlContribution(
			sourceFile, typeChecker, children, opening.Attributes(), activationName, specializedActivation, build,
		)
		if !supported || len(pattern) == 0 {
			failure := "This intl message contains structure or expressions not yet supported by the native protocol-1 analyzer"
			if activationName == "currency" {
				failure = "intl:currency requires one numeric value and a static or source-locale currency"
			} else if activationName == "unit" || activationName == "cldr" {
				failure = "intl:unit requires a supported semantic unit, one numeric value or range, and a recognizable source unit"
			} else if activationName == "plural" || activationName == "select" {
				failure = fmt.Sprintf("intl:%s requires a finite selector and supported lexical fallback", activationName)
			}
			result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
				File: request.ID, Start: scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
				Length:  node.End() - scanner.SkipTrivia(sourceFile.Text(), node.Pos()),
				Message: failure,
			})
			return false
		}
		primaryActivation := messageActivation
		if primaryActivation == nil {
			primaryActivation = specializedActivation
		}
		name := intlStaticAttributeString(messageActivation)
		if name == "" && specializedActivation != nil {
			name = intlStaticObjectName(specializedActivation)
		}
		appendNativeIntlDescriptor(
			&result, request, options, sourceFile, node, primaryActivation, nil,
			ownerOrdinal, ownerID, occurrence, intlTarget{Kind: "content"},
			pattern, build, name,
			"", false,
		)
		occurrence++
		return false
	})
	_ = appendNativeIntlPropertyDescriptors(
		&result, request, options, sourceFile, typeChecker, components, occurrence,
	)
	sort.Slice(result.Regions, func(left, right int) bool {
		return result.Regions[left].Attribute.Start < result.Regions[right].Attribute.Start
	})
	result.Untranslated = intlUntranslatedSpans(sourceFile, result)
	result.ClientRequirements = intlClientRequirements(sourceFile, result.Descriptors)
	return result, nil
}

func appendNativeIntlPropertyDescriptors(
	result *intlAnalysis,
	request Request,
	options intlAnalyzeOptions,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	occurrence int,
) int {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		opening, intrinsic := intlIntrinsicOpening(node, sourceFile)
		if !intrinsic {
			return true
		}
		ownerOrdinal, ownerID := intlOwner(node, components)
		for _, activation := range intlPropertyAttributes(opening.Attributes()) {
			name := activation.AsJsxAttribute().Name().AsJsxNamespacedName().Name().Text()
			fallback := jsxAttribute(opening.Attributes(), "", name)
			pattern, build, supported := buildIntlProperty(
				sourceFile, typeChecker, fallback, activation,
				options.OrdinalMarkers, options.OrdinalWrappers,
			)
			if !supported {
				start := scanner.SkipTrivia(sourceFile.Text(), activation.Pos())
				result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
					File: request.ID, Start: start, Length: activation.End() - start,
					Message: fmt.Sprintf("intl:%s requires a supported authored %s fallback on the same intrinsic", name, name),
				})
				continue
			}
			appendNativeIntlDescriptor(
				result, request, options, sourceFile, node, activation, fallback,
				ownerOrdinal, ownerID, occurrence, intlTarget{Kind: "property", Name: name},
				pattern, build, intlPropertyDescriptorName(node, sourceFile, activation, name),
				"", false,
			)
			occurrence++
		}
		return true
	})
	return occurrence
}

// intlUntranslatedSpans finds authored linguistic JSX text and supported intrinsic
// property fallbacks that are neither owned by descriptors nor explicitly excluded
// through HTML's inherited translate="no" contract.
func intlUntranslatedSpans(sourceFile *ast.SourceFile, analysis intlAnalysis) []intlSpan {
	result := []intlSpan{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsJsxText(node) && !intlTextCovered(node, analysis) && !intlTranslationDisabled(node) {
			raw := sourceText(sourceFile, node)
			trimmed := strings.TrimSpace(raw)
			if trimmed != "" && strings.ContainsFunc(trimmed, unicode.IsLetter) {
				leading := strings.Index(raw, trimmed)
				result = append(result, intlSpan{Start: node.Pos() + leading, Length: len(trimmed)})
			}
			return true
		}
		opening, intrinsic := intlIntrinsicOpening(node, sourceFile)
		if !intrinsic || intlTranslationDisabled(node) {
			return true
		}
		names := make([]string, 0, len(intlPropertyNames))
		for name := range intlPropertyNames {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			fallback := jsxAttribute(opening.Attributes(), "", name)
			if fallback == nil || intlJSXAttribute(opening.Attributes(), name) != nil {
				continue
			}
			initializer := fallback.AsJsxAttribute().Initializer
			if initializer == nil {
				continue
			}
			if ast.IsStringLiteral(initializer) {
				value := initializer.AsStringLiteral().Text
				if value != "" && strings.ContainsFunc(value, unicode.IsLetter) {
					result = append(result, intlSpan{Start: initializer.Pos() + 1, Length: len(value)})
				}
				continue
			}
			if ast.IsJsxExpression(initializer) && initializer.AsJsxExpression().Expression != nil {
				expression := initializer.AsJsxExpression().Expression
				start := scanner.SkipTrivia(sourceFile.Text(), expression.Pos())
				result = append(result, intlSpan{Start: start, Length: expression.End() - start})
			}
		}
		return true
	})
	return result
}

func intlIntrinsicOpening(node *ast.Node, sourceFile *ast.SourceFile) (*ast.Node, bool) {
	var opening *ast.Node
	switch {
	case ast.IsJsxElement(node):
		opening = node.AsJsxElement().OpeningElement.AsNode()
	case ast.IsJsxSelfClosingElement(node):
		opening = node
	default:
		return nil, false
	}
	return opening, jsxIntrinsic(sourceText(sourceFile, opening.TagName()))
}

func intlTextCovered(node *ast.Node, analysis intlAnalysis) bool {
	for _, region := range analysis.Regions {
		if region.DescriptorIndex < 0 || region.DescriptorIndex >= len(analysis.Descriptors) ||
			analysis.Descriptors[region.DescriptorIndex].Target.Kind != "content" {
			continue
		}
		if node.Pos() >= region.Element.Start && node.End() <= region.Element.Start+region.Element.Length {
			return true
		}
	}
	return false
}

func intlTranslationDisabled(node *ast.Node) bool {
	for current := node; current != nil; current = current.Parent {
		var attributes *ast.Node
		switch {
		case ast.IsJsxElement(current):
			attributes = current.AsJsxElement().OpeningElement.Attributes()
		case ast.IsJsxSelfClosingElement(current):
			attributes = current.Attributes()
		default:
			continue
		}
		attribute := jsxAttribute(attributes, "", "translate")
		if attribute == nil {
			continue
		}
		initializer := attribute.AsJsxAttribute().Initializer
		if initializer == nil {
			return false
		}
		if !ast.IsStringLiteral(initializer) {
			continue
		}
		switch strings.ToLower(initializer.AsStringLiteral().Text) {
		case "no":
			return true
		case "", "yes":
			return false
		}
	}
	return false
}

func intlAppendLocaleActivationDiagnostic(
	result *intlAnalysis,
	file string,
	sourceFile *ast.SourceFile,
	attribute *ast.Node,
) {
	initializer := attribute.AsJsxAttribute().Initializer
	if initializer == nil {
		return
	}
	if ast.IsJsxExpression(initializer) {
		initializer = unwrapRenderExpression(initializer.AsJsxExpression().Expression)
	}
	if initializer == nil || (!ast.IsStringLiteral(initializer) && !ast.IsNoSubstitutionTemplateLiteral(initializer)) {
		return
	}
	if _, err := language.Parse(initializer.Text()); err == nil {
		return
	}
	start := scanner.SkipTrivia(sourceFile.Text(), initializer.Pos())
	result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
		File: file, Start: start, Length: initializer.End() - start,
		Message: fmt.Sprintf("intl:locale value %q is not a valid BCP 47 locale", initializer.Text()),
	})
}

func intlHasActivation(tag string, attributes *ast.Node) bool {
	if intlExplicitComponent(tag) {
		return true
	}
	if attributes == nil {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) || !ast.IsJsxNamespacedName(property.AsJsxAttribute().Name()) {
			continue
		}
		if property.AsJsxAttribute().Name().AsJsxNamespacedName().Namespace.Text() == "intl" {
			return true
		}
	}
	return false
}

func intlAppendLocaleDiagnostics(
	result *intlAnalysis,
	file string,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	root *ast.Node,
	sourceLocale string,
	seen map[string]struct{},
) {
	walkNode(root, func(node *ast.Node) bool {
		var constructor string
		var arguments *ast.NodeList
		if name, values, valid := intlConstructor(node); valid && intlLocaleConstructor(name) {
			constructor, arguments = "Intl."+name, values
		} else if ast.IsCallExpression(node) {
			call := node.AsCallExpression()
			if ast.IsPropertyAccessExpression(call.Expression) {
				member := call.Expression.AsPropertyAccessExpression()
				if member.Name().Text() == "toLocaleString" {
					constructor, arguments = "toLocaleString", call.Arguments
				} else if member.Name().Text() == "select" || member.Name().Text() == "selectRange" {
					rules := intlConstInitializer(typeChecker, member.Expression)
					if name, values, valid := intlConstructor(rules); valid && name == "PluralRules" {
						constructor, arguments = "Intl.PluralRules", values
					}
				}
			}
		}
		if constructor == "" || arguments == nil || len(arguments.Nodes) == 0 {
			return true
		}
		locale := unwrapRenderExpression(arguments.Nodes[0])
		if !ast.IsStringLiteral(locale) && !ast.IsNoSubstitutionTemplateLiteral(locale) {
			return true
		}
		if intlLocalesAgree(sourceLocale, locale.Text()) {
			return true
		}
		start := scanner.SkipTrivia(sourceFile.Text(), locale.Pos())
		key := fmt.Sprintf("%d:%d", start, locale.End())
		if _, duplicate := seen[key]; duplicate {
			return true
		}
		seen[key] = struct{}{}
		result.Diagnostics = append(result.Diagnostics, intlDiagnostic{
			File: file, Start: start, Length: locale.End() - start,
			Message: fmt.Sprintf(
				"%s locale %q conflicts with the configured intl source locale %q",
				constructor, locale.Text(), sourceLocale,
			),
		})
		return true
	})
}

func intlLocaleConstructor(name string) bool {
	switch name {
	case "PluralRules", "NumberFormat", "DateTimeFormat", "RelativeTimeFormat", "DisplayNames", "ListFormat", "DurationFormat":
		return true
	default:
		return false
	}
}

func intlLocalesAgree(sourceLocale string, authoredLocale string) bool {
	source, sourceErr := language.Parse(sourceLocale)
	authored, authoredErr := language.Parse(authoredLocale)
	if sourceErr != nil || authoredErr != nil {
		return false
	}
	sourceBase, sourceScript, sourceRegion := source.Raw()
	authoredBase, authoredScript, authoredRegion := authored.Raw()
	if sourceBase != authoredBase {
		return false
	}
	if authoredScript.String() != "Zzzz" && sourceScript.String() != "Zzzz" && authoredScript != sourceScript {
		return false
	}
	return authoredRegion.String() == "ZZ" || sourceRegion.String() == "ZZ" || authoredRegion == sourceRegion
}

func intlClientRequirements(sourceFile *ast.SourceFile, descriptors []intlDescriptor) []string {
	requirements := map[string]struct{}{}
	for _, descriptor := range descriptors {
		for _, capability := range descriptor.Capabilities {
			if capability == "duration" {
				requirements["intl-duration-format"] = struct{}{}
			}
		}
	}
	if len(descriptors) > 0 && regexp.MustCompile(`\bTemporal\s*\.`).MatchString(sourceFile.Text()) {
		requirements["temporal"] = struct{}{}
	}
	result := make([]string, 0, len(requirements))
	for requirement := range requirements {
		result = append(result, requirement)
	}
	sort.Strings(result)
	return result
}
