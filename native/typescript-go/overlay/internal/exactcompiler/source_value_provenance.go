package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// sourceValue is an origin and demanded projection. A normal acquired Get may
// retain its separate observation owner through an input transfer.
// A nil node is an unresolved input term, not an omitted JavaScript argument.
// Substitution flattens entry roots before installing another callable's parameters.
type sourceValue struct {
	// capture retains a symbolic creating context, never normal Get/Call authority.
	capture *acquiredCallableScope

	instance    *sourceConstructedInstance // live actual New output, never detached or cached
	number      numberPayload              // copied from the authenticated acquired Number, not reparsed
	ownedGetRow *ownedGetRow

	initializerUse *sourceInitializerUse // exclusive pending identity, never a raw Call result
	// adapter pairs only this actually acquired library member with its original
	// source routing relation. Its admitted Get output owns later lookup.
	adapter *sourceOrdinaryAdapter

	// acquired retains a normal Get output through a binding or argument transfer.
	// Its original operation/input/scope pair is consumed by callable acquisition,
	// never inferred again from this value's syntax or the current caller frame.
	acquired *sourceObservedValue
	// entrySlot is an uninstalled normal operand, not a known object origin.
	entrySlot *ast.Node
	// bound carries the already acquired callable construction, not its body result.
	// Its original scope and construction operation are consumed by later invocation.
	bound *sourceInvocationBody
	// normal retains one completed operand's original scope through selected inputs.
	normal *sourceNormalValue
	// forwarded records this observation's actual source substitutions only.
	// The separate full-reference check, not this list, proves confinement.
	forwarded []*ast.Node
	awaited   *sourceNativeInvocation
	// native is a standard-entry alternative retained through actual acquisition.
	// Authored writes and opaque alternatives remain beside it.
	native *sourceNativeValue
	node   *ast.Node
	path   []string
	// rest preserves each actual argument's alternatives, without a runtime array identity.
	rest [][]sourceValue
	// copied holds acquired own-property values of an object rest binding, not its source identity.
	copied    map[string][]sourceValue
	undefined bool
}

// sourceValueCreation pairs a finite creating call with its current return occurrence.
// It is scoped to that traversal, so separate factory calls never share binding state.
type sourceValueCreation struct {
	invocation, returning *ast.Node
}

type sourceValueBindings map[ast.SymbolId][]sourceValue
type sourceValueWrite struct {
	value     sourceValue
	operation string
}
type sourceValueSummary struct {
	normalSlots                 map[*ast.Node]struct{}
	nodes, returns, returnSites []*ast.Node
	normal                      []sourceNormalDemand
}
type sourceNormalDemand struct {
	visitOnly    bool
	defaultKnown bool
	defaultRoot  *ast.Node

	fold *sourceNormalFold

	node    *ast.Node
	operand *sourceNormalOperand
	phase   *sourceNormalPhase
}

// sourceValueOwner retains declaration-parametric demands and source assignment indexes only
// for its checker generation. It is not a heap, selected-callee certificate or lowering plan.
type sourceValueOwner struct {
	estimatedCostMaximum    int // immutable cached advisory summary, not authority
	initializerDeclarations map[*ast.Node]*moduleInitializerProjection
	initializerOccurrences  map[*ast.Node]*moduleInitializerProjection
	initializerRevision     uint64
	language                *languageOwner
	checker                 *checker.Checker
	// program binds emit-reference receipts to the same acquired checker generation.
	program        *compiler.Program
	generation     *projectGeneration
	indexPreparing map[*ast.SourceFile]bool
	// components retains receiver/type facts supplied by normal component analysis.
	// It is checker-generation data, never invocation or lifetime authority.
	components                                              map[*ast.Node]externalImportBindings
	summaries                                               map[*ast.Node]sourceValueSummary
	indexes                                                 map[*ast.SourceFile]sourceValueIndex
	work, candidates, substitutions, widenings              int
	indexWork, summaryWork, provenanceFacts, maxTerms       int
	peakProducedFacts, argumentOriginWork, interferenceWork int
}

func newSourceValueOwner(c *checker.Checker) *sourceValueOwner {
	return &sourceValueOwner{checker: c, summaries: make(map[*ast.Node]sourceValueSummary), indexes: make(map[*ast.SourceFile]sourceValueIndex)}
}

// sourceValueQuery bounds all nested invocation and projection demands together. An active
// declaration widens after its finite source input relation stops growing. Normal
// execution retains its declaration guard instead of growing capture contexts.
type sourceValueQuery struct {
	// dependencyStatsOwner receives advisory work only, never query capabilities.
	dependencyStatsOwner *sourceValueOwner
	dependencyUse        *ast.Node
	dependencyEntries    map[*ast.Node]*sourceDependencyEntry

	// dependenciesOnly instantiates source relationships without consuming normal storage.
	dependenciesOnly bool

	pendingCallee      *sourcePendingCallee         // synchronous unavailable-selection borrow, never cached
	pendingWriterInput *sourcePendingWriterInput    // synchronous negative writer-candidate fence, never cached
	constructionMay    *sourceConstructionMayPrefix // synchronous effects-only prefix borrow, never cached
	workLedgers        map[*sourceNormalOperation]bool
	argumentPrefix     *sourceArgumentPrefix

	deferredRead         *sourceDeferredRead         // local read admission only, never cached
	initializerSelection *sourceInitializerSelection // actual argument stack only
	// Installed selection and receiver inspection are stack-scoped capabilities, never cached facts.
	installedReceiverCall *sourceInstalledReceiverCall
	receiverInspection    *sourceReceiverInspection
	returnObservation     *sourceReturnObservation
	normalBindingCall     *ast.Node
	// callerInputs grants only qualified original caller-actual lookup during inspection.
	callerInputs *sourceCallerInputOwner
	// operation is a scoped normal-analysis producer, not runtime activation or indexed admission.
	operation *sourceOperationContext
	// effectOwner scopes caller effect acquisition. Value/producer proofs leave it nil.
	// These scoped syntax endpoints certify neither activation nor acquired values.
	protectedMember          *ast.Node
	freshReturnCall          *ast.Node
	effectOwner              *ast.Node
	provingFunctionOperation bool
	owner                    *sourceValueOwner
	executable               *executableBodyOwner
	remaining                int // historical estimate gauge, never an admission allowance
	estimatedCost            int
	originDepth              int
	facts                    int
	active                   map[*ast.Node]bool
	creators                 map[*ast.Node]sourceValueCreation
	inputs                   *sourceValueInputs
	invoking                 *ast.Node
	live                     map[ast.SymbolId]bool
	returning                *ast.Node
	reading                  *ast.Node
	initializing             *ast.Node
}

