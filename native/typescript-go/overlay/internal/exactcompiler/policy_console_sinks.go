package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Native console sinks retain ownership through immutable aliases and Function forwarding.
// A similarly named parameter or application object does not acquire logging semantics.
func isConsoleInvocation(node *ast.Node, c *checker.Checker) bool {
	expression := policyInvocationTarget(node)
	arguments := policyInvocationArguments(node)
	values := make([]*ast.Node, 0, len(arguments))
	for _, argument := range arguments {
		values = append(values, argument.value)
	}
	expression, _, _ = restrictedCallArguments(expression, values, c, make(map[ast.SymbolId]bool))
	if ast.IsIdentifier(expression) {
		namespace, name := policyConsoleImport(expression, c)
		if !namespace && name != "" && name != "default" && name != "Console" {
			return true
		}
		if symbol := c.GetSymbolAtLocation(expression); symbol != nil {
			for _, declaration := range symbol.Declarations {
				if ast.IsBindingElement(declaration) && immutableBindingElement(declaration) && declaration.AsBindingElement().Initializer == nil && declaration.AsBindingElement().DotDotDotToken == nil && ast.IsObjectBindingPattern(declaration.Parent) {
					owner := declaration.Parent.Parent
					if ast.IsVariableDeclaration(owner) && policyConsoleReceiver(owner.Initializer(), c, make(map[ast.SymbolId]bool)) {
						return true
					}
				}
			}
		}
		return false
	}
	receiver, _ := restrictedInvocationMember(expression, c)
	return receiver != nil && policyConsoleReceiver(receiver, c, make(map[ast.SymbolId]bool))
}

// The global console is owned by the default library or Node's console module declarations.
// Namespace and default imports identify that same native module without depending on local names.
func policyConsoleReceiver(expression *ast.Node, c *checker.Checker, seen map[ast.SymbolId]bool) bool {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return false
	}
	if ast.IsNewExpression(expression) {
		constructor := expression.AsNewExpression().Expression
		if ast.IsIdentifier(constructor) {
			_, name := policyConsoleImport(constructor, c)
			return name == "Console"
		}
		if receiver, name := restrictedInvocationMember(constructor, c); receiver != nil && name == "Console" {
			return policyConsoleReceiver(receiver, c, seen)
		}
		return false
	}
	if ast.IsIdentifier(expression) {
		namespace, name := policyConsoleImport(expression, c)
		if namespace || name == "default" {
			return true
		}
	}
	symbol := c.GetSymbolAtLocation(expression)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return false
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		if ast.SymbolName(symbol) == "console" {
			if c.IsLibSymbolForHoverVerbosity(&ast.Symbol{Declarations: []*ast.Node{declaration}}) {
				return true
			}
			for parent := declaration.Parent; parent != nil; parent = parent.Parent {
				if ast.IsModuleDeclaration(parent) && parent.Name() != nil && ast.IsStringLiteral(parent.Name()) && (parent.Name().Text() == "node:console" || parent.Name().Text() == "console") {
					return true
				}
			}
		}
		if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
			if policyConsoleReceiver(declaration.Initializer(), c, seen) {
				return true
			}
		}
	}
	return false
}

// Type-only imports confer no runtime sink identity. Actual built-in module imports do.
func policyConsoleImport(expression *ast.Node, c *checker.Checker) (bool, string) {
	symbol := c.GetSymbolAtLocation(expression)
	if symbol == nil {
		return false, ""
	}
	for _, declaration := range symbol.Declarations {
		imported := enclosingImportDeclaration(declaration)
		if imported == nil {
			continue
		}
		statement := imported.AsImportDeclaration()
		if statement.ImportClause == nil || statement.ImportClause.AsImportClause().IsTypeOnly() {
			continue
		}
		module := statement.ModuleSpecifier
		if !ast.IsStringLiteral(module) || (module.Text() != "node:console" && module.Text() != "console") {
			continue
		}
		switch {
		case ast.IsNamespaceImport(declaration):
			return true, ""
		case ast.IsImportClause(declaration):
			return false, "default"
		case ast.IsImportSpecifier(declaration):
			specifier := declaration.AsImportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			name := specifier.Name().Text()
			if specifier.PropertyName != nil {
				name = specifier.PropertyName.Text()
			}
			return false, name
		}
	}
	return false, ""
}
