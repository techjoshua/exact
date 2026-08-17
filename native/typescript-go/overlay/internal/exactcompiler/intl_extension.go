package exactcompiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
	"golang.org/x/text/currency"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
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

func buildIntlCurrencyInto(
	sourceFile *ast.SourceFile,
	children []*ast.Node,
	attributes *ast.Node,
	activation *ast.Node,
	sourceLocale string,
	currencyLabels map[string]intlCurrencyLabel,
	defaultCurrencyLabels []string,
	build *intlPatternBuild,
) ([]intlPatternNode, bool) {
	expressions, text := intlDirectChildren(sourceFile, children)
	if len(expressions) != 1 || !intlScalarExpression(expressions[0]) {
		return nil, false
	}
	authoredCurrency := intlStaticAttributeString(activation)
	if authoredCurrency == "" {
		authoredCurrency = intlStaticObjectString(activation, "currency")
	}
	inferredCurrency, inferredDisplay, label := intlCurrencyEvidence(
		text, sourceLocale, currencyLabels, defaultCurrencyLabels,
	)
	if authoredCurrency != "" && inferredCurrency != "" && authoredCurrency != inferredCurrency {
		return nil, false
	}
	currency := authoredCurrency
	if currency == "" {
		currency = inferredCurrency
	}
	if currency == "" {
		currency = intlDefaultCurrency(sourceLocale)
	}
	if matched, _ := regexp.MatchString(`^[A-Z]{3}$`, currency); !matched {
		return nil, false
	}
	explicitDisplay := intlStaticNamedAttribute(attributes, "display")
	if explicitDisplay == "" {
		explicitDisplay = intlStaticObjectString(activation, "display")
	}
	if explicitDisplay != "" && inferredDisplay != "" && explicitDisplay != inferredDisplay {
		return nil, false
	}
	display := explicitDisplay
	if display == "" {
		display = inferredDisplay
	}
	if display == "" {
		display = "symbol"
	}
	if authoredCurrency == "" && label != "" {
		recordIntlTextInference(sourceFile, children, label, "currency", fmt.Sprintf("%s currency with %s display inferred from authored fallback", currency, display), build)
	}
	binding := registerIntlTypedScalar(sourceFile, expressions[0], "monetary", build)
	return []intlPatternNode{{
		Kind: "format", Bindings: []int{binding},
		Formatter: map[string]any{
			"kind": "currency", "currency": currency, "display": display, "options": map[string]any{},
		},
	}}, true
}

func buildIntlUnitInto(
	sourceFile *ast.SourceFile,
	children []*ast.Node,
	attributes *ast.Node,
	activation *ast.Node,
	sourceLocale string,
	unitLabels map[string]string,
	build *intlPatternBuild,
) ([]intlPatternNode, bool) {
	semantic := intlStaticAttributeString(activation)
	if semantic == "" {
		semantic = intlStaticObjectString(activation, "unit")
	}
	quantity, usage, semanticSupported := intlSemanticUnit(semantic)
	if !semanticSupported {
		return nil, false
	}
	expressions, text := intlDirectChildren(sourceFile, children)
	if len(expressions) < 1 || len(expressions) > 2 {
		return nil, false
	}
	for _, expression := range expressions {
		if !intlScalarExpression(expression) {
			return nil, false
		}
	}
	if len(expressions) == 2 && !strings.ContainsAny(text, "-–—") {
		return nil, false
	}
	inferredSourceUnit, label := intlSourceUnitFromFallback(text, unitLabels)
	explicitSourceUnit := intlStaticNamedAttribute(attributes, "source-unit")
	if explicitSourceUnit == "" {
		explicitSourceUnit = intlStaticObjectString(activation, "sourceUnit")
	}
	if explicitSourceUnit != "" && inferredSourceUnit != "" && explicitSourceUnit != inferredSourceUnit {
		return nil, false
	}
	sourceUnit := explicitSourceUnit
	if sourceUnit == "" {
		sourceUnit = inferredSourceUnit
	}
	if sourceUnit == "" {
		sourceUnit = intlDefaultSemanticUnit(quantity, usage, sourceLocale)
	}
	if sourceUnit == "" {
		return nil, false
	}
	if explicitSourceUnit == "" && inferredSourceUnit != "" && label != "" {
		recordIntlTextInference(sourceFile, children, label, "unit", fmt.Sprintf("%s source unit inferred from authored fallback", sourceUnit), build)
	}
	convertTo := intlStaticNamedAttribute(attributes, "convert-to")
	if convertTo == "" {
		convertTo = intlStaticObjectString(activation, "convertTo")
	}
	if convertTo != "" && !intlCompatibleUnit(quantity, convertTo) {
		return nil, false
	}
	bindings := make([]int, 0, len(expressions))
	for _, expression := range expressions {
		bindings = append(bindings, registerIntlTypedScalar(sourceFile, expression, "measurement", build))
	}
	options := map[string]any{"unitDisplay": "long"}
	if utf8.RuneCountInString(label) <= 2 {
		options["unitDisplay"] = "short"
	}
	formatter := map[string]any{
		"kind": "unit", "quantity": quantity, "usage": usage,
		"sourceUnit": sourceUnit, "options": options,
	}
	if convertTo != "" {
		formatter["convertTo"] = convertTo
	}
	return []intlPatternNode{{Kind: "format", Bindings: bindings, Formatter: formatter}}, true
}

