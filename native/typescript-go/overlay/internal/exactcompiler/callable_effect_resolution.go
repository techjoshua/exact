package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func contextEffect(
	call *ast.CallExpression,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (ContextEffect, bool) {
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return ContextEffect{}, false
	}
	member := call.Expression.AsPropertyAccessExpression()
	if member.Expression == nil || !componentContextReceiver(member.Expression, typeChecker) ||
		member.Name() == nil ||
		(member.Name().Text() != "getContext" && member.Name().Text() != "hasContext" &&
			member.Name().Text() != "setContext") {
		return ContextEffect{}, false
	}
	token := "unknown"
	confidence := "unknown"
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		candidate := strings.TrimSpace(sourceText(sourceFile, call.Arguments.Nodes[0]))
		if exactContextToken.MatchString(candidate) {
			token = candidate
			confidence = "exact"
		}
	}
	kind := "read"
	switch member.Name().Text() {
	case "hasContext":
		kind = "probe"
	case "setContext":
		kind = "write"
	}
	return ContextEffect{Token: token, Kind: kind, Confidence: confidence}, true
}

func componentContextReceiver(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (result bool) {
	if expression.Kind == ast.KindThisKeyword {
		return true
	}
	if typeChecker == nil {
		return false
	}
	defer func() {
		if recover() != nil {
			result = false
		}
	}()
	receiverType := typeChecker.GetTypeAtLocation(expression)
	if receiverType == nil {
		return false
	}
	if typeChecker.GetPropertyOfType(receiverType, "state") != nil {
		return true
	}
	display := strings.TrimSpace(typeChecker.TypeToString(receiverType))
	return display == "Component" || strings.HasPrefix(display, "Component<")
}

// collectContextBindings keys context authority by checker identity so a shadowed
// variable cannot inherit another binding's execution contract.
func collectContextBindings(sourceFile *ast.SourceFile, typeChecker *checker.Checker) map[ast.SymbolId]ContextEffect {
	result := make(map[ast.SymbolId]ContextEffect)
	writes := policyAliasWrites(sourceFile, typeChecker)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(declaration.Name())
		if effect, ok := contextBindingInitializerEffect(declaration.Initializer, sourceFile, typeChecker); ok && symbol != nil && len(writes[ast.GetSymbolId(symbol)]) == 0 {
			result[ast.GetSymbolId(symbol)] = effect
		}
		return true
	})
	return result
}

// contextBindingReferenceEffect preserves lookup authority through nullable
// selection without granting authority to an unrelated conditional alternative.
func contextBindingReferenceEffect(symbol *ast.Symbol, source *ast.SourceFile, typeChecker *checker.Checker) (ContextEffect, bool) {
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return ContextEffect{}, false
	}
	return contextBindingInitializerEffect(symbol.ValueDeclaration.AsVariableDeclaration().Initializer, source, typeChecker)
}

func contextBindingInitializerEffect(node *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) (ContextEffect, bool) {
	if node == nil {
		return ContextEffect{}, false
	}
	node = unwrapSourceCallableReference(node)
	if ast.IsCallExpression(node) {
		effect, ok := contextEffect(node.AsCallExpression(), source, typeChecker)
		return effect, ok && effect.Kind == "read"
	}
	if ast.IsConditionalExpression(node) {
		conditional := node.AsConditionalExpression()
		if absentContextAlternative(conditional.WhenFalse, typeChecker) {
			return contextBindingInitializerEffect(conditional.WhenTrue, source, typeChecker)
		}
		if absentContextAlternative(conditional.WhenTrue, typeChecker) {
			return contextBindingInitializerEffect(conditional.WhenFalse, source, typeChecker)
		}
	}
	return ContextEffect{}, false
}

func absentContextAlternative(node *ast.Node, typeChecker *checker.Checker) bool {
	node = unwrapSourceCallableReference(node)
	if node.Kind == ast.KindNullKeyword {
		return true
	}
	return ast.IsIdentifier(node) && node.Text() == "undefined" && typeChecker.GetTypeAtLocation(node).Flags()&checker.TypeFlagsUndefined != 0
}

