package exactcompiler

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

func collectDirectCallableEffects(
	fact *callableFacts,
	factIndex int,
	facts []callableFacts,
	symbolTargets map[ast.SymbolId]int,
	syntacticTargets map[string]int,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
	stateWrites []StateWrite,
	importBindings externalImportBindings,
	contextBindings map[string]ContextEffect,
) {
	if isSideEffectImport(fact.node) {
		declaration := fact.node.AsImportDeclaration()
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		edge := CallEdge{
			ID:              fmt.Sprintf("%s:import:%d", fact.summary.ID, fact.node.Pos()),
			Name:            `import "` + moduleSpecifier + `"`,
			ModuleSpecifier: moduleSpecifier,
			ExportName:      "*module*",
			Resolved:        false,
		}
		fact.summary.Calls = append(fact.summary.Calls, edge)
		source := environmentSource(
			"unknown",
			"unresolved call "+edge.Name,
			fact.summary.Name,
		)
		source.Opaque = !strings.HasPrefix(moduleSpecifier, ".") &&
			!filepath.IsAbs(moduleSpecifier)
		fact.summary.DirectEffectSources = append(
			fact.summary.DirectEffectSources,
			source,
		)
	}
	parameterReads, parameterWrites := collectParameterStateEffects(
		fact.node,
		typeChecker,
	)
	fact.directReads = append(fact.directReads, parameterReads...)
	fact.directWrites = append(fact.directWrites, parameterWrites...)
	for _, read := range stateReads {
		if directlyOwnedSpan(read.Start, read.Start+read.Length, factIndex, facts) {
			fact.directReads = append(fact.directReads, StateEffect{
				Path: strings.Join(read.Path, "."), Kind: "read", Confidence: read.Confidence,
			})
		}
	}
	for _, write := range stateWrites {
		if write.Interaction {
			continue
		}
		if directlyOwnedSpan(write.Start, write.Start+write.Length, factIndex, facts) {
			confidence := "exact"
			if containsString(write.Path, "*") || write.Operation == "array-mutation" {
				confidence = "broad"
			}
			fact.directWrites = append(fact.directWrites, StateEffect{
				Path:       strings.Join(write.Path, "."),
				Kind:       "write",
				Confidence: confidence,
				Operation:  stateEffectOperation(write.Operation),
			})
		}
	}

	walkCallable(fact.node, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
			!isStaticPropertyName(node) {
			name := node.Text()
			symbol := typeChecker.GetSymbolAtLocation(node)
			if _, candidate := browserGlobals[name]; candidate &&
				symbolIsOutsideSource(symbol, sourceFile) &&
				!browserGlobalReferenceIsGuarded(node, name, fact.node) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("browser", name, fact.summary.Name),
				)
			}
			if _, candidate := serverGlobals[name]; candidate &&
				symbolIsOutsideSource(symbol, sourceFile) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("server", name, fact.summary.Name),
				)
			}
			if serverOnlyImportSymbol(symbol) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("server", "server-only import "+name, fact.summary.Name),
				)
			}
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if effect, ok := contextEffect(call, sourceFile, typeChecker); ok {
			fact.directContext = append(fact.directContext, effect)
		} else if effect, ok := contextBindingCallEffect(
			call.Expression,
			contextBindings,
		); ok {
			fact.directContext = append(fact.directContext, effect)
		}
		targetSymbol := resolvedCallableSymbol(
			callTargetSymbol(call.Expression, typeChecker),
			typeChecker,
		)
		targetIndex, resolved := syntacticTargets[strings.TrimSpace(
			sourceText(sourceFile, call.Expression),
		)]
		if ast.IsIdentifier(call.Expression) &&
			call.Expression.Text() == fact.summary.Name {
			targetIndex, resolved = factIndex, true
		}
		if targetSymbol != nil {
			if symbolTarget, exists := symbolTargets[ast.GetSymbolId(targetSymbol)]; exists {
				targetIndex, resolved = symbolTarget, true
			}
		}
		edge := CallEdge{
			ID:       fmt.Sprintf("%s:call:%d", fact.summary.ID, node.Pos()),
			Name:     strings.TrimSpace(sourceText(sourceFile, call.Expression)),
			Resolved: resolved,
		}
		fact.callExpressions[edge.ID] = call.Expression
		if reference, exists := externalImportForExpression(
			call.Expression,
			importBindings,
			typeChecker,
		); exists {
			edge.ModuleSpecifier = reference.moduleSpecifier
			edge.ExportName = reference.exportName
		}
		if targetSymbol != nil {
			fact.callSymbols[edge.ID] = ast.GetSymbolId(targetSymbol)
		}
		if resolved {
			edge.TargetID = facts[targetIndex].summary.ID
			edge.ReceiverBindings = receiverBindingsForCall(
				call,
				fact.node,
				facts[targetIndex].node,
				typeChecker,
			)
			fact.targets = append(fact.targets, targetIndex)
		} else if environment := unresolvedCallEnvironment(
			call.Expression,
			sourceFile,
			typeChecker,
			contextBindings,
		); environment != "" {
			description := edge.Name
			if environment == "unknown" {
				description = "unresolved call " + edge.Name
			}
			source := environmentSource(environment, description, fact.summary.Name)
			source.Opaque = environment == "unknown" &&
				opaqueCallExpression(call.Expression, typeChecker)
			fact.summary.DirectEffectSources = append(
				fact.summary.DirectEffectSources,
				source,
			)
		}
		fact.summary.Calls = append(fact.summary.Calls, edge)
		if eagerCallbackCall(call.Expression) && call.Arguments != nil {
			for argumentIndex, argument := range call.Arguments.Nodes {
				if !ast.IsArrowFunction(argument) &&
					!ast.IsFunctionExpression(argument) {
					continue
				}
				for callbackIndex := range facts {
					if facts[callbackIndex].node != argument {
						continue
					}
					fact.summary.Calls = append(
						fact.summary.Calls,
						CallEdge{
							ID: fmt.Sprintf(
								"%s:callback:%d:%d",
								fact.summary.ID,
								node.Pos(),
								argumentIndex,
							),
							Name:     facts[callbackIndex].summary.Name,
							TargetID: facts[callbackIndex].summary.ID,
							Resolved: true,
						},
					)
					fact.targets = append(fact.targets, callbackIndex)
					break
				}
			}
		}
		return true
	})
	applyCallableAnnotations(fact, sourceFile)
	fact.summary.DirectEffectSources = uniqueEnvironmentSources(
		fact.summary.DirectEffectSources,
	)
	fact.summary.EffectSources = append(
		[]EnvironmentEffectSource(nil),
		fact.summary.DirectEffectSources...,
	)
	fact.directReads = minimalStateEffects(fact.directReads)
	fact.directWrites = uniqueStateEffects(fact.directWrites)
	fact.directContext = uniqueContextEffects(fact.directContext)
	fact.summary.StateReads = append([]StateEffect(nil), fact.directReads...)
	fact.summary.StateWrites = append([]StateEffect(nil), fact.directWrites...)
	fact.summary.Contexts = append([]ContextEffect(nil), fact.directContext...)
}