func intlDirectChildren(sourceFile *ast.SourceFile, children []*ast.Node) ([]*ast.Node, string) {
	expressions := []*ast.Node{}
	text := []string{}
	semantic := ast.GetSemanticJsxChildren(children)
	for _, child := range semantic {
		if ast.IsJsxExpression(child) && child.AsJsxExpression().Expression != nil {
			expressions = append(expressions, unwrapRenderExpression(child.AsJsxExpression().Expression))
		} else if ast.IsJsxText(child) {
			text = append(text, child.AsJsxText().Text)
		}
	}
	return expressions, strings.TrimSpace(normalizeIntlJSXText(strings.Join(text, " ")))
}

func intlStaticNamedAttribute(attributes *ast.Node, name string) string {
	attribute := intlJSXAttribute(attributes, name)
	if attribute == nil {
		explicitName := name
		if name == "source-unit" {
			explicitName = "sourceUnit"
		} else if name == "convert-to" {
			explicitName = "convertTo"
		}
		attribute = jsxAttribute(attributes, "", explicitName)
	}
	if attribute == nil {
		return ""
	}
	return intlStaticAttributeString(attribute)
}

func intlLocaleRegion(locale string) string {
	tag, err := language.Parse(locale)
	if err != nil {
		return ""
	}
	region, confidence := tag.Region()
	if confidence == language.No {
		return ""
	}
	return region.String()
}

func intlDefaultCurrency(locale string) string {
	tag, err := language.Parse(locale)
	if err != nil {
		return ""
	}
	unit, confidence := currency.FromTag(tag)
	if confidence == language.No {
		return ""
	}
	return unit.String()
}

func intlCurrencyEvidence(
	text string,
	locale string,
	localized map[string]intlCurrencyLabel,
	defaultLabels []string,
) (string, string, string) {
	code := regexp.MustCompile(`\b[A-Z]{3}\b`).FindString(text)
	if code != "" {
		return code, "code", code
	}
	if evidence, label, matched := intlLocalizedCurrencyEvidence(text, localized); matched {
		return evidence.Currency, evidence.Display, label
	}
	defaults := make(map[string]intlCurrencyLabel, len(defaultLabels))
	for _, label := range defaultLabels {
		defaults[label] = intlCurrencyLabel{Currency: intlDefaultCurrency(locale), Display: "symbol"}
	}
	if evidence, label, matched := intlLocalizedCurrencyEvidence(text, defaults); matched {
		return evidence.Currency, evidence.Display, label
	}
	return "", "", ""
}

func intlLocalizedCurrencyEvidence(
	text string,
	localized map[string]intlCurrencyLabel,
) (intlCurrencyLabel, string, bool) {
	input := strings.ToLower(norm.NFKC.String(text))
	matchedLabel := ""
	matched := intlCurrencyLabel{}
	for label, evidence := range localized {
		candidate := strings.ToLower(norm.NFKC.String(strings.TrimSpace(label)))
		if candidate == "" || len(candidate) <= len(matchedLabel) {
			continue
		}
		for offset := 0; offset <= len(input)-len(candidate); {
			index := strings.Index(input[offset:], candidate)
			if index < 0 {
				break
			}
			start := offset + index
			end := start + len(candidate)
			first, _ := utf8.DecodeRuneInString(candidate)
			last, _ := utf8.DecodeLastRuneInString(candidate)
			beforeValid := start == 0
			if !beforeValid {
				before, _ := utf8.DecodeLastRuneInString(input[:start])
				beforeValid = (!unicode.IsLetter(first) && !unicode.IsNumber(first)) ||
					(!unicode.IsLetter(before) && !unicode.IsNumber(before))
			}
			afterValid := end == len(input)
			if !afterValid {
				after, _ := utf8.DecodeRuneInString(input[end:])
				afterValid = (!unicode.IsLetter(last) && !unicode.IsNumber(last)) ||
					(!unicode.IsLetter(after) && !unicode.IsNumber(after))
			}
			if beforeValid && afterValid {
				matchedLabel, matched = candidate, evidence
				break
			}
			offset = start + len(candidate)
		}
	}
	return matched, matchedLabel, matchedLabel != ""
}

func intlSourceUnitFromFallback(text string, localized map[string]string) (string, string) {
	input := norm.NFKC.String(strings.TrimSpace(text))
	matchedLabel := ""
	matchedUnit := ""
	match := func(label string, unit string) {
		candidate := norm.NFKC.String(strings.TrimSpace(label))
		haystack := input
		if !strings.ContainsFunc(candidate, unicode.IsUpper) {
			candidate = strings.ToLower(candidate)
			haystack = strings.ToLower(haystack)
		}
		if candidate == "" || len(candidate) <= len(matchedLabel) || !strings.HasSuffix(haystack, candidate) {
			return
		}
		prefix := strings.TrimSuffix(haystack, candidate)
		if prefix != "" {
			boundary, _ := utf8.DecodeLastRuneInString(prefix)
			if unicode.IsLetter(boundary) || unicode.IsNumber(boundary) {
				return
			}
		}
		matchedLabel, matchedUnit = candidate, unit
	}
	for label, unit := range localized {
		match(label, unit)
	}
	return matchedUnit, matchedLabel
}