func contextBindingCallEffect(expression *ast.Node, bindings map[ast.SymbolId]ContextEffect, typeChecker *checker.Checker) (ContextEffect, bool) {
	receiver := expression
	for receiver != nil {
		receiver = unwrapSourceCallableReference(receiver)
		if ast.IsPropertyAccessExpression(receiver) {
			receiver = receiver.AsPropertyAccessExpression().Expression
			continue
		}
		if ast.IsElementAccessExpression(receiver) {
			receiver = receiver.AsElementAccessExpression().Expression
			continue
		}
		break
	}
	if receiver == nil || !ast.IsIdentifier(receiver) {
		return ContextEffect{}, false
	}
	symbol := typeChecker.GetSymbolAtLocation(receiver)
	if symbol == nil {
		return ContextEffect{}, false
	}
	effect, exists := bindings[ast.GetSymbolId(symbol)]
	return effect, exists
}

func callTargetSymbol(
	expression *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	expression = unwrapSourceCallableReference(expression)
	// Lowered readers can contain detached authored expressions. TS-Go's symbol
	// query requires a bound parent chain, so such values remain conservative calls.
	if expression == nil || expression.Parent == nil {
		return nil
	}
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return callTargetSymbol(member.Expression, typeChecker)
		}
		// Resolving an arbitrary property-call name forces contextual checking of
		// its receiver. TS-Go can currently panic there for otherwise valid
		// generic callbacks. Opaque instance methods remain conservative edges.
		return namespaceCallableSymbol(member.Expression, member.Name().Text(), typeChecker)
	}
	if ast.IsElementAccessExpression(expression) {
		member := expression.AsElementAccessExpression()
		if member.ArgumentExpression != nil && ast.IsStringLiteral(member.ArgumentExpression) {
			return namespaceCallableSymbol(member.Expression, member.ArgumentExpression.Text(), typeChecker)
		}
		return nil
	}
	if ast.IsIdentifier(expression) {
		reference := stableSourceCallableReference(expression, typeChecker)
		if reference == nil {
			return nil
		}
		if reference != expression {
			return callTargetSymbol(reference, typeChecker)
		}
		return typeChecker.GetResolvedSymbol(expression)
	}
	return typeChecker.GetSymbolAtLocation(expression)
}

// Static module exports can be resolved without contextually checking arbitrary receiver methods.
// A local object with the same spelling never supplies a published callable's contract.
func namespaceCallableSymbol(receiver *ast.Node, name string, typeChecker *checker.Checker) *ast.Symbol {
	if receiver == nil || !ast.IsIdentifier(receiver) || ast.NodeIsSynthesized(receiver) || receiver.Parent == nil {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(receiver)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsNamespaceImport(declaration) {
			module := typeChecker.GetAliasedSymbol(symbol)
			if module == nil {
				return nil
			}
			for _, exported := range typeChecker.GetExportsOfModule(module) {
				if ast.SymbolName(exported) == name {
					return exported
				}
			}
		}
	}
	return nil
}

func resolvedCallableSymbol(
	symbol *ast.Symbol,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = typeChecker.GetAliasedSymbol(symbol)
	}
	// Local references to exported declarations use a local symbol, while declaration
	// indexing uses the export symbol. Compare their canonical exported identity.
	if symbol != nil {
		return typeChecker.GetExportSymbolOfSymbol(symbol)
	}
	return symbol
}