// browserGlobalReferenceIsGuarded recognizes the ordinary universal-runtime pattern where a
// browser global is read only after a typeof availability test. The guard itself is safe in every
// JavaScript runtime, and the guarded branch cannot execute on a server where the global is absent;
// treating either reference as an unconditional browser effect would incorrectly project the
// complete callable out of an otherwise valid server artifact.
func browserGlobalReferenceIsGuarded(node *ast.Node, name string, callable *ast.Node) bool {
	if node.Parent != nil && ast.IsTypeOfExpression(node.Parent) {
		return true
	}
	for current := node; current != nil && current != callable; current = current.Parent {
		parent := current.Parent
		if parent == nil {
			break
		}
		switch {
		case ast.IsConditionalExpression(parent):
			conditional := parent.AsConditionalExpression()
			availableWhenTrue, recognized := browserAvailabilityGuard(conditional.Condition, name)
			if recognized && ((nodeInside(current, conditional.WhenTrue) && availableWhenTrue) ||
				(nodeInside(current, conditional.WhenFalse) && !availableWhenTrue)) {
				return true
			}
		case ast.IsIfStatement(parent):
			statement := parent.AsIfStatement()
			availableWhenTrue, recognized := browserAvailabilityGuard(statement.Expression, name)
			if recognized && ((nodeInside(current, statement.ThenStatement) && availableWhenTrue) ||
				(statement.ElseStatement != nil && nodeInside(current, statement.ElseStatement) &&
					!availableWhenTrue)) {
				return true
			}
		case ast.IsBinaryExpression(parent):
			binary := parent.AsBinaryExpression()
			if !nodeInside(current, binary.Right) {
				continue
			}
			availableWhenTrue, recognized := browserAvailabilityGuard(binary.Left, name)
			if !recognized {
				continue
			}
			if (binary.OperatorToken.Kind == ast.KindAmpersandAmpersandToken && availableWhenTrue) ||
				(binary.OperatorToken.Kind == ast.KindBarBarToken && !availableWhenTrue) {
				return true
			}
		}
	}
	return false
}