func intlSemanticUnit(value string) (string, string, bool) {
	switch value {
	case "distance-road", "length/road":
		return "length", "road", true
	case "length-person-height", "length/person-height":
		return "length", "person-height", true
	case "temperature-weather", "temperature/weather":
		return "temperature", "weather", true
	case "area-land", "area/land":
		return "area", "land", true
	case "area-floor", "area/floor":
		return "area", "floor", true
	case "mass-person", "mass/person":
		return "mass", "person", true
	case "volume-liquid", "volume/liquid":
		return "volume", "liquid", true
	case "speed-road", "speed/road":
		return "speed", "road", true
	case "pressure-weather", "pressure/weather":
		return "pressure", "weather", true
	case "energy-food", "energy/food":
		return "energy", "food", true
	case "energy-electricity", "energy/electricity":
		return "energy", "electricity", true
	case "power-engine", "power/engine":
		return "power", "engine", true
	case "fuel-economy-road", "fuel-economy/road":
		return "fuel-economy", "road", true
	case "digital-storage", "digital/storage":
		return "digital", "storage", true
	case "area", "mass", "volume", "speed", "pressure", "energy", "power", "fuel-economy", "digital":
		return value, "default", true
	default:
		return "", "", false
	}
}

func intlDefaultSemanticUnit(quantity string, usage string, locale string) string {
	region := intlLocaleRegion(locale)
	if quantity == "length" && usage == "road" {
		if region == "US" || region == "GB" {
			return "mile"
		}
		return "kilometer"
	}
	if quantity == "length" && usage == "person-height" {
		if region == "US" {
			return "inch"
		}
		return "centimeter"
	}
	if quantity == "temperature" {
		if region == "US" {
			return "fahrenheit"
		}
		return "celsius"
	}
	if quantity == "area" {
		if usage == "land" && region == "US" {
			return "acre"
		}
		if usage == "land" {
			return "hectare"
		}
		if region == "US" {
			return "square-foot"
		}
		return "square-meter"
	}
	if quantity == "mass" {
		if usage == "person" && region == "US" {
			return "pound"
		}
		if usage == "person" && region == "GB" {
			return "stone"
		}
		return "kilogram"
	}
	if quantity == "volume" {
		if usage == "liquid" && region == "US" {
			return "gallon"
		}
		return "liter"
	}
	if quantity == "speed" {
		if usage == "road" && (region == "US" || region == "GB") {
			return "mile-per-hour"
		}
		return "kilometer-per-hour"
	}
	if quantity == "pressure" {
		if usage == "weather" && region == "US" {
			return "inch-of-mercury"
		}
		return "hectopascal"
	}
	if quantity == "energy" {
		if usage == "food" && region == "US" {
			return "kilocalorie"
		}
		if usage == "electricity" {
			return "kilowatt-hour"
		}
		return "kilojoule"
	}
	if quantity == "power" {
		if usage == "engine" && (region == "US" || region == "GB") {
			return "horsepower"
		}
		return "kilowatt"
	}
	if quantity == "fuel-economy" {
		if region == "US" {
			return "mile-per-gallon"
		}
		if region == "GB" {
			return "mile-per-gallon-imperial"
		}
		return "liter-per-100-kilometer"
	}
	if quantity == "digital" {
		return "gigabyte"
	}
	return ""
}

var intlUnitDimensions = map[string]string{
	"meter": "length", "kilometer": "length", "centimeter": "length", "millimeter": "length", "mile": "length", "mile-scandinavian": "length", "yard": "length", "foot": "length", "inch": "length",
	"square-meter": "area", "square-kilometer": "area", "square-centimeter": "area", "square-mile": "area", "square-yard": "area", "square-foot": "area", "square-inch": "area", "acre": "area", "hectare": "area",
	"gram": "mass", "kilogram": "mass", "milligram": "mass", "metric-ton": "mass", "ounce": "mass", "pound": "mass", "stone": "mass", "ton": "mass",
	"liter": "volume", "milliliter": "volume", "centiliter": "volume", "cubic-meter": "volume", "gallon": "volume", "gallon-imperial": "volume", "fluid-ounce": "volume", "fluid-ounce-imperial": "volume", "quart": "volume", "pint": "volume", "cup": "volume",
	"meter-per-second": "speed", "kilometer-per-hour": "speed", "mile-per-hour": "speed", "knot": "speed",
	"pascal": "pressure", "hectopascal": "pressure", "kilopascal": "pressure", "megapascal": "pressure", "bar": "pressure", "millibar": "pressure", "pound-force-per-square-inch": "pressure", "inch-of-mercury": "pressure", "millimeter-of-mercury": "pressure",
	"joule": "energy", "kilojoule": "energy", "megajoule": "energy", "calorie": "energy", "kilocalorie": "energy", "watt-hour": "energy", "kilowatt-hour": "energy",
	"watt": "power", "kilowatt": "power", "megawatt": "power", "horsepower": "power",
	"liter-per-100-kilometer": "fuel-economy", "liter-per-kilometer": "fuel-economy", "mile-per-gallon": "fuel-economy", "mile-per-gallon-imperial": "fuel-economy",
	"bit": "digital", "byte": "digital", "kilobit": "digital", "kilobyte": "digital", "megabit": "digital", "megabyte": "digital", "gigabit": "digital", "gigabyte": "digital", "terabit": "digital", "terabyte": "digital", "petabyte": "digital",
	"celsius": "temperature", "fahrenheit": "temperature", "kelvin": "temperature",
}

func intlSupportedUnit(unit string) bool { _, supported := intlUnitDimensions[unit]; return supported }

