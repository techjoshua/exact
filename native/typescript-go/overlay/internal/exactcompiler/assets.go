package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

type assetAnalysis struct {
	dependencies           []AssetDependency
	placementBySpecifier   map[string]string
	clientSideEffectStarts map[int]struct{}
	omitStatementStarts    map[string]map[int]struct{}
	diagnostics            []Diagnostic
}

var nativeDefaultAssetRules = []AssetRule{{
	Extensions:     []string{".css", ".less", ".scss"},
	Kind:           "style",
	DeliveryTarget: "client",
}}

func analyzeAssets(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	request Request,
) assetAnalysis {
	result := assetAnalysis{
		dependencies:           []AssetDependency{},
		placementBySpecifier:   make(map[string]string),
		clientSideEffectStarts: make(map[int]struct{}),
		omitStatementStarts: map[string]map[int]struct{}{
			"client": {},
			"server": {},
		},
		diagnostics: []Diagnostic{},
	}
	bindingPlacements := make(map[ast.SymbolId]string)
	placedBindingNames := make(map[string]struct{})
	rules := append(append([]AssetRule(nil), request.AssetRules...), nativeDefaultAssetRules...)
	seenAssets := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !ast.IsStringLiteral(declaration.ModuleSpecifier) {
			continue
		}
		specifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		placement, placementDiagnostics := exactImportPlacement(
			sourceFile,
			statement,
			declaration,
		)
		result.diagnostics = append(result.diagnostics, placementDiagnostics...)
		if placement != "" {
			if prior := result.placementBySpecifier[specifier]; prior != "" && prior != placement {
				result.diagnostics = append(result.diagnostics, Diagnostic{
					Severity: "error",
					Code:     "EXACT5004",
					Message: fmt.Sprintf(
						"error: import %q has conflicting exact placement attributes",
						specifier,
					),
					Start:  statement.Pos(),
					Length: statement.End() - statement.Pos(),
				})
			} else {
				result.placementBySpecifier[specifier] = placement
			}
			collectPlacedImportSymbols(
				declaration,
				placement,
				typeChecker,
				bindingPlacements,
				placedBindingNames,
			)
		}
		rule, matched := matchingNativeAssetRule(specifier, rules)
		if !matched {
			continue
		}
		sideEffect := declaration.ImportClause == nil
		importMode := rule.ImportMode
		if importMode == "" {
			if sideEffect {
				importMode = "side-effect"
			} else {
				importMode = "module"
			}
		}
		evaluationTarget := placement
		if evaluationTarget == "" {
			evaluationTarget = rule.EvaluationTarget
		}
		if evaluationTarget == "" {
			if importMode == "worker" || sideEffect {
				evaluationTarget = "client"
			} else {
				evaluationTarget = "both"
			}
		}
		deliveryTarget := rule.DeliveryTarget
		if deliveryTarget == "" {
			if importMode == "raw" || importMode == "inline" {
				deliveryTarget = "embedded"
			} else {
				deliveryTarget = "client"
			}
		}
		dependency := AssetDependency{
			Specifier:        specifier,
			Kind:             rule.Kind,
			ImportMode:       importMode,
			EvaluationTarget: evaluationTarget,
			DeliveryTarget:   deliveryTarget,
		}
		key := fmt.Sprintf("%+v", dependency)
		if _, exists := seenAssets[key]; !exists {
			seenAssets[key] = struct{}{}
			result.dependencies = append(result.dependencies, dependency)
		}
		if sideEffect && evaluationTarget == "client" {
			result.clientSideEffectStarts[statement.Pos()] = struct{}{}
		}
		if placement == "" && evaluationTarget != "both" {
			result.placementBySpecifier[specifier] = evaluationTarget
		}
	}
	if len(bindingPlacements) == 0 {
		return result
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsImportDeclaration(statement) {
			continue
		}
		walkNode(statement, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
				isStaticPropertyName(node) {
				return true
			}
			if _, relevant := placedBindingNames[node.Text()]; !relevant {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(node)
			if symbol == nil {
				return true
			}
			placement := bindingPlacements[ast.GetSymbolId(symbol)]
			if placement == "" {
				return true
			}
			opposite := "client"
			if placement == "client" {
				opposite = "server"
			}
			result.omitStatementStarts[opposite][statement.Pos()] = struct{}{}
			return true
		})
	}
	return result
}