func (owner *sourceValueOwner) summary(node *ast.Node) sourceValueSummary {
	if summary, ok := owner.summaries[node]; ok {
		return summary
	}
	summary := sourceValueSummary{returns: directCallableReturns(node), normalSlots: make(map[*ast.Node]struct{})}
	erasedPolicy := owner.erasedTaskPolicyParameter(node)
	index := owner.index(ast.GetSourceFileOfNode(node))
	appendDemand := func(demand sourceNormalDemand) {
		if entry := index.normalOccurrences[demand.node]; !index.incomplete && entry != nil {
			demand.defaultKnown = true
			demand.defaultRoot = entry.defaultRoot
		}
		summary.normal = append(summary.normal, demand)
	}
	if ast.IsArrowFunction(node) && node.Body() != nil && !ast.IsBlock(node.Body()) {
		summary.returns = append(summary.returns, node.Body())
		summary.returnSites = append(summary.returnSites, node.Body())
	}
	walkCallableNormalWithFolds(node, func(child *ast.Node) bool {
		owner.summaryWork++
		if child == erasedPolicy {
			return false
		}
		if ast.IsPartOfTypeNode(child) {
			return false
		}
		if ast.IsReturnStatement(child) {
			summary.returnSites = append(summary.returnSites, child)
		}
		executable := false
		if sourceClassHasDecoratorApplication(child) || ast.IsVariableDeclarationList(child) && child.Flags&ast.NodeFlagsUsing != 0 {
			summary.nodes = append(summary.nodes, child)
		}
		if ast.IsIdentifier(child) && !ast.IsDeclarationName(child) && !isStaticPropertyName(child) {
			summary.nodes = append(summary.nodes, child)
		}
		if ast.IsPropertyAccessExpression(child) || ast.IsElementAccessExpression(child) || ast.IsCallExpression(child) || ast.IsNewExpression(child) || ast.IsTaggedTemplateExpression(child) || ast.IsSpreadAssignment(child) || ast.IsVariableDeclaration(child) || ast.IsAssignmentExpression(child, false) || ast.IsDeleteExpression(child) || ast.IsPrefixUnaryExpression(child) || ast.IsPostfixUnaryExpression(child) {
			summary.nodes = append(summary.nodes, child)
			demand, dependent := describeNormalOperand(child)
			executable = !dependent || !demand.pattern
		}
		appendDemand(sourceNormalDemand{node: child, visitOnly: !executable})
		return true
	}, func(demand sourceNormalOperand) {
		appendDemand(sourceNormalDemand{node: demand.node, operand: &demand})
		if demand.pattern {
			summary.nodes = append(summary.nodes, demand.node)
		}
		if !demand.cellOnly && demand.binding != nil && !ast.IsIdentifier(unwrapSourceCallableReference(demand.value)) {
			if symbol := owner.checker.GetSymbolAtLocation(demand.binding); symbol != nil && symbol.ValueDeclaration != nil {
				summary.normalSlots[symbol.ValueDeclaration] = struct{}{}
			}
		}
	}, func(phase sourceNormalPhase) {
		appendDemand(sourceNormalDemand{node: phase.node, phase: &phase})
		if phase.role == sourceNormalSelect && ast.IsVariableDeclaration(phase.node) {
			summary.nodes = append(summary.nodes, phase.node)
		}
	}, func(fold sourceNormalFold) {
		owner.summaryWork += 1 + len(fold.children)
		appendDemand(sourceNormalDemand{node: fold.node, fold: &fold})
	}, func(node *ast.Node) bool {
		entry := index.normalOccurrences[node]
		return node == erasedPolicy || entry != nil && entry.structural
	})
	owner.summaries[node] = summary
	return summary
}