func intlCompatibleUnit(quantity string, unit string) bool {
	return intlUnitDimensions[unit] == quantity
}

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
	if target.Kind == "content" {
		if contentAttributes := intlContentAttributeSpans(opening.Attributes()); len(contentAttributes) > 0 {
			attributes = offsetIntlSpans(contentAttributes, positionDelta)
		}
		attributes = append(attributes, offsetIntlSpans(build.attributes, positionDelta)...)
	}
	result.Regions = append(result.Regions, intlRegion{
		DescriptorIndex: descriptorIndex,
		ActivationName:  activationName,
		Explicit:        explicit,
		Element:         intlSpan{Start: elementStart, Length: element.End() - parsedElementStart},
		Attribute:       intlSpan{Start: attributeStart, Length: attributeLength},
		Attributes:      attributes,
		Content:         intlSpan{Start: contentStart + positionDelta, Length: contentEnd - contentStart},
		Values:          offsetIntlSpans(build.values, positionDelta), Structures: offsetIntlStructures(build.structures, positionDelta),
		Evidence: offsetIntlEvidence(build.evidence, positionDelta),
	})
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

type intlRelativeDurationProjection struct {
	value  *ast.Node
	fields []string
	zero   string
}

var intlRelativeDurationFields = map[string]struct{}{
	"years": {}, "months": {}, "weeks": {}, "days": {},
	"hours": {}, "minutes": {}, "seconds": {},
}

func analyzeIntlRelativeDuration(sourceFile *ast.SourceFile, expression *ast.Node) (intlRelativeDurationProjection, bool) {
	current := unwrapRenderExpression(expression)
	var duration *ast.Node
	fields := []string{}
	seen := map[string]struct{}{}
	for ast.IsConditionalExpression(current) {
		conditional := current.AsConditionalExpression()
		value, field, valid := intlRelativeDurationCondition(conditional.Condition)
		if !valid || !intlSafeRelativeDurationBranch(sourceFile, conditional.WhenTrue, value, field) {
			return intlRelativeDurationProjection{}, false
		}
		if duration != nil && strings.TrimSpace(sourceText(sourceFile, duration)) != strings.TrimSpace(sourceText(sourceFile, value)) {
			return intlRelativeDurationProjection{}, false
		}
		if _, duplicate := seen[field]; duplicate {
			return intlRelativeDurationProjection{}, false
		}
		duration = value
		fields = append(fields, field)
		seen[field] = struct{}{}
		current = unwrapRenderExpression(conditional.WhenFalse)
	}
	zero, valid := intlStringLeaf(current)
	if duration == nil || len(fields) < 2 || !valid {
		return intlRelativeDurationProjection{}, false
	}
	return intlRelativeDurationProjection{value: duration, fields: fields, zero: zero}, true
}

func analyzeIntlLocalRelativeDuration(sourceFile *ast.SourceFile, expression *ast.Node) (intlRelativeDurationProjection, bool) {
	if !ast.IsCallExpression(expression) {
		return intlRelativeDurationProjection{}, false
	}
	call := expression.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsIdentifier(call.Expression) {
		return intlRelativeDurationProjection{}, false
	}
	var declaration *ast.Node
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if declaration != nil {
			return false
		}
		if ast.IsFunctionDeclaration(node) && node.Name() != nil && node.Name().Text() == call.Expression.Text() {
			declaration = node
			return false
		}
		return true
	})
	if declaration == nil || declaration.Body() == nil || len(declaration.Parameters()) != 1 {
		return intlRelativeDurationProjection{}, false
	}
	parameter := declaration.Parameters()[0].Name()
	if !ast.IsIdentifier(parameter) {
		return intlRelativeDurationProjection{}, false
	}
	body := sourceText(sourceFile, declaration.Body())
	if !strings.Contains(body, ".find(") || !strings.Contains(body, "Intl.RelativeTimeFormat") || !strings.Contains(body, ".format(") {
		return intlRelativeDurationProjection{}, false
	}
	fieldPattern := regexp.MustCompile(regexp.QuoteMeta(parameter.Text()) + `\s*\.\s*(years|months|weeks|days|hours|minutes|seconds)\s*,\s*unit\s*:\s*['\"](year|month|week|day|hour|minute|second)['\"]`)
	matches := fieldPattern.FindAllStringSubmatch(body, -1)
	fields := []string{}
	seen := map[string]struct{}{}
	for _, match := range matches {
		if len(match) != 3 || strings.TrimSuffix(match[1], "s") != match[2] {
			return intlRelativeDurationProjection{}, false
		}
		if _, duplicate := seen[match[1]]; duplicate {
			return intlRelativeDurationProjection{}, false
		}
		fields = append(fields, match[1])
		seen[match[1]] = struct{}{}
	}
	if len(fields) < 2 {
		return intlRelativeDurationProjection{}, false
	}
	zeroPattern := regexp.MustCompile(`return\s+['\"]([^'\"]+)['\"]\s*;`)
	zeroMatch := zeroPattern.FindStringSubmatch(body)
	if len(zeroMatch) != 2 {
		return intlRelativeDurationProjection{}, false
	}
	return intlRelativeDurationProjection{value: call.Arguments.Nodes[0], fields: fields, zero: zeroMatch[1]}, true
}

func intlRelativeDurationCondition(expression *ast.Node) (*ast.Node, string, bool) {
	condition := unwrapRenderExpression(expression)
	if !ast.IsBinaryExpression(condition) {
		return nil, "", false
	}
	binary := condition.AsBinaryExpression()
	if binary.OperatorToken.Kind != ast.KindGreaterThanToken {
		return nil, "", false
	}
	value, _, literal := intlFiniteLiteral(nil, binary.Right)
	if !literal || value != "0" {
		return nil, "", false
	}
	access, valid := intlMathAbsProperty(binary.Left)
	if !valid {
		return nil, "", false
	}
	field := access.AsPropertyAccessExpression().Name().Text()
	if _, supported := intlRelativeDurationFields[field]; !supported {
		return nil, "", false
	}
	return access.AsPropertyAccessExpression().Expression, field, true
}

