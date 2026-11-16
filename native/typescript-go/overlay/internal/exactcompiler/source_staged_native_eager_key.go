package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// validNativeEagerKeyDescription correlates an original immutable module read
// with a detached, already-issued source factory. It grants no current category,
// key identity or normal result. Selection and lexical binding are authenticated
// by describeNativeEagerKey, not by this structural predicate.
func validNativeEagerKeyDescription(key sourceStagedKeySource, expression *ast.Node) bool {
	binding, p := key.binding, key.producer
	return key.symbol && key.expression == expression && expression != nil && ast.IsIdentifier(expression) && binding != nil && ast.IsVariableDeclaration(binding) && binding.Parent != nil && ast.IsVariableDeclarationList(binding.Parent) && binding.Parent.Flags&ast.NodeFlagsConst != 0 && enclosingCallableNode(binding) == nil && binding.Initializer() == p.use && binding.Pos() < expression.Pos() && ast.GetSourceFileOfNode(binding) == ast.GetSourceFileOfNode(expression) && runtimeModuleEvaluation(p.producer.declaration) && p.consumer == p.producer.declaration && validStagedMemberParent(p) && p.producer.selector == (sourceStagedOperationSelector{})
}

func nativeEagerKeyDescription(source *sourceStagedNativeGetSource, expression *ast.Node) *sourceStagedKeySource {
	if source == nil || !reflectiveNative(source.kind) || len(source.keySources) != 1 {
		return nil
	}
	key := &source.keySources[0]
	if !validNativeEagerKeyDescription(*key, expression) {
		return nil
	}
	return key
}

// describeNativeEagerKey is called only by the live selected eager publisher.
// It never evaluates a binding, issues a Symbol producer, or adopts an input.
// A missing original producer therefore stays unsupported rather than becoming
// a descriptive category or an empty pending operation.
func (work *callableEffectWork) describeNativeEagerKey(source *sourceStagedNativeGetSource, selection sourceStagedNativeSelection, owner *executableBodyOwner) *sourceStagedKeySource {
	if source == nil || !reflectiveNative(source.kind) || !sameOperationRequest(source.request, selection.request) || source.get != selection.get || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || len(selection.actuals) != 3 {
		return nil
	}
	expression := selection.actuals[1].expression
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
		return nil
	}
	binding := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(binding) || binding.Initializer() == nil || !ast.IsCallExpression(binding.Initializer()) {
		return nil
	}
	call := binding.Initializer()
	producer := work.operationRecipes[sourceStagedOperationKey{declaration: sourceStagedModuleOwner(call), operation: call, kind: relativeDemandEffects}]
	if !validNativeGetRecipe(producer) || producer.nativeGet == nil || producer.nativeGet.kind != sourceNativeSymbolFor || producer.key != producer.nativeGet.request.producer {
		return nil
	}
	key := &sourceStagedKeySource{expression: expression, binding: binding, producer: producer.nativeGet.request, symbol: true}
	if !validNativeEagerKeyDescription(*key, expression) {
		return nil
	}
	return key
}

func (work *callableEffectWork) enrollNativeEagerKey(facts []callableFacts, recipe sourceStagedOperationRecipe) {
	source := recipe.nativeGet
	if source == nil || recipe.key != nativeRootDebtRequest(source, "eager-inputs").producer || source.eager == nil || len(source.eager.actuals) != 3 {
		return
	}
	key := nativeEagerKeyDescription(source, source.eager.actuals[1].expression)
	if key == nil {
		return
	}
	r := stagedKeySourceRequest(source, *key)
	producer := work.operationRecipes[r.producer]
	consumer, cok := work.memberNodes[r.consumer]
	module, mok := work.memberNodes[r.producer.declaration]
	if !work.validStagedKeySourceReading(producer, r) || !cok || !mok || consumer < 0 || consumer >= len(facts) || module < 0 || module >= len(facts) || facts[module].sourceFile != ast.GetSourceFileOfNode(key.expression) {
		return
	}
	work.requireSourceModuleAvailability(facts, consumer, module, r.edge+":module", source.request.use, source.request.cut)
}

