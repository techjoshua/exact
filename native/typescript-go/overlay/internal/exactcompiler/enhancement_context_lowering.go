package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// lowerEnhancementContextContracts attaches compiler-derived token identities to exported
// components. The runtime reads this narrow contract before any co-targeted component setup runs.
func lowerEnhancementContextContracts(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	components []Component,
) *ast.SourceFile {
	contracts := make(map[string]EnhancementContextEffects)
	for _, component := range components {
		contract := component.EnhancementContexts
		if !component.Exported ||
			(len(contract.Provides) == 0 &&
				len(contract.Requires) == 0 &&
				len(contract.OptionallyConsumes) == 0) {
			continue
		}
		contracts[component.Name] = contract
	}
	if len(contracts) == 0 {
		return sourceFile
	}

	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes)+len(contracts))
	attached := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		statements = append(statements, statement)
		for _, name := range declaredComponentNames(statement, contracts) {
			if _, exists := attached[name]; exists {
				continue
			}
			attached[name] = struct{}{}
		}
	}
	// Attach after module initialization so a component may reference a context
	// token declared later in the same source file without crossing its TDZ.
	for _, component := range components {
		if _, exists := attached[component.Name]; !exists {
			continue
		}
		statements = append(
			statements,
			factory.NewExpressionStatement(
				enhancementContextAttachment(factory, component.Name, contracts[component.Name]),
			),
		)
		delete(attached, component.Name)
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func declaredComponentNames(
	statement *ast.Node,
	contracts map[string]EnhancementContextEffects,
) []string {
	result := []string{}
	if ast.IsFunctionDeclaration(statement) && statement.Name() != nil {
		name := statement.Name().Text()
		if _, exists := contracts[name]; exists {
			result = append(result, name)
		}
	}
	if ast.IsVariableStatement(statement) {
		declarations := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations
		for _, node := range declarations.Nodes {
			name := node.Name()
			if name == nil || !ast.IsIdentifier(name) {
				continue
			}
			if _, exists := contracts[name.Text()]; exists {
				result = append(result, name.Text())
			}
		}
	}
	return result
}

func enhancementContextAttachment(
	factory *printer.NodeFactory,
	component string,
	contract EnhancementContextEffects,
) *ast.Node {
	valueProperties := []*ast.Node{}
	if len(contract.Provides) != 0 {
		valueProperties = append(valueProperties, contractProperty(
			factory,
			"provides",
			frozenContextTokenArray(factory, contract.Provides),
		))
	}
	if len(contract.Requires) != 0 {
		valueProperties = append(valueProperties, contractProperty(
			factory,
			"requires",
			frozenContextTokenArray(factory, contract.Requires),
		))
	}
	if len(contract.OptionallyConsumes) != 0 {
		valueProperties = append(valueProperties, contractProperty(
			factory,
			"optionallyConsumes",
			frozenContextTokenArray(factory, contract.OptionallyConsumes),
		))
	}
	value := frozenExpression(factory, contractObject(factory, true, valueProperties...))
	symbol := factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Symbol"),
			nil,
			factory.NewIdentifier("for"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			contractString(factory, "@exactjs/enhancement-contexts"),
		}),
		ast.NodeFlagsNone,
	)
	descriptor := contractObject(
		factory,
		true,
		contractProperty(factory, "configurable", factory.NewFalseExpression()),
		contractProperty(factory, "enumerable", factory.NewFalseExpression()),
		contractProperty(factory, "value", value),
		contractProperty(factory, "writable", factory.NewFalseExpression()),
	)
	return factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Object"),
			nil,
			factory.NewIdentifier("defineProperty"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			factory.NewIdentifier(component),
			symbol,
			descriptor,
		}),
		ast.NodeFlagsNone,
	)
}

func frozenContextTokenArray(
	factory *printer.NodeFactory,
	tokens []string,
) *ast.Node {
	values := make([]*ast.Node, 0, len(tokens))
	for _, token := range tokens {
		values = append(values, contextTokenIDExpression(factory, token))
	}
	return frozenExpression(factory, contractArray(factory, values...))
}

func contextTokenIDExpression(factory *printer.NodeFactory, token string) *ast.Node {
	parts := strings.Split(token, ".")
	var expression *ast.Node = factory.NewIdentifier(parts[0])
	for _, part := range parts[1:] {
		expression = factory.NewPropertyAccessExpression(
			expression,
			nil,
			factory.NewIdentifier(part),
			ast.NodeFlagsNone,
		)
	}
	return factory.NewPropertyAccessExpression(
		expression,
		nil,
		factory.NewIdentifier("id"),
		ast.NodeFlagsNone,
	)
}

func frozenExpression(factory *printer.NodeFactory, value *ast.Node) *ast.Node {
	return factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Object"),
			nil,
			factory.NewIdentifier("freeze"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{value}),
		ast.NodeFlagsNone,
	)
}