func unresolvedCallEnvironment(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	contextBindings map[ast.SymbolId]ContextEffect,
) string {
	text := normalizationNodeText(sourceFile, expression)
	operation := componentProtocolCallMember(expression, typeChecker)
	if name, member, dynamic := checkedComponentProtocolMember(operation, typeChecker); member && !dynamic {
		// Computed spelling retains the same operation contract. Effects of the key expression
		// are visited separately and must not be erased by this classification.
		if exactComponentOperation("this."+name) && componentProtocolReceiverOwned(expression, typeChecker) {
			return ""
		}
	}
	if exactComponentOperation(text) && (!strings.HasPrefix(text, "this.") || componentProtocolReceiverOwned(expression, typeChecker)) ||
		componentContextOperation(expression, typeChecker) {
		return ""
	}
	if standardLibraryCallRoot(expression, typeChecker) {
		return ""
	}
	if _, contextBinding := contextBindingCallEffect(expression, contextBindings, typeChecker); contextBinding {
		return ""
	}
	if environment := receiverTypeEnvironment(expression, typeChecker); environment == "neutral" {
		return ""
	} else if environment != "" {
		return environment
	}
	symbol := callTargetSymbol(expression, typeChecker)
	if serverOnlyImportSymbol(symbol) {
		return "server"
	}
	if environment, classified := declarationCallEnvironment(
		resolvedCallableSymbol(symbol, typeChecker),
	); classified {
		return environment
	}
	root := text
	if separator := strings.IndexAny(root, ".("); separator >= 0 {
		root = root[:separator]
	}
	if _, server := serverGlobals[root]; server &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "server"
	}
	if _, browser := browserGlobals[root]; browser &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "browser"
	}
	return "unknown"
}

func componentContextOperation(
	expression *ast.Node,
	typeChecker *checker.Checker,
) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	member := expression.AsPropertyAccessExpression()
	if member.Name() == nil {
		return false
	}
	switch member.Name().Text() {
	case "getContext", "hasContext", "setContext":
		return componentContextReceiver(member.Expression, typeChecker)
	default:
		return false
	}
}

func declarationCallEnvironment(
	symbol *ast.Symbol,
) (string, bool) {
	if symbol == nil {
		return "", false
	}
	annotations := exactAnnotations{}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		annotations = mergeAnnotations(annotations, callableNodeAnnotations(declaration, sourceFile))
		if environment, classified := declarationSourceEnvironment(sourceFile, symbol.Name); classified {
			return environment, true
		}
	}
	// An unresolved published callable may expose its contract only in a declaration file.
	// Concrete platform dependencies above still win, and placement tags cannot be erased by pure.
	if annotations.client && annotations.server {
		return "unknown", true
	}
	if annotations.server {
		return "server", true
	}
	if annotations.client {
		return "browser", true
	}
	if annotations.pure {
		return "", true
	}
	return "", false
}

