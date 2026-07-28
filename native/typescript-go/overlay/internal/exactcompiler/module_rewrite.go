package exactcompiler

import (
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

type moduleReplacementIndex map[string]map[string]ModuleExportReplacement

type injectedModuleImport struct {
	targetModule string
	targetExport string
	local        *ast.IdentifierNode
}

// rewriteModuleReferences applies host-planned aliases and export replacements
// directly to the lowered native tree. The authored tree supplies checker
// identities for namespace imports; no compiler-owned syntax crosses into
// JavaScript.
func rewriteModuleReferences(
	authored *ast.SourceFile,
	transformed *ast.SourceFile,
	factory *printer.NodeFactory,
	typeChecker *checker.Checker,
	options *ModuleRewrite,
) (*ast.SourceFile, error) {
	replacements, err := indexModuleReplacements(options.Replacements)
	if err != nil {
		return nil, err
	}
	namespaceImports := namespaceReplacementBindings(authored, typeChecker, replacements)
	injectedImports := make(map[string]injectedModuleImport)
	statements := make([]*ast.Node, 0, len(transformed.Statements.Nodes))
	for _, statement := range transformed.Statements.Nodes {
		switch {
		case ast.IsImportDeclaration(statement):
			rewritten, rewriteErr := rewriteImportDeclaration(
				statement.AsImportDeclaration(),
				factory,
				options.ModuleAliases,
				replacements,
			)
			if rewriteErr != nil {
				return nil, rewriteErr
			}
			statements = append(
				statements,
				rewritten...,
			)
		case ast.IsExportDeclaration(statement):
			statements = append(
				statements,
				rewriteExportDeclaration(
					statement.AsExportDeclaration(),
					factory,
					options.ModuleAliases,
					replacements,
				)...,
			)
		case ast.IsVariableStatement(statement):
			statements = append(
				statements,
				rewriteCommonJSDestructuring(
					statement.AsVariableStatement(),
					factory,
					replacements,
				),
			)
		default:
			statements = append(statements, statement)
		}
	}
	transformed = factory.UpdateSourceFile(
		transformed,
		factory.NewNodeList(statements),
		transformed.EndOfFileToken,
	).AsSourceFile()

	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if ast.IsVariableStatement(node) {
				rewritten := rewriteCommonJSDestructuring(
					node.AsVariableStatement(),
					factory,
					replacements,
				)
				if rewritten != node {
					return visitor.VisitEachChild(rewritten)
				}
			}
			if ast.IsCallExpression(node) {
				call := node.AsCallExpression()
				if moduleCallExpression(call.Expression) &&
					call.Arguments != nil &&
					len(call.Arguments.Nodes) != 0 {
					arguments := append([]*ast.Node(nil), call.Arguments.Nodes...)
					arguments[0] = aliasedModuleLiteral(
						arguments[0],
						factory,
						options.ModuleAliases,
					)
					if arguments[0] != call.Arguments.Nodes[0] {
						return factory.UpdateCallExpression(
							call,
							call.Expression,
							call.QuestionDotToken,
							call.TypeArguments,
							factory.NewNodeList(arguments),
							call.Flags,
						)
					}
				}
			}
			if ast.IsImportTypeNode(node) {
				importType := node.AsImportTypeNode()
				argument := importType.Argument
				if ast.IsLiteralTypeNode(argument) {
					literal := argument.AsLiteralTypeNode().Literal
					updated := aliasedModuleLiteral(
						literal,
						factory,
						options.ModuleAliases,
					)
					if updated != literal {
						return factory.UpdateImportTypeNode(
							importType,
							importType.IsTypeOf,
							factory.NewLiteralTypeNode(updated),
							importType.Attributes,
							importType.Qualifier,
							importType.TypeArguments,
						)
					}
				}
			}
			if ast.IsPropertyAccessExpression(node) {
				member := node.AsPropertyAccessExpression()
				if replacement, ok := commonJSMemberReplacement(
					member.Expression,
					member.Name().Text(),
					replacements,
				); ok {
					return replacementPropertyAccess(member, replacement, factory)
				}
				if replacement, ok := namespaceMemberReplacement(
					member.Expression,
					member.Name().Text(),
					typeChecker,
					namespaceImports,
				); ok {
					return injectedReplacementIdentifier(replacement, factory, injectedImports)
				}
			}
			if ast.IsElementAccessExpression(node) {
				member := node.AsElementAccessExpression()
				if member.ArgumentExpression != nil &&
					ast.IsStringLiteral(member.ArgumentExpression) {
					exportName := member.ArgumentExpression.AsStringLiteral().Text
					if replacement, ok := commonJSMemberReplacement(
						member.Expression,
						exportName,
						replacements,
					); ok {
						return replacementElementAccess(member, replacement, factory)
					}
					if replacement, ok := namespaceMemberReplacement(
						member.Expression,
						exportName,
						typeChecker,
						namespaceImports,
					); ok {
						return injectedReplacementIdentifier(replacement, factory, injectedImports)
					}
				}
			}
			return visitor.VisitEachChild(node)
		},
		&factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	transformed = visitor.VisitNode(transformed.AsNode()).AsSourceFile()
	if len(injectedImports) == 0 {
		return transformed, nil
	}
	return insertInjectedModuleImports(transformed, factory, injectedImports), nil
}

