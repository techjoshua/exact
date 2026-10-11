package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type moduleDefinitionSymbolVisit struct {
	id      ast.SymbolId
	execute bool
}
type moduleDefinitionNodeVisit struct {
	node    *ast.Node
	execute bool
}

// moduleDefinitionAnalysis separates making a value from executing a callable or constructor.
// Both modes retain captured module bindings. Shared dependency graphs and recursive calls are
// visited once per mode, so a deferred definition cannot mask a later eager invocation.
type moduleDefinitionAnalysis struct {
	checker         *checker.Checker
	symbols         map[moduleDefinitionSymbolVisit]bool
	nodes           map[moduleDefinitionNodeVisit]bool
	browser, server bool
}

func (analysis *moduleDefinitionAnalysis) symbol(symbol *ast.Symbol, execute bool) {
	if symbol == nil {
		return
	}
	key := moduleDefinitionSymbolVisit{ast.GetSymbolId(symbol), execute}
	if analysis.symbols[key] {
		return
	}
	analysis.symbols[key] = true
	for _, declaration := range symbol.Declarations {
		for ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration) {
			declaration = declaration.Parent
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if owner == nil || owner.IsDeclarationFile {
			continue
		}
		if ast.IsVariableDeclaration(declaration) && enclosingCallableNode(declaration) != nil {
			continue
		}
		var work *ast.Node
		switch {
		case ast.IsVariableDeclaration(declaration):
			work = declaration.AsVariableDeclaration().Initializer
		case ast.IsFunctionLike(declaration), ast.IsClassDeclaration(declaration), ast.IsClassExpression(declaration):
			work = declaration
		case ast.IsExportAssignment(declaration):
			work = declaration.AsExportAssignment().Expression
		}
		if work == nil {
			continue
		}
		if !execute && ast.IsFunctionLike(work) && !looksLikeTaskPolicy(work, owner) && len(componentSignals(componentCandidate{name: ast.SymbolName(symbol), node: work}, owner)) != 0 {
			continue
		}
		analysis.expression(work, execute)
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		analysis.symbol(analysis.checker.GetImmediateAliasedSymbol(symbol), execute)
	}
}

func (analysis *moduleDefinitionAnalysis) expression(work *ast.Node, execute bool) {
	if work == nil {
		return
	}
	owner := ast.GetSourceFileOfNode(work)
	if owner == nil || owner.IsDeclarationFile {
		return
	}
	key := moduleDefinitionNodeVisit{work, execute}
	if analysis.nodes[key] {
		return
	}
	analysis.nodes[key] = true
	if execute && ast.IsFunctionLike(work) {
		for _, parameter := range work.Parameters() {
			analysis.expression(parameter.AsParameterDeclaration().Initializer, false)
		}
		analysis.expression(work.Body(), false)
		return
	}
	if execute && (ast.IsClassDeclaration(work) || ast.IsClassExpression(work)) {
		var class *ast.ClassLikeBase
		if ast.IsClassDeclaration(work) {
			class = &work.AsClassDeclaration().ClassLikeBase
		} else {
			class = &work.AsClassExpression().ClassLikeBase
		}
		if class.HeritageClauses != nil {
			for _, clause := range class.HeritageClauses.Nodes {
				if clause.AsHeritageClause().Token != ast.KindExtendsKeyword {
					continue
				}
				for _, base := range clause.AsHeritageClause().Types.Nodes {
					expression := base.AsExpressionWithTypeArguments().Expression
					analysis.symbol(analysis.checker.GetSymbolAtLocation(expression), true)
					analysis.symbol(analysis.checker.GetTypeAtLocation(expression).Symbol(), true)
				}
			}
		}
		for _, member := range class.Members.Nodes {
			if ast.IsConstructorDeclaration(member) {
				analysis.expression(member, true)
			}
			if ast.IsPropertyDeclaration(member) && !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) {
				analysis.expression(member.AsPropertyDeclaration().Initializer, false)
			}
		}
		return
	}
	walkNode(work, func(node *ast.Node) bool {
		if node.Parent != nil && ast.IsPartOfTypeNode(node) {
			return false
		}
		deferred := moduleDefinitionNodeIsDeferred(node, work)
		if !deferred && (ast.IsCallExpression(node) || ast.IsNewExpression(node)) {
			if ast.IsNewExpression(node) {
				callee := node.AsNewExpression().Expression
				analysis.symbol(analysis.checker.GetSymbolAtLocation(callee), true)
				analysis.symbol(analysis.checker.GetTypeAtLocation(callee).Symbol(), true)
				if ast.IsClassExpression(callee) {
					analysis.expression(callee, true)
				}
			}
			if ast.IsCallExpression(node) {
				analysis.symbol(callTargetSymbol(node.AsCallExpression().Expression, analysis.checker), true)
			}
			if signature := analysis.checker.GetResolvedSignature(node); signature != nil {
				target := signature.Declaration()
				if target != nil && ast.IsConstructorDeclaration(target) {
					target = target.Parent
				}
				if target != nil && (ast.IsFunctionLike(target) || ast.IsClassDeclaration(target) || ast.IsClassExpression(target)) {
					analysis.expression(target, true)
				}
			}
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		reference := analysis.checker.GetSymbolAtLocation(node)
		if serverOnlyImportSymbol(reference) {
			analysis.server = true
		}
		if !deferred {
			if _, global := browserGlobals[node.Text()]; global && symbolIsOutsideSource(reference, owner) && !browserGlobalReferenceIsGuarded(node, node.Text(), work) {
				analysis.browser = true
			}
			if _, global := serverGlobals[node.Text()]; global && symbolIsOutsideSource(reference, owner) {
				_, server := moduleValueEnvironment(node, owner, analysis.checker, map[ast.SymbolId]struct{}{})
				analysis.server = analysis.server || server
			}
		}
		analysis.symbol(reference, false)
		return true
	})
}

// moduleDefinitionNodeIsDeferred distinguishes bodies and instance fields from computed names
// and static initialization. The selected work root may itself be an executing body or field.
func moduleDefinitionNodeIsDeferred(node, work *ast.Node) bool {
	if node == work {
		return false
	}
	for current := node.Parent; current != nil; current = current.Parent {
		if current == work {
			return ast.IsFunctionLike(current)
		}
		if ast.IsPropertyDeclaration(current) && !ast.HasSyntacticModifier(current, ast.ModifierFlagsStatic) {
			initializer := current.AsPropertyDeclaration().Initializer
			if initializer != nil && node.Pos() >= initializer.Pos() && node.End() <= initializer.End() {
				return true
			}
		}
		if ast.IsFunctionLike(current) {
			name := current.Name()
			if name != nil && ast.IsComputedPropertyName(name) && node.Pos() >= name.Pos() && node.End() <= name.End() {
				continue
			}
			return true
		}
	}
	return false
}

// moduleValueDefinitionPlacement describes artifact availability independently of invocation effects.
func moduleValueDefinitionPlacement(symbol *ast.Symbol, source *ast.SourceFile, typeChecker *checker.Checker) string {
	analysis := moduleDefinitionAnalysis{checker: typeChecker, symbols: map[moduleDefinitionSymbolVisit]bool{}, nodes: map[moduleDefinitionNodeVisit]bool{}}
	analysis.symbol(symbol, false)
	switch {
	case analysis.browser && analysis.server:
		return "unknown"
	case analysis.browser:
		return "client"
	case analysis.server:
		return "server"
	default:
		return "isomorphic"
	}
}
