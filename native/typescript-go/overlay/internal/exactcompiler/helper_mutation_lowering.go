package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// lowerOwnedHelperCall forwards a lexical signal only after native callable selection.
// Ordinary values and signatures remain untouched. Direct identifier reads retain TDZ order.
func (lowering *jsxLowering) lowerOwnedHelperCall(node, signal *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if signal == nil || lowering.checking || lowering.target != TargetServer {
		return nil
	}
	id, found := lowering.helperMutations.calls[nodeSpanKey(node)]
	if !found || !ast.IsCallExpression(node) {
		return nil
	}
	entry := lowering.helperMutations.entries[id]
	name := entry.name
	if entry.source != lowering.sourceFile {
		if lowering.helperMutationImports == nil {
			lowering.helperMutationImports = map[string]string{}
		}
		local, exists := lowering.helperMutationImports[id]
		if !exists {
			local = lowering.uniqueMutationName(name)
			lowering.helperMutationImports[id] = local
		}
		name = local
	}
	arguments := []*ast.Node{}
	for _, argument := range callArguments(node) {
		arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
	}
	call := lowering.call(name, []*ast.Node{signal, lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)), lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(arguments), false)})
	return lowering.factory.NewParenthesizedExpression(lowering.binary(lowering.factory.NewVoidExpression(visitor.VisitNode(node.AsCallExpression().Expression)), ast.KindCommaToken, call))
}