func intlMathAbsProperty(expression *ast.Node) (*ast.Node, bool) {
	value := unwrapRenderExpression(expression)
	if !ast.IsCallExpression(value) {
		return nil, false
	}
	call := value.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(operation.Expression) || operation.Expression.Text() != "Math" || operation.Name().Text() != "abs" {
		return nil, false
	}
	argument := unwrapRenderExpression(call.Arguments.Nodes[0])
	return argument, ast.IsPropertyAccessExpression(argument)
}

func intlSafeRelativeDurationBranch(sourceFile *ast.SourceFile, expression *ast.Node, value *ast.Node, field string) bool {
	expected := strings.TrimSpace(sourceText(sourceFile, value)) + "." + field
	safe := true
	walkNode(expression, func(node *ast.Node) bool {
		if !safe || !ast.IsCallExpression(node) {
			return safe
		}
		access, valid := intlMathAbsProperty(node)
		if !valid || strings.TrimSpace(sourceText(sourceFile, access)) != expected {
			safe = false
			return false
		}
		return true
	})
	return safe && strings.Contains(sourceText(sourceFile, expression), expected)
}

type intlOrdinalProjection struct {
	selector *ast.Node
	cases    []intlPatternCase
	fallback string
}

type intlPluralRuleProjection struct {
	selectors []*ast.Node
	selection string
	cases     []intlPatternCase
	fallback  []intlPatternNode
}

func analyzeIntlPluralRuleLookup(
	typeChecker *checker.Checker,
	expression *ast.Node,
) (intlPluralRuleProjection, bool) {
	if !ast.IsElementAccessExpression(expression) {
		return intlPluralRuleProjection{}, false
	}
	access := expression.AsElementAccessExpression()
	choices := intlConstInitializer(typeChecker, access.Expression)
	if choices == nil {
		choices = unwrapRenderExpression(access.Expression)
	}
	options, valid := intlObjectOptions(choices)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	selectors, selection, valid := intlPluralRulesSelect(typeChecker, access.ArgumentExpression)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	fallbackValue, valid := options["other"].(string)
	if !valid {
		return intlPluralRuleProjection{}, false
	}
	cases := []intlPatternCase{}
	for _, category := range []string{"zero", "one", "two", "few", "many"} {
		if value, exists := options[category]; exists {
			text, valid := value.(string)
			if !valid {
				return intlPluralRuleProjection{}, false
			}
			cases = append(cases, intlPatternCase{
				Key: category, Value: []intlPatternNode{{Kind: "text", Value: text}},
			})
		}
	}
	for name := range options {
		if name != "zero" && name != "one" && name != "two" && name != "few" && name != "many" && name != "other" {
			return intlPluralRuleProjection{}, false
		}
	}
	return intlPluralRuleProjection{
		selectors: selectors, selection: selection, cases: cases,
		fallback: []intlPatternNode{{Kind: "text", Value: fallbackValue}},
	}, true
}

func intlPluralRulesSelect(
	typeChecker *checker.Checker,
	expression *ast.Node,
) ([]*ast.Node, string, bool) {
	if !ast.IsCallExpression(expression) {
		return nil, "", false
	}
	call := expression.AsCallExpression()
	if call.Arguments == nil || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, "", false
	}
	member := call.Expression.AsPropertyAccessExpression()
	method := member.Name().Text()
	expectedArguments := 1
	if method == "selectRange" {
		expectedArguments = 2
	} else if method != "select" {
		return nil, "", false
	}
	if len(call.Arguments.Nodes) != expectedArguments {
		return nil, "", false
	}
	rules := intlConstInitializer(typeChecker, member.Expression)
	if rules == nil {
		rules = unwrapRenderExpression(member.Expression)
	}
	constructor, arguments, valid := intlConstructor(rules)
	if !valid || constructor != "PluralRules" || arguments == nil || len(arguments.Nodes) < 1 || len(arguments.Nodes) > 2 {
		return nil, "", false
	}
	locale := unwrapRenderExpression(arguments.Nodes[0])
	if !ast.IsStringLiteral(locale) && !ast.IsNoSubstitutionTemplateLiteral(locale) {
		return nil, "", false
	}
	options, valid := intlObjectOptions(intlArgument(arguments, 1))
	if !valid {
		return nil, "", false
	}
	selection := "plural-cardinal"
	for name, value := range options {
		if name != "type" {
			return nil, "", false
		}
		kind, valid := value.(string)
		if !valid || (kind != "cardinal" && kind != "ordinal") {
			return nil, "", false
		}
		if kind == "ordinal" {
			selection = "plural-ordinal"
		}
	}
	if method == "selectRange" {
		if selection == "plural-ordinal" {
			selection = "plural-range-ordinal"
		} else {
			selection = "plural-range-cardinal"
		}
	}
	selectors := make([]*ast.Node, 0, expectedArguments)
	for _, argument := range call.Arguments.Nodes {
		selector := unwrapRenderExpression(argument)
		if !intlScalarExpression(selector) {
			return nil, "", false
		}
		selectors = append(selectors, selector)
	}
	return selectors, selection, true
}