// origins keeps initializer-time values separate from later writes to each binding.
// Source ordering is relative to the binding's owner, independent of declaration spelling.
func (query *sourceValueQuery) origins(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) (terms []sourceValue) {
	defer func() {
		if query.returnObservation == nil || node == nil {
			return
		}
		for i := range terms {
			if !query.charge(result, node) {
				return
			}
			terms[i].forwarded = query.forwardingTrace(result, terms[i].forwarded, []*ast.Node{node})
		}
	}()
	if node == nil {
		return nil
	}
	if ast.IsNewExpression(node) {
		if observed, found := query.constructedOutput(node); found {
			retainResultUncertainty(observed, result, sourceExecutionOutput)
			for _, value := range observed.values {
				terms = append(terms, value.value)
			}
			return terms
		}
	}
	if query.originDepth >= 128 {
		result.opaque = true
		query.owner.widenings++
		return nil
	}
	query.remaining--
	query.recordEstimatedCost(1)
	query.originDepth++
	defer func() { query.originDepth-- }()
	query.owner.work++
	if query.returnObservation != nil && query.inputs != nil && ast.IsBinaryExpression(node) {
		binary := node.AsBinaryExpression()
		if binary.OperatorToken.Kind == ast.KindEqualsToken || binary.OperatorToken.Kind == ast.KindCommaToken {
			// Normal execution already owns Get/default/PutValue effects. The
			// expression's value is its RHS, with publication retained in the trace.
			terms := query.origins(binary.Right, bindings, result)
			if binary.OperatorToken.Kind == ast.KindEqualsToken {
				target := planMutationOperation(node).target
				for i := range terms {
					terms[i].forwarded = query.forwardingTrace(result, terms[i].forwarded, []*ast.Node{node, target})
				}
			}
			return terms
		}
	}
	if observation := query.returnObservation; observation != nil && observation.kind == sourceRawNormalResult && (ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node)) {
		// Normal execution owns the Get. A result projection without its retained
		// acquired output cannot execute the getter again to recover a value.
		result.valueIncomplete = true
		return []sourceValue{{}}
	}
	root, path := effectArgumentRoot(node)
	if native, nativePath := query.nativePromiseEntry(node, root, path); native != nil {
		values := query.nativeEntryValues(*native, bindings, result)
		if native.native.kind != sourceNativeGlobalObject {
			symbol := query.owner.checker.GetSymbolAtLocation(native.node.Name())
			values = query.liveValues(symbol, values, root, bindings, result)
		}
		return query.boundProjection(values, nativePath, result)
	}
	if root == nil {
		return nil
	}
	if root.Kind == ast.KindThisKeyword {
		return query.boundProjection(query.receiverOrigins(root, bindings), path, result)
	}
	if ast.IsAwaitExpression(root) && query.returnObservation != nil {
		acquired := accessorCandidates{}
		query.observeNativeAwait(root, bindings, &acquired)
		mergeAccessorCandidates(result, acquired)
		return query.boundProjection(acquired.values, path, result)
	}
	if !ast.IsIdentifier(root) {
		return []sourceValue{{node: root, path: path}}
	}
	symbol := sourceCallableReferenceSymbol(root, query.owner.checker)
	if root.Parent != nil && ast.IsShorthandPropertyAssignment(root.Parent) {
		symbol = query.owner.checker.GetShorthandAssignmentValueSymbol(root.Parent)
	}
	// Binding identity follows the same import resolution as callable acquisition.
	// This proves neither module initialization effects nor a member descriptor.
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.sourceAlias(symbol, result)
	}
	if symbol == nil {
		return []sourceValue{{node: root, path: path}}
	}
	if callable, rest := query.namespaceCallable(symbol, path, result); callable != nil {
		return []sourceValue{{node: callable, path: rest}}
	}
	id := ast.GetSymbolId(symbol)
	if !query.dependenciesOnly {
		if values, exists := query.normalLocalInput(symbol, root, result); exists {
			values = query.liveValues(symbol, values, root, bindings, result)
			return query.boundProjection(values, path, result)
		}
	}
	if values, ok := bindings[id]; ok {
		values = query.liveValues(symbol, values, root, bindings, result)
		return query.boundProjection(values, path, result)
	}
	if !query.dependenciesOnly && query.missingNormalInput(symbol, root, bindings, result) {
		return []sourceValue{{node: root, path: path, entrySlot: symbol.ValueDeclaration}}
	}
	if !query.dependenciesOnly {
		if values, admitted := query.moduleInitializerValues(symbol, root, result); admitted {
			values = query.liveValues(symbol, values, root, bindings, result)
			return query.boundProjection(values, path, result)
		}
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsFunctionLike(declaration) && declaration.Body() != nil && !ast.GetSourceFileOfNode(declaration).IsDeclarationFile {
			// A writable source-callable binding requires acquired-value invocation
			// ownership even when its current alternative is foreign. This marker
			// supplies no completeness or execution-neutrality authority.
			result.sourceCallable = result.sourceCallable || query.owner.bindingWritten(symbol)
			values := query.liveValues(symbol, []sourceValue{{node: declaration}}, root, bindings, result)
			for i := range values {
				values[i].path = append(values[i].path, path...)
			}
			return values
		}
		if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil {
			if !query.dependenciesOnly {
				if values, selected := query.pendingInitializerValues(symbol, root, declaration, bindings, result); selected {
					values = query.liveValues(symbol, values, root, bindings, result)
					return query.boundProjection(values, path, result)
				}
			}
			values := query.originsAt(declaration.Initializer(), declaration, bindings, result)
			if query.owner.bindingWritten(symbol) {
				for _, seed := range values {
					if seed.node != nil && ast.IsFunctionLike(seed.node) && seed.node.Body() != nil {
						result.sourceCallable = true
						break
					}
				}
			}
			for i := range values {
				values[i].path = append(values[i].path, path...)
			}
			values = query.liveValues(symbol, values, root, bindings, result)
			return values
		}
	}
	values := query.liveValues(symbol, []sourceValue{{node: root}}, root, bindings, result)
	for i := range values {
		values[i].path = append(values[i].path, path...)
	}
	return values
}

// originsAt evaluates binding provenance at its authored initialization or argument site.
// This is a finite source-order filter, not a runtime cell or an object snapshot.
func (query *sourceValueQuery) originsAt(node, at *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	previous := query.initializing
	query.initializing = at
	values := query.origins(node, bindings, result)
	// Resolve the acquired finite value while the location still has its source-time
	// meaning. Later reads retain that origin, so replacing the slot cannot retarget it.
	if at != nil && !query.active[at] {
		previousActive, hadActive := query.active[at]
		query.active[at] = true
		// This interval owns only its temporary value, not prior membership.
		defer func() {
			if hadActive {
				query.active[at] = previousActive
			} else {
				delete(query.active, at)
			}
		}()
		var acquired []sourceValue
		for _, value := range values {
			if value.initializerUse != nil && len(value.path) != 0 {
				result.valueIncomplete = true
				acquired = append(acquired, sourceValue{})
				continue
			}
			// Symbolic receiver demands remain relative to the eventual caller.
			if value.node == nil || len(value.path) == 0 || ast.IsIdentifier(value.node) || value.node.Kind == ast.KindThisKeyword {
				acquired = append(acquired, value)
				continue
			}
			if observation := query.returnObservation; observation != nil && observation.kind == sourceRawNormalResult {
				// No actual normal Get output was retained for this projected term.
				// Keep its value incomplete instead of replaying the getter here.
				result.valueIncomplete = true
				acquired = append(acquired, sourceValue{})
				continue
			}
			candidates := accessorCandidates{}
			if value.native != nil {
				query.nativeMember(value, nil, "", accessorAcquire, bindings, &candidates, func(node *ast.Node, path []string, instance bool) {
					other := query.accessors(node, path, "", accessorAcquire, bindings, nil)
					mergeAccessorCandidates(&candidates, other)
					candidates.values = append(candidates.values, other.values...)
				})
			} else {
				candidates = query.accessors(value.node, value.path, "", accessorAcquire, bindings, nil)
			}
			mergeAccessorCandidates(result, candidates)
			for i, candidate := range candidates.values {
				if scope, ok := candidates.callableScopes[i]; ok && candidate.acquired == nil && candidate.normal == nil {
					candidate.capture = &scope
				}
				acquired = append(acquired, candidate)
			}
		}
		values = acquired
	}
	query.initializing = previous
	return values
}

