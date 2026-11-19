package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

type enhancementCallableContextContract struct {
	effects           EnhancementContextEffects
	dependencies      []*ast.Node
	soleHelper        *callableFacts
	transparentTarget bool
}

// lowerEnhancementContextContracts attaches compiler-derived token identities to exported
// components and callable helpers. Imported helpers carry their own token identities, allowing a
// component to compose transitive context effects without importing or registering those tokens.
func lowerEnhancementContextContracts(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	contracts map[string]enhancementCallableContextContract,
	target Target,
	policies policyAnalysis,
) *ast.SourceFile {
	if target == TargetClient {
		// Private context declarations are erased from client artifacts. Context
		// attachments must describe only capabilities available in this target.
		filter := func(tokens []string) []string {
			result := []string{}
			for _, token := range tokens {
				policy, exists := policies.contextPolicies[token]
				if !exists || (policy.Policy.Residency != "server" && !policy.Policy.Secret) {
					result = append(result, token)
				}
			}
			return result
		}
		for name, contract := range contracts {
			contract.effects.Provides = filter(contract.effects.Provides)
			contract.effects.Requires = filter(contract.effects.Requires)
			contract.effects.OptionallyConsumes = filter(contract.effects.OptionallyConsumes)
			contracts[name] = contract
		}
	}
	if len(contracts) == 0 {
		return sourceFile
	}

	used := sourceIdentifiers(sourceFile)
	attach := allocateGeneratedName(used, "__exactAttachEnhancementContexts")
	read := allocateGeneratedName(used, "__exactReadEnhancementDependency")
	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes)+len(contracts)+1)
	attached := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		statements = append(statements, statement)
		for _, name := range declaredContractNames(statement, contracts) {
			attached[name] = struct{}{}
		}
	}
	if len(attached) == 0 {
		return sourceFile
	}
	specifiers := []*ast.Node{factory.NewImportSpecifier(false, factory.NewIdentifier("attachCompiledEnhancementContexts"), factory.NewIdentifier(attach))}
	for name := range attached {
		if len(contracts[name].dependencies) != 0 {
			specifiers = append(specifiers, factory.NewImportSpecifier(false, factory.NewIdentifier("readCompiledEnhancementContextDependency"), factory.NewIdentifier(read)))
			break
		}
	}
	imports := factory.NewImportDeclaration(nil,
		factory.NewImportClause(ast.KindUnknown, nil, factory.NewNamedImports(factory.NewNodeList(specifiers))),
		factory.NewStringLiteral("@exactjs/core/runtime/enhancement-contexts", ast.TokenFlagsNone), nil)
	statements = append(statements, imports)
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
				enhancementContextAttachment(factory, name, contracts[name], attach, read),
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
		if fact.summary.Kind == "component" && contract.soleHelper != nil && len(contract.dependencies) == 1 && enhancementCallableContextEmpty(enhancementCallableContextContract{effects: contract.effects}) && callables.owner != nil {
			contract = directImportedContextContract(fact.sourceFile, contract, memo[factByID[contract.soleHelper.summary.ID]], callables.owner.checker)
		}
		contract.transparentTarget = transparentSuppliedTargetOutput(fact.node, fact.sourceFile, callables)
		// Optional lookup uses its authored token when invoked. It has no peer-order
		// prerequisite and does not require attaching metadata to an ordinary helper.
		if fact.summary.Kind != "component" && enhancementCallableContextProbeOnly(contract) {
			continue
		}
		if enhancementCallableContextEmpty(contract) {
			continue
		}
		result[fact.summary.Name] = contract
	}
	return result
}

// Substitute a sole leaf-helper obligation only when its module binding and a
// component value import resolve to the same shared context constant.
func directImportedContextContract(source *ast.SourceFile, fallback, contract enhancementCallableContextContract, c *checker.Checker) enhancementCallableContextContract {
	helper := fallback.soleHelper
	if c == nil {
		return fallback
	}
	if helper.summary.Kind == "component" || len(helper.directContext) != 1 || len(contract.dependencies) != 0 || len(contract.effects.Provides)+len(contract.effects.Requires) != 1 || len(contract.effects.OptionallyConsumes) != 0 {
		return fallback
	}
	effect := helper.directContext[0]
	symbol := helper.sourceFile.AsNode().Locals()[effect.Token]
	binding := contextRootBinding(symbol, c)
	if binding == nil || ast.GetNodeId(binding) != effect.rootDeclaration {
		return fallback
	}
	symbol = resolvedCallableSymbol(symbol, c)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return fallback
	}
	token := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(token) || token.Parent.Flags&ast.NodeFlagsConst == 0 || token.Initializer() == nil || !ast.IsCallExpression(token.Initializer()) {
		return fallback
	}
	call := token.Initializer().AsCallExpression()
	ref, ok := resolvedCoreImportReference(call.Expression, ast.GetSourceFileOfNode(token), c)
	if !ok || ref.moduleSpecifier != "@exactjs/core" || ref.exportName != "createContext" || call.Arguments == nil || len(call.Arguments.Nodes) > 1 {
		return fallback
	}
	name := importedContextName(source, c, token)
	if name == "" {
		return fallback
	}
	if effect.Kind == "write" && len(contract.effects.Provides) == 1 && contract.effects.Provides[0] == effect.Token {
		return enhancementCallableContextContract{effects: EnhancementContextEffects{Provides: []string{name}}}
	}
	if effect.Kind == "read" && len(contract.effects.Requires) == 1 && contract.effects.Requires[0] == effect.Token {
		return enhancementCallableContextContract{effects: EnhancementContextEffects{Requires: []string{name}}}
	}
	return fallback
}