func intlConstInitializer(typeChecker *checker.Checker, expression *ast.Node) *ast.Node {
	expression = unwrapRenderExpression(expression)
	if !ast.IsIdentifier(expression) {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil || len(symbol.Declarations) != 1 || !ast.IsVariableDeclaration(symbol.Declarations[0]) {
		return nil
	}
	declaration := symbol.Declarations[0]
	if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	return unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
}

func analyzeIntlOrdinalMarker(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	ordinalMarkers map[string]struct{},
) (intlOrdinalProjection, bool) {
	current := unwrapRenderExpression(expression)
	var selector *ast.Node
	cases := []intlPatternCase{}
	suffixes := []string{}
	for ast.IsConditionalExpression(current) {
		conditional := current.AsConditionalExpression()
		condition := unwrapRenderExpression(conditional.Condition)
		if !ast.IsBinaryExpression(condition) {
			return intlOrdinalProjection{}, false
		}
		binary := condition.AsBinaryExpression()
		if binary.OperatorToken.Kind != ast.KindEqualsEqualsEqualsToken && binary.OperatorToken.Kind != ast.KindEqualsEqualsToken {
			return intlOrdinalProjection{}, false
		}
		left, _, leftLiteral := intlFiniteLiteral(sourceFile, binary.Left)
		right, _, rightLiteral := intlFiniteLiteral(sourceFile, binary.Right)
		candidate, value := binary.Left, right
		if leftLiteral {
			candidate, value = binary.Right, left
		} else if !rightLiteral {
			return intlOrdinalProjection{}, false
		}
		if _, err := strconv.Atoi(value); err != nil || !intlScalarExpression(candidate) {
			return intlOrdinalProjection{}, false
		}
		suffix, valid := intlStringLeaf(conditional.WhenTrue)
		if !valid {
			return intlOrdinalProjection{}, false
		}
		if selector != nil && strings.TrimSpace(sourceText(sourceFile, selector)) != strings.TrimSpace(sourceText(sourceFile, candidate)) {
			return intlOrdinalProjection{}, false
		}
		selector = candidate
		suffixes = append(suffixes, suffix)
		cases = append(cases, intlPatternCase{Key: "=" + value, Value: []intlPatternNode{{Kind: "text", Value: suffix}}})
		current = unwrapRenderExpression(conditional.WhenFalse)
	}
	fallback, valid := intlStringLeaf(current)
	if selector == nil || len(cases) < 2 || !valid {
		return intlOrdinalProjection{}, false
	}
	suffixes = append(suffixes, fallback)
	for _, suffix := range suffixes {
		if _, supported := ordinalMarkers[suffix]; !supported {
			return intlOrdinalProjection{}, false
		}
	}
	return intlOrdinalProjection{selector: selector, cases: cases, fallback: fallback}, true
}

func intlStringLeaf(expression *ast.Node) (string, bool) {
	value := unwrapRenderExpression(expression)
	if ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value) {
		return value.Text(), true
	}
	return "", false
}

func analyzeIntlRelativeTime(expression *ast.Node) (*ast.Node, *ast.Node, map[string]any, bool) {
	if !ast.IsCallExpression(expression) {
		return nil, nil, nil, false
	}
	call := expression.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) != 2 || !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, nil, nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if operation.Name().Text() != "format" {
		return nil, nil, nil, false
	}
	constructorName, constructorArguments, supported := intlConstructor(operation.Expression)
	if !supported || constructorName != "RelativeTimeFormat" {
		return nil, nil, nil, false
	}
	options, valid := intlObjectOptions(intlArgument(constructorArguments, 1))
	if !valid {
		return nil, nil, nil, false
	}
	return call.Arguments.Nodes[0], call.Arguments.Nodes[1], options, true
}

