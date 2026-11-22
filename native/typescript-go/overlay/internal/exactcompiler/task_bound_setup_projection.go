package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

type boundTaskSetupBinding struct {
	symbol *ast.Symbol
	tasks  map[string]bool
}

// planBoundTaskSetup identifies standalone setup declarations called only
// by server task bodies. The helper must be server-only. Its sole private reference
// rules out authored changes to its standard bind property.
func planBoundTaskSetup(source *ast.SourceFile, components []componentCandidate, tasks []Task, callables callableAnalysis, availability *moduleValueAvailability) map[*ast.Node]boundTaskSetupBinding {
	if callables.owner == nil || callables.owner.values == nil || !ast.IsExternalModule(source) {
		return nil
	}
	var workTargets map[SourceSpan][]Task
	for _, task := range tasks {
		if !task.FunctionDefined || task.WorkLength == 0 {
			continue
		}
		if workTargets == nil {
			workTargets = make(map[SourceSpan][]Task)
		}
		span := SourceSpan{Start: task.WorkStart, Length: task.WorkLength}
		workTargets[span] = append(workTargets[span], task)
	}
	if len(workTargets) == 0 {
		return nil
	}
	owner := callables.owner.values
	index := owner.index(source)
	pop := index.privateUses
	if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete || pop.refused || len(pop.unresolved[""]) != 0 {
		return nil
	}
	c := owner.checker
	var result map[*ast.Node]boundTaskSetupBinding
	for _, component := range components {
		body := component.node.Body()
		if body == nil || !ast.IsBlock(body) {
			continue
		}
		for _, statement := range body.AsBlock().Statements.Nodes {
			if !ast.IsVariableStatement(statement) {
				continue
			}
			list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			if list.Flags&ast.NodeFlagsConst == 0 || len(list.Declarations.Nodes) != 1 {
				continue
			}
			declaration := list.Declarations.Nodes[0]
			name := declaration.Name()
			bind := declaration.Initializer()
			if !ast.IsIdentifier(name) || bind == nil || !ast.IsCallExpression(bind) || ast.IsOptionalChain(bind) {
				continue
			}
			member := bind.Expression()
			args := callArguments(bind)
			if !ast.IsPropertyAccessExpression(member) || ast.IsOptionalChain(member) || member.Name().Text() != "bind" ||
				len(args) != 1 || args[0].Kind != ast.KindThisKeyword {
				continue
			}
			helper := member.Expression()
			if !ast.IsIdentifier(helper) {
				continue
			}
			if !nativeFunctionInvocation(helper, "bind", c) {
				continue
			}
			symbol := c.GetSymbolAtLocation(helper)
			if symbol == nil || len(symbol.Declarations) != 1 || symbol.ValueDeclaration == nil || availability.placement(symbol) != "server" {
				continue
			}
			fn := symbol.ValueDeclaration
			if !ast.IsFunctionDeclaration(fn) || fn.Parent != source.AsNode() || fn.Body() == nil ||
				ast.GetCombinedModifierFlags(fn)&(ast.ModifierFlagsExport|ast.ModifierFlagsDefault) != 0 {
				continue
			}
			helperID := ast.GetSymbolId(symbol)
			uses := pop.uses[helperID]
			if index.normalExportUnknown || index.normalExported[helperID] || len(uses) != 1 || uses[0].node != helper || len(index.bindings[helperID]) != 0 || len(pop.unresolved[helper.Text()]) != 0 {
				continue
			}
			binding := c.GetSymbolAtLocation(name)
			if binding == nil {
				continue
			}
			uses = pop.uses[ast.GetSymbolId(binding)]
			if len(uses) == 0 {
				continue
			}
			taskOnly := len(pop.unresolved[name.Text()]) == 0
			taskIDs := make(map[string]bool)
			for _, use := range uses {
				call, scope := use.node.Parent, use.region
				if call == nil || !ast.IsCallExpression(call) || call.Expression() != use.node || scope == nil || scope == component.node {
					taskOnly = false
					break
				}
				targets := workTargets[nodeSourceSpan(scope)]
				taskOnly = taskOnly && len(targets) != 0
				for _, task := range targets {
					taskOnly = taskOnly && task.Placement == "server"
					taskIDs[task.ID] = true
				}
			}
			if taskOnly {
				if result == nil {
					result = make(map[*ast.Node]boundTaskSetupBinding)
				}
				result[statement] = boundTaskSetupBinding{symbol: binding, tasks: taskIDs}
			}
		}
	}
	return result
}

// pruneClientBoundTaskSetup checks that lowering removed all emitted uses before
// discarding the setup bind. The caller has restored the authored checker parents.
func pruneClientBoundTaskSetup(file, source *ast.SourceFile, emit *printer.EmitContext, c *checker.Checker, candidates map[*ast.Node]boundTaskSetupBinding) *ast.SourceFile {
	if len(candidates) == 0 {
		return file
	}
	names := make(map[string]bool, len(candidates))
	for _, binding := range candidates {
		names[ast.SymbolName(binding.symbol)] = false
	}
	used := make(map[*ast.Symbol]bool)
	var declarations []*ast.Node
	var visit func(*ast.Node, *ast.Node)
	visit = func(node, parent *ast.Node) {
		if ast.IsVariableStatement(node) {
			if _, candidate := candidates[emit.MostOriginal(node)]; candidate {
				declarations = append(declarations, node)
			}
		}
		if ast.IsIdentifier(node) {
			name := node.Text()
			if blocked, candidate := names[name]; candidate && !blocked {
				shorthand := parent != nil && ast.IsShorthandPropertyAssignment(parent)
				declaration := parent != nil && ast.IsDeclaration(parent) && parent.Name() == node && !shorthand
				property := parent != nil && (ast.IsPropertyAccessExpression(parent) && parent.Name() == node ||
					ast.IsBindingElement(parent) && parent.AsBindingElement().PropertyName == node)
				if declaration || property {
					return
				}
				var symbol *ast.Symbol
				// Generated identifiers have no dependable lexical identity. An
				// unchanged authored identifier can resolve even inside typeof.
				if ast.IsParseTreeNode(node) && ast.GetSourceFileOfNode(node) == source && node.Parent == parent {
					if shorthand {
						symbol = c.GetShorthandAssignmentValueSymbol(parent)
					} else {
						symbol = c.GetSymbolAtLocation(node)
					}
				}
				if symbol == nil {
					names[name] = true
				} else {
					used[symbol] = true
				}
			}
		}
		node.ForEachChild(func(child *ast.Node) bool {
			visit(child, node)
			return false
		})
	}
	visit(file.AsNode(), nil)
	if len(declarations) == 0 {
		return file
	}
	remove := make(map[*ast.Node]bool, len(declarations))
	for _, declaration := range declarations {
		original := emit.MostOriginal(declaration)
		binding := candidates[original]
		name := ast.SymbolName(binding.symbol)
		list := declaration.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
		authored := original.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0]
		sameBind := len(list.Declarations.Nodes) == 1 && list.Flags&ast.NodeFlagsConst != 0 &&
			emit.MostOriginal(list.Declarations.Nodes[0].Name()) == authored.Name() &&
			emit.MostOriginal(list.Declarations.Nodes[0].Initializer()) == authored.Initializer()
		if !sameBind || names[name] || used[binding.symbol] {
			continue
		}
		remove[declaration] = true
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if remove[node] {
			return nil
		}
		return visitor.VisitEachChild(node)
	}, &emit.Factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitEachChild(file.AsNode()).AsSourceFile()
}