// Named value imports include renamed and re-exported tokens. Type-only
// exports and target-qualified imports cannot supply this shared expression.
func importedContextName(source *ast.SourceFile, c *checker.Checker, token *ast.Node) string {
	for _, stmt := range source.Statements.Nodes {
		if !ast.IsImportDeclaration(stmt) {
			continue
		}
		imp := stmt.AsImportDeclaration()
		if imp.Attributes != nil || imp.ImportClause == nil || imp.ImportClause.AsImportClause().IsTypeOnly() {
			continue
		}
		bindings := imp.ImportClause.AsImportClause().NamedBindings
		if bindings == nil || !ast.IsNamedImports(bindings) {
			continue
		}
		for _, spec := range bindings.AsNamedImports().Elements.Nodes {
			if spec.AsImportSpecifier().IsTypeOnly {
				continue
			}
			symbol := c.GetSymbolAtLocation(spec.Name())
			if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 || c.GetTypeOnlyAliasDeclaration(symbol) != nil {
				continue
			}
			resolved := c.GetAliasedSymbol(symbol)
			if resolved != nil && resolved.ValueDeclaration == token {
				return spec.Name().Text()
			}
		}
	}
	return ""
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
	var soleHelper *callableFacts
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
			// Kind belongs to the resolved source fact. A component retains its
			// dependency even before its transparent-target flag is attached.
			if facts[targetIndex].summary.Kind != "component" && enhancementCallableContextProbeOnly(targetContract) {
				continue
			}
			reference := fact.contextReferences[edge.ID]
			if reference == nil {
				continue
			}
			if len(dependencies) == 0 {
				soleHelper = &facts[targetIndex]
			} else if soleHelper != &facts[targetIndex] {
				soleHelper = nil
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
		soleHelper:   soleHelper,
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

// enhancementCallableContextProbeOnly excludes contracts with independent pre-activation
// obligations. Runtime hasContext resolves the actual token without consulting this metadata.
func enhancementCallableContextProbeOnly(contract enhancementCallableContextContract) bool {
	return !contract.transparentTarget && len(contract.effects.Provides) == 0 &&
		len(contract.effects.Requires) == 0 && len(contract.dependencies) == 0 &&
		len(contract.effects.OptionallyConsumes) != 0
}

func enhancementCallableContextEmpty(contract enhancementCallableContextContract) bool {
	return !contract.transparentTarget && len(contract.effects.Provides) == 0 &&
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
	attach string, read string,
) *ast.Node {
	valueProperties := []*ast.Node{
		contractProperty(factory, "provides", frozenContextTokenArray(
			factory, contract.effects.Provides, contract.dependencies, "provides", read,
		)),
		contractProperty(factory, "requires", frozenContextTokenArray(
			factory, contract.effects.Requires, contract.dependencies, "requires", read,
		)),
		contractProperty(factory, "optionallyConsumes", frozenContextTokenArray(
			factory,
			contract.effects.OptionallyConsumes,
			contract.dependencies,
			"optionallyConsumes", read,
		)),
	}
	if contract.transparentTarget {
		valueProperties = append(valueProperties, contractProperty(factory, "transparentTarget", factory.NewTrueExpression()))
	}
	return factory.NewCallExpression(factory.NewIdentifier(attach), nil, nil,
		factory.NewNodeList([]*ast.Node{factory.NewIdentifier(component), contractObject(factory, true, valueProperties...)}), ast.NodeFlagsNone)
}

func frozenContextTokenArray(
	factory *printer.NodeFactory,
	tokens []string,
	dependencies []*ast.Node,
	property string, read string,
) *ast.Node {
	values := make([]*ast.Node, 0, len(tokens))
	for _, token := range tokens {
		values = append(values, contextTokenIDExpression(factory, token))
	}
	value := contractArray(factory, values...)
	if len(dependencies) != 0 {
		// Generated empty arrays infer never[], and unique token IDs can infer a
		// narrower element type. Validate the symbols before broadening this
		// compiler-owned array for transitive dependency concatenation.
		symbols := factory.NewArrayTypeNode(factory.NewKeywordTypeNode(ast.KindSymbolKeyword))
		value = factory.NewAsExpression(factory.NewSatisfiesExpression(value, symbols), symbols)
		arguments := make([]*ast.Node, 0, len(dependencies))
		for _, dependency := range dependencies {
			arguments = append(arguments, enhancementDependencyContextProperty(
				factory,
				dependency,
				property, read,
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
	return value
}

func enhancementDependencyContextProperty(
	factory *printer.NodeFactory,
	dependency *ast.Node,
	property string, read string,
) *ast.Node {
	return factory.NewCallExpression(factory.NewIdentifier(read), nil, nil,
		factory.NewNodeList([]*ast.Node{dependency.Clone(factory), contractString(factory, property)}), ast.NodeFlagsNone)
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
