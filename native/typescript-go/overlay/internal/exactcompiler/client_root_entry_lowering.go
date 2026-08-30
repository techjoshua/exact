package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// lowerCompiledClientRootCalls redirects compiler-issued component roots to narrow physical
// mount and hydration entries. Public calls with any other value retain their authored API.
func (lowering *jsxLowering) lowerCompiledClientRootCalls(root *ast.SourceFile) *ast.SourceFile {
	if lowering.target != TargetClient {
		return root
	}
	// The JSX visitor creates replacement declarations; restore parent links before reading the
	// declaration-list const flag for immutable operation aliases.
	ast.SetParentInChildren(root.AsNode())
	rootOperations := lowering.compiledClientRootVariables(root)
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		updated := visitor.VisitEachChild(node)
		if !ast.IsCallExpression(updated) {
			return updated
		}
		call := updated.AsCallExpression()
		if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			return updated
		}
		helper, supported := lowering.compiledClientRootCallee(
			call.Expression,
			call.Arguments.Nodes[0],
			rootOperations,
		)
		if !supported {
			return updated
		}
		if ast.IsIdentifier(call.Expression) {
			lowering.redirectedRootImports[call.Expression.Text()] = struct{}{}
		}
		return lowering.factory.UpdateCallExpression(
			call,
			lowering.factory.NewIdentifier(helper),
			call.QuestionDotToken,
			call.TypeArguments,
			call.Arguments,
			call.Flags,
		)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitEachChild(root.AsNode()).AsSourceFile()
}

// compiledClientRootVariables proves immutable local aliases of compiler-issued component
// operations. Ordinary TS may name a compiled JSX value before choosing mount or hydration.
type clientRootVariableKey struct {
	scope *ast.Node
	name  string
}

type clientRootOperationKind uint8

const (
	clientRootComponentOperation clientRootOperationKind = iota + 1
	clientRootIntrinsicOperation
	clientRootProgramOperation
)

func (lowering *jsxLowering) compiledClientRootVariables(root *ast.SourceFile) map[clientRootVariableKey]clientRootOperationKind {
	result := make(map[clientRootVariableKey]clientRootOperationKind)
	changed := true
	for changed {
		changed = false
		walkNode(root.AsNode(), func(node *ast.Node) bool {
			if !ast.IsVariableDeclaration(node) {
				return true
			}
			declaration := node.AsVariableDeclaration()
			if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
				!ast.IsIdentifier(declaration.Name()) || declaration.Initializer == nil {
				return true
			}
			key, scoped := clientRootVariable(declaration.Name())
			if !scoped {
				return true
			}
			if _, exists := result[key]; exists {
				return true
			}
			if kind, compiled := lowering.compiledClientRootValue(declaration.Initializer, result); compiled {
				result[key] = kind
				changed = true
			}
			return true
		})
	}
	return result
}

func (lowering *jsxLowering) compiledClientRootValue(
	node *ast.Node,
	variables map[clientRootVariableKey]clientRootOperationKind,
) (clientRootOperationKind, bool) {
	node = unwrapRenderExpression(node)
	if ast.IsIdentifier(node) {
		key, scoped := clientRootVariable(node)
		if !scoped {
			return 0, false
		}
		kind, exists := variables[key]
		return kind, exists
	}
	return lowering.compiledClientRootOperation(node)
}

func clientRootVariable(identifier *ast.Node) (clientRootVariableKey, bool) {
	if identifier == nil || !ast.IsIdentifier(identifier) {
		return clientRootVariableKey{}, false
	}
	for cursor := identifier.Parent; cursor != nil; cursor = cursor.Parent {
		if ast.IsBlock(cursor) || ast.IsSourceFile(cursor) {
			return clientRootVariableKey{scope: cursor, name: identifier.Text()}, true
		}
	}
	return clientRootVariableKey{}, false
}