func indexModuleReplacements(
	values []ModuleExportReplacement,
) (moduleReplacementIndex, error) {
	result := make(moduleReplacementIndex)
	for _, value := range values {
		exports := result[value.SourceModule]
		if exports == nil {
			exports = make(map[string]ModuleExportReplacement)
			result[value.SourceModule] = exports
		}
		if _, exists := exports[value.SourceExport]; exists {
			return nil, fmt.Errorf(
				"duplicate module replacement for %s.%s",
				value.SourceModule,
				value.SourceExport,
			)
		}
		exports[value.SourceExport] = value
	}
	return result, nil
}

func namespaceReplacementBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	replacements moduleReplacementIndex,
) map[*ast.Symbol]map[string]ModuleExportReplacement {
	result := make(map[*ast.Symbol]map[string]ModuleExportReplacement)
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		sourceModule, ok := stringLiteralText(declaration.ModuleSpecifier)
		if !ok || declaration.ImportClause == nil {
			continue
		}
		byExport := replacements[sourceModule]
		clause := declaration.ImportClause.AsImportClause()
		if byExport == nil || clause.NamedBindings == nil ||
			!ast.IsNamespaceImport(clause.NamedBindings) {
			continue
		}
		name := clause.NamedBindings.AsNamespaceImport().Name()
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			result[symbol] = byExport
		}
	}
	return result
}

func rewriteImportDeclaration(
	declaration *ast.ImportDeclaration,
	factory *printer.NodeFactory,
	aliases map[string]string,
	replacements moduleReplacementIndex,
) ([]*ast.Node, error) {
	sourceModule, ok := stringLiteralText(declaration.ModuleSpecifier)
	if !ok {
		return []*ast.Node{declaration.AsNode()}, nil
	}
	if alias, exists := aliases[sourceModule]; exists {
		return []*ast.Node{
			factory.UpdateImportDeclaration(
				declaration,
				declaration.Modifiers(),
				declaration.ImportClause,
				factory.NewStringLiteral(alias, ast.TokenFlagsNone),
				declaration.Attributes,
			),
		}, nil
	}
	byExport := replacements[sourceModule]
	if byExport == nil || declaration.ImportClause == nil {
		return []*ast.Node{declaration.AsNode()}, nil
	}
	clause := declaration.ImportClause.AsImportClause()
	if clause.PhaseModifier == ast.KindTypeKeyword ||
		(clause.NamedBindings != nil && ast.IsNamespaceImport(clause.NamedBindings)) {
		return []*ast.Node{declaration.AsNode()}, nil
	}

	retained := make([]*ast.Node, 0)
	groups := make(map[string]*importReplacementGroup)
	defaultName := clause.Name()
	defaultReplacement, replaceDefault := byExport["default"]
	if replaceDefault && defaultName != nil {
		group := importTargetGroup(groups, defaultReplacement.TargetModule)
		if defaultReplacement.TargetExport == "default" {
			group.defaultName = defaultName
		} else {
			group.specifiers = append(
				group.specifiers,
				factory.NewImportSpecifier(
					false,
					factory.NewIdentifier(defaultReplacement.TargetExport),
					defaultName,
				),
			)
		}
		defaultName = nil
	}
	var named *ast.NamedImports
	if clause.NamedBindings != nil && ast.IsNamedImports(clause.NamedBindings) {
		named = clause.NamedBindings.AsNamedImports()
		for _, specifierNode := range named.Elements.Nodes {
			specifier := specifierNode.AsImportSpecifier()
			sourceExport := specifier.Name().Text()
			if specifier.PropertyName != nil {
				sourceExport = specifier.PropertyName.Text()
			}
			replacement, exists := byExport[sourceExport]
			if specifier.IsTypeOnly || !exists {
				retained = append(retained, specifierNode)
				continue
			}
			group := importTargetGroup(groups, replacement.TargetModule)
			if replacement.TargetExport == "default" {
				if group.defaultName != nil {
					return nil, fmt.Errorf(
						"cannot map multiple imports to the default export of %s",
						replacement.TargetModule,
					)
				}
				group.defaultName = specifier.Name()
			} else {
				group.specifiers = append(
					group.specifiers,
					factory.NewImportSpecifier(
						false,
						factory.NewIdentifier(replacement.TargetExport),
						specifier.Name(),
					),
				)
			}
		}
	}
	if !replaceDefault && len(retained) == importSpecifierCount(named) {
		return []*ast.Node{declaration.AsNode()}, nil
	}

	result := make([]*ast.Node, 0, len(groups)+1)
	if defaultName != nil || len(retained) != 0 {
		var namedBindings *ast.Node
		if len(retained) != 0 {
			namedBindings = factory.NewNamedImports(factory.NewNodeList(retained))
		}
		result = append(
			result,
			factory.UpdateImportDeclaration(
				declaration,
				declaration.Modifiers(),
				factory.UpdateImportClause(
					clause,
					ast.KindUnknown,
					identifierNode(defaultName),
					namedBindings,
				),
				declaration.ModuleSpecifier,
				declaration.Attributes,
			),
		)
	}
	for _, targetModule := range sortedKeys(groups) {
		group := groups[targetModule]
		var namedBindings *ast.Node
		if len(group.specifiers) != 0 {
			namedBindings = factory.NewNamedImports(factory.NewNodeList(group.specifiers))
		}
		result = append(
			result,
			factory.NewImportDeclaration(
				nil,
				factory.NewImportClause(
					ast.KindUnknown,
					group.defaultName,
					namedBindings,
				),
				factory.NewStringLiteral(targetModule, ast.TokenFlagsNone),
				nil,
			),
		)
	}
	return result, nil
}

