package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceObservedValue retains one return occurrence's original installed scope.
// It supplies an origin family, not a descriptor, confinement or execution proof.
// Object settlement and transfers must be closed before a member consumer can
// use this family. No AST identity can discharge those separate obligations.
type sourceObservedValue struct {
	value    sourceValue
	inputs   *sourceValueInputs
	scope    acquiredCallableScope
	returned *ast.Node
}

// sourceEffectAccounting describes ownership of already retained effects, not
// their neutrality or completion. The zero/legacy state grants no accounting.
type sourceEffectAccounting uint8

const (
	sourceEffectsUnaccounted sourceEffectAccounting = iota
	sourceEffectsAccounted
	sourceEffectsRefused
	sourceEffectsBypassed
	// The actual child-task edge owns Effects, never a normal output or entry.
	sourceEffectsTaskOwned
)

type sourceResultObservation struct {
	componentRefs []*ownedGetContribution
	ownedGets     []*ownedGetPopulation

	owned      *languageReceipt
	values     []sourceObservedValue
	incomplete bool
	effects    sourceEffectAccounting
}

// sourceSuccessfulProjection is assessed by the existing selected source
// completion owner. It excludes execution/normal authority. An absent assessment
// cannot be interpreted as an abrupt argument or an empty successful result.
type sourceSuccessfulProjection struct {
	assessed, successful, unknown bool
}

// sourceProjectionDemand separates observing provenance from reusing the output
// of an actual execution producer. Its zero value requires execution accounting.
// Neither demand discharges independently retained effect causes.
type sourceProjectionDemand uint8

const (
	sourceExecutionOutput sourceProjectionDemand = iota
	sourceValueProjection
)

// retainResultUncertainty transfers values only. Execution reuse requires the
// original producer's accounting. Provenance projection never owned execution,
// so missing execution proof is not a new effect obligation for that demand.
func retainResultUncertainty(observed sourceResultObservation, result *accessorCandidates, demand sourceProjectionDemand) {
	if observed.effects == sourceEffectsBypassed {
		return
	}
	result.valueIncomplete = result.valueIncomplete || observed.incomplete
	result.opaque = result.opaque || demand != sourceValueProjection && observed.effects != sourceEffectsAccounted
}

// sourceInvocationResult is conditional output of one actual installed ordinary
// alternative. Raw and post-assimilation domains remain separate.
// Cached callable facts must clear it before publication. Selection cannot create it.
type sourceInvocationResult struct {
	operation, owner, declaration *ast.Node
	// frame is compared only during this construction, never read to borrow scope
	// and never retained in cached facts. Separate executions cannot share a receipt.
	frame        *sourceValueInputs
	async        bool
	construction bool
	entered      bool
	raw          sourceResultObservation
	fulfilled    sourceResultObservation
}

// ordinaryResultCategory is shared by source result consumers. Both generator
// categories return iterators. Their body/default effect graph stays unchanged.
func ordinaryResultCategory(declaration *ast.Node) (async, ordinary bool) {
	if declaration == nil || !ast.IsFunctionLike(declaration) || declaration.Body() == nil {
		return false, false
	}
	if ast.IsFunctionDeclaration(declaration) && declaration.AsFunctionDeclaration().AsteriskToken != nil || ast.IsFunctionExpression(declaration) && declaration.AsFunctionExpression().AsteriskToken != nil || ast.IsMethodDeclaration(declaration) && declaration.AsMethodDeclaration().AsteriskToken != nil {
		return false, false
	}
	return ast.HasSyntacticModifier(declaration, ast.ModifierFlagsAsync), true
}