func mergeAccessorCandidates(result *accessorCandidates, other accessorCandidates) {
	mergeCandidateComponents(result, other)
	result.environmentEffects = append(result.environmentEffects, other.environmentEffects...)
	result.contextEffects = append(result.contextEffects, other.contextEffects...)
	mergeOwnedGets(&result.ownedGets, other.ownedGets)
	result.ownedClaims = append(result.ownedClaims, other.ownedClaims...)
	result.ownedLocalCauses = append(result.ownedLocalCauses, other.ownedLocalCauses...)
	result.ownedReferenceOnly = result.ownedReferenceOnly || other.ownedReferenceOnly
	result.accessorMutations = append(result.accessorMutations, other.accessorMutations...)
	result.nativeDescriptorEffects = append(result.nativeDescriptorEffects, other.nativeDescriptorEffects...)
	result.writeBodies = append(result.writeBodies, other.writeBodies...)
	result.writeOutcomes = append(result.writeOutcomes, other.writeOutcomes...)
	result.callOutcomes = append(result.callOutcomes, other.callOutcomes...)
	result.callFallbacks = append(result.callFallbacks, other.callFallbacks...)
	result.descriptorFallbacks = append(result.descriptorFallbacks, other.descriptorFallbacks...)
	result.fieldFallbacks = append(result.fieldFallbacks, other.fieldFallbacks...)
	result.fieldOutcomes = append(result.fieldOutcomes, other.fieldOutcomes...)
	result.fieldCalls = append(result.fieldCalls, other.fieldCalls...)
	result.ownSlots = append(result.ownSlots, other.ownSlots...)
	result.fieldAlternatives = append(result.fieldAlternatives, other.fieldAlternatives...)
	result.fieldReceiverIncomplete = result.fieldReceiverIncomplete || other.fieldReceiverIncomplete
	result.nativeCalls = append(result.nativeCalls, other.nativeCalls...)
	result.reflective = append(result.reflective, other.reflective...)
	result.normalCalls = append(result.normalCalls, other.normalCalls...)
	result.owned = append(result.owned, other.owned...)
	result.thenReferences = append(result.thenReferences, other.thenReferences...)
	result.thenIncomplete = result.thenIncomplete || other.thenIncomplete
	result.receiverIncomplete = result.receiverIncomplete || other.receiverIncomplete
	result.valueIncomplete = result.valueIncomplete || other.valueIncomplete
	result.sourceCallable = result.sourceCallable || other.sourceCallable
	result.ordinaryBodies = append(result.ordinaryBodies, other.ordinaryBodies...)
	result.ownOperation = result.ownOperation || other.ownOperation
	result.inputs = append(result.inputs, other.inputs...)
	result.declarations = append(result.declarations, other.declarations...)
	result.effects = append(result.effects, other.effects...)
	result.producers = append(result.producers, other.producers...)
	result.sourceOwned = result.sourceOwned || other.sourceOwned
	result.writes = append(result.writes, other.writes...)
	result.opaque = result.opaque || other.opaque
	result.selected = result.selected || other.selected
	if result.cause == nil {
		result.cause = other.cause
	}
}

// execute instantiates cached demands, not the callable body. A projected invocation supplies
// its actual inputs alongside captures. Its possible writes cannot authorize private entry.
// Direct callees keep their existing parameter-effect graph and need only capture demands here.
func (query *sourceValueQuery) execute(declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates, invocation *ast.Node) {
	query.executeInputs(declaration, bindings, result, invocation, nil)
}

