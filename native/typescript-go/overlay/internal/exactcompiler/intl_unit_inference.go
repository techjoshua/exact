package exactcompiler

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"golang.org/x/text/currency"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

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