// nativeEagerKeyCurrent consumes this reader's actual delivered category. Full
// Symbol/Get/ToString Effects remain required even though only category is used.
// No candidate keyExcluded disposition or another reader's ACK is transferable.
func (work *callableEffectWork) nativeEagerKeyCurrent(source *sourceStagedNativeGetSource) bool {
	if source == nil || source.eager == nil || len(source.eager.actuals) != 3 || len(source.keySources) == 0 {
		return source != nil && len(source.keySources) == 0
	}
	key := nativeEagerKeyDescription(source, source.eager.actuals[1].expression)
	if key == nil || !work.nativeSymbolKeyReadingCurrent(stagedKeySourceRequest(source, *key)) {
		return false
	}
	r := stagedKeySourceRequest(source, *key)
	consumer, cok := work.memberNodes[r.consumer]
	module, mok := work.memberNodes[r.producer.declaration]
	if !cok || !mok || module < 0 || module >= len(work.operationFacts) || module >= len(work.stagedRevisions) {
		return false
	}
	d := work.stagedRequired[sourceStagedDependencyKey{consumer: consumer, edge: r.edge + ":module"}]
	return work.operationFacts[module].staged.ready && d != nil && d.producer == module && !d.invalid && !d.projectionPending && d.operation == source.request.use && d.cut == source.request.cut && d.consumed == work.stagedRevisions[module]
}

// nativeSymbolKeyReadingCurrent is shared category consumption, not a source
// issuer. Its caller must first validate its own registered reading association.
func (work *callableEffectWork) nativeSymbolKeyReadingCurrent(r sourceStagedOperationRequest) bool {
	g := work.operationGeneration
	if g == nil || !g.active || g.project == nil || g.project.activeGeneration != g {
		return false
	}
	producer := work.operationRecipes[r.producer]
	proof := work.currentNativeCalleeEffects(producer.nativeGet)
	if !work.validStagedKeySourceReading(producer, r) || proof == nil || !proof.noUserEntry || !work.nativeEffectsGetCurrent(producer.nativeGet) {
		return false
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(producer.nativeGet, "algorithm").producer]
	if !validNativeGetRecipe(algorithm) || algorithm.nativeGet.input == nil || !validStagedNativeInputPlan(*algorithm.nativeGet.input, algorithm.nativeGet) || algorithm.nativeGet.kind != sourceNativeSymbolFor || !algorithm.nativeGet.inputEffects {
		return false
	}
	id := work.operationIDs[r.producer]
	get := work.operationIDs[nativeRootDebtRequest(producer.nativeGet, "callee-get").producer]
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || get.epoch != work.operationEpoch || get.index == 0 || int(get.index) >= len(work.operations) {
		return false
	}
	state, getter := &work.operations[id.index], &work.operations[get.index]
	sub := state.subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}]
	return !state.invalid && !getter.invalid && getter.delta.extracted && getter.revision != 0 && getter.dependenciesRegistered && sub != nil && !sub.blocked && state.revision != 0 && sameOperationRequest(sub.request, r) && sub.applied == state.revision
}

// Module availability is an independent fan-in to the same existing eager task.
func (work *callableEffectWork) afterNativeEagerKeyModule(consumer, producer int, edge string) {
	for key, recipe := range work.operationRecipes {
		source := recipe.nativeGet
		if source == nil || source.eager == nil || key != nativeRootDebtRequest(source, "eager-inputs").producer {
			continue
		}
		for _, k := range source.keySources {
			r := stagedKeySourceRequest(source, k)
			c, cok := work.memberNodes[r.consumer]
			p, pok := work.memberNodes[r.producer.declaration]
			if cok && pok && c == consumer && p == producer && edge == r.edge+":module" {
				work.queueNativeEagerSource(work.operationIDs[key])
				work.notifyNativeEagerInputWaiters(work.operationIDs[key])
			}
		}
	}
}