func browserAvailabilityGuard(node *ast.Node, name string) (bool, bool) {
	for node != nil && ast.IsParenthesizedExpression(node) {
		node = node.AsParenthesizedExpression().Expression
	}
	if node == nil || !ast.IsBinaryExpression(node) {
		return false, false
	}
	binary := node.AsBinaryExpression()
	left, right := binary.Left, binary.Right
	if !browserTypeofUndefinedComparison(left, right, name) &&
		!browserTypeofUndefinedComparison(right, left, name) {
		return false, false
	}
	switch binary.OperatorToken.Kind {
	case ast.KindExclamationEqualsToken, ast.KindExclamationEqualsEqualsToken:
		return true, true
	case ast.KindEqualsEqualsToken, ast.KindEqualsEqualsEqualsToken:
		return false, true
	default:
		return false, false
	}
}

func browserTypeofUndefinedComparison(typeOf *ast.Node, undefined *ast.Node, name string) bool {
	for typeOf != nil && ast.IsParenthesizedExpression(typeOf) {
		typeOf = typeOf.AsParenthesizedExpression().Expression
	}
	for undefined != nil && ast.IsParenthesizedExpression(undefined) {
		undefined = undefined.AsParenthesizedExpression().Expression
	}
	if typeOf == nil || undefined == nil || !ast.IsTypeOfExpression(typeOf) ||
		!ast.IsStringLiteral(undefined) || undefined.Text() != "undefined" {
		return false
	}
	expression := typeOf.AsTypeOfExpression().Expression
	return expression != nil && ast.IsIdentifier(expression) && expression.Text() == name
}

func nodeInside(node *ast.Node, container *ast.Node) bool {
	return node != nil && container != nil && node.Pos() >= container.Pos() && node.End() <= container.End()
}

func appendComponentBindingCallableFacts(
	facts []callableFacts,
	sourceFile *ast.SourceFile,
	bindings map[int]componentBinding,
) []callableFacts {
	ordered := make([]componentBinding, 0, len(bindings))
	for _, binding := range bindings {
		ordered = append(ordered, binding)
	}
	sort.Slice(ordered, func(left int, right int) bool {
		return ordered[left].start < ordered[right].start
	})
	for _, binding := range ordered {
		name := fmt.Sprintf("<anonymous@%d>", binding.start)
		effects := []EnvironmentEffectSource{}
		if interactiveJSXAttribute(binding.callbackProp) {
			effects = append(
				effects,
				environmentSource("browser", "interactive JSX handler", name),
			)
		}
		confidence := "exact"
		if containsString(binding.write.Path, "*") || binding.write.Operation == "array-mutation" {
			confidence = "broad"
		}
		write := StateEffect{
			Path: strings.Join(binding.write.Path, "."), Kind: "write",
			Confidence: confidence, Operation: stateEffectOperation(binding.write.Operation),
		}
		facts = append(facts, callableFacts{
			node: binding.target, sourceFile: sourceFile,
			summary: CallableSummary{
				ID:   fmt.Sprintf("callable:%s:%d", sourceFile.FileName(), binding.start),
				Name: name, Kind: "function",
				ExportNames: []string{}, DirectEffectSources: effects,
				EffectSources: append([]EnvironmentEffectSource(nil), effects...),
				Calls:         []CallEdge{}, ArtifactTargets: []string{},
				StateReads: []StateEffect{}, StateWrites: []StateEffect{write},
				Contexts: []ContextEffect{},
			},
			directReads: []StateEffect{}, directWrites: []StateEffect{write},
			directContext: []ContextEffect{}, callSymbols: make(map[string]ast.SymbolId),
			callExpressions: make(map[string]*ast.Node),
		})
	}
	return facts
}

func eagerCallbackCall(expression *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	switch expression.AsPropertyAccessExpression().Name().Text() {
	case "map", "flatMap", "filter", "forEach", "some", "every",
		"find", "findIndex", "reduce", "reduceRight", "sort",
		"then", "catch", "finally":
		return true
	default:
		return false
	}
}

func collectParameterStateEffects(
	callable *ast.Node,
	typeChecker *checker.Checker,
) ([]StateEffect, []StateEffect) {
	if !isCallableNode(callable) {
		return nil, nil
	}
	parameters := make(map[ast.SymbolId]int)
	for index, parameter := range callable.Parameters() {
		name := parameter.Name()
		if name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			parameters[ast.GetSymbolId(symbol)] = index
		}
	}
	if len(parameters) == 0 {
		return nil, nil
	}
	reads := []StateEffect{}
	writes := []StateEffect{}
	walkCallable(callable, func(node *ast.Node) bool {
		if target, operation := stateWriteTarget(node, typeChecker); operation != "" {
			if effect, exists := parameterStateEffect(
				target,
				"write",
				parameters,
				typeChecker,
			); exists {
				effect.Operation = stateEffectOperation(operation)
				writes = append(writes, effect)
			}
			return true
		}
		if (!ast.IsPropertyAccessExpression(node) &&
			!ast.IsElementAccessExpression(node)) ||
			insideStateWriteTarget(node) {
			return true
		}
		target, eligible := stateReadTarget(node)
		if !eligible {
			return true
		}
		if effect, exists := parameterStateEffect(
			target,
			"read",
			parameters,
			typeChecker,
		); exists {
			reads = append(reads, effect)
		}
		return true
	})
	return minimalStateEffects(reads), uniqueStateEffects(writes)
}

