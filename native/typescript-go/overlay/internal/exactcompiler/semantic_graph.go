package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// collectSemanticGraph projects checker-owned binder identities into a
// process-safe graph. IDs deliberately use the declared request filename so
// manifests never expose a compiler-host working directory.
func collectSemanticGraph(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	filename string,
) SemanticGraph {
	portableFilename := strings.ToLower(strings.ReplaceAll(filename, "\\", "/"))
	moduleScopeID := portableFilename + ":scope:module"
	scopeIDs := map[*ast.Node]string{sourceFile.AsNode(): moduleScopeID}
	scopes := []SemanticScope{{
		ID:       moduleScopeID,
		Kind:     "module",
		NodeKind: semanticNodeKind(sourceFile.AsNode()),
	}}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if node == sourceFile.AsNode() ||
			(!ast.IsFunctionLikeDeclaration(node) && !ast.IsBlock(node)) {
			return true
		}
		kind := "block"
		if ast.IsFunctionLikeDeclaration(node) {
			kind = "function"
		}
		id := fmt.Sprintf("%s:scope:%d", portableFilename, node.Pos())
		scopeIDs[node] = id
		scopes = append(scopes, SemanticScope{
			ID:       id,
			ParentID: semanticScopeID(node.Parent, scopeIDs, moduleScopeID),
			Kind:     kind,
			NodeKind: semanticNodeKind(node),
		})
		return true
	})

	declarations := []SemanticDeclaration{}
	declarationsBySymbol := make(map[ast.SymbolId]SemanticDeclaration)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || !ast.IsDeclarationName(node) {
			return true
		}
		kind, declarationNode := semanticDeclarationKind(node)
		if kind == "" {
			return true
		}
		declaration := SemanticDeclaration{
			ID:        fmt.Sprintf("%s:declaration:%d", portableFilename, node.Pos()),
			Name:      node.Text(),
			ScopeID:   semanticScopeID(node.Parent, scopeIDs, moduleScopeID),
			Kind:      kind,
			NodeStart: node.Pos(),
			NodeEnd:   node.End(),
		}
		if kind == "import" {
			declaration.ModuleSpecifier,
				declaration.ImportedName,
				declaration.TypeOnly = semanticImportMetadata(node, sourceFile)
		} else {
			declaration.TypeOnly = semanticTypeOnly(node)
		}
		declaration.ExportedName = semanticDirectExportName(
			declarationNode,
			declaration.Name,
		)
		declarations = append(declarations, declaration)
		if symbol := typeChecker.GetSymbolAtLocation(node); symbol != nil {
			declarationsBySymbol[ast.GetSymbolId(symbol)] = declaration
		}
		return true
	})

	references := []SemanticReference{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			semanticNonReference(node) {
			return true
		}
		reference := SemanticReference{
			Name:      node.Text(),
			ScopeID:   semanticScopeID(node.Parent, scopeIDs, moduleScopeID),
			Source:    "unresolved",
			NodeStart: node.Pos(),
			NodeEnd:   node.End(),
			TypeOnly:  semanticTypeOnly(node),
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol != nil {
			if declaration, exists := declarationsBySymbol[ast.GetSymbolId(symbol)]; exists {
				reference.DeclarationID = declaration.ID
				reference.DeclarationKind = declaration.Kind
				reference.TypeOnly = reference.TypeOnly || declaration.TypeOnly
				if declaration.Kind == "import" {
					reference.Source = "import"
					reference.ModuleSpecifier = declaration.ModuleSpecifier
					reference.ImportedName = declaration.ImportedName
				} else {
					reference.Source = "local"
				}
			}
		}
		if reference.Source == "unresolved" {
			if _, global := browserGlobals[reference.Name]; global {
				reference.Source = "global"
			}
		}
		reference.ExportedName = semanticExportSpecifierName(node)
		references = append(references, reference)
		return true
	})

	exports := collectSemanticExports(sourceFile, declarations)
	sort.Slice(scopes, func(left int, right int) bool {
		return scopes[left].ID < scopes[right].ID
	})
	sort.Slice(declarations, func(left int, right int) bool {
		if declarations[left].NodeStart != declarations[right].NodeStart {
			return declarations[left].NodeStart < declarations[right].NodeStart
		}
		return declarations[left].Name < declarations[right].Name
	})
	sort.Slice(references, func(left int, right int) bool {
		if references[left].NodeStart != references[right].NodeStart {
			return references[left].NodeStart < references[right].NodeStart
		}
		return references[left].Name < references[right].Name
	})
	sort.Slice(exports, func(left int, right int) bool {
		return exports[left].ExportedName < exports[right].ExportedName
	})
	return SemanticGraph{
		Scopes:       scopes,
		Declarations: declarations,
		References:   references,
		Exports:      exports,
	}
}