// observeInstalledGetResults consumes this accessor input plan and normal return
// completion. It reuses acquired direct-return Gets, never successful await values.
// No object confinement, arbitrary thenable execution or task lifetime is granted.
func (query *sourceValueQuery) observeInstalledGetResults(body *ast.Node, inputs *sourceValueInputs, observed *sourceResultObservation, obligations *accessorCandidates) {
	if observeOwnedStorage(body, inputs, observed) {
		return
	}
	defer func() { *observed = query.sealInitializerObservation(*observed, obligations) }()
	async, ordinary := ordinaryResultCategory(body)
	if !ordinary || query.active[body] {
		observed.incomplete = true
		return
	}
	if async {
		// An async descriptor getter returns its raw result, not the record
		// returned by its body. This effect-only consumer keeps it unknown.
		observed.incomplete = true
		return
	}

	priorActive, hadActive := query.active[body]
	query.active[body] = true
	defer func() {
		if hadActive {
			query.active[body] = priorActive
		} else {
			delete(query.active, body)
		}
	}()
	previousInputs, previousReturn, previousInvocation := query.inputs, query.returning, query.invoking
	previousCreators := query.creators
	query.inputs, query.invoking = inputs, inputs.invocation
	query.creators = make(map[*ast.Node]sourceValueCreation, len(previousCreators)+1)
	for owner, creator := range previousCreators {
		if !query.charge(obligations, owner) {
			observed.incomplete = true
			break
		}
		query.creators[owner] = creator
	}
	defer func() {
		query.inputs, query.returning, query.invoking, query.creators = previousInputs, previousReturn, previousInvocation, previousCreators
	}()
	previousObservation := query.returnObservation
	defer func() { query.returnObservation = previousObservation }()
	query.consumeSuccessfulCompletions(body, inputs.bindings, observed, obligations, func(site, expression *ast.Node) {
		query.returnObservation = &sourceReturnObservation{kind: sourceRawNormalResult, owner: body, reader: site, frame: inputs, receipts: obligations.nativeCalls, normalCalls: obligations.normalCalls}
		query.returning = expression
		query.creators[body] = sourceValueCreation{invocation: inputs.invocation, returning: expression}
		appendValue := func(value sourceValue) {
			observed.values = append(observed.values, sourceObservedValue{value: value, inputs: inputs, scope: query.acquireCallableScope(inputs.bindings, obligations), returned: site})
		}
		if expression == nil {
			appendValue(sourceValue{undefined: true})
			return
		}
		acquired := false
		for _, get := range inputs.returnedGets {
			acquired = appendReturnedGetObservation(site, get, query.owner.language, observed) || acquired
		}

		if acquired {
			return
		}
		operand, transfers := query.normalResultValueOperand(expression, obligations)
		if operand != nil && ast.IsCallExpression(operand) {
			produced, found := query.acquireNormalCallResult(operand, obligations)
			if found {
				observed.incomplete = observed.incomplete || produced.incomplete
				for _, value := range produced.values {
					value.value.forwarded = query.forwardingTrace(obligations, value.value.forwarded, transfers)
					observed.values = append(observed.values, value)
				}
				return
			}
		}
		alternatives := query.acquireReturnAlternatives(operand, body, inputs)
		appendContributionRefs(&observed.componentRefs, candidateContributionReferences(alternatives))
		mergeOwnedGets(&observed.ownedGets, alternatives.ownedGets)
		observed.incomplete = observed.incomplete || len(alternatives.values) == 0 || alternatives.valueIncomplete || alternatives.receiverIncomplete
		mergeAccessorCandidates(obligations, alternatives)
		for i, value := range alternatives.values {
			if value.ownedGetRow != nil {
				observed.values = append(observed.values, sourceObservedValue{value: value})
				continue
			}
			value.forwarded = query.forwardingTrace(obligations, value.forwarded, transfers)
			if value.acquired != nil {
				original := *value.acquired
				original.value = value
				observed.values = append(observed.values, original)
				continue
			}
			scope, present := alternatives.callableScopes[i]
			if !present {
				scope = query.acquireCallableScope(inputs.bindings, obligations)
			}
			observed.values = append(observed.values, sourceObservedValue{value: value, inputs: inputs, scope: scope, returned: site})
		}
	})
}

// acquireReturnAlternatives uses the existing charged alternative acquisition
// under this installed return occurrence. It can read admitted output only.
// Missing Get/Call receipts constrain values without replaying a producer, and
// original acquired tuples stay paired instead of borrowing this consumer scope.
func (query *sourceValueQuery) acquireReturnAlternatives(value, body *ast.Node, inputs *sourceValueInputs) accessorCandidates {
	context := query.returnObservation
	if inputs == nil || inputs.declaration != body || query.inputs != inputs || context == nil || context.owner != body || context.frame != inputs {
		return accessorCandidates{valueIncomplete: true}
	}
	previous := query.operation
	query.operation = &sourceOperationContext{node: value, owner: body, inputs: inputs, outputOnly: true}
	defer func() { query.operation = previous }()
	return query.accessors(value, nil, "", accessorAcquire, inputs.bindings, nil)
}

