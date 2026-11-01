package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func collectDirectCallableEffects(
	fact *callableFacts,
	factIndex int,
	facts []callableFacts,
	symbolTargets map[ast.SymbolId]int,
	syntacticTargets map[string]int,
	nodeTargets map[*ast.Node]int,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
	stateWrites []StateWrite,
	importBindings externalImportBindings,
	contextBindings map[ast.SymbolId]ContextEffect,
	assets assetAnalysis,
	owner *executableBodyOwner,
) {
	if ast.IsFunctionLike(fact.node) {
		if _, valid := functionTaskPolicy(fact.node, sourceFile, importBindings); valid {
			fact.progressReceiver = taskPolicyHasFacet(fact.node, "progress")
		}
	}
	if isSideEffectImport(fact.node) {
		collectSideEffectImportFacts(fact, assets)
	}
	parameterReads, parameterWrites := collectParameterStateEffects(
		fact.node,
		typeChecker,
	)
	fact.directReads = append(fact.directReads, parameterReads...)
	fact.directWrites = append(fact.directWrites, parameterWrites...)
	for _, read := range stateReads {
		if directlyOwnedSpan(read.Start, read.Start+read.Length, factIndex, facts) {
			read = taskOptionalReceiverRead(read, fact.node)
			fact.directReads = append(fact.directReads, StateEffect{
				pathSegments: append([]string{}, read.Path...),
				Path:         strings.Join(read.Path, "."), Kind: "read", Confidence: read.Confidence,
			})
		}
	}
	for _, write := range stateWrites {
		if write.Interaction {
			continue
		}
		if directlyOwnedSpan(write.Start, write.Start+write.Length, factIndex, facts) {
			confidence := "exact"
			if containsString(write.Path, "*") || write.Operation == "opaque-mutation" {
				confidence = "broad"
			}
			fact.directWrites = append(fact.directWrites, StateEffect{
				pathSegments: append([]string{}, write.Path...),
				Path:         strings.Join(write.Path, "."),
				Kind:         "write",
				Confidence:   confidence,
				Operation:    stateEffectOperation(write.Operation),
				ArrayRoots:   write.ArrayRoots,
			})
		}
	}

	precisionRequested := sourceValueRefinementRequired(fact, owner.values)
	var frame *sourceValueInputs
	if precisionRequested {
		fact.normalInputs = &sourceValueInputs{declaration: fact.node, bindings: make(sourceValueBindings)}
		fact.normalInputs.population = owner.values.normalPopulation(fact.node)
		frame = fact.normalInputs
		if fact.initializerDeclaration != nil {
			frame.initializerCursor = &moduleInitializerCursor{frame: frame, owner: owner.values, plan: fact.initializerPlan, declaration: fact.initializerDeclaration}
		}
		frame.ownedFact = fact
		beginNormalOperations(frame)
		fact.normalInputs.properties = &sourcePropertyReferenceView{frame: fact.normalInputs, state: sourcePropertyUnpublished}
		defer func() {
			for _, slot := range frame.operations {
				if r := slot.ownedRequest; r != nil {
					r.released = true
					r.caller = nil
				}
			}
			drainOwnedGetFact(fact, false, nodeTargets, sourceFile, typeChecker)
			releaseNormalOperations(frame)
			disposePropertyReferences(frame)
			frame.initializerCursor = nil
			fact.normalInputs = nil
		}()
		selection := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool), inputs: fact.normalInputs}
		selected := accessorCandidates{}
		selection.installPriorPropertyFacts(facts, &selected)
		selection.prepareNormalStatementSelection(&selected)
		appendOpaqueAccessorEffect(fact, selected)
	}
	var moduleFlow *sourceValueQuery
	if runtimeModuleEvaluation(fact.node) {
		moduleFlow = &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, dependenciesOnly: true, active: make(map[*ast.Node]bool)}
	}
	consumeNode := func(node *ast.Node) bool {
		if moduleFlow != nil {
			if possible, _ := moduleFlow.reachable(node, nil); !possible {
				return false
			}
		}
		if sourceClassHasDecoratorApplication(node) {
			flow := moduleFlow
			if flow == nil {
				flow = &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, dependenciesOnly: true, active: make(map[*ast.Node]bool)}
			}
			if possible, _ := flow.reachable(node, nil); possible {
				effect := sourceDecoratorApplicationEffect(node, fact.node, fact.summary.Name)
				fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
			}
		}
		if ast.IsVariableDeclarationList(node) && node.Flags&ast.NodeFlagsUsing != 0 {
			flow := moduleFlow
			if flow == nil {
				flow = &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, dependenciesOnly: true, active: make(map[*ast.Node]bool)}
			}
			if possible, _ := flow.reachable(node, nil); possible && flow.sourceDisposalMayBeAcquired(node) {
				fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, sourceDisposalEffect(node, fact.node, fact.summary.Name))
			}
		}
		if node.Parent != nil && ast.IsPartOfTypeNode(node) {
			return false
		}
		if initializer := sourceParameterDefault(node, fact.node); initializer != nil && enclosingCallableNode(initializer) == fact.node {
			first := len(fact.summary.DirectEffectSources)
			defer func() {
				for i := first; i < len(fact.summary.DirectEffectSources); i++ {
					fact.summary.DirectEffectSources[i] = sourceDefaultPhaseEffect(fact.summary.DirectEffectSources[i], node, fact.node)
				}
			}()
		}
		appendDirectReferenceEffects(fact, node, sourceFile, typeChecker)
		appendAccessorEffects(fact, node, nodeTargets, sourceFile, typeChecker, owner)
		if demand, dependent := describeNormalOperand(node); !dependent || !demand.pattern {
			appendImplicitAccessorEffects(fact, node, nodeTargets, sourceFile, typeChecker, nil, owner)
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		var targetSymbol *ast.Symbol
		targetIndex, resolved := 0, false
		resolveTarget := func() {
			if effect, ok := contextEffect(call, sourceFile, typeChecker); ok {
				fact.directContext = append(fact.directContext, effect)
			} else if effect, ok := contextBindingCallEffect(
				call.Expression,
				contextBindings,
				typeChecker,
			); ok {
				fact.directContext = append(fact.directContext, effect)
			}
			targetSymbol = resolvedCallableSymbol(
				callTargetSymbol(call.Expression, typeChecker),
				typeChecker,
			)
			targetIndex, resolved = syntacticTargets[strings.TrimSpace(
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
			// An immediate callable has no declaration symbol. Its own AST identity
			// still establishes a precise edge, including context and state effects.
			if immediate, exists := nodeTargets[unwrapRenderExpression(call.Expression)]; exists {
				targetIndex, resolved = immediate, true
			}
		}
		registerEdge := func(invocation accessorCandidates) {
			invocationOwned := invocation.invocationOwned
			if invocation.replacedInvocation {
				targetSymbol = nil
				resolved = false
			}
			edge := CallEdge{
				ID:       fmt.Sprintf("%s:call:%d", fact.summary.ID, node.Pos()),
				Name:     strings.TrimSpace(sourceText(sourceFile, call.Expression)),
				Resolved: resolved,
			}
			fact.callExpressions[edge.ID] = call.Expression
			if fact.fieldEdgeOperations == nil {
				fact.fieldEdgeOperations = make(map[string]*ast.Node)
			}
			fact.fieldEdgeOperations[edge.ID] = node
			fact.ownedScalarCalls[edge.ID] = selectedHelperSymbol(call.Expression, typeChecker) != nil
			fact.contextReferences[edge.ID] = stableSourceCallableReference(enhancementCallableReference(call.Expression), typeChecker)
			if reference, exists := externalImportForExpression(
				call.Expression,
				importBindings,
				typeChecker,
			); exists && !invocation.replacedInvocation {
				edge.ModuleSpecifier = reference.moduleSpecifier
				edge.ExportName = reference.exportName
			}
			if targetSymbol != nil {
				fact.callSymbols[edge.ID] = ast.GetSymbolId(targetSymbol)
			}
			edge.ReceiverBindings = receiverBindingsForCall(call, fact.node, typeChecker)
			_, hostOwned := owner.body(call.Expression)
			if resolved {
				edge.TargetID = facts[targetIndex].summary.ID
				fact.targets = append(fact.targets, targetIndex)
			} else if environment := unresolvedCallEnvironment(
				call.Expression,
				sourceFile,
				typeChecker,
				contextBindings,
			); !(invocationOwned && environment == "unknown") && !hostOwned && environment != "" && !(environment == "browser" && guardedBrowserCallReference(call.Expression, fact.node, sourceFile, typeChecker)) {
				description := edge.Name
				if environment == "unknown" {
					description = "unresolved call " + edge.Name
				}
				source := environmentSource(environment, description, fact.summary.Name)
				if environment == "unknown" {
					source.callOrigin = &sourceCallOutcome{declaration: fact.node, operation: node}
				}
				source.Opaque = environment == "unknown" &&
					opaqueCallExpression(call.Expression, typeChecker)
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					source,
				)
			}
			fact.summary.Calls = append(fact.summary.Calls, edge)
		}
		var definition *sourceDefinitionMAYCall
		if ast.IsIdentifier(call.Expression) {
			symbol := typeChecker.GetSymbolAtLocation(call.Expression)
			if symbol != nil {
				if index, exists := symbolTargets[ast.GetSymbolId(symbol)]; exists && index >= 0 && index < len(facts) {
					var parent *callableFacts
					if parentIndex, known := nodeTargets[enclosingCallableNode(fact.node)]; known && parentIndex >= 0 && parentIndex < len(facts) {
						parent = &facts[parentIndex]
					}
					definition = prepareDefinitionMAYCall(fact, &facts[index], node, symbol, typeChecker, owner, parent)
				}
			}
		}
		if definition != nil {
			// Install the canonical pending graph edge before suppressing recursive
			// occurrence consumption. The fixed-point solver still owns its effects.
			resolveTarget()
			registerEdge(accessorCandidates{})
			definition.edge = len(fact.summary.Calls) - 1
		}
		invocation := accessorCandidates{}
		invocation = appendArgumentAccessorEffects(fact, node, nodeTargets, sourceFile, typeChecker, owner, definition)
		fact.nativeCalls = append(fact.nativeCalls, invocation.nativeCalls...)
		fact.normalCalls = append(fact.normalCalls, invocation.normalCalls...)
		if definition == nil {
			resolveTarget()
			registerEdge(invocation)
		}

		if (eagerCallbackCall(call.Expression, typeChecker) || reactiveComputationOperation(call.Expression, typeChecker) || reactivePeekOperation(call.Expression, sourceFile, typeChecker) || isTaskContextCapabilityCall(node, typeChecker, "peek")) && call.Arguments != nil {
			for argumentIndex, argument := range call.Arguments.Nodes {
				if !invokedCallbackArgument(node, argumentIndex, typeChecker) {
					continue
				}
				appendInvokedCallbackEffects(fact, facts, node, argument, argumentIndex, sourceFile, typeChecker, nodeTargets, symbolTargets, importBindings)
			}
		}
		return true
	}
	consumeOperand := func(demand sourceNormalOperand) {
		values := newSourceValueOwner(typeChecker)
		if owner != nil && owner.values != nil {
			values = owner.values
		}
		query := sourceValueQuery{owner: values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool), reading: demand.node, inputs: fact.normalInputs}
		query.operation = &sourceOperationContext{node: demand.node, owner: fact.node, inputs: fact.normalInputs}
		result := accessorCandidates{nativeCalls: fact.nativeCalls, normalCalls: fact.normalCalls}
		bindings := fact.normalInputs.bindings
		query.consumeNormalOperand(demand, fact.node, bindings, &result, fact.normalInputs)
		if demand.get {
			result = refineSourceDependencies(result, func() accessorCandidates {
				return sourceMemberDependencies(demand.node, typeChecker, owner, fact.node, bindings)
			})
		}
		if demand.pattern || demand.await || demand.get || demand.cellOnly {
			appendOpaqueAccessorEffect(fact, result)
			appendSourceValueWrites(fact, result, typeChecker)
			appendAccessorTargets(fact, demand.node, result, nodeTargets, sourceFile)
		}
	}
	consumePhase := func(phase sourceNormalPhase) {
		query := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool), inputs: fact.normalInputs, reading: phase.node}
		query.operation = &sourceOperationContext{node: phase.node, owner: fact.node, inputs: fact.normalInputs}
		result := accessorCandidates{}
		query.returnObservation = &sourceReturnObservation{owner: fact.node, reader: phase.node, frame: fact.normalInputs, receipts: fact.nativeCalls, normalCalls: fact.normalCalls}
		query.consumeNormalPhase(phase, fact.normalInputs.bindings, &result)
		if ast.IsCallExpression(phase.node) {
			result = refineSourceDependencies(result, func() accessorCandidates {
				return sourceInvocationDependencies(phase.node, typeChecker, owner, fact.node)
			})
		} else if ast.IsPropertyAccessExpression(phase.node) || ast.IsElementAccessExpression(phase.node) {
			result = refineSourceDependencies(result, func() accessorCandidates {
				return sourceMemberDependencies(phase.node, typeChecker, owner, fact.node, fact.normalInputs.bindings)
			})
		}

		if !supportedBindingDeclaration(phase.node) {
			appendOwnedGetFact(fact, phase.node, result, nodeTargets, sourceFile, typeChecker)
		} else if phase.role == sourceNormalSelect && result.opaque && result.valueIncomplete {
			// Refused normal binding selection retains ordinary opacity without
			// interpreting the declaration as a Call or Get.
			appendOpaqueAccessorEffect(fact, result)
		}
		fact.nativeCalls = append(fact.nativeCalls, result.nativeCalls...)
		fact.normalCalls = append(fact.normalCalls, result.normalCalls...)
	}
	consumeFold := func(fold sourceNormalFold) {
		query := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: fact.node, remaining: 4096, active: make(map[*ast.Node]bool), inputs: fact.normalInputs, reading: fold.node, operation: &sourceOperationContext{node: fold.node, owner: fact.node, inputs: fact.normalInputs}}
		result := accessorCandidates{}
		query.consumeNormalFold(fold, &result)
		if ast.IsCallExpression(fold.node) {
			result = refineSourceDependencies(result, func() accessorCandidates {
				return sourceInvocationDependencies(fold.node, typeChecker, owner, fact.node)
			})
		}
		appendOpaqueAccessorEffect(fact, result)
	}
	if precisionRequested {
		for _, event := range owner.values.summary(fact.node).normal {
			if frame.initializerCursor != nil {
				switch frame.initializerCursor.disposition(event) {
				case initializerAtomicDependency, initializerStructuralUnwind, initializerSkip:
					continue
				}
			}
			switch {
			case event.fold != nil:
				consumeFold(*event.fold)
			case event.phase != nil:
				consumePhase(*event.phase)
			case event.operand != nil:
				consumeOperand(*event.operand)
			default:
				consumeNode(event.node)
			}
		}
		if frame.initializerCursor != nil {
			frame.initializerCursor.finish(fact, frame)
		}
	} else {
		// Ordinary effect demands use the recursive source walk. Exact output
		// schedules are invoked only by their named refinement consumers.
		walkCallableNormal(fact.node, consumeNode, nil)
	}
	appendReturnSettlementEffects(fact, nodeTargets, sourceFile, typeChecker, owner)
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
			pathSegments: append([]string{}, binding.write.Path...),
			Path:         strings.Join(binding.write.Path, "."), Kind: "write",
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
			callExpressions:   make(map[string]*ast.Node),
			contextReferences: make(map[string]*ast.Node),
		})
	}
	return facts
}