func semanticNodeKind(node *ast.Node) string {
	return strings.TrimPrefix(node.Kind.String(), "Kind")
}

func semanticScopeID(
	node *ast.Node,
	scopeIDs map[*ast.Node]string,
	moduleScopeID string,
) string {
	for current := node; current != nil; current = current.Parent {
		if id, exists := scopeIDs[current]; exists {
			return id
		}
	}
	return moduleScopeID
}

func semanticDeclarationKind(name *ast.Node) (string, *ast.Node) {
	parent := name.Parent
	if parent == nil {
		return "", nil
	}
	switch {
	case ast.IsImportSpecifier(parent),
		ast.IsImportClause(parent),
		ast.IsNamespaceImport(parent):
		return "import", parent
	case ast.IsFunctionDeclaration(parent), ast.IsFunctionExpression(parent):
		return "function", parent
	case ast.IsClassDeclaration(parent), ast.IsClassExpression(parent):
		return "class", parent
	case ast.IsVariableDeclaration(parent), ast.IsBindingElement(parent):
		return "variable", parent
	case ast.IsParameterDeclaration(parent):
		return "parameter", parent
	case ast.IsTypeAliasDeclaration(parent), ast.IsTypeParameterDeclaration(parent):
		return "type", parent
	case ast.IsInterfaceDeclaration(parent):
		return "interface", parent
	default:
		return "", parent
	}
}

func semanticImportMetadata(
	name *ast.Node,
	sourceFile *ast.SourceFile,
) (string, string, bool) {
	importedName := name.Text()
	typeOnly := false
	for current := name.Parent; current != nil; current = current.Parent {
		switch {
		case ast.IsImportSpecifier(current):
			specifier := current.AsImportSpecifier()
			typeOnly = typeOnly || specifier.IsTypeOnly
			if specifier.PropertyName != nil {
				importedName = specifier.PropertyName.Text()
			}
		case ast.IsNamespaceImport(current):
			importedName = "*"
		case ast.IsImportClause(current):
			clause := current.AsImportClause()
			typeOnly = typeOnly || clause.PhaseModifier == ast.KindTypeKeyword
			if clause.Name() == name {
				importedName = "default"
			}
		case ast.IsImportDeclaration(current):
			declaration := current.AsImportDeclaration()
			if ast.IsStringLiteral(declaration.ModuleSpecifier) {
				return declaration.ModuleSpecifier.AsStringLiteral().Text, importedName, typeOnly
			}
			return "", importedName, typeOnly
		case current == sourceFile.AsNode():
			return "", importedName, typeOnly
		}
	}
	return "", importedName, typeOnly
}

func semanticTypeOnly(node *ast.Node) bool {
	if ast.IsPartOfTypeNode(node) {
		return true
	}
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsImportSpecifier(current) && current.AsImportSpecifier().IsTypeOnly {
			return true
		}
		if ast.IsImportClause(current) &&
			current.AsImportClause().PhaseModifier == ast.KindTypeKeyword {
			return true
		}
		if ast.IsExportSpecifier(current) && current.AsExportSpecifier().IsTypeOnly {
			return true
		}
		if ast.IsStatement(current) {
			break
		}
	}
	return false
}

