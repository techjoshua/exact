package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
)

// setupTaskResultAssignments retains explicit component-owned task result activations.
// Their dependency watcher and publication belong to task lowering, even with reactive inputs.
func setupTaskResultAssignments(source *ast.SourceFile, component *ast.Node, statements []*ast.Node) map[*ast.Node]bool {
	bindings := collectExternalImportBindings(source, nil)
	provider := false
	for _, reference := range bindings.byName {
		provider = provider || reference.moduleSpecifier == "@exactjs/core" && (reference.exportName == "TaskContext" || reference.namespace)
	}
	if !provider {
		return nil
	}
	// Syntax discovery is conservative around a provider shadow. The checked task analyzer
	// remains authoritative for policy identity and component ownership.
	clearBinding := func(node *ast.Node) {
		walkNode(node, func(candidate *ast.Node) bool {
			if ast.IsIdentifier(candidate) && ast.IsDeclarationName(candidate) {
				delete(bindings.byName, candidate.Text())
			}
			return true
		})
	}
	for _, parameter := range component.Parameters() {
		clearBinding(parameter.AsParameterDeclaration().Name())
	}
	callables := setupTaskLocalAliases(statements)
	for _, statement := range statements {
		if ast.IsFunctionDeclaration(statement) && statement.Name() != nil {
			clearBinding(statement.Name())
		} else if ast.IsVariableStatement(statement) {
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				clearBinding(declaration.Name())
			}
		}
	}
	result := map[*ast.Node]bool{}
	for _, statement := range statements {
		if !ast.IsExpressionStatement(statement) {
			continue
		}
		assignment := unwrapRenderExpression(statement.AsExpressionStatement().Expression)
		if assignment == nil || !ast.IsBinaryExpression(assignment) || assignment.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			continue
		}
		path, stateField := componentComputationStatePath(assignment.AsBinaryExpression().Left)
		if !stateField || path == "this.state" {
			continue
		}
		value := unwrapRenderExpression(assignment.AsBinaryExpression().Right)
		if value == nil || !ast.IsCallExpression(value) {
			continue
		}
		work := resolveSetupTaskCallable(value.AsCallExpression().Expression, callables, map[string]bool{})
		if work == nil || !isCallableNode(work) || work.Body() == nil {
			continue
		}
		policyBindings := bindings
		policyBindings.byName = make(map[string]externalImportReference, len(bindings.byName))
		for name, reference := range bindings.byName {
			policyBindings.byName[name] = reference
		}
		for _, parameter := range work.Parameters() {
			walkNode(parameter.AsParameterDeclaration().Name(), func(node *ast.Node) bool {
				if ast.IsIdentifier(node) {
					delete(policyBindings.byName, node.Text())
				}
				return true
			})
		}
		if _, explicit := functionTaskPolicy(work, source, policyBindings); explicit {
			result[statement] = true
		}
	}
	return result
}

// resolveSetupTaskCallable follows stable local aliases and literal task-table selections.
// It is candidate discovery only. Unknown overriding members cannot establish a task owner.
func resolveSetupTaskCallable(expression *ast.Node, locals map[string]*ast.Node, seen map[string]bool) *ast.Node {
	expression = unwrapRenderExpression(expression)
	if expression == nil {
		return nil
	}
	if ast.IsIdentifier(expression) {
		name := expression.Text()
		if seen[name] {
			return nil
		}
		seen[name] = true
		return resolveSetupTaskCallable(locals[name], locals, seen)
	}
	var owner *ast.Node
	var key string
	if ast.IsPropertyAccessExpression(expression) {
		owner = expression.AsPropertyAccessExpression().Expression
		key = expression.AsPropertyAccessExpression().Name().Text()
	} else if ast.IsElementAccessExpression(expression) {
		owner = expression.AsElementAccessExpression().Expression
		name := unwrapRenderExpression(expression.AsElementAccessExpression().ArgumentExpression)
		if name == nil || !ast.IsStringLiteral(name) {
			return nil
		}
		key = name.Text()
	} else {
		return expression
	}
	owner = resolveSetupTaskCallable(owner, locals, seen)
	if owner != nil && ast.IsArrayLiteralExpression(owner) {
		index, err := strconv.Atoi(key)
		elements := owner.AsArrayLiteralExpression().Elements.Nodes
		if err != nil || index < 0 || strconv.Itoa(index) != key || index >= len(elements) {
			return nil
		}
		for _, element := range elements[:index+1] {
			if ast.IsSpreadElement(element) {
				return nil
			}
		}
		if elements[index].Kind == ast.KindOmittedExpression {
			return nil
		}
		return resolveSetupTaskCallable(elements[index], locals, seen)
	}
	if owner == nil || !ast.IsObjectLiteralExpression(owner) {
		return nil
	}
	properties := owner.AsObjectLiteralExpression().Properties.Nodes
	for index := len(properties) - 1; index >= 0; index-- {
		property := properties[index]
		if ast.IsSpreadAssignment(property) {
			return nil
		}
		name := property.Name()
		if name == nil {
			return nil
		}
		if ast.IsComputedPropertyName(name) {
			name = unwrapRenderExpression(name.AsComputedPropertyName().Expression)
			if name == nil || !ast.IsStringLiteral(name) {
				return nil
			}
		}
		if !ast.IsIdentifier(name) && !ast.IsStringLiteral(name) {
			return nil
		}
		if name.Text() != key {
			continue
		}
		if ast.IsPropertyAssignment(property) {
			return resolveSetupTaskCallable(property.AsPropertyAssignment().Initializer, locals, seen)
		}
		if ast.IsShorthandPropertyAssignment(property) {
			return resolveSetupTaskCallable(property.Name(), locals, seen)
		}
		return nil
	}
	return nil
}

// ownedTaskLocalCallSummary resolves a component's literal task table without contextual checking
// arbitrary receiver methods. Only an explicit local task policy permits this fallback.
func ownedTaskLocalCallSummary(expression, component *ast.Node, source *ast.SourceFile, bindings externalImportBindings, facts callableAnalysis) (CallableSummary, bool) {
	if !ast.IsIdentifier(expression) && !ast.IsPropertyAccessExpression(expression) && !ast.IsElementAccessExpression(expression) {
		return CallableSummary{}, false
	}
	if component.Body() == nil || !ast.IsBlock(component.Body()) {
		return CallableSummary{}, false
	}
	locals := setupTaskLocalAliases(component.Body().AsBlock().Statements.Nodes)
	work := resolveSetupTaskCallable(expression, locals, map[string]bool{})
	if work == nil || !isCallableNode(work) {
		return CallableSummary{}, false
	}
	if _, explicit := functionTaskPolicy(work, source, bindings); !explicit {
		return CallableSummary{}, false
	}
	summary, exists := facts.byNode[work]
	return summary, exists
}