func analyzeNativeIntlFormatter(expression *ast.Node, typeChecker *checker.Checker) ([]*ast.Node, string, map[string]any, bool) {
	if !ast.IsCallExpression(expression) {
		return nil, "", nil, false
	}
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return nil, "", nil, false
	}
	operation := call.Expression.AsPropertyAccessExpression()
	method := operation.Name().Text()
	if method == "toLocaleString" || method == "toLocaleDateString" || method == "toLocaleTimeString" {
		temporalKind := intlTemporalExpressionKind(operation.Expression, typeChecker)
		typeName := ""
		if typeChecker != nil {
			typeName = typeChecker.TypeToString(typeChecker.GetTypeAtLocation(operation.Expression))
		}
		if method == "toLocaleString" && temporalKind == "temporal-duration" {
			options, valid := intlObjectOptions(intlArgument(call.Arguments, 1))
			if !valid {
				return nil, "", nil, false
			}
			return []*ast.Node{operation.Expression}, temporalKind, map[string]any{
				"kind": "duration", "options": options,
			}, true
		}
		if (temporalKind != "" && temporalKind != "temporal-duration") || typeName == "Date" {
			options, valid := intlObjectOptions(intlArgument(call.Arguments, 1))
			if !valid {
				return nil, "", nil, false
			}
			if typeName == "Date" && len(options) == 0 {
				options = map[string]any{"year": "numeric", "month": "numeric", "day": "numeric"}
				if method != "toLocaleDateString" {
					options["hour"], options["minute"], options["second"] = "numeric", "numeric", "numeric"
				}
				if method == "toLocaleTimeString" {
					delete(options, "year")
					delete(options, "month")
					delete(options, "day")
				}
			}
			if typeName == "Date" {
				temporalKind = "temporal-instant"
			}
			return []*ast.Node{operation.Expression}, temporalKind, map[string]any{
				"kind": "date-time", "temporalKind": temporalKind, "options": options,
			}, true
		}
	}
	if method == "of" && call.Arguments != nil && len(call.Arguments.Nodes) == 1 {
		constructorName, constructorArguments, supported := intlConstructor(operation.Expression)
		if supported && constructorName == "DisplayNames" {
			options, valid := intlObjectOptions(intlArgument(constructorArguments, 1))
			domain, domainValid := options["type"].(string)
			if valid && domainValid {
				return call.Arguments.Nodes, "string", map[string]any{
					"kind": "display-name", "domain": domain,
					"options": intlWithoutOptions(options, "type"),
				}, true
			}
		}
	}
	if method != "format" && method != "formatRange" {
		return nil, "", nil, false
	}
	rangeFormat := method == "formatRange"
	expectedArguments := 1
	if rangeFormat {
		expectedArguments = 2
	}
	if call.Arguments == nil || len(call.Arguments.Nodes) != expectedArguments {
		return nil, "", nil, false
	}
	constructorName, constructorArguments, supported := intlConstructor(operation.Expression)
	if !supported {
		return nil, "", nil, false
	}
	options, optionsSupported := intlObjectOptions(intlArgument(constructorArguments, 1))
	if !optionsSupported {
		return nil, "", nil, false
	}
	values := append([]*ast.Node(nil), call.Arguments.Nodes...)
	switch constructorName {
	case "DateTimeFormat":
		formatter := map[string]any{
			"kind": "date-time", "temporalKind": "temporal-date-time", "options": options,
		}
		if rangeFormat {
			formatter["range"] = true
		}
		return values, "temporal-date-time", formatter, true
	case "DurationFormat":
		if rangeFormat {
			return nil, "", nil, false
		}
		return values, "temporal-duration", map[string]any{
			"kind": "duration", "options": options,
		}, true
	case "NumberFormat":
		style, _ := options["style"].(string)
		if style == "currency" {
			currency, valid := options["currency"].(string)
			if !valid {
				return nil, "", nil, false
			}
			display, _ := options["currencyDisplay"].(string)
			if display == "" {
				display = "symbol"
			}
			projected := intlWithoutOptions(options, "style", "currency", "currencyDisplay")
			return values, "monetary", map[string]any{
				"kind": "currency", "currency": currency, "display": display, "options": projected,
			}, true
		}
		if style == "unit" {
			unit, valid := options["unit"].(string)
			if !valid {
				return nil, "", nil, false
			}
			return values, "measurement", map[string]any{
				"kind": "unit", "quantity": intlUnitQuantity(unit), "usage": "default",
				"sourceUnit": unit, "options": intlWithoutOptions(options, "style", "unit"),
			}, true
		}
		return values, "number", map[string]any{
			"kind": "number", "options": options,
		}, true
	case "ListFormat":
		return values, "string", map[string]any{"kind": "list", "options": options}, true
	}
	return nil, "", nil, false
}

func intlTemporalExpressionKind(expression *ast.Node, typeChecker *checker.Checker) string {
	if expression == nil || typeChecker == nil {
		return ""
	}
	display := typeChecker.TypeToString(typeChecker.GetTypeAtLocation(expression))
	kinds := []struct {
		name string
		kind string
	}{
		{"PlainDateTime", "temporal-date-time"},
		{"ZonedDateTime", "temporal-zoned-date-time"},
		{"PlainDate", "temporal-date"},
		{"PlainTime", "temporal-time"},
		{"Instant", "temporal-instant"},
		{"Duration", "temporal-duration"},
	}
	for _, candidate := range kinds {
		if display == candidate.name || display == "Temporal."+candidate.name || strings.HasSuffix(display, "."+candidate.name) {
			return candidate.kind
		}
	}
	return ""
}

func intlConstructor(expression *ast.Node) (string, *ast.NodeList, bool) {
	var target *ast.Node
	var arguments *ast.NodeList
	switch {
	case ast.IsCallExpression(expression):
		call := expression.AsCallExpression()
		target, arguments = call.Expression, call.Arguments
	case ast.IsNewExpression(expression):
		constructor := expression.AsNewExpression()
		target, arguments = constructor.Expression, constructor.Arguments
	default:
		return "", nil, false
	}
	if !ast.IsPropertyAccessExpression(target) {
		return "", nil, false
	}
	member := target.AsPropertyAccessExpression()
	if !ast.IsIdentifier(member.Expression) || member.Expression.Text() != "Intl" {
		return "", nil, false
	}
	return member.Name().Text(), arguments, true
}

func intlArgument(arguments *ast.NodeList, index int) *ast.Node {
	if arguments == nil || index < 0 || index >= len(arguments.Nodes) {
		return nil
	}
	return arguments.Nodes[index]
}

func intlObjectOptions(node *ast.Node) (map[string]any, bool) {
	if node == nil {
		return map[string]any{}, true
	}
	if !ast.IsObjectLiteralExpression(node) {
		return nil, false
	}
	result := map[string]any{}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) {
			return nil, false
		}
		assignment := property.AsPropertyAssignment()
		name := assignment.Name().Text()
		value := unwrapRenderExpression(assignment.Initializer)
		switch {
		case ast.IsStringLiteral(value) || ast.IsNoSubstitutionTemplateLiteral(value):
			result[name] = value.Text()
		case ast.IsNumericLiteral(value):
			number, err := strconv.ParseFloat(value.Text(), 64)
			if err != nil {
				return nil, false
			}
			result[name] = number
		case value.Kind == ast.KindTrueKeyword:
			result[name] = true
		case value.Kind == ast.KindFalseKeyword:
			result[name] = false
		default:
			return nil, false
		}
	}
	return result, true
}