func semanticDirectExportName(declaration *ast.Node, name string) string {
	if declaration == nil ||
		(!ast.IsVariableDeclaration(declaration) &&
			!ast.IsBindingElement(declaration) &&
			!ast.IsFunctionDeclaration(declaration) &&
			!ast.IsClassDeclaration(declaration) &&
			!ast.IsTypeAliasDeclaration(declaration) &&
			!ast.IsInterfaceDeclaration(declaration)) {
		return ""
	}
	for current := declaration; current != nil; current = current.Parent {
		if ast.IsVariableStatement(current) ||
			ast.IsFunctionDeclaration(current) ||
			ast.IsClassDeclaration(current) ||
			ast.IsTypeAliasDeclaration(current) ||
			ast.IsInterfaceDeclaration(current) {
			if !ast.HasSyntacticModifier(current, ast.ModifierFlagsExport) {
				return ""
			}
			if ast.HasSyntacticModifier(current, ast.ModifierFlagsDefault) {
				return "default"
			}
			return name
		}
		if ast.IsStatement(current) {
			return ""
		}
	}
	return ""
}

func semanticNonReference(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return true
	}
	if isStaticPropertyName(node) ||
		ast.IsJsxAttribute(parent) ||
		ast.IsImportSpecifier(parent) ||
		ast.IsImportClause(parent) ||
		ast.IsNamespaceImport(parent) {
		return true
	}
	if ast.IsExportSpecifier(parent) {
		declaration := parent.Parent
		for declaration != nil && !ast.IsExportDeclaration(declaration) {
			declaration = declaration.Parent
		}
		if declaration != nil && declaration.AsExportDeclaration().ModuleSpecifier != nil {
			return true
		}
		specifier := parent.AsExportSpecifier()
		return specifier.PropertyName != nil && specifier.Name() == node
	}
	if ast.IsPropertyAssignment(parent) && parent.Name() == node {
		return true
	}
	if ast.IsJsxOpeningElement(parent) ||
		ast.IsJsxClosingElement(parent) ||
		ast.IsJsxSelfClosingElement(parent) {
		return len(node.Text()) != 0 &&
			node.Text()[0] >= 'a' && node.Text()[0] <= 'z'
	}
	return false
}

func semanticExportSpecifierName(node *ast.Node) string {
	parent := node.Parent
	if parent == nil || !ast.IsExportSpecifier(parent) {
		return ""
	}
	specifier := parent.AsExportSpecifier()
	if specifier.PropertyName != nil {
		if specifier.PropertyName == node {
			return specifier.Name().Text()
		}
		return ""
	}
	if specifier.Name() == node {
		return node.Text()
	}
	return ""
}

func collectSemanticExports(
	sourceFile *ast.SourceFile,
	declarations []SemanticDeclaration,
) []SemanticExport {
	exports := []SemanticExport{}
	seen := make(map[string]struct{})
	add := func(value SemanticExport) {
		key := value.ExportedName + "\x00" + value.LocalName + "\x00" + value.ModuleSpecifier
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		exports = append(exports, value)
	}
	for _, declaration := range declarations {
		if declaration.ExportedName != "" {
			add(SemanticExport{
				ExportedName: declaration.ExportedName,
				LocalName:    declaration.Name,
				TypeOnly:     declaration.TypeOnly,
			})
		}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsExportDeclaration(statement) {
			continue
		}
		declaration := statement.AsExportDeclaration()
		moduleSpecifier := ""
		if declaration.ModuleSpecifier != nil &&
			ast.IsStringLiteral(declaration.ModuleSpecifier) {
			moduleSpecifier = declaration.ModuleSpecifier.AsStringLiteral().Text
		}
		if declaration.ExportClause == nil ||
			!ast.IsNamedExports(declaration.ExportClause.AsNode()) {
			continue
		}
		for _, element := range declaration.ExportClause.AsNamedExports().Elements.Nodes {
			specifier := element.AsExportSpecifier()
			exportedName := specifier.Name().Text()
			localName := exportedName
			if specifier.PropertyName != nil {
				localName = specifier.PropertyName.Text()
			}
			value := SemanticExport{
				ExportedName: exportedName,
				TypeOnly:     declaration.IsTypeOnly || specifier.IsTypeOnly,
			}
			if moduleSpecifier != "" {
				value.ImportedName = localName
				value.ModuleSpecifier = moduleSpecifier
			} else {
				value.LocalName = localName
			}
			add(value)
		}
	}
	return exports
}