// executeInputs keeps direct parameter-effect ownership separate from projected invocation
// while both consumers use the same binding/default execution plan.
func (query *sourceValueQuery) executeInputs(declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates, invocation *ast.Node, inputs *sourceValueInputs) bool {
	freshSourceInputs := false
	if query.dependenciesOnly {
		releaseEntry, fresh := query.enterDependencyBody(declaration, bindings, inputs, invocation, result)
		freshSourceInputs = fresh
		defer releaseEntry()
	}
	if query.active[declaration] && !freshSourceInputs {
		// An omitted normal body supplies no complete reference inventory, even
		// when its primitive effect backedge is already owned by the call graph.
		result.thenIncomplete = true
		// The ordinary effect graph already owns a primitive-input backedge.
		// Object, unknown and projected inputs still need a widened demand.
		if !query.primitiveRecursiveInputs(declaration, bindings, inputs) {
			result.opaque = true
			query.owner.widenings++
		}
		return false
	}
	query.remaining--
	query.recordEstimatedCost(1)
	query.owner.work++
	previousActive, hadActive := query.active[declaration]
	query.active[declaration] = true
	defer func() {
		if hadActive {
			query.active[declaration] = previousActive
		} else {
			delete(query.active, declaration)
		}
	}()
	query.owner.candidates++
	previousPrefix := query.argumentPrefix
	query.argumentPrefix = query.currentArgumentPrefix()
	defer func() { query.argumentPrefix = previousPrefix }()
	previousInputs := query.inputs
	previousOperation := query.operation
	if previousOperation != nil {
		query.operation = &sourceOperationContext{node: invocation, owner: declaration, inputs: inputs}
	}
	defer func() { query.operation = previousOperation }()
	query.inputs = inputs
	defer func() { query.inputs = previousInputs }()
	previousInvocation := query.invoking
	query.invoking = invocation
	if inputs != nil {
		query.invoking = inputs.invocation
	}
	defer func() { query.invoking = previousInvocation }()
	if inputs != nil {
		bindings = inputs.bindings
	}
	if invocation != nil {
		inputs = query.bindInputs(declaration, invocation, bindings, result)
		bindings = inputs.bindings

	}
	query.inputs = inputs
	if inputs != nil && previousInputs != nil {
		inputs.properties = previousInputs.properties
	}
	// An explicit task has its own execution owner and effect graph. Bind the call's
	// inputs above, but never lift that child's callback execution onto this caller.
	// The child's own analysis still enters its body, including invalid local effects.
	parameters := declaration.Parameters()
	if query.effectOwner != nil && declaration != query.effectOwner && len(parameters) > 0 && parameters[len(parameters)-1].Initializer() != nil {
		source := ast.GetSourceFileOfNode(declaration)
		if _, explicit := functionTaskPolicy(declaration, source, collectExternalImportBindings(source, query.owner.checker)); explicit {
			operation := invocation
			if inputs != nil && inputs.invocation != nil {
				operation = inputs.invocation
			}
			result.retainCallableEffect(operation, declaration)
			return false
		}
	}
	if inputs != nil && query.operation != nil {
		inputs.thenReferences = make([]sourceThenReference, 0)
	}
	if inputs == nil {
		inputs = &sourceValueInputs{declaration: declaration, bindings: query.acquireCallableScope(bindings, result).bindings}
	}
	query.inputs = inputs
	// Caller-actual lookup stays scoped to its original consumer, independently
	// of whether this body requests source relationships or normal storage.
	priorCallerInputs := query.callerInputs
	if query.operation != nil {
		query.callerInputs = nil
	}
	defer func() { query.callerInputs = priorCallerInputs }()
	// Generic source instantiation owns substitutions and per-use effects. It
	// does not enter normal storage or issue a consumed-body lifetime.
	if query.dependenciesOnly {
		inputs.dependencyScope = query.acquireCallableScope(bindings, result)
		inputs.dependencyUse = query.effectUse()
		// Source demands describe possible work. They neither execute a storage
		// recipe nor acquire normal outputs from a previous analysis interval.
		visited := make(map[*ast.Node]bool)
		consume := func(node *ast.Node, demandBindings sourceValueBindings) {
			if visited[node] {
				return
			}
			visited[node] = true
			query.executeDemand(node, declaration, demandBindings, result, invocation, inputs)
		}
		for _, node := range query.owner.summary(declaration).nodes {
			defaults, isDefault := query.defaultInput(inputs, node, result)
			if inputs.deferredBody && !isDefault {
				continue
			}
			demandBindings := bindings
			if isDefault {
				if defaults.bindings == nil {
					query.accountBypassedSourceDemand(node, bindings, result)
					continue
				}
				demandBindings = defaults.bindings
			}
			consume(node, demandBindings)
		}
		for _, initializer := range inputs.order {
			defaults := inputs.defaults[initializer]
			outcome := query.returnOutcome(initializer, defaults.bindings == nil)
			outcome.phase = sourceDefaultEvaluation
			result.callOutcomes = append(result.callOutcomes, outcome)
			if defaults.bindings == nil {
				for _, node := range query.owner.summary(initializer).nodes {
					query.accountBypassedSourceDemand(node, bindings, result)
				}
				continue
			}
			for _, node := range query.owner.summary(initializer).nodes {
				consume(node, defaults.bindings)
			}
		}
		result.inputs = append(result.inputs, inputs)
		return true
	}
	// A requested raw-result observer consumes after body exit. Its caller owns
	// final release. Effect-only entry has no such later consumer.
	inputs.population = query.owner.normalPopulation(declaration)
	beginNormalOperations(inputs)
	defer func() {
		// Selected Get inputs belong to consumeGetInputs through its chosen
		// final observer, including effect-only and refused entries.
		if inputs.returnedGets == nil && inputs.get == nil {
			releaseNormalOperations(inputs)
		}
	}()
	if inputs.invocation != nil && ast.IsCallExpression(inputs.invocation) {
		previousConsumed := inputs.consumedCall
		inputs.consumedCall = &sourceConsumedCallInputs{operation: inputs.invocation, declaration: declaration, parent: previousInputs, inputs: inputs, entered: true, conditional: query.operation == nil}
		// Pending RHS Gets belong to this body consumption, not a cached input plan.
		previousGets := inputs.lexicalGets
		inputs.lexicalGets = nil
		defer func() { inputs.consumedCall = previousConsumed; inputs.lexicalGets = previousGets }()
	}

	if query.executeOwnedStorageBody(declaration, inputs, result) {
		return true
	}

	for _, demand := range query.owner.summary(declaration).normal {
		if inputs.deferredBody {
			if _, isDefault := query.normalDemandDefault(demand, inputs, result); !isDefault {
				continue
			}
		}
		if demand.visitOnly {
			continue
		}
		func() {
			node := demand.node
			finish := query.normalWork(result, node)
			defer finish()
			previousInitializing := query.initializing
			defer func() { query.initializing = previousInitializing }()
			demandBindings := bindings
			conditional, binding := false, false
			if inputs != nil {
				if defaults, isDefault := query.normalDemandDefault(demand, inputs, result); isDefault {
					if defaults.bindings == nil {
						return
					}
					binding = true
					demandBindings = defaults.bindings
					conditional = defaults.conditional
					query.initializing = node
				}
			}
			demandResult := result
			if conditional {
				demandResult = &accessorCandidates{}
			}
			if demand.fold != nil {
				query.consumeNormalFold(*demand.fold, demandResult)
			} else if demand.phase != nil {
				query.withNormalReceipts(declaration, node, inputs, result, func() { query.consumeNormalPhase(*demand.phase, demandBindings, demandResult) })
			} else if demand.operand != nil {
				query.consumeNormalOperand(*demand.operand, declaration, demandBindings, demandResult, inputs)
			} else if binding {
				query.withActiveInvocation(inputs.invocation, func() { query.executeDemand(node, declaration, demandBindings, demandResult, invocation, inputs) })
			} else {
				query.executeDemand(node, declaration, demandBindings, demandResult, invocation, inputs)
			}
			if conditional {
				demandResult.opaque = demandResult.opaque || len(demandResult.declarations) > 0 || len(demandResult.writes) > 0 || len(demandResult.producers) > 0
				mergeAccessorCandidates(result, *demandResult)
			}
		}()
	}

	if inputs.writeAlternative != nil && query.charge(result, declaration) {
		verdict := inputs.writeComponents[declaration.Body()]
		for _, parameter := range declaration.Parameters() {
			if !query.charge(result, parameter) {
				verdict = sourceWriteTop
				break
			}
			symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name())
			if symbol == nil {
				verdict = sourceWriteTop
				continue
			}
			installed, ok := inputs.installedFormals[ast.GetSymbolId(symbol)]
			if !ok || installed.inputs != inputs || installed.symbol != symbol || installed.parameter != parameter {
				verdict = sourceWriteTop
			}
		}
		result.writeBodies = append(result.writeBodies, sourceWriteBody{alternative: inputs.writeAlternative, verdict: verdict})
	}
	query.settlementReturnEffects(declaration, bindings, result)
	if inputs != nil && len(inputs.defaults) > 0 {
		result.inputs = append(result.inputs, inputs)
	}
	return true
}

