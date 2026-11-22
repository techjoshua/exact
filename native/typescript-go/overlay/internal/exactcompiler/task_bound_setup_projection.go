package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

type boundTaskSetupBinding struct {
	symbol      *ast.Symbol
	tasks       map[string]bool
	lengthReads map[*ast.Node]bool
	arity       int
}

// planBoundTaskSetup proves a private receiver-only bind can be reconstructed
// for its server tasks. Outside task work the bound value may be observed only
// by exact length reads. The private use inventory rules out descriptor changes
// and escapes of the helper and the bound value.
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
			valid := len(pop.unresolved[name.Text()]) == 0
			taskIDs := make(map[string]bool)
			var lengthReads map[*ast.Node]bool
			for _, use := range uses {
				parent, scope := use.node.Parent, use.region
				if boundSetupLengthRead(use.node, component.node, workTargets) {
					if lengthReads == nil {
						lengthReads = make(map[*ast.Node]bool)
					}
					lengthReads[parent] = true
					continue
				}
				if parent == nil || !ast.IsCallExpression(parent) || parent.Expression() != use.node || scope == nil || scope == component.node {
					valid = false
					break
				}
				targets := workTargets[nodeSourceSpan(scope)]
				valid = valid && len(targets) != 0
				for _, task := range targets {
					valid = valid && task.Placement == "server"
					taskIDs[task.ID] = true
				}
			}
			// An explicit annotation can give length a different authored type,
			// even though the runtime property still contains the argument count.
			if valid && len(taskIDs) != 0 && (len(lengthReads) == 0 || declaration.Type() == nil) {
				if result == nil {
					result = make(map[*ast.Node]boundTaskSetupBinding)
				}
				bindingPlan := boundTaskSetupBinding{symbol: binding, tasks: taskIDs, lengthReads: lengthReads}
				if len(lengthReads) != 0 {
					bindingPlan.arity = receiverOnlyBindArity(fn)
				}
				result[statement] = bindingPlan
			}
		}
	}
	return result
}

// boundSetupLengthRead admits property reads outside task work. A descriptor
// operation on the function itself appears as another use of the binding.
func boundSetupLengthRead(reference, component *ast.Node, workTargets map[SourceSpan][]Task) bool {
	member := reference.Parent
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Expression() != reference ||
		member.Name().Text() != "length" || ast.IsOptionalChain(member) {
		return false
	}
	value := member
	for parent := value.Parent; parent != nil && ast.IsOuterExpression(parent, ast.OEKAll) && parent.Expression() == value; parent = value.Parent {
		value = parent
	}
	if value.Parent == nil || ast.IsDeleteExpression(value.Parent) || ast.IsAssignmentTarget(value) {
		return false
	}
	for scope := member.Parent; scope != nil; scope = scope.Parent {
		if scope == component {
			return true
		}
		if len(workTargets[nodeSourceSpan(scope)]) != 0 {
			return false
		}
	}
	return false
}

// receiverOnlyBindArity is the ECMAScript expected argument count for a
// function declaration. Binding only this leaves that count intact.
func receiverOnlyBindArity(fn *ast.Node) int {
	count := 0
	for _, parameter := range fn.Parameters() {
		name := parameter.Name()
		if name != nil && ast.IsIdentifier(name) && name.Text() == "this" {
			continue
		}
		if parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			break
		}
		count++
	}
	return count
}

// pruneClientBoundTaskSetup checks emitted references before projecting a bind.
// When length remains observable, keep the numeric value at the original
// declaration so reads still respect its lexical initialization. An unresolved
// generated reference vetoes the whole projection.
func pruneClientBoundTaskSetup(file, source *ast.SourceFile, emit *printer.EmitContext, c *checker.Checker, candidates map[*ast.Node]boundTaskSetupBinding) *ast.SourceFile {
	if len(candidates) == 0 {
		return file
	}
	names := make(map[string]bool, len(candidates))
	lengthReads := make(map[*ast.Node]*ast.Symbol)
	for _, binding := range candidates {
		names[ast.SymbolName(binding.symbol)] = false
		for member := range binding.lengthReads {
			lengthReads[member] = binding.symbol
		}
	}
	used := make(map[*ast.Symbol]bool)
	projected := make(map[*ast.Symbol][]*ast.Node)
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
				if parent != nil && ast.IsPropertyAccessExpression(parent) && parent.Expression() == node &&
					parent.Name().Text() == "length" && !ast.IsOptionalChain(parent) {
					original := emit.MostOriginal(parent)
					if proved := lengthReads[original]; proved != nil &&
						emit.MostOriginal(node) == original.Expression() {
						projected[proved] = append(projected[proved], parent)
						return
					}
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
	replacements := make(map[*ast.Node]*ast.Node, len(declarations))
	factory := emit.Factory
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
		members := projected[binding.symbol]
		if len(members) == 0 {
			replacements[declaration] = nil
			continue
		}
		for _, member := range members {
			replacements[member] = member.Expression()
		}
		local := list.Declarations.Nodes[0]
		arity := factory.NewNumericLiteral(strconv.Itoa(binding.arity), ast.TokenFlagsNone)
		value := factory.UpdateVariableDeclaration(local.AsVariableDeclaration(), local.Name(), nil, factory.NewKeywordTypeNode(ast.KindNumberKeyword), arity)
		replacements[declaration] = factory.UpdateVariableStatement(declaration.AsVariableStatement(), declaration.Modifiers(),
			factory.UpdateVariableDeclarationList(list, factory.NewNodeList([]*ast.Node{value}), list.Flags))
	}
	if len(replacements) == 0 {
		return file
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if replacement, changed := replacements[node]; changed {
			return replacement
		}
		return visitor.VisitEachChild(node)
	}, &factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitEachChild(file.AsNode()).AsSourceFile()
}
