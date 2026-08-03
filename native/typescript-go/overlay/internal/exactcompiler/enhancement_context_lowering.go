package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

type enhancementCallableContextContract struct {
	effects      EnhancementContextEffects
	dependencies []*ast.Node
}

// lowerEnhancementContextContracts attaches compiler-derived token identities to exported
// components and callable helpers. Imported helpers carry their own token identities, allowing a
// component to compose transitive context effects without importing or registering those tokens.
func lowerEnhancementContextContracts(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	callables callableAnalysis,
) *ast.SourceFile {
	contracts := enhancementCallableContextContracts(sourceFile, callables)
	if len(contracts) == 0 {
		return sourceFile
	}

	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes)+len(contracts))
	attached := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		statements = append(statements, statement)
		for _, name := range declaredContractNames(statement, contracts) {
			attached[name] = struct{}{}
		}
	}
	// Attach after module initialization so local tokens declared later in the
	// source cannot cross their TDZ. Imported dependencies have completed their
	// own module initialization before this module evaluates.
	names := make([]string, 0, len(attached))
	for name := range attached {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		statements = append(
			statements,
			factory.NewExpressionStatement(
				enhancementContextAttachment(factory, name, contracts[name]),
			),
		)
	}
	result := factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(result.AsNode())
	return result
}

func enhancementCallableContextContracts(
	sourceFile *ast.SourceFile,
	callables callableAnalysis,
) map[string]enhancementCallableContextContract {
	result := make(map[string]enhancementCallableContextContract)
	factByID := make(map[string]int, len(callables.facts))
	for index := range callables.facts {
		factByID[callables.facts[index].summary.ID] = index
	}
	memo := make(map[int]enhancementCallableContextContract)
	visiting := make(map[int]bool)
	for index := range callables.facts {
		fact := &callables.facts[index]
		if fact.sourceFile.FileName() != sourceFile.FileName() ||
			len(fact.summary.ExportNames) == 0 ||
			!exactContextToken.MatchString(fact.summary.Name) ||
			strings.Contains(fact.summary.Name, ".") {
			continue
		}
		contract := enhancementCallableContextForFact(
			index,
			callables.facts,
			factByID,
			memo,
			visiting,
		)
		if enhancementCallableContextEmpty(contract) {
			continue
		}
		result[fact.summary.Name] = contract
	}
	return result
}

func enhancementCallableContextForFact(
	index int,
	facts []callableFacts,
	factByID map[string]int,
	memo map[int]enhancementCallableContextContract,
	visiting map[int]bool,
) enhancementCallableContextContract {
	if contract, exists := memo[index]; exists {
		return contract
	}
	if visiting[index] {
		return enhancementCallableContextContract{}
	}
	visiting[index] = true
	owner := facts[index].sourceFile
	effects := []ContextEffect{}
	dependencies := []*ast.Node{}
	dependencyKeys := make(map[string]struct{})
	localVisited := make(map[int]bool)
	var visitLocal func(int)
	visitLocal = func(localIndex int) {
		if localVisited[localIndex] {
			return
		}
		localVisited[localIndex] = true
		fact := &facts[localIndex]
		effects = append(effects, fact.directContext...)
		for _, edge := range fact.summary.Calls {
			targetIndex, exists := factByID[edge.TargetID]
			if !edge.Resolved || !exists {
				continue
			}
			if facts[targetIndex].sourceFile == owner {
				visitLocal(targetIndex)
				continue
			}
			targetContract := enhancementCallableContextForFact(
				targetIndex,
				facts,
				factByID,
				memo,
				visiting,
			)
			if enhancementCallableContextEmpty(targetContract) {
				continue
			}
			reference := enhancementCallableReference(fact.callExpressions[edge.ID])
			if reference == nil {
				continue
			}
			key := strings.TrimSpace(sourceText(fact.sourceFile, reference))
			if _, exists := dependencyKeys[key]; exists {
				continue
			}
			dependencyKeys[key] = struct{}{}
			dependencies = append(dependencies, reference)
		}
	}
	visitLocal(index)
	contract := enhancementCallableContextContract{
		effects:      enhancementContextEffects(effects, moduleContextTokenRoots(owner)),
		dependencies: dependencies,
	}
	delete(visiting, index)
	memo[index] = contract
	return contract
}

func enhancementCallableReference(expression *ast.Node) *ast.Node {
	for expression != nil && ast.IsParenthesizedExpression(expression) {
		expression = expression.AsParenthesizedExpression().Expression
	}
	if expression != nil && ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return member.Expression
		}
	}
	return expression
}

func enhancementCallableContextEmpty(contract enhancementCallableContextContract) bool {
	return len(contract.effects.Provides) == 0 &&
		len(contract.effects.Requires) == 0 &&
		len(contract.effects.OptionallyConsumes) == 0 &&
		len(contract.dependencies) == 0
}

func declaredContractNames(
	statement *ast.Node,
	contracts map[string]enhancementCallableContextContract,
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
	contract enhancementCallableContextContract,
) *ast.Node {
	valueProperties := []*ast.Node{
		contractProperty(factory, "provides", frozenContextTokenArray(
			factory, contract.effects.Provides, contract.dependencies, "provides",
		)),
		contractProperty(factory, "requires", frozenContextTokenArray(
			factory, contract.effects.Requires, contract.dependencies, "requires",
		)),
		contractProperty(factory, "optionallyConsumes", frozenContextTokenArray(
			factory,
			contract.effects.OptionallyConsumes,
			contract.dependencies,
			"optionallyConsumes",
		)),
	}
	value := frozenExpression(factory, contractObject(factory, true, valueProperties...))
	symbol := enhancementContextSymbol(factory)
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
	dependencies []*ast.Node,
	property string,
) *ast.Node {
	values := make([]*ast.Node, 0, len(tokens))
	for _, token := range tokens {
		values = append(values, contextTokenIDExpression(factory, token))
	}
	value := contractArray(factory, values...)
	if len(dependencies) != 0 {
		arguments := make([]*ast.Node, 0, len(dependencies))
		for _, dependency := range dependencies {
			arguments = append(arguments, enhancementDependencyContextProperty(
				factory,
				dependency,
				property,
			))
		}
		value = factory.NewCallExpression(
			factory.NewPropertyAccessExpression(
				value,
				nil,
				factory.NewIdentifier("concat"),
				ast.NodeFlagsNone,
			),
			nil,
			nil,
			factory.NewNodeList(arguments),
			ast.NodeFlagsNone,
		)
	}
	return frozenExpression(factory, value)
}

func enhancementDependencyContextProperty(
	factory *printer.NodeFactory,
	dependency *ast.Node,
	property string,
) *ast.Node {
	contract := factory.NewCallExpression(
		factory.NewPropertyAccessExpression(
			factory.NewIdentifier("Reflect"),
			nil,
			factory.NewIdentifier("get"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			dependency.Clone(factory),
			enhancementContextSymbol(factory),
		}),
		ast.NodeFlagsNone,
	)
	return factory.NewPropertyAccessExpression(
		contract,
		nil,
		factory.NewIdentifier(property),
		ast.NodeFlagsNone,
	)
}

func enhancementContextSymbol(factory *printer.NodeFactory) *ast.Node {
	return factory.NewCallExpression(
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