// primitiveRecursiveInputs stops only repeated primitive input substitution. Known
// effects still converge through resolved callable edges. This supplies no return
// value, purity or performed-execution proof, and unknown coercions stay opaque.
func (query *sourceValueQuery) primitiveRecursiveInputs(declaration *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs) bool {
	if inputs == nil {
		return false
	}
	primitive := func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		value := query.owner.checker.GetTypeAtLocation(node)
		return value != nil && value.Flags()&checker.TypeFlagsPrimitive != 0
	}
	for _, parameter := range declaration.Parameters() {
		if !ast.IsIdentifier(parameter.Name()) || !primitive(parameter.Name()) {
			return false
		}
	}
	for _, values := range bindings {
		for _, value := range values {
			if !value.undefined && (len(value.path) != 0 || value.rest != nil || value.copied != nil || !primitive(value.node)) {
				return false
			}
		}
	}
	return true
}

// executeDemand applies one cached demand with its body or binding-time inputs.
// Native evaluation remains in emitted JavaScript, including exceptions and argument order.
func (query *sourceValueQuery) executeDemand(node, declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates, invocation *ast.Node, inputs *sourceValueInputs) {
	previousOperation := query.operation
	if previousOperation != nil {
		effectOwner := declaration
		if inputs != nil && inputs.population != nil && inputs.population.moduleEntry(node, previousOperation.owner) != nil {
			effectOwner = previousOperation.owner
		}
		query.operation = &sourceOperationContext{node: node, owner: effectOwner, inputs: inputs}
	}
	defer func() { query.operation = previousOperation }()
	possible, _ := query.reachable(node, bindings)
	if !possible {
		return
	}
	if query.dependenciesOnly && query.sourceDisposalMayBeAcquired(node) {
		name := "<anonymous>"
		if declaration.Name() != nil {
			name = callableNameText(declaration.Name())
		}
		effect := sourceDisposalEffect(node, declaration, name)
		effect.callOrigin = nil
		result.environmentEffects = append(result.environmentEffects, effect)
	}
	if query.dependenciesOnly && sourceClassHasDecoratorApplication(node) {
		name := "<anonymous>"
		if declaration.Name() != nil {
			name = callableNameText(declaration.Name())
		}
		effect := sourceDecoratorApplicationEffect(node, declaration, name)
		effect.callOrigin = nil // This source demand has passed its actual default/phase gate.
		result.environmentEffects = append(result.environmentEffects, effect)
	}
	if query.dependenciesOnly && ast.IsIdentifier(node) {
		name := "<anonymous>"
		if declaration.Name() != nil {
			name = callableNameText(declaration.Name())
		}
		sources, contexts := sourceReferenceEffects(node, declaration, ast.GetSourceFileOfNode(node), query.owner.checker, name)
		for i := range sources {
			if origin := sources[i].callOrigin; origin != nil && origin.phase == sourceDefaultEvaluation {
				sources[i].callOrigin = nil
			}
		}
		result.environmentEffects = append(result.environmentEffects, sources...)
		result.contextEffects = append(result.contextEffects, contexts...)
	}
	if ast.IsCallExpression(node) {
		if slot := query.normalOperation(node, false); slot != nil && (slot.state == sourceOperationConsumed || slot.state == sourceOperationRefused || slot.state == sourceOperationBypassed) {
			finishNormalPending(inputs, slot)
			return
		}
	}

	query.remaining--
	query.recordEstimatedCost(1)
	query.owner.work++
	if query.operation != nil {
		query.retainThenOperation(node, bindings, result)
	}
	if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
		read, write := accessorEvaluationMode(node)
		if query.operation != nil && normalGetBinding(node, declaration, inputs, query.owner.checker) {
			read = false
		}
		if read || write {
			receiver, name := accessorReceiver(node)
			mode := accessorRead
			if write {
				mode |= accessorSet
			}
			if !read {
				mode |= accessorNoGet
			}
			var returned *ast.Node
			assigned := query.lexicalWriteGet(node, inputs, result)
			if inputs != nil && inputs.returnedGets != nil && read && !write {
				outer := node
				for outer.Parent != nil && (ast.IsParenthesizedExpression(outer.Parent) || ast.IsAsExpression(outer.Parent) || ast.IsNonNullExpression(outer.Parent) || ast.IsSatisfiesExpression(outer.Parent)) {
					outer = outer.Parent
				}
				if outer.Parent != nil && ast.IsReturnStatement(outer.Parent) && outer.Parent.AsReturnStatement().Expression == outer {
					returned = outer.Parent
					mode = accessorAcquire
				}
			}
			if assigned != nil && read && !write {
				mode = accessorAcquire
			}
			previousMember := query.protectedMember
			query.protectedMember = node
			var candidates accessorCandidates
			if returned != nil || assigned != nil {
				candidates = query.consumeNormalGet(node, bindings)
			} else if read && !write && query.operation != nil {
				candidates = query.consumeNormalGet(node, bindings)
			} else {
				candidates = query.sourceAccessorOperationCandidates(receiver, nil, name, mode, bindings, node)
			}
			// Actual normal Get publication emits the outcome once. Non-normal
			// reads retain the existing direct producer's checked relation.
			if read && !write && query.operation == nil {
				query.appendFieldReadOutcome(node, receiver, name, &candidates)
			}
			query.protectedMember = previousMember
			if returned != nil || assigned != nil {
				site := returned
				if assigned != nil {
					site = assigned
				}
				// This is a value receipt. The actual Get producer retains its
				// execution obligations separately, including any unknown cause.
				acquired := sourceGetReturn{componentRefs: candidateContributionReferences(candidates), ownedGets: candidates.ownedGets, site: site, incomplete: candidates.valueIncomplete || candidates.receiverIncomplete || len(candidates.values) == 0}
				for index, value := range candidates.values {
					if value.ownedGetRow != nil {
						acquired.values = append(acquired.values, sourceObservedValue{value: value})
						continue
					}
					scope, exists := candidates.callableScopes[index]
					if !exists {
						scope = query.acquireCallableScope(bindings, &candidates)
					}
					acquired.values = append(acquired.values, sourceObservedValue{value: value, inputs: inputs, scope: scope, returned: returned})
				}
				if returned != nil {
					query.detachReturnedPrimitive(&acquired, &candidates)
				}
				if assigned != nil {
					inputs.lexicalGets = append(inputs.lexicalGets, acquired)
				} else {
					inputs.returnedGets = append(inputs.returnedGets, acquired)
				}
			}
			mergeAccessorCandidates(result, candidates)
		}
	}
	if ast.IsVariableDeclaration(node) && (ast.IsObjectBindingPattern(node.Name()) || ast.IsArrayBindingPattern(node.Name())) {
		query.bindInputPattern(node.Name(), query.originsAt(node.Initializer(), node, bindings, result), bindings, result, accessorAcquire, inputs)
	}
	visitImplicitAccessorQueries(node, query.owner.checker, func(receiver *ast.Node, path []string, name string, mode accessorTraversal) accessorCandidates {
		return query.accessors(receiver, path, name, mode, bindings, nil)
	}, func(candidates accessorCandidates) { mergeAccessorCandidates(result, candidates) })
	if ast.IsCallExpression(node) || ast.IsNewExpression(node) {
		if ast.IsNewExpression(node) && query.operation != nil {
			result.thenIncomplete = result.thenIncomplete || query.unaccountedConstruction(node, bindings, result)
		}
		func() {
			previous := query.returnObservation
			defer func() { query.returnObservation = previous }()
			if query.operation != nil && inputs != nil && inputs.declaration == declaration {
				query.returnObservation = &sourceReturnObservation{owner: declaration, reader: node, frame: inputs, receipts: result.nativeCalls, normalCalls: result.normalCalls}
			}
			mergeAccessorCandidates(result, query.invocation(node, bindings))
		}()
	}
	if view := query.propertyView(); view != nil && view.converting != nil && query.operation != nil && inputs != nil && ast.IsAssignmentExpression(node, false) {
		mutation := planMutationOperation(node)
		if mutation.target != nil && ast.IsIdentifier(mutation.target) {
			symbol := query.owner.checker.GetSymbolAtLocation(mutation.target)
			if symbol == nil || symbol.ValueDeclaration == nil || enclosingCallableNode(symbol.ValueDeclaration) != declaration {
				// A nonscalar foreign Put during a real converter Get may expose
				// its receiver through an alias. This refuses precision, it does
				// not assert that the assignment mutated any prototype.
				if !query.primitiveSettlementValue(unwrapSourceCallableReference(node.AsBinaryExpression().Right)) {
					result.opaque = true
					view.converting.residualMutation = true
				}
			}
		}
	}
	if _, dependent := describeNormalOperand(node); !dependent {
		query.consumeLexicalWrite(node, bindings, result, inputs)
	}
	if target, operation := stateWriteTarget(node, query.owner.checker); operation != "" {
		root, path := effectArgumentRoot(target)
		captureOwner := declaration
		boundReceiver := invocation != nil || inputs != nil && inputs.get != nil
		if boundReceiver {
			captureOwner = nil
		}
		captured := ast.IsIdentifier(root) && (sourceCapturedParameter(root, captureOwner, query.owner.checker, map[ast.SymbolId]bool{}) || sourcePatternParameter(root, query.owner.checker))
		if len(path) > 0 && (captured || boundReceiver && root != nil && root.Kind == ast.KindThisKeyword) {
			// Resolve the actual written receiver before appending its leaf. This
			// shares object-copy and rest-array projection without forwarding a
			// whole rest container as though it were one of its nested values.
			receiver, _ := accessorReceiver(unwrapSourceCallableReference(target))
			values := query.origins(receiver, bindings, result)
			for _, value := range values {
				value.path = append(append([]string{}, value.path...), path[len(path)-1])
				result.writes = append(result.writes, sourceValueWrite{value: value, operation: stateEffectOperation(operation)})
				query.recordFacts(1)
			}
		}
	}
}