func eagerCallbackCall(expression *ast.Node, typeChecker *checker.Checker) bool {
	_, name := restrictedInvocationMember(unwrapSourceCallableReference(expression), typeChecker)
	switch name {
	case "map", "flatMap", "filter", "forEach", "some", "every",
		"find", "findIndex", "reduce", "reduceRight", "sort",
		"then", "catch", "finally":
		return true
	case "from":
		return standardFactoryMapperSymbol(nativeReceiverMemberSymbol(expression, typeChecker))
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
	parameters := parameterStateSymbols(callable, typeChecker)
	if len(parameters) == 0 {
		return nil, nil
	}
	reads := []StateEffect{}
	writes := []StateEffect{}
	walkCallable(callable, func(node *ast.Node) bool {
		// Native pattern members are puts even without a default operation node.
		// Receiver/key and default RHS children retain their ordinary traversal.
		if (ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) && nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
			if effect, exists := parameterStateEffect(node, "write", parameters, typeChecker); exists {
				writes = append(writes, effect)
			}
			return true
		}
		if ast.IsBinaryExpression(node) && nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
			return true
		}
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

// parameterStateSymbols shares checker-bound parameter ownership with scalar body emission.
func parameterStateSymbols(callable *ast.Node, typeChecker *checker.Checker) map[ast.SymbolId]int {
	parameters := make(map[ast.SymbolId]int)
	if !isCallableNode(callable) {
		return parameters
	}
	for index, parameter := range callable.Parameters() {
		name := parameter.Name()
		if name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			parameters[ast.GetSymbolId(symbol)] = index
		}
	}
	return parameters
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
	if kind == "read" {
		node = optionalStateReadReceiver(node)
	}
	segments := []string{}
	current := node
	for {
		current = unwrapRenderExpression(current)
		if reference := stateReferenceExpression(current); reference != current {
			current = reference
			continue
		}
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
	root := "value"
	if len(segments) != 0 && segments[0] == "state" {
		root = ""
		segments = segments[1:]
	}
	confidence := "exact"
	if len(segments) == 0 && root == "" {
		segments = []string{"*"}
		confidence = "broad"
	} else if containsString(segments, "*") {
		confidence = "unknown"
	}
	return StateEffect{
		pathSegments: append([]string{}, segments...),
		Path:         strings.Join(segments, "."),
		Kind:         kind,
		Confidence:   confidence,
		Receiver:     &StateReceiver{Kind: "parameter", Index: parameterIndex, Root: root},
		ArrayRoots:   arrayRootProofs(node, segments, typeChecker),
	}, true
}

func receiverBindingsForCall(
	call *ast.CallExpression,
	caller *ast.Node,
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
	if call.Arguments == nil {
		return nil
	}
	result := make([]ReceiverBinding, 0, len(call.Arguments.Nodes))
	for index := range call.Arguments.Nodes {
		binding := ReceiverBinding{ParameterIndex: index, Source: "unknown"}
		argument, path := immutableEffectArgumentRoot(call.Arguments.Nodes[index], typeChecker, map[ast.SymbolId]bool{})
		source := "unknown"
		sourceIndex := 0
		if argument.Kind == ast.KindThisKeyword {
			source = "component"
		} else if ast.IsIdentifier(argument) {
			if symbol := typeChecker.GetSymbolAtLocation(argument); symbol != nil {
				if parameterIndex, exists := callerParameters[ast.GetSymbolId(symbol)]; exists {
					source = "parameter"
					sourceIndex = parameterIndex
				}
			}
		}
		// Contextual typing of fresh object literals can instantiate a large generic call.
		// It cannot improve an unknown receiver with no access path, so establish ownership
		// first. Keep checking owned arguments to exclude primitive values from write authority,
		// and preserve existing path metadata for unknown member-access arguments.
		if (source != "unknown" || len(path) != 0) && stateArgumentMayOwnMutations(typeChecker.GetTypeAtLocation(call.Arguments.Nodes[index])) {
			binding.Source = source
			binding.SourceParameterIndex = sourceIndex
			binding.Path = path
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
	walkCallableNormal(root, visit, nil)
}

// walkCallableNormal shares the existing lexical walker with narrow dependent
// operand consumers. The callback carries no completion or activation authority.
func walkCallableNormal(root *ast.Node, visit func(*ast.Node) bool, operand func(sourceNormalOperand), phases ...func(sourceNormalPhase)) {
	var phase func(sourceNormalPhase)
	if len(phases) == 1 {
		phase = phases[0]
	}
	walkCallableNormalWithFolds(root, visit, operand, phase, nil)
}

// walkCallableNormalWithFolds supplies immutable syntax folds alongside the
// existing normal effect callbacks. Deferred edges do not supply body events.
func walkCallableNormalWithFolds(root *ast.Node, visit func(*ast.Node) bool, operand func(sourceNormalOperand), phase func(sourceNormalPhase), fold func(sourceNormalFold), structural ...func(*ast.Node) bool) {
	var walk func(*ast.Node)
	walk = func(node *ast.Node) {
		isStructural := sourceNormalStructural
		if len(structural) == 1 {
			isStructural = structural[0]
		}
		var children []*ast.Node
		var erasedChildren []bool
		descend := func(child *ast.Node) {
			if fold != nil {
				children = append(children, child)
				erasedChildren = append(erasedChildren, isStructural(child))
			}
			walk(child)
		}
		creation := node != root && isCallableNode(node)
		emit := fold != nil && !isStructural(node)
		if emit {
			fold(sourceNormalFold{node: node, kind: sourceNormalEnter})
		}
		defer func() {
			if emit {
				fold(sourceNormalFold{node: node, children: children, erasedChildren: erasedChildren, creation: creation, kind: normalFoldKind(node, creation)})
			}
		}()

		if node != root && isCallableNode(node) {
			for _, decorator := range sourceDefinitionDecorators(node) {
				descend(decorator)
			}
			// Computed names execute while the owner is constructed. Callable bodies do not.
			if name := node.Name(); name != nil && ast.IsComputedPropertyName(name) {
				descend(name.AsComputedPropertyName().Expression)
			}
			return
		}
		if ast.IsDecorator(node) && ast.IsFunctionLike(root) {
			for _, decorator := range sourceDefinitionDecorators(root) {
				if decorator == node {
					return
				}
			}
		}
		if node == root.Name() && ast.IsComputedPropertyName(node) {
			return
		}

		if phase != nil && supportedBindingDeclaration(node) {
			phase(sourceNormalPhase{node: node, role: sourceNormalAdmit})
			descend(node.Initializer())
			phase(sourceNormalPhase{node: node})
			return
		}
		if phase != nil && ast.IsNewExpression(node) {
			phase(sourceNormalPhase{node: node, role: sourceNormalAdmit})
			descend(node.Expression())
			phase(sourceNormalPhase{node: node})
			if arguments := node.AsNewExpression().Arguments; arguments != nil {
				for ordinal, argument := range arguments.Nodes {
					descend(argument)
					phase(sourceNormalPhase{node: node, argument: argument, role: sourceNormalArgumentEnd, ordinal: ordinal})
				}
			}
			visit(node)
			return
		}
		if phase != nil && ast.IsCallExpression(node) {
			call := node.AsCallExpression()
			phase(sourceNormalPhase{node: node, role: sourceNormalAdmit})
			descend(call.Expression)
			phase(sourceNormalPhase{node: node})
			if call.Arguments != nil {
				for ordinal, argument := range call.Arguments.Nodes {
					phase(sourceNormalPhase{node: node, argument: argument, role: sourceNormalArgumentBegin, ordinal: ordinal})
					func() {
						completed := false
						defer func() {
							if !completed {
								phase(sourceNormalPhase{node: node, argument: argument, role: sourceNormalArgumentAbort, ordinal: ordinal})
							}
						}()
						descend(argument)
						phase(sourceNormalPhase{node: node, argument: argument, role: sourceNormalArgumentEnd, ordinal: ordinal})
						completed = true
					}()
				}
			}
			visit(node)
			return
		}
		// Ordinary Gets and lexical writes consume their dependencies first.
		if phase != nil && (ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) || ast.IsAssignmentExpression(node, false)) {
			demand, dependent := describeNormalOperand(node)
			node.ForEachChild(func(child *ast.Node) bool { descend(child); return false })
			visit(node)
			if operand != nil && dependent {
				operand(demand)
			}
			return
		}
		if operand != nil && normalCalleeResultOperand(node) != nil {
			callee := node.AsCallExpression().Expression
			descend(callee)
			if !visit(node) {
				return
			}
			node.ForEachChild(func(child *ast.Node) bool {
				if child != callee {
					descend(child)
				}
				return false
			})
			return
		}
		if !visit(node) {
			return
		}
		demand, dependent := describeNormalOperand(node)
		if operand != nil && dependent && demand.pattern {
			descend(demand.value)
			operand(demand)
			descend(node.AsBinaryExpression().Left)
			return
		}
		node.ForEachChild(func(child *ast.Node) bool {
			if sourceMemberOperationOwnsChild(node, child) && node != root {
				return false
			}
			descend(child)
			return false
		})
		if operand != nil && dependent {
			operand(demand)
		}
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

// immutableEffectArgumentRoot follows const aliases when carrying receiver ownership into a
// helper summary. Symbol identity retains lexical shadowing and cycle detection bounds aliases.
func immutableEffectArgumentRoot(node *ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (*ast.Node, []string) {
	root, path := effectArgumentRoot(node)
	if !ast.IsIdentifier(root) {
		return root, path
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return root, path
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) || declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		value := declaration.AsVariableDeclaration().Initializer
		if value == nil {
			continue
		}
		owner, prefix := immutableEffectArgumentRoot(value, typeChecker, seen)
		return owner, append(prefix, path...)
	}
	return root, path
}

// guardedBrowserCallReference carries a global availability proof to its member call.
// Browser parameters and unrelated argument effects retain their independent placement.
func guardedBrowserCallReference(expression, callable *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	current := unwrapSourceCallableReference(expression)
	for current != nil {
		if ast.IsPropertyAccessExpression(current) {
			current = unwrapSourceCallableReference(current.AsPropertyAccessExpression().Expression)
			continue
		}
		if ast.IsElementAccessExpression(current) {
			current = unwrapSourceCallableReference(current.AsElementAccessExpression().Expression)
			continue
		}
		if !ast.IsIdentifier(current) {
			return false
		}
		name := current.Text()
		_, browser := browserGlobals[name]
		return browser && symbolIsOutsideSource(typeChecker.GetSymbolAtLocation(current), source) && browserGlobalReferenceIsGuarded(current, name, callable)
	}
	return false
}