type importReplacementGroup struct {
	defaultName *ast.IdentifierNode
	specifiers  []*ast.Node
}

func importTargetGroup(
	groups map[string]*importReplacementGroup,
	targetModule string,
) *importReplacementGroup {
	group := groups[targetModule]
	if group == nil {
		group = &importReplacementGroup{}
		groups[targetModule] = group
	}
	return group
}

func rewriteExportDeclaration(
	declaration *ast.ExportDeclaration,
	factory *printer.NodeFactory,
	aliases map[string]string,
	replacements moduleReplacementIndex,
) []*ast.Node {
	sourceModule, ok := stringLiteralText(declaration.ModuleSpecifier)
	if !ok {
		return []*ast.Node{declaration.AsNode()}
	}
	if alias, exists := aliases[sourceModule]; exists {
		return []*ast.Node{
			factory.UpdateExportDeclaration(
				declaration,
				declaration.Modifiers(),
				declaration.IsTypeOnly,
				declaration.ExportClause,
				factory.NewStringLiteral(alias, ast.TokenFlagsNone),
				declaration.Attributes,
			),
		}
	}
	byExport := replacements[sourceModule]
	if byExport == nil || declaration.IsTypeOnly || declaration.ExportClause == nil ||
		!ast.IsNamedExports(declaration.ExportClause) {
		return []*ast.Node{declaration.AsNode()}
	}
	retained := make([]*ast.Node, 0)
	grouped := make(map[string][]*ast.Node)
	named := declaration.ExportClause.AsNamedExports()
	for _, specifierNode := range named.Elements.Nodes {
		specifier := specifierNode.AsExportSpecifier()
		sourceExport := specifier.Name().Text()
		if specifier.PropertyName != nil {
			sourceExport = specifier.PropertyName.Text()
		}
		replacement, exists := byExport[sourceExport]
		if specifier.IsTypeOnly || !exists {
			retained = append(retained, specifierNode)
			continue
		}
		grouped[replacement.TargetModule] = append(
			grouped[replacement.TargetModule],
			factory.NewExportSpecifier(
				false,
				factory.NewIdentifier(replacement.TargetExport),
				specifier.Name(),
			),
		)
	}
	if len(retained) == len(named.Elements.Nodes) {
		return []*ast.Node{declaration.AsNode()}
	}
	result := make([]*ast.Node, 0, len(grouped)+1)
	if len(retained) != 0 {
		result = append(
			result,
			factory.UpdateExportDeclaration(
				declaration,
				declaration.Modifiers(),
				false,
				factory.NewNamedExports(factory.NewNodeList(retained)),
				declaration.ModuleSpecifier,
				declaration.Attributes,
			),
		)
	}
	for _, targetModule := range sortedKeys(grouped) {
		result = append(
			result,
			factory.NewExportDeclaration(
				nil,
				false,
				factory.NewNamedExports(factory.NewNodeList(grouped[targetModule])),
				factory.NewStringLiteral(targetModule, ast.TokenFlagsNone),
				nil,
			),
		)
	}
	return result
}

