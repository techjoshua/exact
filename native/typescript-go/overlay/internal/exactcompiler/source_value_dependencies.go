package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceInvocationDependencies instantiates AST-backed demands at their use point.
// Bindings and creator contexts are query-local. This path publishes dependencies,
// never normal values, storage deltas or permission to enter a precise operation.
func sourceInvocationDependencies(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, delivered ...*sourceRelativeInputEdge) accessorCandidates {
	return sourceInvocationDependenciesAt(node, node, c, owner, consumer, nil, delivered...)
}

// sourceInvocationDependenciesAt retains the caller's observation and acquired
// argument associations when a source consumer enters an instantiated body.
func sourceInvocationDependenciesAt(node, reading *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, inputs *sourceValueInputs, delivered ...*sourceRelativeInputEdge) accessorCandidates {
	return sourceInvocationDependenciesWithBodyEffects(node, reading, c, owner, consumer, inputs, nil, delivered...)
}

// sourceInvocationDependenciesWithBodyEffects observes the installed source-only
// binder at its original producer. The callback never enters a prepared cache.
func sourceInvocationDependenciesWithBodyEffects(node, reading *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, inputs *sourceValueInputs, observe func(sourceBodyEffectsObservation), delivered ...*sourceRelativeInputEdge) accessorCandidates {
	return sourceInvocationDependenciesObserved(node, reading, c, owner, consumer, inputs, sourceEffectsObserver{body: observe}, delivered...)
}

func sourceInvocationDependenciesObserved(node, reading *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, inputs *sourceValueInputs, observe sourceEffectsObserver, delivered ...*sourceRelativeInputEdge) accessorCandidates {
	query := newSourceDependencyQuery(reading, c, owner, consumer)
	observe.issuer = query
	query.sourceEffects = observe
	defer func() { query.sourceEffects = sourceEffectsObserver{} }()
	query.dependencyUse = node
	defer query.publishDependencyStatistics()
	var bindings sourceValueBindings
	if inputs != nil {
		bindings = inputs.bindings
		query.creators = inputs.dependencyScope.creators
		query.invoking = inputs.invocation
		query.dependencyUse = inputs.dependencyUse
	}

	// Borrow the binder already owned by this original input consumer. No
	// second input acquisition or caller scope is constructed for the graph.
	if inputs == nil && len(delivered) == 1 && delivered[0] != nil && !delivered[0].delivered && delivered[0].request.operation == node {
		request := cloneStagedWriterInvocation(delivered[0].request)
		request.use, request.cut = query.effectUse(), query.relativeInputCut(node)
		if revoke, installed := query.beginSourceRelativeInputRequest(request, delivered[0]); installed {
			defer revoke()
		}
	}
	progressFrontier(query, query.dependencyUse, 0)
	return query.invocation(node, bindings)
}

// newSourceDependencyQuery owns an uncached source relationship traversal.
func newSourceDependencyQuery(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node) *sourceValueQuery {
	var values *sourceValueOwner
	if owner != nil && owner.values != nil {
		// Share checker-owned templates and indexes. The dependency query
		// keeps its own statistics, initializer history and invocation inputs.
		prior := owner.values
		values = &sourceValueOwner{
			checker: c, program: prior.program, generation: prior.generation,
			language: prior.language, components: prior.components,
			indexes: prior.indexes, summaries: prior.summaries,
		}
	} else {
		values = newSourceValueOwner(c)
	}
	query := &sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, reading: node, dependenciesOnly: true, remaining: 4096, active: make(map[*ast.Node]bool), dependencyUse: node}
	if owner != nil {
		query.dependencyStatsOwner = owner.values
	}
	query.installedMemberIssuer = query
	progressOpenRoot(query)
	return query
}

// sourceMemberDependencies analyzes the original member operation independently
// of optional acquired-value refinement. Unknown receiver effects remain explicit.
func sourceMemberDependencies(node *ast.Node, c *checker.Checker, owner *executableBodyOwner, consumer *ast.Node, bindings sourceValueBindings) accessorCandidates {
	query := newSourceDependencyQuery(node, c, owner, consumer)
	defer query.publishDependencyStatistics()
	progressFrontier(query, query.dependencyUse, 0)
	return query.evaluatedSourceAccessors(node, bindings)
}

