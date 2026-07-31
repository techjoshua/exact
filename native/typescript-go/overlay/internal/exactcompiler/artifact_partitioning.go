package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// pruneArtifactStatements removes independently classifiable module
// initializers and exported values from the opposite runtime artifact.
func pruneArtifactStatements(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	target Target,
	callables callableAnalysis,
	exports []ExportRecord,
) *ast.SourceFile {
	if target == TargetDefault {
		return sourceFile
	}
	omittedStarts := make(map[int]struct{})
	for _, fact := range callables.facts {
		if fact.summary.Kind != "module-initializer" ||
			artifactTargetsInclude(fact.summary.ArtifactTargets, target) {
			continue
		}
		if len(fact.summary.ArtifactTargets) != 0 {
			omittedStarts[fact.node.Pos()] = struct{}{}
		}
	}
	omittedNames := make(map[string]struct{})
	for _, exported := range exports {
		if exported.Kind != "value" ||
			(exported.Placement != "client" && exported.Placement != "server") ||
			exported.Placement == string(target) {
			continue
		}
		omittedNames[exported.Name] = struct{}{}
	}
	if len(omittedStarts) == 0 && len(omittedNames) == 0 {
		return sourceFile
	}

	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes))
	changed := false
	for _, statement := range sourceFile.Statements.Nodes {
		if _, omit := omittedStarts[statement.Pos()]; omit {
			// Imports have their own target-aware pruning pass after contract
			// lowering. Removing one as a module initializer here can orphan a
			// render-helper binding synthesized into an executor carrier.
			// Side-effect-only imports have no binding to retain and remain
			// governed by their module-initializer placement.
			if !ast.IsImportDeclaration(statement) ||
				statement.AsImportDeclaration().ImportClause == nil {
				changed = true
				continue
			}
		}
		updated, keep := pruneOppositeExportedValues(statement, factory, omittedNames)
		if !keep {
			changed = true
			continue
		}
		if updated != statement {
			changed = true
		}
		statements = append(statements, updated)
	}
	if !changed {
		return sourceFile
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func artifactTargetsInclude(targets []string, target Target) bool {
	for _, candidate := range targets {
		if candidate == string(target) {
			return true
		}
	}
	return false
}

func pruneOppositeExportedValues(
	statement *ast.Node,
	factory *printer.NodeFactory,
	omittedNames map[string]struct{},
) (*ast.Node, bool) {
	if ast.IsVariableStatement(statement) {
		variable := statement.AsVariableStatement()
		list := variable.DeclarationList.AsVariableDeclarationList()
		declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
		for _, declaration := range list.Declarations.Nodes {
			name := declaration.Name()
			if name != nil && ast.IsIdentifier(name) {
				if _, omit := omittedNames[name.Text()]; omit {
					continue
				}
			}
			declarations = append(declarations, declaration)
		}
		if len(declarations) == 0 {
			return nil, false
		}
		if len(declarations) != len(list.Declarations.Nodes) {
			declarationList := factory.UpdateVariableDeclarationList(
				list,
				factory.NewNodeList(declarations),
				list.Flags,
			)
			return factory.UpdateVariableStatement(
				variable,
				variable.Modifiers(),
				declarationList,
			), true
		}
	}
	if ast.IsExportDeclaration(statement) {
		declaration := statement.AsExportDeclaration()
		if declaration.ExportClause == nil ||
			!ast.IsNamedExports(declaration.ExportClause) {
			return statement, true
		}
		named := declaration.ExportClause.AsNamedExports()
		elements := make([]*ast.Node, 0, len(named.Elements.Nodes))
		for _, element := range named.Elements.Nodes {
			specifier := element.AsExportSpecifier()
			localName := specifier.Name().Text()
			if specifier.PropertyName != nil {
				localName = specifier.PropertyName.Text()
			}
			if _, omit := omittedNames[localName]; omit {
				continue
			}
			if _, omit := omittedNames[specifier.Name().Text()]; omit {
				continue
			}
			elements = append(elements, element)
		}
		if len(elements) == 0 {
			return nil, false
		}
		if len(elements) != len(named.Elements.Nodes) {
			exportClause := factory.UpdateNamedExports(
				named,
				factory.NewNodeList(elements),
			)
			return factory.UpdateExportDeclaration(
				declaration,
				declaration.Modifiers(),
				declaration.IsTypeOnly,
				exportClause,
				declaration.ModuleSpecifier,
				declaration.Attributes,
			), true
		}
	}
	return statement, true
}

// pruneArtifactImports removes bindings whose only consumers were erased by
// target partitioning. Explicit side-effect imports remain intact.
func pruneArtifactImports(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	request Request,
	assets assetAnalysis,
	retainedUses map[string]struct{},
) *ast.SourceFile {
	used := artifactIdentifierUses(sourceFile)
	for name := range retainedUses {
		used[name] = struct{}{}
	}
	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes))
	changed := false
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			if omitted := assets.omitStatementStarts[string(request.Target)]; omitted != nil {
				if _, remove := omitted[statement.Pos()]; remove {
					changed = true
					continue
				}
			}
			statements = append(statements, statement)
			continue
		}
		declaration := statement.AsImportDeclaration()
		specifier := ""
		if ast.IsStringLiteral(declaration.ModuleSpecifier) {
			specifier = declaration.ModuleSpecifier.AsStringLiteral().Text
		}
		placement := assets.placementBySpecifier[specifier]
		typeOnly := declaration.ImportClause != nil &&
			declaration.ImportClause.AsImportClause().PhaseModifier ==
				ast.KindTypeKeyword
		preserveAsset := false
		if _, exists := assets.clientSideEffectStarts[statement.Pos()]; exists {
			preserveAsset = request.PreserveClientAssetImports &&
				request.Target == TargetServer
		}
		if request.Target != TargetDefault && !typeOnly && placement != "" &&
			placement != string(request.Target) && !preserveAsset {
			changed = true
			continue
		}
		stripped := stripExactImportAttribute(declaration, factory)
		if stripped != statement {
			changed = true
		}
		statement = stripped
		if request.Target == TargetDefault {
			if statement != declaration.AsNode() {
				changed = true
			}
			statements = append(statements, statement)
			continue
		}
		updated, keep := pruneImportDeclaration(statement, factory, used)
		if !keep {
			changed = true
			continue
		}
		if updated != statement {
			changed = true
		}
		statements = append(statements, updated)
	}
	if !changed {
		return sourceFile
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func artifactIdentifierUses(sourceFile *ast.SourceFile) map[string]struct{} {
	result := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsImportDeclaration(statement) {
			continue
		}
		walkNode(statement, func(node *ast.Node) bool {
			if ast.IsIdentifier(node) {
				result[node.Text()] = struct{}{}
			}
			return true
		})
	}
	return result
}

