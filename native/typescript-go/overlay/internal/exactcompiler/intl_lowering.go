package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

var cachedIntlConstructors = map[string]map[string]struct{}{
	"NumberFormat":       {"format": {}, "formatRange": {}, "formatToParts": {}, "formatRangeToParts": {}, "resolvedOptions": {}},
	"DateTimeFormat":     {"format": {}, "formatRange": {}, "formatToParts": {}, "formatRangeToParts": {}, "resolvedOptions": {}},
	"PluralRules":        {"select": {}, "selectRange": {}, "resolvedOptions": {}},
	"RelativeTimeFormat": {"format": {}, "formatToParts": {}, "resolvedOptions": {}},
	"DisplayNames":       {"of": {}, "resolvedOptions": {}},
	"ListFormat":         {"format": {}, "formatToParts": {}, "resolvedOptions": {}},
	"Collator":           {"compare": {}, "resolvedOptions": {}},
	"Segmenter":          {"segment": {}, "resolvedOptions": {}},
	"DurationFormat":     {"format": {}, "formatToParts": {}, "resolvedOptions": {}},
	"Locale":             {},
}

type intlBindingLowering struct {
	constructor string
	arguments   *ast.NodeList
	declaration *ast.Node
	uses        map[string]bool
}

type intlConstructorLowering struct {
	constructor string
	component   bool
}

type intlPrototypeLowering struct {
	operation  string
	projection string
	component  bool
}

type intlOperationPlan struct {
	constructors map[string]intlConstructorLowering
	bindings     map[string]*intlBindingLowering
	prototypes   map[string]intlPrototypeLowering
	removed      map[int]struct{}
	globalAlias  string
}

// lowerIntlOperations routes proven native formatter operations through core's realm cache. The
// semantic plan is built from the checker-owned tree before synthesized imports and render plans
// exist; applying it afterward prevents generated identifiers from entering TypeScript lookup.
func lowerIntlOperations(
	transformed *ast.SourceFile,
	factory *printer.NodeFactory,
	plan intlOperationPlan,
) *ast.SourceFile {
	if len(plan.constructors) == 0 && len(plan.bindings) == 0 && len(plan.prototypes) == 0 {
		return transformed
	}
	usedGlobal := false
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsVariableStatement(node) {
				statement := node.AsVariableStatement()
				list := statement.DeclarationList.AsVariableDeclarationList()
				declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
				for _, declaration := range list.Declarations.Nodes {
					if _, omit := plan.removed[declaration.Pos()]; omit {
						continue
					}
					declarations = append(declarations, visitor.VisitEachChild(declaration))
				}
				if len(declarations) == 0 {
					return factory.NewEmptyStatement()
				}
				if len(declarations) != len(list.Declarations.Nodes) {
					return factory.UpdateVariableStatement(
						statement,
						statement.Modifiers(),
						factory.UpdateVariableDeclarationList(
							list,
							factory.NewNodeList(declarations),
							list.Flags,
						),
					)
				}
			}
			visited := visitor.VisitEachChild(node)
			if ast.IsCallExpression(node) {
				if binding := plan.bindings[nodeSpanKey(node)]; binding != nil {
					call := visited.AsCallExpression()
					operation := call.Expression.AsPropertyAccessExpression()
					component := binding.uses[nodeSpanKey(node)]
					facade := plannedIntlFacade(factory, component, plan.globalAlias)
					usedGlobal = usedGlobal || !component
					return factory.NewCallExpression(
						factory.NewPropertyAccessExpression(
							intlCachedConstructor(factory, facade, binding.constructor, binding.arguments),
							operation.QuestionDotToken,
							operation.Name(),
							ast.NodeFlagsNone,
						),
						call.QuestionDotToken,
						call.TypeArguments,
						call.Arguments,
						ast.NodeFlagsNone,
					)
				}
				if prototype, exists := plan.prototypes[nodeSpanKey(node)]; exists {
					call := visited.AsCallExpression()
					member := call.Expression.AsPropertyAccessExpression()
					facade := plannedIntlFacade(factory, prototype.component, plan.globalAlias)
					usedGlobal = usedGlobal || !prototype.component
					arguments := []*ast.Node{member.Expression}
					if prototype.projection != "" {
						arguments = append(arguments, factory.NewStringLiteral(prototype.projection, ast.TokenFlagsNone))
					}
					arguments = append(arguments, call.Arguments.Nodes...)
					return factory.NewCallExpression(
						factory.NewPropertyAccessExpression(
							facade,
							nil,
							factory.NewIdentifier(prototype.operation),
							ast.NodeFlagsNone,
						),
						nil,
						nil,
						factory.NewNodeList(arguments),
						ast.NodeFlagsNone,
					)
				}
			}
			if constructor, exists := plan.constructors[nodeSpanKey(node)]; exists {
				var arguments *ast.NodeList
				if ast.IsCallExpression(visited) {
					arguments = visited.AsCallExpression().Arguments
				} else if ast.IsNewExpression(visited) {
					arguments = visited.AsNewExpression().Arguments
				} else {
					return visited
				}
				facade := plannedIntlFacade(factory, constructor.component, plan.globalAlias)
				usedGlobal = usedGlobal || !constructor.component
				return intlCachedConstructor(factory, facade, constructor.constructor, arguments)
			}
			return visited
		},
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	result := visitor.VisitEachChild(transformed.AsNode()).AsSourceFile()
	if usedGlobal {
		result = addIntlFacadeImport(result, factory, plan.globalAlias)
	}
	ast.SetParentInChildren(result.AsNode())
	return result
}