// refineSourceDependencies adds source effect contributions without replacing
// normal outputs or residuals. Only matching contextual field/Call outcomes resolve classified
// return-output gaps at the owning effect boundary. Unclassified causes survive.
func refineSourceDependencies(precise accessorCandidates, summary func() accessorCandidates) accessorCandidates {
	needsSummary := precise.opaque || precise.valueIncomplete || precise.receiverIncomplete || precise.fieldReceiverIncomplete || len(precise.fieldFallbacks) > 0 || len(precise.callFallbacks) > 0
	for _, call := range precise.fieldCalls {
		needsSummary = needsSummary || !call.complete
		for _, outcome := range call.outcomes {
			needsSummary = needsSummary || !outcome.fulfilled
		}
		for _, outcome := range call.calls {
			needsSummary = needsSummary || !outcome.complete
		}
	}
	if !needsSummary {
		return precise
	}
	contribution := summary()
	// This projection excludes values, frames, acquisition rights and outputs.
	// Known donors and each structured residual remain independently represented.
	effects := candidatePublisherPayload(contribution)
	mergeAccessorCandidates(&precise, effects)
	precise.producers = append(precise.producers, contribution.producers...)
	precise.inputs = append(precise.inputs, contribution.inputs...)
	return precise
}

// publishDependencyStatistics returns advisory counters to the checker owner.
// No scope, binding, acquisition result or current-write decision is retained.
func (query *sourceValueQuery) publishDependencyStatistics() {
	progressCloseRoot(query)
	parent := query.dependencyStatsOwner
	if parent == nil || parent == query.owner {
		return
	}
	query.dependencyStatsOwner = nil
	child := query.owner
	parent.work = estimatedCostSum(parent.work, child.work)
	parent.candidates = estimatedCostSum(parent.candidates, child.candidates)
	parent.substitutions = estimatedCostSum(parent.substitutions, child.substitutions)
	parent.widenings = estimatedCostSum(parent.widenings, child.widenings)
	parent.indexWork = estimatedCostSum(parent.indexWork, child.indexWork)
	parent.summaryWork = estimatedCostSum(parent.summaryWork, child.summaryWork)
	parent.provenanceFacts = estimatedCostSum(parent.provenanceFacts, child.provenanceFacts)
	parent.argumentOriginWork = estimatedCostSum(parent.argumentOriginWork, child.argumentOriginWork)
	parent.interferenceWork = estimatedCostSum(parent.interferenceWork, child.interferenceWork)
	parent.maxTerms = max(parent.maxTerms, child.maxTerms)
	parent.peakProducedFacts = max(parent.peakProducedFacts, child.peakProducedFacts)
	parent.estimatedCostMaximum = max(parent.estimatedCostMaximum, child.estimatedCostMaximum)
}

// sourceValueRefinementRequired identifies actual acquired-output consumers.
// Ordinary synchronous effects and returned capture relationships do not request
// normal execution. Static getter-chain elision and async settlement still do.
func sourceValueRefinementRequired(fact *callableFacts, owner *sourceValueOwner) bool {
	if fact.initializerPlan != nil {
		return true
	}
	if async, ordinary := ordinaryResultCategory(fact.node); async && ordinary {
		return true
	}
	for _, demand := range owner.summary(fact.node).normal {
		if demand.operand != nil && demand.operand.await {
			return true
		}
	}
	return false
}