// declarationSourceEnvironment owns the existing module declaration contract independently
// of source receiver completeness. It grants effects only, not a callable implementation.
func declarationSourceEnvironment(sourceFile *ast.SourceFile, name string) (string, bool) {
	if sourceFile == nil {
		return "", false
	}
	filename := strings.ToLower(strings.ReplaceAll(sourceFile.FileName(), `\`, "/"))
	switch {
	case strings.Contains(filename, "/@types/node/"):
		return "server", true
	case strings.Contains(filename, "/packages/hydrate/") ||
		strings.Contains(filename, "/@exactjs/hydrate/"):
		return "browser", true
	case strings.Contains(filename, "/packages/dom/") ||
		strings.Contains(filename, "/@exactjs/dom/"):
		// Resolved declarations own platform effects even when the import is renamed.
		switch name {
		case "render", "renderComponentRoot", "renderCompiledComponentInputRoot", "unmount", "dispose", "adoptStatic",
			"adoptComponentRoot", "adoptMarkerlessComponentRoot",
			"findComponentDomNode", "disposeOwnedSubtree":
			return "browser", true
		default:
			return "", true
		}
	case strings.Contains(filename, "/packages/core/") ||
		strings.Contains(filename, "/@exactjs/core/") ||
		strings.Contains(filename, "/packages/reactive/") ||
		strings.Contains(filename, "/@exactjs/reactive/") ||
		strings.Contains(filename, "/packages/request/") ||
		strings.Contains(filename, "/@exactjs/request/"):
		return "", true
	}
	return "", false
}

// portableDeclaredMethod requires every actual selected declaration to be a method
// of a recognized portable package. Structural names and property/getter signatures
// do not supply this existing package contract.
func portableDeclaredMethod(symbol *ast.Symbol) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if declaration.Kind != ast.KindMethodSignature || source == nil || !source.IsDeclarationFile {
			return false
		}
		if environment, classified := declarationSourceEnvironment(source, symbol.Name); !classified || environment != "" {
			return false
		}
	}
	return true
}

func opaqueCallExpression(expression *ast.Node, typeChecker *checker.Checker) bool {
	root := expression
	for ast.IsPropertyAccessExpression(root) {
		root = root.AsPropertyAccessExpression().Expression
	}
	if !ast.IsIdentifier(root) {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return true
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsParameterDeclaration(declaration) {
			return true
		}
	}
	return false
}

func exactComponentOperation(text string) bool {
	if strings.HasPrefix(text, "TaskContext.") {
		return true
	}
	if !strings.HasPrefix(text, "this.") {
		return false
	}
	member := strings.TrimPrefix(text, "this.")
	switch member {
	case "hasContext", "map", "getContext", "setContext", "prop", "ref", "readRef", "reactive", "own",
		"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender":
		return true
	}
	return strings.HasPrefix(member, "log.") ||
		strings.HasPrefix(member, "refs.")
}

func receiverTypeEnvironment(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (environment string) {
	var receiver *ast.Node
	switch {
	case ast.IsPropertyAccessExpression(expression):
		receiver = expression.AsPropertyAccessExpression().Expression
	case ast.IsElementAccessExpression(expression):
		receiver = expression.AsElementAccessExpression().Expression
	default:
		return ""
	}
	defer func() {
		if recover() != nil {
			environment = ""
		}
	}()
	value := typeChecker.GetTypeAtLocation(receiver)
	if value == nil {
		return ""
	}
	value = typeChecker.GetNonNullableType(value)
	if owner := nativeReceiverMemberEnvironment(expression, typeChecker); owner != "" {
		return owner
	}
	// Interface aliases retain portable framework declaration authority. Platform
	// declarations still follow receiver ownership, including Node's DOM augmentations.
	if environment, classified := declarationCallEnvironment(nativeReceiverMemberSymbol(expression, typeChecker)); classified && environment == "" {
		return "neutral"
	}
	if exactIntlReceiver(value) {
		return "neutral"
	}
	// A familiar receiver spelling cannot authorize an application-added method.
	if !nativeReceiverMemberDeclarations(expression, typeChecker) {
		return ""
	}
	if nativeNeutralReceiver(value) || nativePortableEventReceiver(value) {
		return "neutral"
	}
	display := typeChecker.TypeToString(value)
	if neutralReceiverType.MatchString(display) {
		return "neutral"
	}
	if browserReceiverType.MatchString(display) {
		return "browser"
	}
	return ""
}

func resolveCallableEffects(facts []callableFacts, owners ...*executableBodyOwner) []sourceStagedPending {
	var mapOwner *executableBodyOwner
	if len(owners) == 1 {
		mapOwner = owners[0]
	}
	work := callableEffectWork{extracting: -1}
	return resolveCallableEffectsWithWork(facts, mapOwner, &work)
}

func resolveCallableEffectsWithWork(facts []callableFacts, mapOwner *executableBodyOwner, work *callableEffectWork) []sourceStagedPending {
	restoreWriterInputs := registerWriterInputFacts(mapOwner, facts, work)
	defer restoreWriterInputs()
	work.prepareTaskReferenceEffects(facts, mapOwner)
	drainDirectExposures(facts, mapOwner)
	drainDescriptorProjections(facts)
	consumeSourceWriterValues(facts, mapOwner)
	work.prepareOperationUses(facts, mapOwner)
	work.prepareSourceInputConsumers(facts, mapOwner)
	work.prepareRelativeInvocations(facts, mapOwner)
	work.prepareRelativeCoercions(facts)
	cycles := callableCycleGroups(facts)
	work.initializePropagation(facts)
	changed := true
	for changed {
		changed = false
		setSourcesChanged := false
		for index := range facts {
			work.refreshPendingMembers(facts, index)
			if !work.dirty[index] {
				continue
			}
			work.dirty[index] = false
			fact := &facts[index]
			factChanged := false
			blocked := fact.directOwnedScalarBlocked
			sources := append(
				[]EnvironmentEffectSource(nil),
				fact.summary.DirectEffectSources...,
			)
			unresolved := sources[:0]
			for _, source := range sources {
				if sourceObligationCoveredLocally(fact, source, work.installedMemberFieldOutcomeCurrent) {
					continue
				}
				unresolved = append(unresolved, source)
			}
			sources = unresolved
			reads := append([]StateEffect(nil), fact.directReads...)
			writes := append([]StateEffect(nil), fact.directWrites...)
			writes = append(writes, work.opaque[index]...)
			contexts := append([]ContextEffect(nil), fact.directContext...)
			for _, targetIndex := range fact.targets {
				// A progress call emits an observation. Its receiver's state and environment
				// effects execute independently on the browser and never enter the producer.
				if facts[targetIndex].progressReceiver {
					continue
				}
				target := facts[targetIndex].summary
				if len(target.StateWrites) != 0 {
					blocked = blocked || target.ownedScalarBlocked
					for _, edge := range fact.summary.Calls {
						if edge.TargetID == target.ID && !fact.ownedScalarCalls[edge.ID] {
							blocked = true
						}
					}
				}
				for _, edge := range fact.summary.Calls {
					if !edge.Resolved || edge.TargetID != target.ID {
						continue
					}
					if work.refreshSetSourceBodyRevision(facts, index, targetIndex, edge, mapOwner) {
						setSourcesChanged, changed = true, true
					}
					work.observeStagedSummary(facts, index, targetIndex, edge.ID)
					sources = appendCallableEdgeEffectSources(sources, fact, &facts[targetIndex], edge, mapOwner, work.installedMemberFieldOutcomeCurrent)
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
						cycles[index] == cycles[targetIndex],
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
						cycles[index] == cycles[targetIndex],
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}

			sources = uniqueEnvironmentSources(sources)
			if fact.summary.ReevaluationSafe {
				// A checked pure annotation resolves otherwise opaque calls but cannot erase a
				// concrete browser or server dependency discovered by semantic analysis.
				known := sources[:0]
				for _, source := range sources {
					if source.Environment != "unknown" || source.provenanceIncomplete {
						known = append(known, source)
					}
				}
				sources = known
			}
			reads = minimalStateEffects(reads)
			writes = uniqueStateEffects(writes)
			contexts = uniqueContextEffects(contexts)
			if signature := environmentSourcesSignature(sources); signature != work.signatures[index].environment {
				work.signatures[index].environment = signature
				fact.summary.EffectSources = sources
				factChanged = true
			}
			if signature := stateEffectSetSignature(reads); signature != work.signatures[index].reads {
				work.signatures[index].reads = signature
				fact.summary.StateReads = reads
				factChanged = true
			}
			if signature := stateEffectSetSignature(writes); signature != work.signatures[index].writes {
				work.signatures[index].writes = signature
				fact.summary.StateWrites = writes
				factChanged = true
			}
			if signature := contextEffectSetSignature(contexts); signature != work.signatures[index].contexts {
				work.signatures[index].contexts = signature
				fact.summary.Contexts = contexts
				factChanged = true
			}
			if fact.summary.ownedScalarBlocked != blocked {
				fact.summary.ownedScalarBlocked = blocked
				factChanged = true
			}
			if factChanged {
				work.stagedRevisions[index]++
				changed = work.notifyPendingMemberDonors(facts, index) || changed
				for _, caller := range work.callers[index] {
					work.dirty[caller] = true
					changed = changed || caller <= index
				}
			}
		}
		if setSourcesChanged {
			work.drainOperationExtractions(facts, mapOwner)
			work.prepareRelativeSetEffects(facts, mapOwner)
		}
		if resultsChanged := work.refreshStagedCallResults(facts, mapOwner); resultsChanged || work.inputDataChanged {
			// A delivery from any existing operation owner can satisfy a prior
			// DATA reading. Consume this notification before rerunning the same
			// relative phase, so deliveries made by that phase remain queued.
			work.inputDataChanged = false
			work.refreshSourceInputConsumerWaits(facts, mapOwner)
			work.prepareRelativeInvocations(facts, mapOwner)
			changed = true
		}
		changed = work.refreshStagedMemberActivations(facts, mapOwner) || changed
		// A later fact can deliver a new source relationship to an earlier
		// owner. Observe its revision before deciding this pass is quiescent.
		for index := range facts {
			if work.refreshPendingMembers(facts, index) {
				changed = true
			}
		}
		// Resumptions and member activation can register installed getter bodies
		// after initial preparation. Drain them before declaring quiescence.
		changed = work.deliverInstalledFieldGetters(facts, mapOwner) || changed
	}
	work.refreshOperationPublication(facts)
	return work.settleStagedPublication(facts, cycles)
}

func applyCallableArtifactConstraints(facts []callableFacts) {
	if len(stagedPublicationPending(facts)) != 0 {
		return
	}
	constraints := make([]uint8, len(facts))
	for index := range facts {
		for _, source := range facts[index].summary.EffectSources {
			if source.Environment == "browser" {
				constraints[index] |= 1
			}
			if source.Environment == "server" {
				constraints[index] |= 2
			}
		}
	}
	changed := true
	for changed {
		changed = false
		for callerIndex := range facts {
			for _, targetIndex := range facts[callerIndex].targets {
				next := constraints[targetIndex] | constraints[callerIndex]
				if next != constraints[targetIndex] {
					constraints[targetIndex] = next
					changed = true
				}
			}
		}
	}
	for index := range facts {
		facts[index].artifactConstraint = constraints[index]
	}
}

// appendDirectReferenceEffects classifies an executed source reference for its
// original effect publisher. Checker identity, context provenance and guarded
// browser access stay shared by callable and actual field-initializer drivers.
// This function neither executes a reference nor grants field/body admission.
func appendDirectReferenceEffects(fact *callableFacts, node *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker, owner *executableBodyOwner) {
	if node == nil || !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
		return
	}
	sources, contexts, ambient := sourceCallArgumentReferenceEffects(fact, node, sourceFile, typeChecker, owner, nil, -1)
	if ambient.reference == nil {
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, sources...)
	} else {
		for _, source := range sources {
			appendOperationEffect(fact, source)
		}
	}
	fact.directContext = append(fact.directContext, contexts...)
}

// sourceReferenceEffects shares bound global/context classification with source
// dependency demands. It grants neither purity nor a value/descriptor proof.
func sourceReferenceEffects(node, boundary *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker, nameOfOwner string) (sources []EnvironmentEffectSource, contexts []ContextEffect) {

	if node == nil || !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
		return nil, nil
	}
	return sourceBoundReferenceEffects(node, boundary, sourceFile, typeChecker, nameOfOwner, typeChecker.GetSymbolAtLocation(node))
}

// sourceBoundReferenceEffects reuses a classifier's original symbol lookup.
// It preserves the existing global/context/default rules without another walk.
func sourceBoundReferenceEffects(node, boundary *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker, nameOfOwner string, symbol *ast.Symbol) (sources []EnvironmentEffectSource, contexts []ContextEffect) {
	name := node.Text()
	if effect, ok := contextBindingReferenceEffect(symbol, sourceFile, typeChecker); ok {
		contexts = append(contexts, effect)
	}
	if _, candidate := browserGlobals[name]; candidate && symbolIsOutsideSource(symbol, sourceFile) && !browserGlobalReferenceIsGuarded(node, name, boundary) {
		sources = append(sources, environmentSource("browser", name, nameOfOwner))
	}
	if _, candidate := serverGlobals[name]; candidate && symbolIsOutsideSource(symbol, sourceFile) {
		sources = append(sources, environmentSource("server", name, nameOfOwner))
	}
	if serverOnlyImportSymbol(symbol) {
		sources = append(sources, environmentSource("server", "server-only import "+name, nameOfOwner))
	}

	if initializer := sourceParameterDefault(node, boundary); initializer != nil {
		for i := range sources {
			sources[i].callOrigin = &sourceCallOutcome{declaration: enclosingCallableNode(initializer), operation: initializer, consumer: boundary, phase: sourceDefaultEvaluation}
		}
	}
	return sources, contexts
}

func environmentSource(
	environment string,
	description string,
	callable string,
) EnvironmentEffectSource {
	return EnvironmentEffectSource{
		Environment: environment,
		Description: description,
		Path:        []string{callable, description},
	}
}

func uniqueEnvironmentSources(
	values []EnvironmentEffectSource,
) []EnvironmentEffectSource {
	result := make([]EnvironmentEffectSource, 0, len(values))
	shortest := make(map[string]EnvironmentEffectSource, len(values))
	for _, value := range values {
		key := value.Environment + ":" + value.Description + fieldSourceIdentity(value)
		current, exists := shortest[key]
		if !exists || len(value.Path) < len(current.Path) ||
			(len(value.Path) == len(current.Path) &&
				strings.Join(value.Path, ".") < strings.Join(current.Path, ".")) {
			value.provenanceIncomplete = value.provenanceIncomplete || current.provenanceIncomplete
			value.Opaque = value.Opaque || current.Opaque
			value.Path = nonNilSlice(value.Path)
			shortest[key] = value
		} else if value.provenanceIncomplete && !current.provenanceIncomplete {
			current.provenanceIncomplete = true
			current.Opaque = current.Opaque || value.Opaque
			shortest[key] = current
		}
	}
	for _, value := range shortest {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		leftKey := result[left].Environment + ":" + result[left].Description + ":" +
			strings.Join(result[left].Path, ".") + fieldSourceIdentity(result[left])
		rightKey := result[right].Environment + ":" + result[right].Description + ":" +
			strings.Join(result[right].Path, ".") + fieldSourceIdentity(result[right])
		return leftKey < rightKey
	})
	return result
}

func uniqueContextEffects(values []ContextEffect) []ContextEffect {
	unique := make([]ContextEffect, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		key := value.Kind + ":" + value.Token
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, value)
	}
	result := make([]ContextEffect, 0, len(unique))
	for _, value := range unique {
		if value.Kind == "read" {
			result = append(result, value)
		}
	}
	for _, value := range unique {
		if value.Kind != "read" {
			result = append(result, value)
		}
	}
	return result
}

func environmentEffectFor(sources []EnvironmentEffectSource) string {
	browser, server, unknown := false, false, false
	for _, source := range sources {
		browser = browser || source.Environment == "browser"
		server = server || source.Environment == "server"
		unknown = unknown || source.Environment == "unknown"
	}
	if browser && server {
		return "mixed"
	}
	if unknown {
		return "unknown"
	}
	if browser {
		return "browser"
	}
	if server {
		return "server"
	}
	return "neutral"
}

func artifactTargetsFor(
	effect string,
	sources []EnvironmentEffectSource,
	constraint uint8,
) []string {
	switch effect {
	case "browser":
		return []string{"client"}
	case "server":
		return []string{"server"}
	case "neutral":
		return []string{"client", "server"}
	default:
		if constraint == 1 {
			return []string{"client"}
		}
		if constraint == 2 {
			return []string{"server"}
		}
		browser, server := false, false
		for _, source := range sources {
			browser = browser || source.Environment == "browser"
			server = server || source.Environment == "server"
		}
		if browser && !server {
			return []string{"client"}
		}
		if server && !browser {
			return []string{"server"}
		}
		return []string{}
	}
}

func moduleInitializerDiagnostics(
	callables callableAnalysis,
	target Target,
	sourceFile *ast.SourceFile,
	policy PolicyAnalysis,
	preserveOpaqueInitializers bool,
) []Diagnostic {
	diagnostics := []Diagnostic{}
	if target == TargetDefault {
		return diagnostics
	}
	for _, fact := range callables.facts {
		if fact.sourceFile != sourceFile {
			continue
		}
		callable := fact.summary
		if callable.Kind != "module-initializer" {
			continue
		}
		// Invocation effects do not include a captured binding's earlier module
		// initialization. Partitioning must also retain the definition requirements
		// of the values this initializer uses, without executing dormant bodies.
		sources := append([]EnvironmentEffectSource(nil), callable.EffectSources...)
		definition := newModuleDefinitionAnalysis(callables.owner.checker, callables.owner)
		definition.expression(fact.node, false)
		if definition.browser {
			sources = append(sources, environmentSource("browser", "required module definition", callable.Name))
		}
		if definition.server {
			sources = append(sources, environmentSource("server", "required module definition", callable.Name))
		}
		message := ""
		switch environmentEffectFor(sources) {
		case "mixed":
			message = "executable module initializer has indivisible browser and server effects"
		case "unknown":
			if !preserveOpaqueInitializers && containsOpaqueEnvironment(callable.EffectSources) &&
				!artifactTargetsInclude(callable.ArtifactTargets, target) &&
				!(target == TargetServer &&
					policyConstrainsModuleInitializer(
						fact.node,
						sourceFile,
						policy,
					)) {
				message = "executable module initializer depends on an opaque call or side-effect import"
			}
		}
		if message != "" {
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2101",
				Message:  "error: " + message + placementDiagnosticContext(sources),
				Start:    fact.node.Pos(),
				Length:   fact.node.End() - fact.node.Pos(),
			})
		}
	}
	return diagnostics
}

func policyConstrainsModuleInitializer(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	policy PolicyAnalysis,
) bool {
	startLine, _ := sourceLocation(sourceFile, node.Pos())
	endLine, _ := sourceLocation(sourceFile, node.End())
	for _, consumer := range policy.SecretConsumers {
		if consumer.Target == "server" &&
			consumer.Line >= startLine &&
			consumer.Line <= endLine {
			return true
		}
	}
	return false
}

func environmentSourcesSignature(values []EnvironmentEffectSource) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Environment)
		result.WriteByte(':')
		result.WriteString(value.Description)
		result.WriteString(fieldSourceIdentity(value))
		result.WriteByte(':')
		result.WriteString(strings.Join(value.Path, "."))
		if value.Opaque {
			result.WriteString(":opaque")
		}
		if value.provenanceIncomplete {
			result.WriteString(":provenance-incomplete")
		}
		result.WriteByte('\n')
	}
	return result.String()
}

func stateEffectsSignature(values []StateEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(stateEffectPathKey(value))
		result.WriteByte(':')
		result.WriteString(arrayRootProofSignature(value.ArrayRoots))
		result.WriteString(value.Confidence)
		result.WriteByte(':')
		result.WriteString(stateReceiverSignature(value.Receiver))
		result.WriteByte('\n')
	}
	return result.String()
}

func stateReceiverSignature(receiver *StateReceiver) string {
	if receiver == nil {
		return "component"
	}
	if receiver.Kind == "parameter" {
		return fmt.Sprintf("parameter:%d:%s", receiver.Index, receiver.Root)
	}
	return receiver.Kind
}

func contextEffectsSignature(values []ContextEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(value.Token)
		result.WriteByte(':')
		result.WriteString(value.Confidence)
		result.WriteByte('\n')
	}
	return result.String()
}