// emitHelperMutationEntries clones only eligible owned bodies in the same module scope.
// Each synchronous private entry returns Reflect.apply's value directly, including promises.
// The typecheck-only dependency view preserves authored syntax in both bodies. Executable
// artifacts instead delegate ordinary syntax to the normal JSX lowering visitor.
func (lowering *jsxLowering) emitHelperMutationEntries(source *ast.SourceFile, preserveAuthoredSyntax bool) *ast.SourceFile {
	if lowering.target != TargetServer || lowering.checking {
		return source
	}
	statements := append([]*ast.Node{}, source.Statements.Nodes...)
	assertionName := lowering.uniqueMutationName("__exactAssertArrayCompletion")
	assertionUsed := false
	// Source order makes generated output stable despite map-backed lookup tables.
	for _, original := range lowering.helperMutationOrder {
		entry := lowering.helperMutations.entries[original]
		if entry.source != lowering.sourceFile {
			continue
		}
		if !assertionUsed {
			statements = append(statements, componentConstructorImport(lowering.factory, "assertArrayCompletionVersion", assertionName, "@exactjs/core/framework/server-task-helpers"))
			assertionUsed = true
		}
		signal := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactOwnerSignal"))
		receiver := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactOwnerReceiver"))
		args := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactOwnerArguments"))
		var visitor *ast.NodeVisitor
		visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
			if target, exists := entry.nativeTargets[nodeSourceSpan(node)]; exists {
				return lowering.lowerHelperNativeReference(target, signal, visitor)
			}
			if nativeAssignmentTargetRole(node) == nativeAssignmentPattern && ast.IsBinaryExpression(node) {
				return visitor.VisitEachChild(node)
			}

			// Only this source-owned helper visitor admits the planned native push site.
			// Ordinary component Array calls keep their existing collection lowering owner.
			if write, exists := lowering.writes[nodeSpanKey(node)]; exists && write.Operation == "array-mutation" {
				return lowering.lowerSelectedStateWrite(node, write, signal, false, visitor)
			}
			if result := lowering.lowerSelectedTaskWrite(node, signal, false, visitor); result != nil {
				return result
			}
			if result := lowering.lowerOwnedHelperCall(node, signal, visitor); result != nil {
				return result
			}
			// Keep the helper's signal-aware writes while the ordinary visitor lowers JSX
			// and other executable syntax in the same source-owned body.
			if preserveAuthoredSyntax {
				return visitor.VisitEachChild(node)
			}
			return lowering.visit(node)
		}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
		body := func() *ast.Node {
			previousWrites, previousVisitor := lowering.writes, lowering.visitor
			lowering.writes = indexStateWrites(entry.writes)
			lowering.visitor = visitor
			defer func() {
				lowering.writes, lowering.visitor = previousWrites, previousVisitor
			}()
			return lowering.withMutationFrame(entry.node, visitor.VisitEachChild)
		}()
		// Strip only the declaration's name and export modifiers. Self-as-value references
		// continue to select the original binding, while resolved recursive calls forward ownership.
		var callable *ast.Node
		if ast.IsArrowFunction(body) {
			callable = body
		} else {
			var types *ast.TypeParameterList
			var resultType *ast.Node
			if ast.IsFunctionDeclaration(body) {
				types = body.AsFunctionDeclaration().TypeParameters
				resultType = body.AsFunctionDeclaration().Type
			} else {
				types = body.AsFunctionExpression().TypeParameters
				resultType = body.AsFunctionExpression().Type
			}
			callable = lowering.factory.NewFunctionExpression(lowering.taskWorkModifiers(body), nil, nil, types, lowering.factory.NewNodeList(body.Parameters()), resultType, nil, body.Body())
		}
		// This generated annotation must not resolve an authored AbortSignal alias.
		contextType := lowering.factory.NewImportTypeNode(false, lowering.factory.NewLiteralTypeNode(lowering.factory.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone)), nil, lowering.factory.NewIdentifier("TaskContext"), nil)
		signalType := lowering.factory.NewIndexedAccessTypeNode(contextType, lowering.factory.NewLiteralTypeNode(lowering.factory.NewStringLiteral("signal", ast.TokenFlagsNone)))
		parameters := []*ast.Node{
			lowering.factory.NewParameterDeclaration(nil, nil, signal, nil, signalType, nil),
			lowering.factory.NewParameterDeclaration(nil, nil, receiver, nil, lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword), nil),
			lowering.factory.NewParameterDeclaration(nil, nil, args, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil),
		}
		binding := entry.node.Name()
		if binding == nil {
			binding = sourceCallableBinding(entry.node).Name()
		}
		// Reflect.apply must not contextually replace inferred defaults or binding patterns
		// with unknown parameters. The ordinary signature stays in this same module scope.
		callable = lowering.factory.NewAsExpression(lowering.factory.NewParenthesizedExpression(callable), lowering.factory.NewTypeQueryNode(lowering.factory.NewIdentifier(binding.Text()), nil))
		root := helperReflectRoot(lowering.sourceFile)
		reflect := lowering.factory.NewIdentifier(root)
		if root == "globalThis" {
			reflect = lowering.factory.NewPropertyAccessExpression(reflect, nil, lowering.factory.NewIdentifier("Reflect"), ast.NodeFlagsNone)
		}
		result := lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(reflect, nil, lowering.factory.NewIdentifier("apply"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{callable, receiver, args}), ast.NodeFlagsNone)
		wrapper := lowering.factory.NewFunctionDeclaration(lowering.factory.NewModifierList([]*ast.Node{lowering.factory.NewModifier(ast.KindExportKeyword)}), nil, lowering.factory.NewIdentifier(entry.name), nil, lowering.factory.NewNodeList(parameters), nil, nil, lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewExpressionStatement(lowering.call(assertionName, []*ast.Node{lowering.factory.NewNumericLiteral("4", ast.TokenFlagsNone)})), lowering.factory.NewReturnStatement(result)}), true))
		statements = append(statements, wrapper)
	}
	for _, id := range lowering.helperMutationOrder {
		local, needed := lowering.helperMutationImports[id]
		if !needed {
			continue
		}
		entry := lowering.helperMutations.entries[id]
		statements = append(statements, lowering.factory.NewImportDeclaration(nil, lowering.factory.NewImportClause(ast.KindUnknown, nil, lowering.factory.NewNamedImports(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewImportSpecifier(false, lowering.factory.NewIdentifier(entry.name), lowering.factory.NewIdentifier(local))}))), lowering.factory.NewStringLiteral(helperSourceSpecifier(lowering.sourceFile, entry.source, lowering.helperMutations.selectedSources), ast.TokenFlagsNone), nil))
	}
	return lowering.factory.UpdateSourceFile(source, lowering.factory.NewNodeList(statements), source.EndOfFileToken).AsSourceFile()
}

// emitValidationHelperSource uses the ordinary producer's complete lowering context and helper
// emitter. This typecheck-only dependency view retains authored JSX in the producer and
// companion, preserving their checked return types without creating executable programs.
func emitValidationHelperSource(source *ast.SourceFile, helpers helperMutationPlan, c *checker.Checker) string {
	defer ast.SetParentInChildren(source.AsNode())
	context := printer.NewEmitContext()
	plan := jsxLoweringPlan{helperMutations: helpers, target: TargetServer, typeChecker: c}
	lowering, _ := plan.prepare(source, context)
	lowering.visitor = ast.NewNodeVisitor(lowering.visit, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	transformed := lowering.emitHelperMutationEntries(source, true)
	transformed = lowering.assembleModuleStatements(transformed, len(transformed.Statements.Nodes))
	emitter := printer.NewPrinter(printer.PrinterOptions{NewLine: core.NewLineKindLF, Target: core.ScriptTargetES2022}, printer.PrintHandlers{}, context)
	return emitter.EmitSourceFile(transformed)
}