// constructDependencyEffects retains known constructor bodies and existing host
// contracts without acquiring an instance. Unmodeled alternatives remain opaque.
func (query *sourceValueQuery) constructDependencyEffects(site *ast.Node, bindings sourceValueBindings) accessorCandidates {
	// Finite native Intl construction already has a portable operation contract.
	// Keep the original operand walk, but do not require a source body or instance
	// output merely to retain its Effects. Authored/dynamic inputs keep fallback.
	if _, arguments, native := nativeIntlConstructor(site, query.owner.checker); native &&
		standardLibraryCallRoot(site.Expression(), query.owner.checker) && finiteIntlArguments(arguments) {
		return accessorCandidates{valueIncomplete: true}
	}
	result := query.promiseConstruction(site, bindings)
	if len(result.effects) > 0 || result.opaque {
		return result
	}
	expression := site.AsNewExpression().Expression
	selected := query.selectSourceConstruction(site, bindings, &result)
	query.publishStandardConstruction(site, bindings, selected)
	query.retainSelectedConstructionDependencies(site, selected, &result)
	if len(selected.declarations) > 0 || selected.base.selected || selected.base.invocationOwned {
		// The selected body/field dependency consumer accounts construction
		// effects. Missing an exact instance output supplies no extra opacity.
		// Unselected constructor alternatives remain independent operations.
		result.valueIncomplete = true
		result.opaque = result.opaque || len(selected.declarations) == 0 || selected.base.valueIncomplete
		return result
	}
	values := query.originsAt(expression, site, bindings, &result)
	if len(values) == 0 {
		result.opaque = true
	}
	for _, value := range values {
		target := value.node
		// Acquisition retains the genuine standard constructor declaration for
		// source-member publication. Its declaration is not a source body. Keep
		// the existing host-effect classifier's identifier input instead of
		// mistaking this representation change for an opaque constructor.
		if value.native != nil && value.native.kind == sourceNativeWeakMapConstructor && len(value.path) == 0 {
			if _, kind := query.nativeRootDeclaration(target); kind == sourceNativeWeakMapConstructor {
				target = target.Name()
			}
		}
		if target == nil || len(value.path) > 0 {
			result.opaque = true
			continue
		}
		if ast.IsIdentifier(target) {
			environment := unresolvedCallEnvironment(target, ast.GetSourceFileOfNode(target), query.owner.checker, nil)
			if environment == "unknown" {
				result.opaque = true
			} else if environment != "" && environment != "neutral" {
				result.environmentEffects = append(result.environmentEffects, environmentSource(environment, sourceText(ast.GetSourceFileOfNode(target), target), "constructor"))
			}
		} else {
			result.opaque = true
		}
	}
	result.valueIncomplete = true
	return result
}

// sourceCreatorValue compares a returned allocation's creating source context.
// The same return AST from another factory use does not identify this binding.
func (query *sourceValueQuery) sourceCreatorValue(value sourceValue, owner, creator *ast.Node) bool {
	if len(value.path) != 0 {
		return false
	}
	if value.node == creator {
		return true
	}
	return value.capture != nil && value.capture.creators[owner].invocation == creator
}

// consumeSourceBodyEffects records coverage of one instantiated body's demands.
// Calls and accessor reads use the same operation identity and alternative law.
// The record accounts effects without granting a normal output or execution receipt.
func (query *sourceValueQuery) consumeSourceBodyEffects(operation, body *ast.Node, bindings sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) bool {
	firstField, firstCall := len(result.fieldOutcomes), len(result.callOutcomes)
	firstInput := len(result.inputs)
	enumerated := query.executeInputs(body, bindings, result, invocation, inputs)
	var outcomes []sourceFieldOutcome
	for _, outcome := range result.fieldOutcomes[firstField:] {
		if outcome.demand.declaration == body {
			outcomes = append(outcomes, outcome)
		}
	}
	var calls []sourceCallOutcome
	for _, outcome := range result.callOutcomes[firstCall:] {
		if outcome.declaration == body {
			calls = append(calls, outcome)
		}
	}
	call := sourceFieldCall{operation: operation, target: body, outcomes: outcomes, calls: calls, complete: enumerated && !result.thenIncomplete, dependencies: true}
	result.fieldCalls = append(result.fieldCalls, call)
	if query.dependenciesOnly && query.sourceEffects.body != nil {
		for _, installed := range result.inputs[firstInput:] {
			if installed != nil && installed.declaration == body {
				sourceGet := query.installedSourceGetterObservation(body, operation, installed)
				if installed.invocation == operation || sourceGet != nil {
					query.sourceEffects.body(sourceBodyEffectsObservation{sourceGet: sourceGet, inputs: installed, call: call, consumer: query.effectOwner, generation: query.owner.generation, cut: query.relativeInputCut(operation)})
				}
			}
		}
	}
	return enumerated
}