func planIntlOperations(sourceFile *ast.SourceFile, typeChecker *checker.Checker) intlOperationPlan {
	componentNodes := make(map[*ast.Node]struct{})
	for _, candidate := range activeComponentCandidates(sourceFile) {
		componentNodes[candidate.node] = struct{}{}
	}
	bindings := collectIntlBindingLowerings(sourceFile, typeChecker, componentNodes)
	plan := intlOperationPlan{
		constructors: make(map[string]intlConstructorLowering),
		bindings:     make(map[string]*intlBindingLowering),
		prototypes:   make(map[string]intlPrototypeLowering),
		removed:      make(map[int]struct{}),
		globalAlias:  intlGlobalAlias(sourceFile),
	}
	for _, binding := range bindings {
		plan.removed[binding.declaration.Pos()] = struct{}{}
		for span := range binding.uses {
			plan.bindings[span] = binding
		}
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if constructor, _, supported := nativeIntlConstructor(node, typeChecker); supported {
			plan.constructors[nodeSpanKey(node)] = intlConstructorLowering{
				constructor: constructor,
				component:   insideIntlComponentScope(node, componentNodes),
			}
		}
		if ast.IsCallExpression(node) {
			if prototype, supported := planPrototypeLocaleCall(node, typeChecker); supported {
				prototype.component = insideIntlComponentScope(node, componentNodes)
				plan.prototypes[nodeSpanKey(node)] = prototype
			}
		}
		return true
	})
	return plan
}

func collectIntlBindingLowerings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	componentNodes map[*ast.Node]struct{},
) []*intlBindingLowering {
	bySymbol := make(map[ast.SymbolId]*intlBindingLowering)
	byName := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) || declaration.Initializer == nil {
			return true
		}
		for cursor := node.Parent; cursor != nil; cursor = cursor.Parent {
			if ast.IsVariableStatement(cursor) {
				if ast.HasSyntacticModifier(cursor, ast.ModifierFlagsExport) {
					return true
				}
				break
			}
		}
		constructor, arguments, supported := nativeIntlConstructor(declaration.Initializer, typeChecker)
		if !supported || !finiteIntlArguments(arguments) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(declaration.Name())
		if symbol != nil {
			byName[declaration.Name().Text()] = struct{}{}
			bySymbol[ast.GetSymbolId(symbol)] = &intlBindingLowering{
				constructor: constructor,
				arguments:   arguments,
				declaration: node,
				uses:        make(map[string]bool),
			}
		}
		return true
	})
	unsafe := make(map[*intlBindingLowering]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) {
			return true
		}
		if _, candidate := byName[node.Text()]; !candidate {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		binding := bySymbol[ast.GetSymbolId(symbol)]
		if binding == nil {
			return true
		}
		call := intlBindingMethodCall(node, binding.constructor)
		if call == nil {
			unsafe[binding] = struct{}{}
			return true
		}
		binding.uses[nodeSpanKey(call)] = insideIntlComponentScope(call, componentNodes)
		return true
	})
	result := make([]*intlBindingLowering, 0, len(bySymbol))
	for _, binding := range bySymbol {
		if _, rejected := unsafe[binding]; rejected || len(binding.uses) == 0 {
			continue
		}
		result = append(result, binding)
	}
	return result
}

func intlBindingMethodCall(identifier *ast.Node, constructor string) *ast.Node {
	member := identifier.Parent
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.AsPropertyAccessExpression().Expression != identifier {
		return nil
	}
	if _, supported := cachedIntlConstructors[constructor][member.AsPropertyAccessExpression().Name().Text()]; !supported {
		return nil
	}
	call := member.Parent
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().Expression != member {
		return nil
	}
	return call
}

func finiteIntlArguments(arguments *ast.NodeList) bool {
	if arguments == nil || len(arguments.Nodes) == 0 {
		return true
	}
	if len(arguments.Nodes) > 2 || !ast.IsStringLiteral(arguments.Nodes[0]) {
		return false
	}
	if len(arguments.Nodes) == 2 {
		_, valid := intlObjectOptions(arguments.Nodes[1])
		return valid
	}
	return true
}