func (lowering *jsxLowering) compiledClientRootCallee(
	expression *ast.Node,
	operation *ast.Node,
	variables map[clientRootVariableKey]clientRootOperationKind,
) (string, bool) {
	reference, exists := lowering.clientRootImportReference(expression)
	if !exists {
		return "", false
	}
	switch reference.moduleSpecifier {
	case "@exactjs/dom", "@exactjs/dom/root":
		if reference.exportName == "render" {
			kind, compiled := lowering.compiledClientRootValue(operation, variables)
			if !compiled {
				return "", false
			}
			if kind == clientRootIntrinsicOperation {
				return lowering.names.renderCompiledIntrinsicRoot, true
			}
			if kind == clientRootProgramOperation {
				return lowering.names.renderCompiledProgramRoot, true
			}
			return lowering.names.renderCompiledRoot, true
		}
	case "@exactjs/hydrate", "@exactjs/hydrate/root":
		switch reference.exportName {
		case "hydrate":
			kind, compiled := lowering.compiledClientRootValue(operation, variables)
			return lowering.names.hydrateCompiledRoot, compiled && kind == clientRootComponentOperation
		case "hydrateAfterNavigation":
			kind, compiled := lowering.compiledClientRootValue(operation, variables)
			return lowering.names.hydrateCompiledDeferred, compiled && kind == clientRootComponentOperation
		case "readPublishedRootProps":
			return lowering.names.readCompiledRootProps, true
		}
	}
	return "", false
}

// pruneRedirectedRootImports removes only named bindings whose every call was replaced above.
// Leaving an unused ESM binding in place would still evaluate the generic public entry module.
func (lowering *jsxLowering) pruneRedirectedRootImports(root *ast.SourceFile) *ast.SourceFile {
	if len(lowering.redirectedRootImports) == 0 {
		return root
	}
	statements := make([]*ast.Node, 0, len(root.Statements.Nodes))
	for _, statement := range root.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			statements = append(statements, statement)
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration.ImportClause == nil {
			statements = append(statements, statement)
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		bindings := clause.NamedBindings
		if bindings == nil || !ast.IsNamedImports(bindings) {
			statements = append(statements, statement)
			continue
		}
		retained := make([]*ast.Node, 0, len(bindings.AsNamedImports().Elements.Nodes))
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			name := element.AsImportSpecifier().Name().Text()
			_, redirected := lowering.redirectedRootImports[name]
			if !redirected || hasRuntimeIdentifierReference(root.AsNode(), name) {
				retained = append(retained, element)
			}
		}
		if len(retained) == len(bindings.AsNamedImports().Elements.Nodes) {
			statements = append(statements, statement)
			continue
		}
		if len(retained) == 0 && clause.Name() == nil {
			continue
		}
		var updatedBindings *ast.Node
		if len(retained) != 0 {
			updatedBindings = lowering.factory.UpdateNamedImports(
				bindings.AsNamedImports(),
				lowering.factory.NewNodeList(retained),
			)
		}
		updatedClause := lowering.factory.UpdateImportClause(
			clause,
			clause.PhaseModifier,
			clause.Name(),
			updatedBindings,
		)
		statements = append(statements, lowering.factory.UpdateImportDeclaration(
			declaration,
			declaration.Modifiers(),
			updatedClause,
			declaration.ModuleSpecifier,
			declaration.Attributes,
		))
	}
	updated := lowering.factory.UpdateSourceFile(
		root,
		lowering.factory.NewNodeList(statements),
		root.EndOfFileToken,
	).AsSourceFile()
	ast.SetParentInChildren(updated.AsNode())
	return updated
}

func hasRuntimeIdentifierReference(root *ast.Node, name string) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if found {
			return false
		}
		if ast.IsIdentifier(node) && node.Text() == name &&
			!ast.IsDeclarationName(node) && !isStaticPropertyName(node) {
			found = true
			return false
		}
		return true
	})
	return found
}

func (lowering *jsxLowering) clientRootImportReference(expression *ast.Node) (externalImportReference, bool) {
	if ast.IsIdentifier(expression) {
		reference, exists := lowering.externalImports.byName[expression.Text()]
		return reference, exists
	}
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if ast.IsIdentifier(member.Expression) {
			reference, exists := lowering.externalImports.byName[member.Expression.Text()]
			if exists && reference.namespace {
				reference.exportName = member.Name().Text()
				reference.namespace = false
			}
			return reference, exists
		}
	}
	return externalImportReference{}, false
}

func (lowering *jsxLowering) compiledClientRootOperation(node *ast.Node) (clientRootOperationKind, bool) {
	if !ast.IsCallExpression(node) {
		return 0, false
	}
	call := node.AsCallExpression()
	if !ast.IsIdentifier(call.Expression) || call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
		return 0, false
	}
	switch call.Expression.Text() {
	case lowering.names.componentReceipt:
		return clientRootComponentOperation, true
	case lowering.names.intrinsicElement:
		return clientRootIntrinsicOperation, true
	case lowering.names.preparedRenderProgram:
		return clientRootProgramOperation, true
	default:
		return 0, false
	}
}