func rewriteCommonJSDestructuring(
	statement *ast.VariableStatement,
	factory *printer.NodeFactory,
	replacements moduleReplacementIndex,
) *ast.Node {
	declarations := make([]*ast.Node, 0)
	changed := false
	list := statement.DeclarationList.AsVariableDeclarationList()
	for _, declarationNode := range list.Declarations.Nodes {
		declaration := declarationNode.AsVariableDeclaration()
		name := declaration.Name()
		sourceModule, ok := requireModule(declaration.Initializer)
		if !ok || !ast.IsObjectBindingPattern(name) || replacements[sourceModule] == nil {
			declarations = append(declarations, declarationNode)
			continue
		}
		retained := make([]*ast.Node, 0)
		grouped := make(map[string][]*ast.Node)
		for _, elementNode := range name.AsBindingPattern().Elements.Nodes {
			element := elementNode.AsBindingElement()
			sourceExport, named := bindingElementExportName(element)
			replacement, exists := replacements[sourceModule][sourceExport]
			if element.DotDotDotToken != nil || !named || !exists {
				retained = append(retained, elementNode)
				continue
			}
			changed = true
			grouped[replacement.TargetModule] = append(
				grouped[replacement.TargetModule],
				factory.UpdateBindingElement(
					element,
					element.DotDotDotToken,
					factory.NewIdentifier(replacement.TargetExport),
					element.Name(),
					element.Initializer,
				),
			)
		}
		if len(retained) != 0 {
			declarations = append(
				declarations,
				factory.UpdateVariableDeclaration(
					declaration,
					factory.NewBindingPattern(
						ast.KindObjectBindingPattern,
						factory.NewNodeList(retained),
					),
					declaration.ExclamationToken,
					declaration.Type,
					declaration.Initializer,
				),
			)
		}
		for _, targetModule := range sortedKeys(grouped) {
			declarations = append(
				declarations,
				factory.NewVariableDeclaration(
					factory.NewBindingPattern(
						ast.KindObjectBindingPattern,
						factory.NewNodeList(grouped[targetModule]),
					),
					nil,
					declaration.Type,
					newRequireCall(factory, targetModule),
				),
			)
		}
	}
	if !changed {
		return statement.AsNode()
	}
	return factory.UpdateVariableStatement(
		statement,
		statement.Modifiers(),
		factory.UpdateVariableDeclarationList(list, factory.NewNodeList(declarations), list.Flags),
	)
}

func commonJSMemberReplacement(
	expression *ast.Node,
	exportName string,
	replacements moduleReplacementIndex,
) (ModuleExportReplacement, bool) {
	sourceModule, ok := requireModule(expression)
	if !ok {
		return ModuleExportReplacement{}, false
	}
	replacement, exists := replacements[sourceModule][exportName]
	return replacement, exists
}

