package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// lowerTimeClockRead instruments only calls inside a compiler-resolved time:update lexical range.
func (lowering *jsxLowering) lowerTimeClockRead(node *ast.Node) *ast.Node {
	if lowering.timeActivation == "" || !ast.IsCallExpression(node) {
		return nil
	}
	activation := lowering.timeActivationExpression(node)
	planInputs := lowering.timePlanInputsForNode(node)
	if timeDateNowCall(node) {
		arguments := []*ast.Node{}
		if len(planInputs) != 0 {
			arguments = append(arguments, lowering.timePlanInputArray(planInputs))
		}
		return lowering.memberCall(
			activation,
			"readEpochMilliseconds",
			arguments...,
		)
	}
	call := node.AsCallExpression()
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return nil
	}
	operation := call.Expression.AsPropertyAccessExpression()
	if !ast.IsPropertyAccessExpression(operation.Expression) {
		return nil
	}
	now := operation.Expression.AsPropertyAccessExpression()
	if !ast.IsIdentifier(now.Expression) || now.Expression.Text() != "Temporal" || now.Name().Text() != "Now" {
		return nil
	}
	kind := operation.Name().Text()
	switch kind {
	case "instant", "zonedDateTimeISO", "plainDateTimeISO", "plainDateISO", "plainTimeISO":
	default:
		return nil
	}
	arguments := []*ast.Node{lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone)}
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		arguments = append(arguments, lowering.visitor.VisitNode(call.Arguments.Nodes[0]))
	}
	if len(planInputs) != 0 {
		arguments = append(arguments, lowering.timePlanInputArray(planInputs))
	}
	return lowering.memberCall(
		activation,
		"readTemporalNow",
		arguments...,
	)
}

// lowerTimeNewDate preserves the native Date category for zero-argument construction.
func (lowering *jsxLowering) lowerTimeNewDate(node *ast.Node) *ast.Node {
	if lowering.timeActivation == "" || !ast.IsNewExpression(node) {
		return nil
	}
	expression := node.AsNewExpression()
	if !ast.IsIdentifier(expression.Expression) || expression.Expression.Text() != "Date" ||
		(expression.Arguments != nil && len(expression.Arguments.Nodes) != 0) {
		return nil
	}
	activation := lowering.timeActivationExpression(node)
	planInputs := lowering.timePlanInputsForNode(node)
	arguments := []*ast.Node{}
	if len(planInputs) != 0 {
		arguments = append(arguments, lowering.timePlanInputArray(planInputs))
	}
	return lowering.memberCall(activation, "readDate", arguments...)
}

// lowerTimeDerivedReference materializes safe owner-local aliases inside the range reader. This
// preserves range-local frozen samples instead of closing over the component setup snapshot.
func (lowering *jsxLowering) lowerTimeDerivedReference(node *ast.Node) *ast.Node {
	if lowering.timeActivation == "" || lowering.checker == nil || !ast.IsIdentifier(node) {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsBindingElement(declaration) && ast.GetSourceFileOfNode(declaration) == lowering.sourceFile {
			initializer := lowering.timeDestructuredInitializer(declaration)
			if initializer != nil && safeReactiveInitializer(initializer, lowering.sourceFile, lowering.checker) &&
				timeExpressionHasClockDependency(initializer, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
				return lowering.visitTimeInitializer(node, initializer)
			}
			continue
		}
		if !ast.IsVariableDeclaration(declaration) || ast.GetSourceFileOfNode(declaration) != lowering.sourceFile {
			continue
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		_, compilerProvedDerived := lowering.derivedBindingAtReference(node)
		if initializer == nil ||
			(!compilerProvedDerived && !safeReactiveInitializer(initializer, lowering.sourceFile, lowering.checker)) ||
			!timeExpressionHasClockDependency(initializer, lowering.checker, lowering.sourceFile, make(map[ast.SymbolId]struct{})) {
			continue
		}
		if name := declaration.AsVariableDeclaration().Name(); name != nil && ast.IsIdentifier(name) {
			lowering.materializedName(name.Text(), name.Pos())
		}
		return lowering.visitTimeInitializer(node, initializer)
	}
	return nil
}

func (lowering *jsxLowering) visitTimeInitializer(reference *ast.Node, initializer *ast.Node) *ast.Node {
	previous := lowering.timeAdoptedSelection
	if selected := lowering.timeAdoptedRangeForNode(reference); selected != nil {
		lowering.timeAdoptedSelection = selected
	}
	result := lowering.visitor.VisitNode(initializer)
	lowering.timeAdoptedSelection = previous
	return result
}

func timeExpressionHasClockDependency(node *ast.Node, typeChecker interface {
	GetSymbolAtLocation(*ast.Node) *ast.Symbol
}, sourceFile *ast.SourceFile, visited map[ast.SymbolId]struct{}) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if timeDateNowCall(candidate) || timeTemporalNowCall(candidate) || timeZeroArgumentDate(candidate) {
			found = true
			return false
		}
		if !ast.IsIdentifier(candidate) || ast.IsDeclarationName(candidate) || isStaticPropertyName(candidate) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(candidate)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		if _, seen := visited[id]; seen {
			return true
		}
		visited[id] = struct{}{}
		for _, declaration := range symbol.Declarations {
			if declaration.Kind == ast.KindParameter {
				if argument := timeArgumentForParameterUse(declaration, typeChecker, sourceFile); argument != nil &&
					timeExpressionHasClockDependency(argument, typeChecker, sourceFile, visited) {
					found = true
					return false
				}
				continue
			}
			if !ast.IsVariableDeclaration(declaration) || ast.GetSourceFileOfNode(declaration) != sourceFile {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil && timeExpressionHasClockDependency(initializer, typeChecker, sourceFile, visited) {
				found = true
				return false
			}
		}
		return !found
	})
	return found
}

func timeTemporalNowCall(node *ast.Node) bool {
	if !ast.IsCallExpression(node) || !ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
		return false
	}
	operation := node.AsCallExpression().Expression.AsPropertyAccessExpression()
	if !ast.IsPropertyAccessExpression(operation.Expression) {
		return false
	}
	now := operation.Expression.AsPropertyAccessExpression()
	return ast.IsIdentifier(now.Expression) && now.Expression.Text() == "Temporal" && now.Name().Text() == "Now"
}

func timeZeroArgumentDate(node *ast.Node) bool {
	if !ast.IsNewExpression(node) {
		return false
	}
	expression := node.AsNewExpression()
	return ast.IsIdentifier(expression.Expression) && expression.Expression.Text() == "Date" &&
		(expression.Arguments == nil || len(expression.Arguments.Nodes) == 0)
}