// afterRead excludes work that cannot change a value already acquired or read in
// the same callable. Cross-callable timing remains unproved in this finite relation.
func (query *sourceValueQuery) afterRead(node *ast.Node) bool {
	at := query.initializing
	if at == nil {
		at = query.returning
	}
	if at == nil {
		at = query.reading
	}
	return at != nil && ast.GetSourceFileOfNode(node) == ast.GetSourceFileOfNode(at) && enclosingCallableNode(node) == enclosingCallableNode(at) && node.Pos() >= at.Pos()
}

// sourceAlias preserves known definition identity without expanding an intermediate
// module implementation. Transitive identity also requires selected dependency ownership.
func (query *sourceValueQuery) sourceAlias(symbol *ast.Symbol, result *accessorCandidates) *ast.Symbol {
	resolved := query.owner.checker.GetAliasedSymbol(symbol)
	if resolved == nil || resolved.ValueDeclaration == nil || ast.GetSourceFileOfNode(resolved.ValueDeclaration).IsDeclarationFile {
		return resolved
	}
	for _, declaration := range symbol.Declarations {
		for parent := declaration; parent != nil && query.charge(result, parent); parent = parent.Parent {
			if !ast.IsImportDeclaration(parent) {
				continue
			}
			module := query.owner.checker.GetSymbolAtLocation(parent.AsImportDeclaration().ModuleSpecifier)
			if module != nil {
				for _, selected := range module.Declarations {
					if ast.IsSourceFile(selected) && selected != ast.GetSourceFileOfNode(resolved.ValueDeclaration).AsNode() && !query.selectedAliasProvenance(parent, module, symbol, resolved, result) {
						result.opaque = true
						result.cause = parent
					}
				}
			}
			break
		}
	}
	return resolved
}

