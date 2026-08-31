package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

type serverLocalCandidate struct {
	symbol              ast.SymbolId
	name                string
	start               int
	end                 int
	ownerStart          int
	ownerEnd            int
	inertClientCallable bool
}

func (lowering *jsxLowering) serverProjectionClientCallable(node *ast.Node) bool {
	work := node
	if ast.IsVariableDeclaration(node) {
		work = node.AsVariableDeclaration().Initializer
	}
	if work == nil || (!ast.IsFunctionDeclaration(work) && !ast.IsArrowFunction(work) &&
		!ast.IsFunctionExpression(work)) {
		return false
	}
	if task, exists := lowering.functionTasks[work.Pos()]; exists && task.Placement == "client" {
		return true
	}
	facets, valid := functionTaskPolicy(work, lowering.sourceFile, lowering.externalImports)
	if !valid {
		return false
	}
	for _, facet := range facets {
		if facet == "client" {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) directServerArtifactComponent(node *ast.Node) bool {
	if lowering.target != TargetServer {
		return false
	}
	for _, component := range lowering.components {
		if component.TargetPlan.DirectServer && node.Pos() >= component.Start &&
			node.End() <= component.Start+component.Length {
			return true
		}
	}
	return false
}

// lowerDirectServerExecutorReturn folds the compiler-proven expression render arrow into setup so
// synchronous server execution produces its component-local program without retaining a closure.
func (lowering *jsxLowering) lowerDirectServerExecutorReturn(node *ast.Node) *ast.Node {
	if lowering.target != TargetServer || !ast.IsReturnStatement(node) {
		return nil
	}
	component, found := lowering.componentContaining(node)
	if !found || !component.TargetPlan.DirectServerExecutor {
		return nil
	}
	for current := node.Parent; current != nil; current = current.Parent {
		if !ast.IsFunctionLike(current) {
			continue
		}
		if current.Pos() != component.Start {
			return nil
		}
		break
	}
	expression := unwrapRenderExpression(node.AsReturnStatement().Expression)
	if !ast.IsArrowFunction(expression) || ast.IsBlock(expression.AsArrowFunction().Body) {
		return nil
	}
	return lowering.factory.NewReturnStatement(lowering.visit(expression.AsArrowFunction().Body))
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
	if !found || !owner.TargetPlan.DirectServerFrame {
		return false
	}
	return true
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
			if task, exists := lowering.functionTasks[node.Pos()]; exists && task.Placement != "client" {
				return false
			}
			name = node.Name()
		case ast.IsVariableDeclaration(node):
			declaration := node.AsVariableDeclaration()
			if declaration.Initializer == nil ||
				!serverProjectionElidableInitializer(declaration.Initializer) {
				return true
			}
			if task, exists := lowering.functionTasks[declaration.Initializer.Pos()]; exists && task.Placement != "client" {
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
			symbolID := ast.GetSymbolId(symbol)
			candidates[symbolID] = serverLocalCandidate{
				symbol:              symbolID,
				name:                name.Text(),
				start:               node.Pos(),
				end:                 node.End(),
				ownerStart:          components[owner].node.Pos(),
				ownerEnd:            components[owner].node.End(),
				inertClientCallable: lowering.serverProjectionClientCallable(node),
			}
		}
		return true
	})
	if len(candidates) == 0 {
		return root
	}
	sourceSymbols := make(map[int]ast.SymbolId)
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		shorthandValue := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent)
		if !ast.IsIdentifier(node) || node.Parent == nil ||
			(ast.IsDeclarationName(node) && !shorthandValue) || isStaticPropertyName(node) {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
			sourceSymbols[node.Pos()] = ast.GetSymbolId(symbol)
		}
		return true
	})

	dependencies := make(map[ast.SymbolId]map[ast.SymbolId]struct{})
	roots := make(map[ast.SymbolId]struct{})
	rootNames := make(map[string]struct{})
	walkNode(root, func(node *ast.Node) bool {
		shorthandValue := node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent)
		if !ast.IsIdentifier(node) || node.Parent == nil ||
			(ast.IsDeclarationName(node) && !shorthandValue) || isStaticPropertyName(node) {
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
			rootNames[node.Text()] = struct{}{}
		}
		usedSymbols := make([]ast.SymbolId, 0, 1)
		if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
			usedSymbols = append(usedSymbols, ast.GetSymbolId(symbol))
		} else if used := sourceSymbols[node.Pos()]; used != 0 {
			usedSymbols = append(usedSymbols, used)
		} else {
			// Transformed shorthand properties can be synthetic nodes without a checker symbol or
			// authored position. Preserve every same-name local in the containing component rather
			// than incorrectly proving one unreachable; later bundling can still remove ambiguity.
			for symbol, candidate := range candidates {
				if candidate.name == node.Text() && node.Pos() >= candidate.ownerStart &&
					node.Pos() < candidate.ownerEnd {
					usedSymbols = append(usedSymbols, symbol)
				}
			}
		}
		if len(usedSymbols) == 0 {
			return true
		}
		for _, used := range usedSymbols {
			if _, candidate := candidates[used]; !candidate {
				continue
			}
			if owner == 0 {
				roots[used] = struct{}{}
				continue
			}
			if owner != used {
				if dependencies[owner] == nil {
					dependencies[owner] = make(map[ast.SymbolId]struct{})
				}
				dependencies[owner][used] = struct{}{}
			}
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
	inertClientCallables := make(map[int]struct{})
	for symbol, candidate := range candidates {
		_, keepSymbol := reachable[symbol]
		_, keepName := rootNames[candidate.name]
		if !keepSymbol && !keepName {
			removable[candidate.start] = struct{}{}
		} else if candidate.inertClientCallable {
			inertClientCallables[candidate.start] = struct{}{}
		}
	}
	if len(removable) == 0 && len(inertClientCallables) == 0 {
		return root
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsFunctionDeclaration(node) {
			if _, remove := removable[node.Pos()]; remove {
				return lowering.factory.NewEmptyStatement()
			}
			if _, inert := inertClientCallables[node.Pos()]; inert {
				declaration := node.AsFunctionDeclaration()
				return lowering.factory.NewVariableStatement(
					nil,
					lowering.factory.NewVariableDeclarationList(
						lowering.factory.NewNodeList([]*ast.Node{
							lowering.factory.NewVariableDeclaration(
								declaration.Name(), nil, nil, lowering.inertClientTaskCallable(),
							),
						}),
						ast.NodeFlagsConst,
					),
				)
			}
		}
		if ast.IsVariableStatement(node) {
			statement := node.AsVariableStatement()
			list := statement.DeclarationList.AsVariableDeclarationList()
			declarations := make([]*ast.Node, 0, len(list.Declarations.Nodes))
			changed := false
			for _, declaration := range list.Declarations.Nodes {
				if _, remove := removable[declaration.Pos()]; !remove {
					if _, inert := inertClientCallables[declaration.Pos()]; inert {
						value := declaration.AsVariableDeclaration()
						declarations = append(declarations, lowering.factory.UpdateVariableDeclaration(
							value,
							value.Name(),
							value.ExclamationToken,
							value.Type,
							lowering.inertClientTaskCallable(),
						))
						changed = true
					} else {
						declarations = append(declarations, visitor.VisitEachChild(declaration))
					}
				} else {
					changed = true
				}
			}
			if len(declarations) == 0 {
				return lowering.factory.NewEmptyStatement()
			}
			if changed {
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
				// Evaluating a computed property name can call user code, invoke an accessor, or
				// throw even when the assigned value is inert. The shared effect analysis may
				// eventually prove narrower cases; this projection pass must not guess.
				if name := property.Name(); name != nil && ast.IsComputedPropertyName(name) {
					return false
				}
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