// consumeSuccessfulCompletions is the shared successful-return projection. It is not
// an expression evaluator. Throw/rejection supplies no undefined alternative, and
// the existing structured completion owner accounts for replacing finalizers.
func (query *sourceValueQuery) consumeSuccessfulCompletions(body *ast.Node, bindings sourceValueBindings, observed *sourceResultObservation, obligations *accessorCandidates, consume func(*ast.Node, *ast.Node)) sourceSuccessfulProjection {
	if body == nil || !ast.IsFunctionLike(body) || body.Body() == nil {
		return sourceSuccessfulProjection{}
	}
	outcomes := sourceReturnValue
	if ast.IsBlock(body.Body()) {
		outcomes = query.completionFor(body.Body(), bindings, true).outcomes
	}
	observed.incomplete = observed.incomplete || outcomes&sourceReturnUnknown != 0
	assessment := sourceSuccessfulProjection{assessed: true, successful: outcomes&(sourceReturnNormal|sourceReturnValue) != 0, unknown: observed.incomplete || outcomes == 0}
	if outcomes&sourceReturnNormal != 0 {
		consume(nil, nil)
	}
	for _, site := range query.owner.summary(body).returnSites {
		if !query.charge(obligations, site) {
			observed.incomplete = true
			assessment.unknown = true
			return assessment
		}
		possible, _ := query.reachable(site, bindings)
		if !possible || !query.returnCompletesFor(site, bindings, true) {
			continue
		}
		expression := site
		if ast.IsReturnStatement(site) {
			expression = site.AsReturnStatement().Expression
		}
		consume(site, expression)
	}
	return assessment
}

// acquireNormalCallResult consumes the actual normal producer's detached result.
// It neither rebinds arguments/defaults nor executes the body/Get a second time.
// Input instance matching excludes another call or a generic indexed selection.
func (query *sourceValueQuery) acquireNormalCallResult(call *ast.Node, obligations *accessorCandidates) (observed sourceResultObservation, found bool) {
	defer func() {

	}()
	context := query.returnObservation
	if context == nil || context.frame == nil || context.frame != query.inputs {
		return observed, false
	}
	// Native source operations publish through their own actual normal slot,
	// without claiming an entered source body or a Promise/constructor receipt.
	if slot := query.normalOperation(call, false); slot != nil && slot.state == sourceOperationConsumed && slot.authority.valid(query) && slot.authority.generation != nil && slot.authority.generation.active && slot.population == context.frame.population && context.frame.operationLifetime != nil && (context.owner == context.frame.declaration || slot.entry != nil && context.owner == slot.entry.statement) && slot.output.effects != sourceEffectsUnaccounted {
		return normalGetOutput(slot), true
	}
	for _, receipt := range context.normalCalls {
		if !query.charge(obligations, call) {
			observed.incomplete = true
			return observed, found
		}
		if receipt.operation != call || receipt.owner != context.owner || receipt.frame != context.frame {
			continue
		}
		found = true
		if receipt.raw.effects == sourceEffectsTaskOwned && !receipt.entered && context.frame.operationLifetime != nil && query.owner.erasedTaskPolicyParameter(receipt.declaration) != nil {
			retained, exhausted := query.retainsTaskCallEffect(receipt, obligations)
			if exhausted {
				observed.effects = sourceEffectsRefused
				return observed, found
			}
			if retained && (observed.effects == sourceEffectsUnaccounted || observed.effects == sourceEffectsTaskOwned) {
				observed.effects = sourceEffectsTaskOwned
			} else {
				observed.effects = sourceEffectsRefused
			}
		} else if receipt.raw.effects != sourceEffectsAccounted || !receipt.entered && !receipt.construction || observed.effects == sourceEffectsTaskOwned {
			observed.effects = sourceEffectsRefused
		} else if observed.effects != sourceEffectsRefused {
			observed.effects = sourceEffectsAccounted
		}
		observed.incomplete = observed.incomplete || receipt.raw.incomplete || !receipt.entered && !receipt.construction
		if receipt.async {
			if receipt.entered {
				value := sourceValue{node: call, native: &sourceNativeValue{kind: sourceNativeAsyncFacade, acquired: call, async: receipt}}
				observed.values = append(observed.values, sourceObservedValue{value: value, inputs: query.inputs, scope: query.acquireCallableScope(query.inputs.bindings, obligations)})
			}
			continue
		}
		for _, value := range receipt.raw.values {
			if !query.charge(obligations, call) {
				observed.incomplete = true
				return observed, found
			}
			value.scope = query.copyCallableScope(value.scope, obligations)
			observed.values = append(observed.values, value)
		}
	}
	for _, receipt := range context.receipts {
		if !query.charge(obligations, call) {
			observed.incomplete = true
			break
		}
		if receipt.operation != call || receipt.owner != context.owner || receipt.frame != context.frame {
			continue
		}
		found = true
		observed.effects = sourceEffectsRefused
		observed.incomplete = observed.incomplete || receipt.incomplete
		facade := sourceValue{node: call, native: &sourceNativeValue{kind: sourceNativePromiseFacade, acquired: call, resolve: receipt}}
		observed.values = append(observed.values, sourceObservedValue{value: facade, inputs: query.inputs, scope: query.copyCallableScope(receipt.scope, obligations)})
	}

	return observed, found
}