func intlWithoutOptions(input map[string]any, names ...string) map[string]any {
	removed := map[string]struct{}{}
	for _, name := range names {
		removed[name] = struct{}{}
	}
	result := map[string]any{}
	for name, value := range input {
		if _, skip := removed[name]; !skip {
			result[name] = value
		}
	}
	return result
}

func intlUnitQuantity(unit string) string {
	if quantity := intlUnitDimensions[unit]; quantity != "" {
		return quantity
	}
	return "unit"
}

type intlSelection struct {
	selector    *ast.Node
	bindingType string
	selection   string
	trueKey     string
}

func analyzeIntlSelection(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	condition *ast.Node,
) (intlSelection, bool) {
	condition = unwrapRenderExpression(condition)
	if ast.IsBinaryExpression(condition) {
		binary := condition.AsBinaryExpression()
		if binary.OperatorToken.Kind == ast.KindEqualsEqualsEqualsToken ||
			binary.OperatorToken.Kind == ast.KindEqualsEqualsToken {
			leftValue, leftType, leftLiteral := intlFiniteLiteral(sourceFile, binary.Left)
			rightValue, rightType, rightLiteral := intlFiniteLiteral(sourceFile, binary.Right)
			selector, literal, bindingType := binary.Left, rightValue, rightType
			if leftLiteral {
				selector, literal, bindingType = binary.Right, leftValue, leftType
			} else if !rightLiteral {
				selector = nil
			}
			if selector != nil && intlScalarExpression(selector) {
				selection, trueKey := "exact", literal
				if bindingType == "number" && literal == "1" {
					selection, trueKey = "plural-cardinal", "=1"
				}
				return intlSelection{selector, bindingType, selection, trueKey}, true
			}
		}
	}
	if intlScalarExpression(condition) && !ast.IsStringLiteral(condition) && !ast.IsNumericLiteral(condition) {
		return intlSelection{condition, "boolean", "boolean", "true"}, true
	}
	if typeChecker != nil &&
		typeChecker.GetTypeAtLocation(condition).Flags()&checker.TypeFlagsBooleanLike != 0 &&
		safeReactiveInitializer(condition, sourceFile, typeChecker) {
		return intlSelection{condition, "boolean", "boolean", "true"}, true
	}
	return intlSelection{}, false
}

func intlFiniteLiteral(sourceFile *ast.SourceFile, expression *ast.Node) (string, string, bool) {
	expression = unwrapRenderExpression(expression)
	switch {
	case ast.IsStringLiteral(expression) || ast.IsNoSubstitutionTemplateLiteral(expression):
		return expression.Text(), "string", true
	case ast.IsNumericLiteral(expression):
		value, err := strconv.ParseFloat(expression.Text(), 64)
		if err != nil {
			return "", "", false
		}
		return strconv.FormatFloat(value, 'f', -1, 64), "number", true
	case expression.Kind == ast.KindTrueKeyword:
		return "true", "boolean", true
	case expression.Kind == ast.KindFalseKeyword:
		return "false", "boolean", true
	default:
		return "", "", false
	}
}

func registerIntlScalar(sourceFile *ast.SourceFile, expression *ast.Node, build *intlPatternBuild) int {
	identity := strings.TrimSpace(sourceText(sourceFile, expression))
	if binding, found := build.identities[identity]; found {
		return binding
	}
	binding := len(build.bindings)
	bindingType := "string"
	if ast.IsNumericLiteral(expression) {
		bindingType = "number"
	}
	start := scanner.SkipTrivia(sourceFile.Text(), expression.Pos())
	build.bindings = append(build.bindings, intlBinding{Index: binding, Kind: "value", Type: bindingType})
	build.values = append(build.values, intlSpan{Start: start, Length: expression.End() - start})
	build.identities[identity] = binding
	return binding
}

func registerIntlSelector(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	bindingType string,
	build *intlPatternBuild,
) int {
	binding := registerIntlScalar(sourceFile, expression, build)
	build.bindings[binding].Kind = "selector"
	build.bindings[binding].Type = bindingType
	return binding
}

func registerIntlTypedScalar(
	sourceFile *ast.SourceFile,
	expression *ast.Node,
	bindingType string,
	build *intlPatternBuild,
) int {
	binding := registerIntlScalar(sourceFile, expression, build)
	build.bindings[binding].Type = bindingType
	return binding
}

func intlScalarExpression(expression *ast.Node) bool {
	return ast.IsIdentifier(expression) || ast.IsPropertyAccessExpression(expression) ||
		ast.IsElementAccessExpression(expression) || ast.IsStringLiteral(expression) ||
		ast.IsNumericLiteral(expression)
}

func intlOwner(node *ast.Node, components []Component) (int, string) {
	owner := -1
	ownerLength := int(^uint(0) >> 1)
	ownerID := ""
	for index, component := range components {
		end := component.Start + component.Length
		if component.Start <= node.Pos() && end >= node.End() && component.Length < ownerLength {
			owner, ownerLength, ownerID = index, component.Length, component.ID
		}
	}
	return owner, ownerID
}

func intlChildrenSpan(children []*ast.Node, fallback int) (int, int) {
	if len(children) == 0 {
		return fallback, fallback
	}
	start := children[0].Pos()
	end := children[len(children)-1].End()
	return start, end
}

func normalizeIntlJSXText(value string) string {
	return normalizeJSXText(value)
}