func namespaceMemberReplacement(
	expression *ast.Node,
	exportName string,
	typeChecker *checker.Checker,
	bindings map[*ast.Symbol]map[string]ModuleExportReplacement,
) (ModuleExportReplacement, bool) {
	if expression == nil || !ast.IsIdentifier(expression) {
		return ModuleExportReplacement{}, false
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	replacement, exists := bindings[symbol][exportName]
	return replacement, exists
}

func replacementPropertyAccess(
	member *ast.PropertyAccessExpression,
	replacement ModuleExportReplacement,
	factory *printer.NodeFactory,
) *ast.Node {
	return factory.NewPropertyAccessExpression(
		newRequireCall(factory, replacement.TargetModule),
		nil,
		factory.NewIdentifier(replacement.TargetExport),
		member.Flags,
	)
}

func replacementElementAccess(
	member *ast.ElementAccessExpression,
	replacement ModuleExportReplacement,
	factory *printer.NodeFactory,
) *ast.Node {
	return factory.NewElementAccessExpression(
		newRequireCall(factory, replacement.TargetModule),
		nil,
		factory.NewStringLiteral(replacement.TargetExport, ast.TokenFlagsNone),
		member.Flags,
	)
}

func injectedReplacementIdentifier(
	replacement ModuleExportReplacement,
	factory *printer.NodeFactory,
	imports map[string]injectedModuleImport,
) *ast.Node {
	key := replacement.TargetModule + "\x00" + replacement.TargetExport
	value, exists := imports[key]
	if !exists {
		value = injectedModuleImport{
			targetModule: replacement.TargetModule,
			targetExport: replacement.TargetExport,
			local: factory.NewUniqueName(
				"__exact_" + safeModuleIdentifier(replacement.TargetExport),
			),
		}
		imports[key] = value
	}
	return value.local
}

func insertInjectedModuleImports(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
	imports map[string]injectedModuleImport,
) *ast.SourceFile {
	keys := sortedKeys(imports)
	injected := make([]*ast.Node, 0, len(keys))
	for _, key := range keys {
		value := imports[key]
		injected = append(
			injected,
			factory.NewImportDeclaration(
				nil,
				factory.NewImportClause(
					ast.KindUnknown,
					nil,
					factory.NewNamedImports(
						factory.NewNodeList([]*ast.Node{
							factory.NewImportSpecifier(
								false,
								factory.NewIdentifier(value.targetExport),
								value.local,
							),
						}),
					),
				),
				factory.NewStringLiteral(value.targetModule, ast.TokenFlagsNone),
				nil,
			),
		)
	}
	split := 0
	for split < len(sourceFile.Statements.Nodes) &&
		isModuleDirectiveStatement(sourceFile.Statements.Nodes[split]) {
		split++
	}
	statements := make([]*ast.Node, 0, len(sourceFile.Statements.Nodes)+len(injected))
	statements = append(statements, sourceFile.Statements.Nodes[:split]...)
	statements = append(statements, injected...)
	statements = append(statements, sourceFile.Statements.Nodes[split:]...)
	return factory.UpdateSourceFile(
		sourceFile,
		factory.NewNodeList(statements),
		sourceFile.EndOfFileToken,
	).AsSourceFile()
}

func aliasedModuleLiteral(
	node *ast.Node,
	factory *printer.NodeFactory,
	aliases map[string]string,
) *ast.Node {
	text, ok := stringLiteralText(node)
	if !ok {
		return node
	}
	replacement, exists := aliases[text]
	if !exists {
		return node
	}
	return factory.NewStringLiteral(replacement, ast.TokenFlagsNone)
}

func requireModule(node *ast.Node) (string, bool) {
	if node == nil || !ast.IsCallExpression(node) {
		return "", false
	}
	call := node.AsCallExpression()
	if call.Expression == nil || !ast.IsIdentifier(call.Expression) ||
		call.Expression.Text() != "require" || call.Arguments == nil ||
		len(call.Arguments.Nodes) != 1 {
		return "", false
	}
	return stringLiteralText(call.Arguments.Nodes[0])
}

func newRequireCall(factory *printer.NodeFactory, targetModule string) *ast.Node {
	return factory.NewCallExpression(
		factory.NewIdentifier("require"),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{
			factory.NewStringLiteral(targetModule, ast.TokenFlagsNone),
		}),
		ast.NodeFlagsNone,
	)
}

func bindingElementExportName(element *ast.BindingElement) (string, bool) {
	if element.PropertyName != nil &&
		(ast.IsIdentifier(element.PropertyName) || ast.IsStringLiteral(element.PropertyName)) {
		return element.PropertyName.Text(), true
	}
	if name := element.Name(); name != nil && ast.IsIdentifier(name) {
		return name.Text(), true
	}
	return "", false
}

func stringLiteralText(node *ast.Node) (string, bool) {
	if node == nil || !ast.IsStringLiteral(node) {
		return "", false
	}
	return node.AsStringLiteral().Text, true
}

func moduleCallExpression(node *ast.Node) bool {
	return node != nil &&
		(node.Kind == ast.KindImportKeyword ||
			(ast.IsIdentifier(node) && node.Text() == "require"))
}

func importSpecifierCount(named *ast.NamedImports) int {
	if named == nil {
		return 0
	}
	return len(named.Elements.Nodes)
}

func identifierNode(node *ast.Node) *ast.IdentifierNode {
	if node == nil {
		return nil
	}
	return node
}

func isModuleDirectiveStatement(node *ast.Node) bool {
	return ast.IsExpressionStatement(node) &&
		ast.IsStringLiteral(node.AsExpressionStatement().Expression)
}

func safeModuleIdentifier(value string) string {
	var result strings.Builder
	for index, character := range value {
		if character == '_' || character == '$' || unicode.IsLetter(character) ||
			(index > 0 && unicode.IsDigit(character)) {
			result.WriteRune(character)
		} else {
			result.WriteRune('_')
		}
	}
	if result.Len() == 0 {
		return "export"
	}
	return result.String()
}

func sortedKeys[Value any](values map[string]Value) []string {
	result := make([]string, 0, len(values))
	for key := range values {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
}