// retainsTaskCallEffect checks the original child's retained dependency, never
// reconstructing it from a task marker. A direct collector publishes a Call's
// edges before the later operand consumer receives its receipts-only accumulator.
// Read that same live fact when the edge has already left the local accumulator.
func (query *sourceValueQuery) retainsTaskCallEffect(receipt *sourceInvocationResult, obligations *accessorCandidates) (retained, exhausted bool) {
	for _, edge := range obligations.effects {
		if !query.charge(obligations, receipt.operation) {
			return false, true
		}
		if edge.operation == receipt.operation && edge.declaration == receipt.declaration {
			return true, false
		}
	}
	frame := query.inputs
	if frame == nil || frame != receipt.frame || frame.operationLifetime == nil || frame.declaration != receipt.owner || query.effectOwner != receipt.owner || query.executable == nil || query.executable.values != query.owner || query.owner.program == nil || query.owner.generation == nil || !query.owner.generation.active || query.executable.project == nil || query.executable.project.program != query.owner.program || query.executable.project.activeGeneration != query.owner.generation || query.executable.checker != query.owner.checker {
		return false, false
	}
	fact := frame.ownedFact
	publisher := query.executable.pendingMemberPublishers[receipt.owner]
	if fact == nil || fact.node != receipt.owner || fact.normalInputs != frame || publisher == nil || !publisher.live || publisher.fact != fact {
		return false, false
	}
	source := ast.GetSourceFileOfNode(receipt.declaration)
	if source == nil || query.owner.program.GetSourceFile(source.FileName()) != source {
		return false, false
	}
	target := fmt.Sprintf("callable:%s:%d", source.FileName(), receipt.declaration.Pos())
	for _, edge := range fact.summary.Calls {
		if !query.charge(obligations, receipt.operation) {
			return false, true
		}
		if edge.Resolved && edge.TargetID == target && fact.fieldEdgeOperations[edge.ID] == receipt.operation {
			return true, false
		}
	}
	return false, false
}

// invocationValueConsumed describes a normal operation's value use, not a
// precision whitelist. Discarded values do not demand returned Get acquisition.
func (query *sourceValueQuery) invocationValueConsumed(call *ast.Node, obligations *accessorCandidates) bool {
	outer := query.envelopeOuterExpression(call, obligations)
	if outer == nil || outer.Parent == nil {
		return false
	}
	parent := outer.Parent
	if ast.IsExpressionStatement(parent) || ast.IsVoidExpression(parent) {
		return false
	}
	return !ast.IsBinaryExpression(parent) || parent.AsBinaryExpression().OperatorToken.Kind != ast.KindCommaToken || parent.AsBinaryExpression().Left != outer
}

// normalResultValueOperand projects an already owned normal expression result.
// It performs no Get, default, PutValue or body work. Assignment publication is
// carried with the value and remains subject to the complete lifetime inventory.
func (query *sourceValueQuery) normalResultValueOperand(expression *ast.Node, obligations *accessorCandidates) (*ast.Node, []*ast.Node) {
	var transfers []*ast.Node
	for expression != nil {
		if !query.charge(obligations, expression) {
			return nil, nil
		}
		expression = unwrapSourceCallableReference(expression)
		if !ast.IsBinaryExpression(expression) {
			return expression, transfers
		}
		binary := expression.AsBinaryExpression()
		if binary.OperatorToken.Kind != ast.KindEqualsToken && binary.OperatorToken.Kind != ast.KindCommaToken {
			return expression, transfers
		}
		if binary.OperatorToken.Kind == ast.KindEqualsToken {
			target := planMutationOperation(expression).target
			if target == nil || !query.charge(obligations, target) {
				return nil, nil
			}
			transfers = append(transfers, expression, target)
		}
		expression = binary.Right
	}
	return nil, transfers
}

// appendReturnedGetObservation transfers only this exact return site's cached
// population. Rowless completions precede value projection and never acquire a
// scope or restart the producing getter. It creates no receipt or occurrence.
func appendReturnedGetObservation(site *ast.Node, get sourceGetReturn, owner *languageOwner, observed *sourceResultObservation) bool {
	if get.site != site {
		return false
	}
	appendContributionRefs(&observed.componentRefs, get.componentRefs)
	mergeOwnedGets(&observed.ownedGets, get.ownedGets)
	if values, ok := projectReturnedPrimitive(get, owner); ok {
		observed.incomplete = observed.incomplete || len(values) == 0
		observed.values = append(observed.values, values...)
	} else {
		observed.values = append(observed.values, get.values...)
	}
	observed.incomplete = observed.incomplete || get.incomplete
	return true
}