// namespaceCallable follows an actual module export binding, never an object
// property's compatible type. Executable selection remains authoritative.
func (query *sourceValueQuery) namespaceCallable(symbol *ast.Symbol, path []string, result *accessorCandidates) (*ast.Node, []string) {
	if symbol == nil || len(path) == 0 {
		return nil, path
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.owner.checker.GetAliasedSymbol(symbol)
	}
	if symbol == nil || symbol.Flags&ast.SymbolFlagsModule == 0 {
		return nil, path
	}
	for _, exported := range query.owner.checker.GetExportsOfModule(symbol) {
		if !query.charge(result, nil) {
			return nil, path
		}
		if exported.Name != path[0] {
			continue
		}
		if selected, owned := query.executable.symbol(exported, make(map[ast.SymbolId]bool)); owned {
			result.selected = true
			if selected == nil {
				result.opaque = true
				return nil, path
			}
			exported = selected
		}
		exported = sourceCallableSymbol(exported, query.owner.checker)
		if exported == nil {
			return nil, path
		}
		declaration := exported.ValueDeclaration
		if declaration != nil && ast.IsVariableDeclaration(declaration) {
			declaration = unwrapSourceCallableReference(declaration.Initializer())
		}
		if declaration != nil && ast.IsFunctionLike(declaration) && declaration.Body() != nil && !ast.GetSourceFileOfNode(declaration).IsDeclarationFile {
			// Resolving an export keeps its body, but does not account for work in
			// an intervening module. Match the named-import immediate-edge refusal.
			for _, selected := range symbol.Declarations {
				if ast.IsSourceFile(selected) && selected != ast.GetSourceFileOfNode(declaration).AsNode() {
					result.opaque = true
					result.cause = selected
				}
			}
			return declaration, path[1:]
		}
	}
	return nil, path
}

// appendSourceValueWrites keeps possible writes visible while closure lowering remains blocked.
// Relative capture roots are materialized only against the actual caller, with no new receiver kind.
func appendSourceValueWrites(fact *callableFacts, candidates accessorCandidates, c *checker.Checker) {
	parameters := parameterStateSymbols(fact.node, c)
	for _, write := range candidates.writes {
		var root *ast.Node
		var path []string
		if write.value.node != nil {
			root, path = immutableEffectArgumentRoot(write.value.node, c, map[ast.SymbolId]bool{})
		}
		path = append(path, write.value.path...)
		source := "unknown"
		index := 0
		if root != nil && root.Kind == ast.KindThisKeyword {
			source = "component"
		}
		if root != nil && ast.IsIdentifier(root) {
			if symbol := c.GetSymbolAtLocation(root); symbol != nil {
				if i, ok := parameters[ast.GetSymbolId(symbol)]; ok {
					source = "parameter"
					index = i
				}
			}
		}
		effect := StateEffect{Path: strings.Join(path, "."), pathSegments: path, Kind: "write", Confidence: "unknown", Operation: write.operation, Receiver: &StateReceiver{Kind: "parameter", Root: "value"}}
		effect = bindStateEffect(effect, ReceiverBinding{Source: source, SourceParameterIndex: index})
		fact.directWrites = append(fact.directWrites, effect)
		fact.directOwnedScalarBlocked = true
	}
}

// sourceCapturedParameter distinguishes lexical receiver demands from an ordinary callee's
// own parameter effects, which already belong to the existing effect graph.
func sourceCapturedParameter(root, callable *ast.Node, c *checker.Checker, seen map[ast.SymbolId]bool) bool {
	symbol := c.GetSymbolAtLocation(root)
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return false
	}
	seen[ast.GetSymbolId(symbol)] = true
	for _, declaration := range symbol.Declarations {
		if ast.IsParameterDeclaration(declaration) {
			return enclosingCallableNode(declaration) != callable
		}
		if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil {
			base, _ := effectArgumentRoot(declaration.Initializer())
			if ast.IsIdentifier(base) {
				return sourceCapturedParameter(base, callable, c, seen)
			}
		}
	}
	return false
}

// sourcePatternParameter identifies names whose input projection was composed by bindPattern.
// The ordinary parameter-effect graph indexes whole identifier formals only.
func sourcePatternParameter(root *ast.Node, c *checker.Checker) bool {
	symbol := c.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if !ast.IsBindingElement(declaration) {
			continue
		}
		for ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration) {
			declaration = declaration.Parent
		}
		if ast.IsParameterDeclaration(declaration) {
			return true
		}
	}
	return false
}

// recordFacts reports candidates, substitutions and writes per root, including rest members.
// Its peak counts these recorded facts, not every transient projection or Go heap allocation.
func (query *sourceValueQuery) recordFacts(count int) {
	query.facts += count
	query.owner.provenanceFacts += count
	if query.facts > query.owner.peakProducedFacts {
		query.owner.peakProducedFacts = query.facts
	}
}

// charge records advisory root cost across substitution copies and relation scans.
// It does not refuse analysis. Static indexes and templates separately account
// for their single generation-owned source walk.
func (query *sourceValueQuery) charge(result *accessorCandidates, cause *ast.Node) bool {

	query.remaining--
	query.recordEstimatedCost(1)
	query.owner.work++
	return true
}

// callDeclarations is the shared executable/symbol candidate owner for direct source
// calls. Authored signatures remain untouched and a missing selected body stays opaque.
func (query *sourceValueQuery) callDeclarations(expression *ast.Node, result *accessorCandidates) []*ast.Node {
	if body, selected := query.executable.body(expression); selected {
		result.selected = true
		if body == nil {
			result.opaque = true
			return nil
		}
		return []*ast.Node{body}
	}
	if symbol := resolvedCallableSymbol(callTargetSymbol(expression, query.owner.checker), query.owner.checker); symbol != nil {
		return symbol.Declarations
	}
	return nil
}