func collectPlacedImportSymbols(
	declaration *ast.ImportDeclaration,
	placement string,
	typeChecker *checker.Checker,
	result map[ast.SymbolId]string,
	relevantNames map[string]struct{},
) {
	if declaration.ImportClause == nil {
		return
	}
	clause := declaration.ImportClause.AsImportClause()
	names := []*ast.Node{}
	if clause.Name() != nil {
		names = append(names, clause.Name())
	}
	if clause.NamedBindings != nil {
		if ast.IsNamespaceImport(clause.NamedBindings) {
			names = append(names, clause.NamedBindings.AsNamespaceImport().Name())
		} else {
			for _, specifier := range clause.NamedBindings.AsNamedImports().Elements.Nodes {
				names = append(names, specifier.Name())
			}
		}
	}
	for _, name := range names {
		relevantNames[name.Text()] = struct{}{}
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			result[ast.GetSymbolId(symbol)] = placement
		}
	}
}

func exactImportPlacement(
	sourceFile *ast.SourceFile,
	statement *ast.Node,
	declaration *ast.ImportDeclaration,
) (string, []Diagnostic) {
	if declaration.Attributes == nil {
		return "", nil
	}
	matches := []*ast.Node{}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		if attribute.AsImportAttribute().Name().Text() == "exact" {
			matches = append(matches, attribute)
		}
	}
	if len(matches) == 0 {
		return "", nil
	}
	line, column := sourceLocation(sourceFile, statement.Pos())
	prefix := fmt.Sprintf("%s:%d:%d", sourceFile.FileName(), line, column)
	diagnostics := []Diagnostic{}
	add := func(code string, message string) {
		diagnostics = append(diagnostics, Diagnostic{
			Severity: "error",
			Code:     code,
			Message:  "error: " + prefix + " " + message,
			Start:    statement.Pos(),
			Length:   statement.End() - statement.Pos(),
		})
	}
	if len(matches) > 1 {
		add("EXACT5001", "import has duplicate exact attributes")
	}
	if declaration.ImportClause != nil &&
		declaration.ImportClause.AsImportClause().PhaseModifier == ast.KindTypeKeyword {
		add("EXACT5002", "type-only import cannot declare exact placement")
	}
	value := matches[0].AsImportAttribute().Value
	if value == nil || !ast.IsStringLiteral(value) {
		add("EXACT5003", `exact import attribute must be "client" or "server"`)
		return "", diagnostics
	}
	placement := value.AsStringLiteral().Text
	if placement != "client" && placement != "server" {
		add("EXACT5003", `exact import attribute must be "client" or "server"`)
		return "", diagnostics
	}
	return placement, diagnostics
}

func matchingNativeAssetRule(specifier string, rules []AssetRule) (AssetRule, bool) {
	parts := strings.SplitN(specifier, "?", 2)
	clean := strings.ToLower(strings.SplitN(parts[0], "#", 2)[0])
	queryTokens := make(map[string]struct{})
	if len(parts) > 1 {
		for _, value := range strings.Split(parts[1], "&") {
			token := strings.ToLower(strings.SplitN(value, "=", 2)[0])
			if token != "" {
				queryTokens[token] = struct{}{}
			}
		}
	}
	for _, rule := range rules {
		extensionMatch := len(rule.Extensions) == 0
		for _, extension := range rule.Extensions {
			normalized := strings.ToLower(extension)
			if !strings.HasPrefix(normalized, ".") {
				normalized = "." + normalized
			}
			extensionMatch = extensionMatch || strings.HasSuffix(clean, normalized)
		}
		queryMatch := len(rule.Queries) == 0
		for _, query := range rule.Queries {
			_, exists := queryTokens[strings.TrimPrefix(strings.ToLower(query), "?")]
			queryMatch = queryMatch || exists
		}
		if extensionMatch && queryMatch {
			return rule, true
		}
	}
	return AssetRule{}, false
}

func stripExactImportAttribute(
	declaration *ast.ImportDeclaration,
	factory *printer.NodeFactory,
) *ast.Node {
	if declaration.Attributes == nil {
		return declaration.AsNode()
	}
	attributes := declaration.Attributes.AsImportAttributes()
	retained := make([]*ast.Node, 0, len(attributes.Attributes.Nodes))
	for _, attribute := range attributes.Attributes.Nodes {
		if attribute.AsImportAttribute().Name().Text() != "exact" {
			retained = append(retained, attribute)
		}
	}
	if len(retained) == len(attributes.Attributes.Nodes) {
		return declaration.AsNode()
	}
	var updatedAttributes *ast.Node
	if len(retained) != 0 {
		updatedAttributes = factory.UpdateImportAttributes(
			attributes,
			attributes.Token,
			factory.NewNodeList(retained),
			attributes.MultiLine,
		)
	}
	return factory.UpdateImportDeclaration(
		declaration,
		declaration.Modifiers(),
		declaration.ImportClause,
		declaration.ModuleSpecifier,
		updatedAttributes,
	)
}
