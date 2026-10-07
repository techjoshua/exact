package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// lowerTimeClockRead instruments only calls inside a compiler-resolved time:update lexical range.
func (lowering *jsxLowering) lowerTimeClockRead(node *ast.Node) *ast.Node {
	if lowering.timeActivation == "" || !ast.IsCallExpression(node) {
		return nil
	}
	activation := lowering.timeActivationExpression(node)
	planInputs := lowering.timePlanInputsForNode(node)
	call := node.AsCallExpression()
	if timeDateNowCall(node, lowering.checker) {
		arguments := []*ast.Node{}
		if len(planInputs) != 0 {
			arguments = append(arguments, lowering.timePlanInputArray(planInputs))
		}
		return lowering.preserveTimeClockMemberEvaluation(call.Expression, lowering.memberCall(activation, "readEpochMilliseconds", arguments...))
	}
	kind := timeTemporalClockOperation(node, lowering.checker)
	if kind == "" {
		return nil
	}
	arguments := []*ast.Node{lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone)}
	if len(callArguments(node)) != 0 {
		arguments = append(arguments, lowering.visitor.VisitNode(call.Arguments.Nodes[0]))
	}
	if len(planInputs) != 0 {
		arguments = append(arguments, lowering.timePlanInputArray(planInputs))
	}
	category := map[string]string{"instant": "Instant", "zonedDateTimeISO": "ZonedDateTime", "plainDateTimeISO": "PlainDateTime", "plainDateISO": "PlainDate", "plainTimeISO": "PlainTime"}[kind]
	// The checked operation preserves its native category across the intentionally erased helper.
	emitted := lowering.factory.NewAsExpression(lowering.memberCall(activation, "readTemporalNow", arguments...), lowering.factory.NewTypeReferenceNode(lowering.factory.NewQualifiedName(lowering.factory.NewIdentifier("Temporal"), lowering.factory.NewIdentifier(category)), nil))
	return lowering.preserveTimeClockMemberEvaluation(call.Expression, lowering.factory.NewParenthesizedExpression(emitted))
}

// lowerTimeNewDate preserves the native Date category for zero-argument construction.
func (lowering *jsxLowering) lowerTimeNewDate(node *ast.Node) *ast.Node {
	if lowering.timeActivation == "" || !ast.IsNewExpression(node) {
		return nil
	}
	if !timeZeroArgumentDate(node, lowering.checker) {
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

func timeExpressionHasClockDependency(node *ast.Node, typeChecker *checker.Checker, sourceFile *ast.SourceFile, visited map[ast.SymbolId]struct{}) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if timeDateNowCall(candidate, typeChecker) || timeTemporalNowCall(candidate, typeChecker) || timeZeroArgumentDate(candidate, typeChecker) {
			found = true
			return false
		}
		if !ast.IsIdentifier(candidate) || candidate.Parent == nil || ast.IsDeclarationName(candidate) || isStaticPropertyName(candidate) {
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
			if ast.GetSourceFileOfNode(declaration) != sourceFile {
				continue
			}
			var initializer *ast.Node
			if ast.IsBindingElement(declaration) {
				// Reachability and plan inference share the same static binding projection.
				analysis := &jsxLowering{checker: typeChecker, sourceFile: sourceFile}
				initializer = analysis.timeDestructuredInitializer(declaration)
			} else if ast.IsVariableDeclaration(declaration) {
				initializer = declaration.AsVariableDeclaration().Initializer
			}
			if initializer != nil && timeExpressionHasClockDependency(initializer, typeChecker, sourceFile, visited) {
				found = true
				return false
			}
		}
		return !found
	})
	return found
}

func timeTemporalNowCall(node *ast.Node, typeChecker *checker.Checker) bool {
	return timeTemporalClockOperation(node, typeChecker) != ""
}

func timeZeroArgumentDate(node *ast.Node, typeChecker *checker.Checker) bool {
	node = unwrapTimeStaticExpression(node)
	if node == nil || !ast.IsNewExpression(node) {
		return false
	}
	expression := node.AsNewExpression()
	return timeNativeGlobalValue(expression.Expression, "Date", typeChecker) && (expression.Arguments == nil || len(expression.Arguments.Nodes) == 0)
}
