package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// moduleValuePruning keeps declarations and their executing module consumers under one target proof.
type moduleValuePruning struct {
	bindings   map[string]struct{}
	statements map[int]struct{}
}

// planModuleValuePruning captures initializer and consumer ownership before transformed nodes
// lose checker identity. JSX projection retains its separate compiler-owned execution boundary.
func planModuleValuePruning(sourceFile *ast.SourceFile, typeChecker *checker.Checker, target Target, availability *moduleValueAvailability) moduleValuePruning {
	result := moduleValuePruning{bindings: make(map[string]struct{}), statements: make(map[int]struct{})}
	components := make(map[string]struct{})
	for _, candidate := range activeComponentCandidates(sourceFile) {
		components[candidate.name] = struct{}{}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if (ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement)) && statement.Name() != nil {
			name := statement.Name()
			if _, component := components[name.Text()]; !component {
				placement := availability.placement(typeChecker.GetSymbolAtLocation(name))
				if (placement == "client" || placement == "server") && placement != string(target) {
					result.bindings[name.Text()] = struct{}{}
				}
			}
		}
		if ((ast.IsStatementButNotDeclaration(statement) && !ast.IsVariableStatement(statement)) || ast.IsBlock(statement)) && statement.SubtreeFacts()&ast.SubtreeContainsJsx == 0 {
			analysis := newModuleDefinitionAnalysis(typeChecker, availability.owner)
			analysis.expression(statement, false)
			browser, server := analysis.browser, analysis.server
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
				placement := availability.placement(typeChecker.GetSymbolAtLocation(name))
				if (placement == "client" || placement == "server") && placement != string(target) {
					result.bindings[name.Text()] = struct{}{}
				}
			}
		}
	}
	return result
}

// componentReferencePlacement reuses the availability of a top-level runtime binding.
// Its initializer's performed writes stay at module execution, outside component setup.
func (availability *moduleValueAvailability) componentReferencePlacement(node *ast.Node, symbol *ast.Symbol) string {
	if symbol == nil || ast.IsJsxTagName(node) {
		return ""
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = availability.checker.SkipAlias(symbol)
	}
	if symbol == nil || symbol.ValueDeclaration == nil {
		return ""
	}
	declaration := symbol.ValueDeclaration
	for ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration) {
		declaration = declaration.Parent
	}
	top := declaration
	if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) {
		top = declaration.Parent.Parent
	} else if !ast.IsFunctionDeclaration(declaration) && !ast.IsClassDeclaration(declaration) {
		return ""
	}
	if top == nil || top.Parent == nil || !ast.IsSourceFile(top.Parent) || top.Parent.AsSourceFile().IsDeclarationFile {
		return ""
	}
	return availability.placement(symbol)
}
