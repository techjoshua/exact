package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

// Keep call arguments from every invocation until task placement is finalized.
// Repeated calls share one task definition but carry distinct values.
type taskCallArguments struct {
	call, work *ast.Node
	arguments  []*ast.Node
	defaults   []int
}

func isTaskFunctionArgument(argument *ast.Node, c *checker.Checker) bool {
	value := unwrapSourceCallableReference(argument)
	if ast.IsArrowFunction(value) || ast.IsFunctionExpression(value) {
		return true
	}
	if ast.IsSpreadElement(value) {
		tuple := c.GetTypeAtLocation(value.Expression())
		if tuple != nil && checker.IsTupleType(tuple) {
			for index, member := range c.GetTypeArguments(tuple) {
				if tuple.TargetTupleType().ElementFlags()[index] == checker.ElementFlagsRequired && definitelyFunction(member, c) {
					return true
				}
			}
		}
		return false
	}
	return definitelyFunction(c.GetTypeAtLocation(value), c)
}

func definitelyFunction(t *checker.Type, c *checker.Checker) bool {
	return t != nil && t.Flags()&(checker.TypeFlagsAnyOrUnknown|checker.TypeFlagsNever) == 0 &&
		len(c.GetSignaturesOfType(t, checker.SignatureKindCall)) != 0
}

// Diagnose function values at the client-to-server transport even when the
// server parameter is unused. Local invocations preserve their callback values.
func (facts *sourceAnalysisFacts) taskFunctionArgumentDiagnostics(tasks []Task, jsx []JSXElement, callables callableAnalysis, operations []InvokedTaskOperation) []Diagnostic {
	if len(facts.taskArguments) == 0 {
		return nil
	}
	placements := make(map[int]string, len(tasks))
	for _, task := range tasks {
		if task.FunctionDefined {
			placements[task.WorkStart] = task.Placement
		}
	}
	// Use the same property captures that the generated operation serializes.
	// Checking just the selected slot leaves unrelated props on the client.
	badCaptures := make(map[int][]*ast.Node)
	for _, op := range operations {
		if op.Placement != "server" {
			continue
		}
		for _, capture := range op.captures {
			if fn := capture.transportedPropFunction(facts.checker); fn != nil {
				badCaptures[op.Start] = append(badCaptures[op.Start], fn)
			}
		}
	}
	type transfer struct {
		argument, caller *ast.Node
		capture          bool
	}
	var candidates []transfer
	for _, use := range facts.taskArguments {
		if placements[use.work.Pos()] != "server" {
			continue
		}
		caller := enclosingCallableNode(use.call)
		if caller == nil || placements[caller.Pos()] == "server" {
			continue
		}
		for _, fn := range badCaptures[use.work.Pos()] {
			candidates = append(candidates, transfer{fn, caller, true})
		}
		firstSpread := len(use.arguments)
		for index, arg := range use.arguments {
			if ast.IsSpreadElement(arg) && index < firstSpread {
				firstSpread = index
			}
			if isTaskFunctionArgument(arg, facts.checker) {
				candidates = append(candidates, transfer{arg, caller, false})
			}
		}
		// The client task facade evaluates a selected default before dispatch.
		// After a spread the original argument index can be unknown.
		for _, index := range use.defaults {
			if firstSpread < len(use.arguments) && index >= firstSpread {
				continue
			}
			if index < len(use.arguments) {
				actual := unwrapSourceCallableReference(use.arguments[index])
				if !ast.IsVoidExpression(actual) && !(ast.IsIdentifier(actual) && facts.checker.IsUndefinedSymbol(facts.checker.GetSymbolAtLocation(actual))) {
					continue
				}
			}
			value := taskRuntimeParameters(use.work)[index].Initializer()
			if isTaskFunctionArgument(value, facts.checker) {
				candidates = append(candidates, transfer{value, caller, false})
			}
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	clientHandlers := make(map[*ast.Node]bool)
	addHandler := func(handler *ast.Node) {
		handler = unwrapSourceCallableReference(handler)
		if handler == nil {
			return
		}
		if ast.IsIdentifier(handler) && (callables.owner == nil || callables.owner.values.bindingWritten(facts.checker.GetSymbolAtLocation(handler))) {
			return
		}
		if body := taskActivationTargetBody(handler, facts.checker); body != nil && placements[body.Pos()] != "server" {
			clientHandlers[body] = true
		}
	}
	for _, handler := range facts.clientLifecycleHandlers {
		addHandler(handler)
	}
	for _, element := range jsx {
		if !element.Intrinsic {
			continue
		}
		for _, attribute := range element.Attributes {
			if !jsxEventAttribute(attribute.Name) || attribute.ValueKind != "expression" {
				continue
			}
			node := ast.GetNodeAtPosition(facts.source, attribute.Start, false)
			if node != nil && ast.IsJsxAttribute(node) {
				addHandler(islandJSXAttributeValue(node.AsJsxAttribute().Initializer))
			}
		}
	}
	// Follow existing direct, resolved calls made by an event or client task.
	// A server task starts a new execution realm, even when the event reaches it.
	byID := make(map[string]*callableFacts)
	var pending []*callableFacts
	for i := range callables.facts {
		fact := &callables.facts[i]
		if fact.sourceFile != facts.source || fact.node == nil {
			continue
		}
		byID[fact.summary.ID] = fact
		if clientHandlers[fact.node] || placements[fact.node.Pos()] == "client" {
			clientHandlers[fact.node] = true
			pending = append(pending, fact)
		}
	}
	for len(pending) > 0 {
		fact := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		for _, edge := range fact.summary.Calls {
			target := byID[edge.TargetID]
			if !edge.Resolved || target == nil || clientHandlers[target.node] || placements[target.node.Pos()] == "server" {
				continue
			}
			expr := fact.callExpressions[edge.ID]
			if expr == nil || expr.Parent == nil || !ast.IsCallExpression(expr.Parent) || expr.Parent.Expression() != expr || enclosingCallableNode(expr) != fact.node {
				continue
			}
			clientHandlers[target.node] = true
			pending = append(pending, target)
		}
	}
	var diagnostics []Diagnostic
	reported := map[*ast.Node]bool{}
	for _, use := range candidates {
		if !clientHandlers[use.caller] || reported[use.argument] {
			continue
		}
		reported[use.argument] = true
		message := "error: a function cannot be sent from the client as a server task argument. Run the callback on the client and pass its result, or pass data and handle it in the server task"
		if use.capture {
			message = "error: this component prop supplies a function that cannot be sent to a server task. Run the callback on the client and pass its data, or use a server-local function"
		}
		start := scanner.SkipTrivia(facts.source.Text(), use.argument.Pos())
		diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2001",
			Message: message,
			Start:   start, Length: use.argument.End() - start})
	}
	return diagnostics
}
