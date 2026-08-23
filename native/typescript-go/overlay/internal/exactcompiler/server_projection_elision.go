package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

type serverLocalCandidate struct {
	symbol ast.SymbolId
	start  int
	end    int
}

// directServerFrameComponent reports whether the containing component has only synchronous,
// compiler-closed server work. The predicate mirrors the contract's direct-lane exclusions so
// server-only eager derived values and output forwarding cannot diverge from runtime selection.
func (lowering *jsxLowering) directServerFrameComponent(node *ast.Node) bool {
	if lowering.target != TargetServer {
		return false
	}
	var owner Component
	found := false
	for _, component := range lowering.components {
		if node.Pos() >= component.Start && node.End() <= component.Start+component.Length &&
			(!found || component.Length < owner.Length) {
			owner = component
			found = true
		}
	}
	if !found || !owner.CompiledRender || owner.DynamicComponents ||
		len(projectComponentExecution(owner.Execution, TargetServer).Transitions) != 0 {
		return false
	}
	componentNode := componentSourceNode(lowering.sourceFile, owner)
	if componentNode == nil ||
		componentUsesProtocolMember(
			componentNode,
			"log", "intl", "hasContext", "getContext", "setContext", "reactive",
			"ref", "refs", "map", "onUnmount", "onRender", "own",
		) {
		return false
	}
	return lowering.interop == nil || !componentUsesJSXInterop(owner, componentNode)
}

func componentSourceNode(sourceFile *ast.SourceFile, component Component) *ast.Node {
	var result *ast.Node
	walkNode(sourceFile.AsNode(), func(candidate *ast.Node) bool {
		if candidate.Pos() == component.Start &&
			candidate.End() == component.Start+component.Length {
			result = candidate
			return false
		}
		return result == nil
	})
	return result
}

// omitUnreachableServerComponentLocals removes effect-free setup declarations whose complete
// consumer graph disappeared when the server projection erased dormant interaction callbacks.
// It deliberately operates after JSX projection and keeps any declaration with an effectful
// initializer, a surviving external reference, or a path to one.
func (lowering *jsxLowering) omitUnreachableServerComponentLocals(root *ast.Node) *ast.Node {
	if lowering.target != TargetServer || lowering.checker == nil {
		return root
	}
	components := activeComponentCandidates(lowering.sourceFile)
	candidates := make(map[ast.SymbolId]serverLocalCandidate)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		owner := componentOwnerIndex(node, components)
		if owner < 0 || node == components[owner].node {
			return true
		}
		var name *ast.Node
		switch {
		case ast.IsFunctionDeclaration(node):
			if _, task := lowering.functionTasks[node.Pos()]; task {
				return false
			}
			name = node.Name()
		case ast.IsVariableDeclaration(node):
			declaration := node.AsVariableDeclaration()
			if declaration.Initializer == nil ||
				!serverProjectionElidableInitializer(declaration.Initializer) {
				return true
			}
			if _, task := lowering.functionTasks[declaration.Initializer.Pos()]; task {
				return true
			}
			name = declaration.Name()
		default:
			return true
		}
		if name == nil || !ast.IsIdentifier(name) {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(name); symbol != nil {
			candidates[ast.GetSymbolId(symbol)] = serverLocalCandidate{
				symbol: ast.GetSymbolId(symbol), start: node.Pos(), end: node.End(),
			}
		}
		return true
	})
	if len(candidates) == 0 {
		return root
	}

	dependencies := make(map[ast.SymbolId]map[ast.SymbolId]struct{})
	roots := make(map[ast.SymbolId]struct{})
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || node.Parent == nil ||
			ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := lowering.checker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		used := ast.GetSymbolId(symbol)
		if _, candidate := candidates[used]; !candidate {
			return true
		}
		owner := ast.SymbolId(0)
		ownerWidth := int(^uint(0) >> 1)
		for id, candidate := range candidates {
			if width := candidate.end - candidate.start; node.Pos() >= candidate.start &&
				node.Pos() < candidate.end && width < ownerWidth {
				owner = id
				ownerWidth = width
			}
		}
		if owner == 0 {
			roots[used] = struct{}{}
			return true
		}
		if owner != used {
			if dependencies[owner] == nil {
				dependencies[owner] = make(map[ast.SymbolId]struct{})
			}
			dependencies[owner][used] = struct{}{}
		}
		return true
	})
	queue := make([]ast.SymbolId, 0, len(roots))
	reachable := make(map[ast.SymbolId]struct{}, len(roots))
	for root := range roots {
		reachable[root] = struct{}{}
		queue = append(queue, root)
	}
	for len(queue) != 0 {
		owner := queue[0]
		queue = queue[1:]
		for dependency := range dependencies[owner] {
			if _, exists := reachable[dependency]; exists {
				continue
			}
			reachable[dependency] = struct{}{}
			queue = append(queue, dependency)
		}
	}
	removable := make(map[int]struct{})
	for symbol, candidate := range candidates {
		if _, keep := reachable[symbol]; !keep {
			removable[candidate.start] = struct{}{}
		}
	}
	if len(removable) == 0 {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsFunctionDeclaration(node) {
			if _, remove := removable[node.Pos()]; remove {
				return lowering.factory.NewEmptyStatement()
			}
		}
		if ast.IsVariableStatement(node) {
			statement := node.AsVariableStatement()
			list := statement.DeclarationList.AsVariableDeclarationList()
			declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
			for _, declaration := range list.Declarations.Nodes {
				if _, remove := removable[declaration.Pos()]; !remove {
					declarations = append(declarations, visitor.VisitEachChild(declaration))
				}
			}
			if len(declarations) == 0 {
				return lowering.factory.NewEmptyStatement()
			}
			if len(declarations) != len(list.Declarations.Nodes) {
				return lowering.factory.UpdateVariableStatement(
					statement,
					statement.Modifiers(),
					lowering.factory.UpdateVariableDeclarationList(
						list, lowering.factory.NewNodeList(declarations), list.Flags,
					),
				)
			}
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(root)
}

func serverProjectionElidableInitializer(node *ast.Node) bool {
	if node == nil {
		return true
	}
	switch {
	case ast.IsArrowFunction(node), ast.IsFunctionExpression(node), ast.IsIdentifier(node),
		ast.IsStringLiteral(node), ast.IsNumericLiteral(node), ast.IsBigIntLiteral(node),
		ast.IsNoSubstitutionTemplateLiteral(node), node.Kind == ast.KindNullKeyword:
		return true
	case ast.IsParenthesizedExpression(node):
		return serverProjectionElidableInitializer(node.AsParenthesizedExpression().Expression)
	case ast.IsArrayLiteralExpression(node):
		for _, element := range node.AsArrayLiteralExpression().Elements.Nodes {
			if !serverProjectionElidableInitializer(element) {
				return false
			}
		}
		return true
	case ast.IsObjectLiteralExpression(node):
		for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsPropertyAssignment(property) {
				if !serverProjectionElidableInitializer(property.AsPropertyAssignment().Initializer) {
					return false
				}
				continue
			}
			if ast.IsShorthandPropertyAssignment(property) {
				continue
			}
			return false
		}
		return true
	default:
		return false
	}
}