func parameterStateEffect(
	node *ast.Node,
	kind string,
	parameters map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) (StateEffect, bool) {
	if node == nil {
		return StateEffect{}, false
	}
	segments := []string{}
	current := node
	for {
		switch {
		case ast.IsPropertyAccessExpression(current):
			member := current.AsPropertyAccessExpression()
			if member.Name() == nil {
				return StateEffect{}, false
			}
			segments = append(segments, member.Name().Text())
			current = member.Expression
		case ast.IsElementAccessExpression(current):
			member := current.AsElementAccessExpression()
			if member.ArgumentExpression == nil ||
				(!ast.IsStringLiteral(member.ArgumentExpression) &&
					!ast.IsNumericLiteral(member.ArgumentExpression)) {
				segments = append(segments, "*")
			} else {
				segments = append(segments, member.ArgumentExpression.Text())
			}
			current = member.Expression
		default:
			goto resolved
		}
	}
resolved:
	if !ast.IsIdentifier(current) {
		return StateEffect{}, false
	}
	symbol := typeChecker.GetSymbolAtLocation(current)
	if symbol == nil {
		return StateEffect{}, false
	}
	parameterIndex, exists := parameters[ast.GetSymbolId(symbol)]
	if !exists {
		return StateEffect{}, false
	}
	for left, right := 0, len(segments)-1; left < right; left, right = left+1, right-1 {
		segments[left], segments[right] = segments[right], segments[left]
	}
	if len(segments) == 0 || segments[0] != "state" {
		return StateEffect{}, false
	}
	segments = segments[1:]
	confidence := "exact"
	if len(segments) == 0 {
		segments = []string{"*"}
		confidence = "broad"
	} else if containsString(segments, "*") {
		confidence = "unknown"
	}
	return StateEffect{
		Path:       strings.Join(segments, "."),
		Kind:       kind,
		Confidence: confidence,
		Receiver:   &StateReceiver{Kind: "parameter", Index: parameterIndex},
	}, true
}

func receiverBindingsForCall(
	call *ast.CallExpression,
	caller *ast.Node,
	callee *ast.Node,
	typeChecker *checker.Checker,
) []ReceiverBinding {
	callerParameters := make(map[ast.SymbolId]int)
	if isCallableNode(caller) {
		for index, parameter := range caller.Parameters() {
			name := parameter.Name()
			if name == nil || !ast.IsIdentifier(name) {
				continue
			}
			if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
				callerParameters[ast.GetSymbolId(symbol)] = index
			}
		}
	}
	if !isCallableNode(callee) {
		return nil
	}
	result := make([]ReceiverBinding, 0, len(callee.Parameters()))
	for index := range callee.Parameters() {
		binding := ReceiverBinding{ParameterIndex: index, Source: "unknown"}
		if call.Arguments != nil && index < len(call.Arguments.Nodes) {
			argument := call.Arguments.Nodes[index]
			if argument.Kind == ast.KindThisKeyword {
				binding.Source = "component"
			} else if ast.IsIdentifier(argument) {
				if symbol := typeChecker.GetSymbolAtLocation(argument); symbol != nil {
					if sourceIndex, exists := callerParameters[ast.GetSymbolId(symbol)]; exists {
						binding.Source = "parameter"
						binding.SourceParameterIndex = sourceIndex
					}
				}
			}
		}
		result = append(result, binding)
	}
	return result
}

func isSideEffectImport(node *ast.Node) bool {
	return ast.IsImportDeclaration(node) &&
		node.AsImportDeclaration().ImportClause == nil &&
		node.AsImportDeclaration().ModuleSpecifier != nil &&
		ast.IsStringLiteral(node.AsImportDeclaration().ModuleSpecifier)
}

func walkCallable(root *ast.Node, visit func(*ast.Node) bool) {
	var walk func(*ast.Node)
	walk = func(node *ast.Node) {
		if node != root && isCallableNode(node) {
			return
		}
		if !visit(node) {
			return
		}
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(root)
}

func directlyOwnedSpan(start int, end int, owner int, facts []callableFacts) bool {
	node := facts[owner].node
	if start < node.Pos() || end > node.End() {
		return false
	}
	for index := range facts {
		if index == owner {
			continue
		}
		if facts[index].sourceFile != facts[owner].sourceFile {
			continue
		}
		candidate := facts[index].node
		if candidate.Pos() >= node.Pos() && candidate.End() <= node.End() &&
			start >= candidate.Pos() && end <= candidate.End() {
			return false
		}
	}
	return true
}
