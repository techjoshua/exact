package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// An exact selector uses string keys, and plural selectors require actual numbers.
// A mixed or opaque operand retains its authored comparison as a Boolean binding.
func intlHomogeneousPrimitive(value *checker.Type, kind string) bool {
	if value == nil {
		return false
	}
	if value.IsUnion() {
		for _, member := range value.Types() {
			if !intlHomogeneousPrimitive(member, kind) {
				return false
			}
		}
		return len(value.Types()) != 0
	}
	flag := checker.TypeFlagsStringLike
	if kind == "number" {
		flag = checker.TypeFlagsNumberLike
	}
	if kind == "boolean" {
		flag = checker.TypeFlagsBooleanLike
	}
	return value.Flags()&flag != 0
}

// Locale and extra arguments are omitted from extracted formatters. Only inert source-locale
// arguments may cross that boundary. Other calls remain evaluated scalar values.
func intlInertLocaleArguments(arguments *ast.NodeList, typeChecker *checker.Checker) bool {
	if arguments == nil || len(arguments.Nodes) == 0 {
		return true
	}
	if len(arguments.Nodes) > 2 {
		return false
	}
	locale := unwrapRenderExpression(arguments.Nodes[0])
	return ast.IsStringLiteral(locale) || ast.IsNoSubstitutionTemplateLiteral(locale) ||
		(ast.IsIdentifier(locale) && typeChecker != nil && typeChecker.GetTypeAtLocation(locale).Flags()&checker.TypeFlagsUndefined != 0)
}

// Temporal type aliases resolve to the native declaration. Application types with matching
// names must remain ordinary values, without guessed formatting semantics.
func intlTemporalTypeKind(value *checker.Type) string {
	if value == nil || value.Symbol() == nil {
		return ""
	}
	symbol := value.Symbol()
	if len(symbol.Declarations) == 0 {
		return ""
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile || filepath.Base(source.FileName()) != "lib.esnext.temporal.d.ts" {
			return ""
		}
	}
	return map[string]string{
		"PlainDateTime": "temporal-date-time", "ZonedDateTime": "temporal-zoned-date-time",
		"PlainDate": "temporal-date", "PlainTime": "temporal-time",
		"Instant": "temporal-instant", "Duration": "temporal-duration",
	}[strings.TrimPrefix(symbol.Name, "Temporal.")]
}

// Ambient namespace augmentation can describe a newer native Intl API without replacing the
// global runtime namespace. A local namespace or value declaration does replace its identity.
func intlNativeNamespaceValue(node *ast.Node, typeChecker *checker.Checker) bool {
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return false
	}
	native := false
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile || !ast.IsModuleDeclaration(declaration) {
			return false
		}
		filename := filepath.Base(source.FileName())
		if strings.HasPrefix(filename, "lib.es") && strings.HasSuffix(filename, ".d.ts") {
			native = true
		}
	}
	return native
}
