package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// serverTaskFacadeScope retains setup-owned definitions and binds their references
// only after existing parent execution has entered its task frame. Each child work
// owns its own scope, so grandchildren select the same retained owner transitively.
type serverTaskFacadeScope struct {
	work       *ast.Node
	aliases    map[string]string
	statements []*ast.Node
}

// reference selects authored task bindings with the checker before expression
// lowering. Ordinary shadows and aliases declared inside this work stay lexical.
func (scope *serverTaskFacadeScope) reference(lowering *jsxLowering, node *ast.Node) *ast.Node {
	if lowering.checking || lowering.target != TargetServer {
		return nil
	}
	// Classifiers and checker queries require authored parent ownership. Updated
	// source nodes retain provenance, while private context parameters have none.
	node = lowering.emitContext.MostOriginal(node)
	if node == nil || node.Parent == nil {
		return nil
	}
	shorthand := ast.IsShorthandPropertyAssignment(node)
	reference := node
	if shorthand {
		reference = node.Name()
	}
	if !ast.IsIdentifier(reference) || (!shorthand && (ast.IsDeclarationName(reference) || isStaticPropertyName(reference))) {
		return nil
	}
	if lowering.checker == nil {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(reference)
	if shorthand {
		// Shorthand names have property symbols. Ownership and task selection
		// must both follow the authored value, as expanded properties do.
		symbol = lowering.checker.GetShorthandAssignmentValueSymbol(node)
	}
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if declaration.Pos() >= scope.work.Pos() && declaration.End() <= scope.work.End() {
			return nil
		}
	}
	// Resolve stable value aliases only after checking the authored binding scope.
	symbol = resolvedCallableSymbol(sourceCallableSymbol(symbol, lowering.checker), lowering.checker)
	if symbol == nil {
		return nil
	}
	task, found := lowering.taskDefinitions[ast.GetSymbolId(symbol)]
	if !found || task.Progress || task.Placement == "client" || !lowering.directServerArtifactOwnsTask(task) {
		return nil
	}
	if scope.aliases == nil {
		scope.aliases = make(map[string]string)
	}
	name, exists := scope.aliases[task.ID]
	if !exists {
		if !lowering.serverTaskHasCaller(task) {
			return nil
		}
		name = lowering.uniqueMutationName("__exactBoundServerChild")
		scope.aliases[task.ID] = name
		bound := lowering.taskHelperCall("bindTask", lowering.names.bindRequestTask, []*ast.Node{lowering.factory.NewIdentifier(reference.Text())})
		scope.statements = append(scope.statements, constStatement(lowering.factory, lowering.factory.NewIdentifier(name), bound))
	}
	value := lowering.factory.NewIdentifier(name)
	if shorthand {
		return lowering.factory.NewPropertyAssignment(nil, node.Name(), nil, nil, value)
	}
	return value
}

// finish runs before the parent's first authored statement or await. Repeated
// activations create views of the same raw definitions, preserving owner lanes.
func (scope *serverTaskFacadeScope) finish(lowering *jsxLowering, work *ast.Node) *ast.Node {
	if len(scope.statements) == 0 {
		return work
	}
	body := work.Body()
	statements := append([]*ast.Node(nil), scope.statements...)
	if ast.IsBlock(body) {
		statements = append(statements, body.AsBlock().Statements.Nodes...)
	} else {
		statements = append(statements, lowering.factory.NewReturnStatement(body))
	}
	return lowering.updateTaskWorkBody(work, lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))
}
