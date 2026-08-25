package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
)

// omitFullyMaterializedRenderLocals removes safe view-local declarations after every authored
// reference has been moved into a precise reactive closure. The first lowering pass must finish
// before this decision because declarations precede the JSX consumers that materialize them.
func (lowering *jsxLowering) omitFullyMaterializedRenderLocals(root *ast.Node) *ast.Node {
	if lowering.checker == nil || len(lowering.materializedNames) == 0 {
		return root
	}
	candidates := make(map[ast.SymbolId]int)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		name := node.AsVariableDeclaration().Name()
		if name == nil || !ast.IsIdentifier(name) ||
			lowering.materializedNames[name.Pos()] == "" {
			return true
		}
		// Cached retained cells use a separate cached name and therefore never enter this set.
		// A materialized name proves the initializer itself moved into a reactive consumer; when no
		// authored reference survives the completed lowering pass, retaining the setup cell would
		// duplicate both the calculation and its reactive graph ownership.
		if binding, retained := lowering.derived[name.Pos()]; retained && len(binding.References) > 1 {
			// Separate consumers must continue to share one identity-bearing result. Their emitted
			// closures can each contain a materialized local, but that does not prove the two values
			// are interchangeable.
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(name); symbol != nil {
			candidates[ast.GetSymbolId(symbol)] = name.Pos()
		}
		return true
	})
	if len(candidates) == 0 {
		return root
	}
	remaining := make(map[ast.SymbolId]struct{})
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || node.Parent == nil ||
			ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
			id := ast.GetSymbolId(symbol)
			if _, candidate := candidates[id]; candidate {
				remaining[id] = struct{}{}
			}
		}
		return true
	})
	removable := make(map[int]struct{})
	for symbol, start := range candidates {
		if _, retained := remaining[symbol]; !retained {
			removable[start] = struct{}{}
		}
	}
	if len(removable) == 0 {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(
		func(node *ast.Node) *ast.Node {
			if !ast.IsVariableStatement(node) {
				return visitor.VisitEachChild(node)
			}
			statement := node.AsVariableStatement()
			list := statement.DeclarationList.AsVariableDeclarationList()
			declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
			for _, declaration := range list.Declarations.Nodes {
				name := declaration.AsVariableDeclaration().Name()
				if name != nil && ast.IsIdentifier(name) {
					if _, remove := removable[name.Pos()]; remove {
						continue
					}
				}
				declarations = append(declarations, visitor.VisitEachChild(declaration))
			}
			if len(declarations) == len(list.Declarations.Nodes) {
				return visitor.VisitEachChild(node)
			}
			if len(declarations) == 0 {
				return lowering.factory.NewEmptyStatement()
			}
			return lowering.factory.UpdateVariableStatement(
				statement,
				statement.Modifiers(),
				lowering.factory.UpdateVariableDeclarationList(
					list,
					lowering.factory.NewNodeList(declarations),
					list.Flags,
				),
			)
		},
		&lowering.factory.NodeFactory,
		ast.NodeVisitorHooks{},
	)
	return visitor.VisitNode(root)
}

func (lowering *jsxLowering) lowerDerivedDeclaration(node *ast.Node) *ast.Node {
	declaration := node.AsVariableDeclaration()
	name := declaration.Name()
	if name == nil || !ast.IsIdentifier(name) || declaration.Initializer == nil {
		return nil
	}
	if _, exists := lowering.derived[name.Pos()]; !exists {
		return nil
	}
	if lowering.directServerFrameComponent(node) {
		return lowering.factory.UpdateVariableDeclaration(
			declaration,
			name,
			declaration.ExclamationToken,
			declaration.Type,
			lowering.visitor.VisitNode(declaration.Initializer),
		)
	}
	closure := lowering.materializedClosure(
		declaration.Initializer,
		lowering.cachedDerivedLocals(declaration.Initializer),
	)
	if closure == nil {
		closure = lowering.arrow(lowering.visitor.VisitNode(declaration.Initializer))
	}
	value := lowering.call(
		lowering.names.derived,
		[]*ast.Node{closure},
	)
	return lowering.factory.UpdateVariableDeclaration(
		declaration,
		name,
		declaration.ExclamationToken,
		declaration.Type,
		value,
	)
}

func (lowering *jsxLowering) lowerDerivedReference(node *ast.Node) *ast.Node {
	if _, exists := lowering.derivedBindingAtReference(node); exists {
		if lowering.directServerFrameComponent(node) {
			return lowering.factory.NewIdentifier(node.Text())
		}
		return lowering.derivedGet(lowering.factory.NewIdentifier(node.Text()))
	}
	return nil
}

func (lowering *jsxLowering) derivedBindingAtReference(
	node *ast.Node,
) (ReactiveBinding, bool) {
	if lowering.checker == nil || node == nil || ast.NodeIsSynthesized(node) || ast.GetSourceFileOfNode(node) == nil {
		return ReactiveBinding{}, false
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return ReactiveBinding{}, false
	}
	for _, declaration := range symbol.Declarations {
		name := declaration.Name()
		if name == nil {
			continue
		}
		if binding, exists := lowering.derived[name.Pos()]; exists {
			return binding, true
		}
	}
	return ReactiveBinding{}, false
}

func (lowering *jsxLowering) derivedGet(expression *ast.Node) *ast.Node {
	return lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			expression,
			nil,
			lowering.factory.NewIdentifier("get"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList(nil),
		ast.NodeFlagsNone,
	)
}

// omitElidedDerivedDeclarations removes setup bindings whose safe scalar
// calculation is materialized directly inside its sole reactive view
// consumer. Retained declarations still pass through the normal visitor so a
// mixed declaration statement preserves every unrelated lowering.
func (lowering *jsxLowering) omitElidedDerivedDeclarations(
	node *ast.Node,
) *ast.Node {
	if lowering.directServerFrameComponent(node) {
		// The client artifact materializes a sole render consumer inside its
		// precise binding. A direct SSR frame executes the authored render body
		// once and therefore still needs the ordinary setup local; it has no
		// client binding in which that initializer could be materialized.
		return nil
	}
	statement := node.AsVariableStatement()
	list := statement.DeclarationList.AsVariableDeclarationList()
	declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
	changed := false
	for _, candidate := range list.Declarations.Nodes {
		name := candidate.AsVariableDeclaration().Name()
		if name != nil && ast.IsIdentifier(name) {
			if _, elided := lowering.elidedDerived[name.Pos()]; elided {
				changed = true
				continue
			}
		}
		declarations = append(
			declarations,
			lowering.visitor.VisitNode(candidate),
		)
	}
	if !changed {
		return nil
	}
	if len(declarations) == 0 {
		return lowering.factory.NewEmptyStatement()
	}
	return lowering.factory.UpdateVariableStatement(
		statement,
		statement.Modifiers(),
		lowering.factory.UpdateVariableDeclarationList(
			list,
			lowering.factory.NewNodeList(declarations),
			list.Flags,
		),
	)
}
