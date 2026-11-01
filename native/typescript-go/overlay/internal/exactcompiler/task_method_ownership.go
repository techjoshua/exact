package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskMethodCreation is lexical creation ownership, not a selected-callee or lifetime claim.
// Authored pointers establish the relation before parent/capture rewriting. Spans index its use.
type taskMethodCreation struct {
	method, work, binding *ast.Node
	consumers             map[taskMethodConsumer]bool
	called                bool
}

// taskMethodConsumer preserves each analyzed activation of one authored work.
type taskMethodConsumer struct{ id, component string }

// planTaskMethodCreations visits each authored task subtree once. Direct calls witness this
// bounded admission, while an extracted original retains its creating activation signal.
func planTaskMethodCreations(source *ast.SourceFile, tasks []Task, writes map[string]StateWrite, c *checker.Checker) map[SourceSpan]taskMethodCreation {
	result := map[SourceSpan]taskMethodCreation{}
	tasksBySpan := map[SourceSpan][]Task{}
	for _, task := range tasks {
		if !task.SyntheticSetup && !task.CompilerSetup && !task.CompilerComputation && task.WorkLength > 0 {
			span := SourceSpan{Start: task.WorkStart, Length: task.WorkLength}
			tasksBySpan[span] = append(tasksBySpan[span], task)
		}
	}
	works := map[*ast.Node][]Task{}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if task, ok := tasksBySpan[nodeSourceSpan(node)]; ok && isCallableNode(node) && node.Body() != nil {
			works[node] = task
		}
		return true
	})
	for work, tasks := range works {
		methods := map[*ast.Node]*taskMethodCreation{}
		calls := []*ast.Node{}
		walkNode(work.Body(), func(node *ast.Node) bool {
			if ast.IsPartOfTypeNode(node) || ast.IsClassDeclaration(node) || ast.IsClassExpression(node) {
				return false
			}
			if isCallableNode(node) || ast.IsConstructorDeclaration(node) {
				binding := taskMethodConstBinding(node, work, c)
				if binding == nil {
					return false
				}
				methods[node] = &taskMethodCreation{method: node, work: work, binding: binding, consumers: map[taskMethodConsumer]bool{}}
			}
			var method *taskMethodCreation
			for parent := node; parent != nil && parent != work; parent = parent.Parent {
				if candidate := methods[parent]; candidate != nil {
					method = candidate
					break
				}
			}
			if method != nil {
				if write, ok := writes[nodeSpanKey(node)]; ok && write.RootAlias != "" && write.RootComponent && len(write.DynamicSegments) == 0 && (write.Operation == "assignment" || write.Operation == "update" || write.Operation == "delete") {
					for _, task := range tasks {
						if write.Component == task.Component {
							method.consumers[taskMethodConsumer{id: task.ID, component: task.Component}] = true
						}
					}
				}
			} else if ast.IsCallExpression(node) {
				calls = append(calls, node)
			}
			return true
		})
		for _, call := range calls {
			expression := unwrapSourceCallableReference(call.AsCallExpression().Expression)
			var receiver *ast.Node
			if ast.IsPropertyAccessExpression(expression) {
				receiver = expression.AsPropertyAccessExpression().Expression
			}
			if ast.IsElementAccessExpression(expression) {
				receiver = expression.AsElementAccessExpression().Expression
			}
			receiver = unwrapSourceCallableReference(receiver)
			if receiver == nil || !ast.IsIdentifier(receiver) {
				continue
			}
			symbol := sourceCallableReferenceSymbol(expression, c)
			if symbol == nil {
				continue
			}
			for _, declaration := range symbol.Declarations {
				if method := methods[declaration]; method != nil && c.GetSymbolAtLocation(receiver) == c.GetSymbolAtLocation(method.binding.Name()) {
					method.called = true
				}
			}
		}
		for node, method := range methods {
			if len(method.consumers) != 0 && method.called {
				result[nodeSourceSpan(node)] = *method
			}
		}
	}
	return result
}

// taskMethodConstBinding rejects other creation environments, without scanning uses for escape.
func taskMethodConstBinding(method, work *ast.Node, c *checker.Checker) *ast.Node {
	if !ast.IsMethodDeclaration(method) || method.Body() == nil || method.AsMethodDeclaration().AsteriskToken != nil || ast.HasSyntacticModifier(method, ast.ModifierFlagsAsync) {
		return nil
	}
	object := method.Parent
	if object == nil || !ast.IsObjectLiteralExpression(object) {
		return nil
	}
	name := method.Name()
	if name == nil {
		return nil
	}
	if ast.IsComputedPropertyName(name) {
		key := c.GetTypeAtLocation(name.AsComputedPropertyName().Expression)
		if key == nil || key.Flags()&checker.TypeFlagsStringLiteral == 0 {
			return nil
		}
	} else if !ast.IsIdentifier(name) && !ast.IsStringLiteral(name) && !ast.IsNumericLiteral(name) {
		return nil
	}
	binding := sourceCallableBinding(object)
	if binding == nil || !ast.IsIdentifier(binding.Name()) || binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	current := binding.Parent
	for current != nil && current != work.Body() {
		if !ast.IsVariableDeclarationList(current) && !ast.IsVariableStatement(current) && !ast.IsBlock(current) {
			return nil
		}
		current = current.Parent
	}
	if current != work.Body() {
		return nil
	}
	return binding
}

// taskMethodCreatedBy requires authored method/body pointers and the consumer identity.
// Task projection may synthesize the callable while retaining its original body.
func (lowering *jsxLowering) taskMethodCreatedBy(node, work *ast.Node, id, component string, start, length int) bool {
	if !ast.IsMethodDeclaration(node) {
		return false
	}
	creation, ok := lowering.taskMethodOwners[nodeSourceSpan(node)]
	return ok && creation.consumers[taskMethodConsumer{id: id, component: component}] && creation.work.Pos() == start && creation.work.End()-creation.work.Pos() == length && lowering.emitContext.MostOriginal(node) == creation.method && lowering.emitContext.MostOriginal(work.Body()) == creation.work.Body()
}
