package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// Find the closest declaration without attributing an inner scope's shadow to an outer read.
// This narrow pre-bind lookup supplies identity evidence, never type or general call semantics.
func normalizationLexicalDeclaration(node *ast.Node, name string) *ast.Node {
	for scope := node.Parent; scope != nil; scope = scope.Parent {
		// These bindings are not block statements. They still shadow imports in
		// the catch body or loop, including the loop condition and update.
		var declaration *ast.Node
		if ast.IsCatchClause(scope) {
			declaration = scope.AsCatchClause().VariableDeclaration
		} else if ast.IsForStatement(scope) {
			declaration = scope.AsForStatement().Initializer
		} else if ast.IsForOfStatement(scope) || ast.IsForInStatement(scope) {
			declaration = scope.AsForInOrOfStatement().Initializer
		}
		if declaration != nil {
			declarations := []*ast.Node{declaration}
			if ast.IsVariableDeclarationList(declaration) {
				declarations = declaration.AsVariableDeclarationList().Declarations.Nodes
			}
			for _, bindingDeclaration := range declarations {
				if ast.IsVariableDeclaration(bindingDeclaration) {
					for _, binding := range bindingIdentifiers(bindingDeclaration.Name()) {
						if binding.Text() == name {
							return bindingDeclaration
						}
					}
				}
			}
		}
		if ast.IsFunctionLike(scope) {
			if ast.IsFunctionExpression(scope) && scope.Name() != nil && scope.Name().Text() == name {
				return scope
			}
			for _, parameter := range scope.Parameters() {
				for _, binding := range bindingIdentifiers(parameter.Name()) {
					if binding.Text() == name {
						return parameter
					}
				}
			}
			if declaration := normalizationHoistedDeclaration(scope, name); declaration != nil {
				return declaration
			}
		}
		var statements []*ast.Node
		if ast.IsBlock(scope) {
			statements = scope.AsBlock().Statements.Nodes
		}
		if ast.IsSourceFile(scope) {
			statements = scope.AsSourceFile().Statements.Nodes
		}
		if ast.IsCaseBlock(scope) {
			for _, clause := range scope.AsCaseBlock().Clauses.Nodes {
				statements = append(statements, clause.AsCaseOrDefaultClause().Statements.Nodes...)
			}
		}
		for _, statement := range statements {
			if ast.IsVariableStatement(statement) {
				for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
					for _, binding := range bindingIdentifiers(declaration.Name()) {
						if binding.Text() == name {
							return declaration
						}
					}
				}
			} else if ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement) {
				if statement.Name() != nil && statement.Name().Text() == name {
					return statement
				}
			} else if ast.IsImportDeclaration(statement) && statement.AsImportDeclaration().ImportClause != nil {
				clause := statement.AsImportDeclaration().ImportClause.AsImportClause()
				if clause.Name() != nil && clause.Name().Text() == name {
					return clause.AsNode()
				}
				if clause.NamedBindings != nil {
					if ast.IsNamespaceImport(clause.NamedBindings) {
						if clause.NamedBindings.Name().Text() == name {
							return clause.NamedBindings
						}
					} else {
						for _, specifier := range clause.NamedBindings.AsNamedImports().Elements.Nodes {
							if specifier.Name().Text() == name {
								return specifier
							}
						}
					}
				}
			}
		}
	}
	return nil
}

// Function-scoped var bindings shadow outer imports even when declared inside a branch.
// Nested callable and class bodies establish other owners and cannot supply that evidence.
func normalizationHoistedDeclaration(scope *ast.Node, name string) *ast.Node {
	var result *ast.Node
	walkNode(scope.Body(), func(node *ast.Node) bool {
		if result != nil || ast.IsFunctionLike(node) || ast.IsClassDeclaration(node) || ast.IsClassExpression(node) {
			return false
		}
		if ast.IsVariableDeclaration(node) && node.Parent != nil &&
			ast.IsVariableDeclarationList(node.Parent) &&
			node.Parent.Flags&(ast.NodeFlagsLet|ast.NodeFlagsConst) == 0 {
			for _, binding := range bindingIdentifiers(node.Name()) {
				if binding.Text() == name {
					result = node
					return false
				}
			}
		}
		return true
	})
	return result
}
