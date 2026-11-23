package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// moduleValuePruning keeps declarations and their executing module consumers under one target proof.
type moduleValuePruning struct {
	dormantBindingTypes map[int]ast.Kind
	bindings            map[string]struct{}
	statements          map[int]struct{}
}

// planModuleValuePruning captures initializer and consumer ownership before transformed nodes
// lose checker identity. JSX projection retains its separate compiler-owned execution boundary.
func planModuleValuePruning(sourceFile *ast.SourceFile, typeChecker *checker.Checker, target Target, availability *moduleValueAvailability) moduleValuePruning {
	if target == TargetDefault {
		return moduleValuePruning{}
	}
	result := moduleValuePruning{bindings: make(map[string]struct{}), statements: make(map[int]struct{})}
	if availability != nil {
		result.dormantBindingTypes = availability.dormantBindingTypes
	}
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
	if availability == nil || symbol == nil || ast.IsJsxTagName(node) {
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
	placement := availability.placement(symbol)
	if placement == "client" || placement == "server" || !ast.IsVariableDeclaration(declaration) {
		return placement
	}
	// Artifact pruning consumes the canonical initializer's target. A read of
	// its stored value needs the same binding on the component's target.
	initializer, known := availability.callables[declaration]
	if !known {
		initializer = availability.callables[top]
	}
	if initializer.Kind == "module-initializer" && len(initializer.ArtifactTargets) == 1 {
		return initializer.ArtifactTargets[0]
	}
	return placement
}

// taskCallBindingRequirement carries the real module binding into task placement.
// A direct Call can refer to code that target-local module pruning would otherwise
// erase. This does not execute the module initializer in the task.
func (availability *moduleValueAvailability) taskCallBindingRequirement(work, operation *ast.Node, name string) (EnvironmentEffectSource, bool) {
	if availability == nil || availability.owner == nil || availability.owner.values == nil || !nodeInside(operation, work.Body()) {
		return EnvironmentEffectSource{}, false
	}
	expression := unwrapSourceCallableReference(operation.Expression())
	if expression == nil || !ast.IsIdentifier(expression) {
		return EnvironmentEffectSource{}, false
	}
	symbol := availability.checker.GetSymbolAtLocation(expression)
	var environment string
	switch availability.componentReferencePlacement(expression, symbol) {
	case "client":
		environment = "browser"
	case "server":
		environment = "server"
	default:
		return EnvironmentEffectSource{}, false
	}
	// The summary may retain calls from lexically unreachable branches.
	query := sourceValueQuery{owner: availability.owner.values, executable: availability.owner, remaining: 4096}
	if possible, _ := query.reachableWithin(operation, work.Body(), nil, false); !possible {
		return EnvironmentEffectSource{}, false
	}
	return environmentSource(environment, "module binding "+expression.Text(), name), true
}

// dormantReferencePlacement lets partitioning retain a local const's precise
// primitive type when its initializer must be removed. Other bindings keep
// their existing target requirement, including imports and structural types.
func (availability *moduleValueAvailability) dormantReferencePlacement(file *ast.SourceFile, node *ast.Node) string {
	if availability == nil || !ast.IsIdentifier(node) {
		return ""
	}
	var symbol *ast.Symbol
	parent := node.Parent
	// Shorthand defaults are separate expressions with their own lexical bindings.
	if parent != nil && ast.IsShorthandPropertyAssignment(parent) && parent.Name() == node {
		symbol = availability.checker.GetShorthandAssignmentValueSymbol(parent)
	} else {
		if ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return ""
		}
		symbol = availability.checker.GetSymbolAtLocation(node)
	}
	placement := availability.componentReferencePlacement(node, symbol)
	if placement != "client" && placement != "server" {
		if serverOnlyImportSymbol(symbol) {
			return "server"
		}
		return ""
	}
	d := symbol.ValueDeclaration
	if d == nil || !ast.IsVariableDeclaration(d) || !ast.IsIdentifier(d.Name()) ||
		d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 ||
		d.Parent.Parent == nil || d.Parent.Parent.Parent != file.AsNode() {
		return placement
	}
	var kind ast.Kind
	switch availability.checker.GetTypeOfSymbol(symbol) {
	case availability.checker.GetStringType():
		kind = ast.KindStringKeyword
	case availability.checker.GetNumberType():
		kind = ast.KindNumberKeyword
	default:
		return placement
	}
	if availability.dormantBindingTypes == nil {
		availability.dormantBindingTypes = make(map[int]ast.Kind)
	}
	availability.dormantBindingTypes[d.Pos()] = kind
	return ""
}