func nativeIntlConstructor(expression *ast.Node, typeChecker *checker.Checker) (string, *ast.NodeList, bool) {
	constructor, arguments, supported := intlConstructor(expression)
	if !supported {
		return "", nil, false
	}
	if _, known := cachedIntlConstructors[constructor]; !known {
		return "", nil, false
	}
	var target *ast.Node
	if ast.IsCallExpression(expression) {
		target = expression.AsCallExpression().Expression
	} else {
		target = expression.AsNewExpression().Expression
	}
	member := target.AsPropertyAccessExpression()
	if !nativeDeclarationSymbol(typeChecker.GetSymbolAtLocation(member.Expression)) {
		return "", nil, false
	}
	return constructor, arguments, true
}

func nativeDeclarationSymbol(symbol *ast.Symbol) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile {
			return false
		}
	}
	return true
}

func planPrototypeLocaleCall(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (intlPrototypeLowering, bool) {
	call := expression.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) || call.Arguments == nil || len(call.Arguments.Nodes) > 2 {
		return intlPrototypeLowering{}, false
	}
	member := call.Expression.AsPropertyAccessExpression()
	method := member.Name().Text()
	if method != "toLocaleString" && method != "toLocaleDateString" && method != "toLocaleTimeString" {
		return intlPrototypeLowering{}, false
	}
	if !nativeDeclarationSymbol(typeChecker.GetSymbolAtLocation(member.Name())) {
		return intlPrototypeLowering{}, false
	}
	if len(call.Arguments.Nodes) == 2 {
		if _, valid := intlObjectOptions(call.Arguments.Nodes[1]); !valid {
			return intlPrototypeLowering{}, false
		}
	}
	typeName := typeChecker.TypeToString(typeChecker.GetTypeAtLocation(member.Expression))
	if typeName == "Date" {
		projection := "date-time"
		if method == "toLocaleDateString" {
			projection = "date"
		} else if method == "toLocaleTimeString" {
			projection = "time"
		}
		return intlPrototypeLowering{operation: "formatDate", projection: projection}, true
	}
	if method == "toLocaleString" && (typeName == "number" || typeName == "bigint") {
		return intlPrototypeLowering{operation: "formatNumber"}, true
	}
	return intlPrototypeLowering{}, false
}

func intlCachedConstructor(factory *printer.NodeFactory, facade *ast.Node, constructor string, arguments *ast.NodeList) *ast.Node {
	return factory.NewCallExpression(
		factory.NewPropertyAccessExpression(facade, nil, factory.NewIdentifier(constructor), ast.NodeFlagsNone),
		nil,
		nil,
		arguments,
		ast.NodeFlagsNone,
	)
}

func plannedIntlFacade(factory *printer.NodeFactory, component bool, globalAlias string) *ast.Node {
	if component {
		return factory.NewPropertyAccessExpression(
			factory.NewIdentifier("this"),
			nil,
			factory.NewIdentifier("intl"),
			ast.NodeFlagsNone,
		)
	}
	return factory.NewIdentifier(globalAlias)
}

func insideIntlComponentScope(node *ast.Node, componentNodes map[*ast.Node]struct{}) bool {
	for cursor := node.Parent; cursor != nil; cursor = cursor.Parent {
		if _, component := componentNodes[cursor]; component {
			return true
		}
		if ast.IsFunctionDeclaration(cursor) || ast.IsFunctionExpression(cursor) || ast.IsMethodDeclaration(cursor) {
			return false
		}
	}
	return false
}

func intlGlobalAlias(sourceFile *ast.SourceFile) string {
	used := sourceIdentifiers(sourceFile)
	if _, exists := used["__exactIntl"]; !exists {
		return "__exactIntl"
	}
	for suffix := 2; ; suffix++ {
		candidate := "__exactIntl" + fmt.Sprintf("%d", suffix)
		if _, exists := used[candidate]; !exists {
			return candidate
		}
	}
}

func addIntlFacadeImport(sourceFile *ast.SourceFile, factory *printer.NodeFactory, alias string) *ast.SourceFile {
	declaration := factory.NewImportDeclaration(
		nil,
		factory.NewImportClause(
			ast.KindUnknown,
			nil,
			factory.NewNamedImports(factory.NewNodeList([]*ast.Node{
				factory.NewImportSpecifier(false, factory.NewIdentifier("intl"), factory.NewIdentifier(alias)),
			})),
		),
		factory.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone),
		nil,
	)
	statements := append([]*ast.Node(nil), sourceFile.Statements.Nodes...)
	insertion := 0
	for insertion < len(statements) && isDirectiveStatement(statements[insertion]) {
		insertion++
	}
	statements = append(statements, nil)
	copy(statements[insertion+1:], statements[insertion:])
	statements[insertion] = declaration
	return factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
}
