package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// exportedValueEnvironment follows local value dependencies without conflating authored
// export aliases with protocol identity. Loaded source dependencies retain their own
// declaration ownership, while declaration-only package contracts remain opaque.
func exportedValueEnvironment(symbol *ast.Symbol, sourceFile *ast.SourceFile, typeChecker *checker.Checker, visited map[ast.SymbolId]struct{}) (bool, bool) {
	if symbol == nil {
		return false, false
	}
	id := ast.GetSymbolId(symbol)
	if _, seen := visited[id]; seen {
		return false, false
	}
	visited[id] = struct{}{}
	// This query aggregates all reachable effects. Retaining visited symbols avoids
	// expanding shared dependency diamonds repeatedly while preserving cycle effects.
	browser, server := false, false
	for _, declaration := range symbol.Declarations {
		declarationSource := ast.GetSourceFileOfNode(declaration)
		if declarationSource == nil || declarationSource.IsDeclarationFile {
			continue
		}
		for ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration) {
			declaration = declaration.Parent
		}
		component := false
		if declaration.SubtreeFacts()&ast.SubtreeContainsJsx != 0 {
			for _, candidate := range activeComponentCandidates(declarationSource) {
				if candidate.node == declaration || (ast.IsVariableDeclaration(declaration) && candidate.node == declaration.AsVariableDeclaration().Initializer) {
					component = true
					break
				}
			}
		}
		if component {
			// Native component projection owns client work and retains the server implementation.
			continue
		}
		var work *ast.Node
		switch {
		case ast.IsVariableDeclaration(declaration):
			work = declaration
		case ast.IsExportAssignment(declaration):
			work = declaration.AsExportAssignment().Expression
		case ast.IsFunctionDeclaration(declaration), ast.IsMethodDeclaration(declaration), ast.IsArrowFunction(declaration), ast.IsFunctionExpression(declaration):
			work = declaration
		}
		if work == nil {
			continue
		}
		directBrowser, directServer := moduleValueEnvironment(work, declarationSource, typeChecker, visited)
		browser = browser || directBrowser
		server = server || directServer
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		// Follow one alias at a time so default export expressions retain their
		// source evidence instead of resolving directly to a foreign property.
		aliasBrowser, aliasServer := exportedValueEnvironment(typeChecker.GetImmediateAliasedSymbol(symbol), sourceFile, typeChecker, visited)
		browser = browser || aliasBrowser
		server = server || aliasServer
	}
	return browser, server
}

// moduleValuePruning keeps declarations and their executing module consumers under one target proof.
type moduleValuePruning struct {
	bindings   map[string]struct{}
	statements map[int]struct{}
}

// planModuleValuePruning captures initializer and consumer ownership before transformed nodes
// lose checker identity. JSX projection retains its separate compiler-owned execution boundary.
func planModuleValuePruning(sourceFile *ast.SourceFile, typeChecker *checker.Checker, target Target) moduleValuePruning {
	result := moduleValuePruning{bindings: make(map[string]struct{}), statements: make(map[int]struct{})}
	components := make(map[string]struct{})
	for _, candidate := range activeComponentCandidates(sourceFile) {
		components[candidate.name] = struct{}{}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil {
			name := statement.Name()
			if _, component := components[name.Text()]; !component {
				placement := exportedValuePlacement(typeChecker.GetSymbolAtLocation(name), sourceFile, typeChecker)
				if (placement == "client" || placement == "server") && placement != string(target) {
					result.bindings[name.Text()] = struct{}{}
				}
			}
		}
		if ((ast.IsStatementButNotDeclaration(statement) && !ast.IsVariableStatement(statement)) || ast.IsBlock(statement)) && statement.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
			browser, server := moduleValueEnvironment(statement, sourceFile, typeChecker, make(map[ast.SymbolId]struct{}))
			if (browser && !server && target == TargetServer) || (server && !browser && target == TargetClient) {
				result.statements[statement.Pos()] = struct{}{}
			}
		}
		if !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			for _, name := range bindingIdentifiers(declaration.Name()) {
				if _, component := components[name.Text()]; component {
					continue
				}
				placement := exportedValuePlacement(typeChecker.GetSymbolAtLocation(name), sourceFile, typeChecker)
				if (placement == "client" || placement == "server") && placement != string(target) {
					result.bindings[name.Text()] = struct{}{}
				}
			}
		}
	}
	return result
}

// moduleValueEnvironment retains executable source evidence even when a default export
// resolves directly to a foreign property symbol rather than a local declaration.
func moduleValueEnvironment(work *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker, visited map[ast.SymbolId]struct{}) (bool, bool) {
	browser, server := false, false
	guardBoundary := work
	if ast.IsVariableDeclaration(work) {
		guardBoundary = enclosingCallableNode(work)
		if guardBoundary == nil {
			guardBoundary = sourceFile.AsNode()
		}
	}
	walkNode(work, func(node *ast.Node) bool {
		if node.Parent != nil && ast.IsPartOfTypeNode(node) {
			return false
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if _, candidate := browserGlobals[node.Text()]; candidate && symbolIsOutsideSource(symbol, sourceFile) && !browserGlobalReferenceIsGuarded(node, node.Text(), guardBoundary) {
			browser = true
		}
		if _, candidate := serverGlobals[node.Text()]; candidate && symbolIsOutsideSource(symbol, sourceFile) {
			// Static CommonJS imports are portable build inputs. Their requested module,
			// rather than the loader spelling, determines environment ownership.
			module, loader := requireModule(node.Parent, func(value *ast.Node) bool { return nativeModuleLoaderExpression(value, typeChecker) })
			if node.Text() != "require" || !loader || serverOnlyModule(module) {
				server = true
			}
		}
		if serverOnlyImportSymbol(symbol) {
			server = true
		}
		dependencyBrowser, dependencyServer := exportedValueEnvironment(typeChecker.GetSymbolAtLocation(node), sourceFile, typeChecker, visited)
		browser = browser || dependencyBrowser
		server = server || dependencyServer
		return true
	})
	return browser, server
}