func pruneImportDeclaration(
	node *ast.Node,
	factory *printer.NodeFactory,
	used map[string]struct{},
) (*ast.Node, bool) {
	declaration := node.AsImportDeclaration()
	if declaration.ImportClause == nil {
		return node, true
	}
	clause := declaration.ImportClause.AsImportClause()
	if clause.PhaseModifier == ast.KindTypeKeyword {
		return node, true
	}
	defaultName := clause.Name()
	if defaultName != nil {
		if _, retained := used[defaultName.Text()]; !retained {
			defaultName = nil
		}
	}
	bindings := clause.NamedBindings
	if bindings != nil {
		switch {
		case ast.IsNamespaceImport(bindings):
			name := bindings.Name()
			if name == nil {
				bindings = nil
			} else if _, retained := used[name.Text()]; !retained {
				bindings = nil
			}
		case ast.IsNamedImports(bindings):
			named := bindings.AsNamedImports()
			elements := make([]*ast.Node, 0, len(named.Elements.Nodes))
			for _, element := range named.Elements.Nodes {
				name := element.Name()
				if name == nil {
					continue
				}
				if _, retained := used[name.Text()]; retained {
					elements = append(elements, element)
				}
			}
			if len(elements) == 0 {
				bindings = nil
			} else if len(elements) != len(named.Elements.Nodes) {
				bindings = factory.UpdateNamedImports(
					named,
					factory.NewNodeList(elements),
				)
			}
		}
	}
	if defaultName == nil && bindings == nil {
		return nil, false
	}
	updatedClause := factory.UpdateImportClause(
		clause,
		clause.PhaseModifier,
		defaultName,
		bindings,
	)
	return factory.UpdateImportDeclaration(
		declaration,
		declaration.Modifiers(),
		updatedClause,
		declaration.ModuleSpecifier,
		declaration.Attributes,
	), true
}
