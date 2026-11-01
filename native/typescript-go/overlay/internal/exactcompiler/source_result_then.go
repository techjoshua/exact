package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceThenSelection separates a single Get's effects from whether its value is
// noncallable. It is not a Promise method or post-Get lifetime model.
type sourceThenSelection struct {
	effects     accessorCandidates
	noncallable bool
}

func (query *sourceValueQuery) settlementThen(get *sourceGetInputs, bindings sourceValueBindings, references []sourceThenReference, incomplete bool) sourceThenSelection {
	selected := sourceThenSelection{}
	value := get.receiver.node
	own, getter, setter := false, false, false
	for _, field := range value.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(&selected.effects, field) {
			return selected
		}
		if field.Name() != nil && callableNameText(field.Name()) == "then" {
			own = true
			getter = getter || ast.IsGetAccessorDeclaration(field)
			setter = setter || ast.IsSetAccessorDeclaration(field)
		}
	}
	if own || !get.freshReturn {
		summary := sourceOwnEffectSummary{}
		previousSummary := get.effectSummary
		get.effectSummary = &summary
		defer func() { get.effectSummary = previousSummary; summary.populations = nil }()
		get.thenReferences, get.thenIncomplete = references, incomplete
		selected.effects = query.accessorsAtGet(value, []string{"then"}, "", accessorAcquire, bindings, nil, get)
		// A setter-only own slot masks the prototype and reads as undefined.
		if setter && !getter && get.freshReturn && len(selected.effects.values) == 0 {
			selected.effects.values = append(selected.effects.values, sourceValue{undefined: true})
		}
		selected.noncallable = !selected.effects.opaque && sourceThenValuesNoncallable(selected.effects.values)
		retainCallableThenEffects(&selected.effects, get.operation, summary.populations...)
		return selected
	}
	populations := query.inheritedThenValues(get, bindings, references, incomplete, &selected.effects)
	selected.noncallable = !selected.effects.opaque && sourceThenValuesNoncallable(selected.effects.values)
	retainCallableThenEffects(&selected.effects, get.operation, populations...)
	return selected
}

// inheritedThenValues consumes this Get's descriptor alternatives at its actual
// prototype fallthrough. A nonfresh receiver keeps uncertainty and cannot gain
// a successful-value or no-escape proof from a noncallable getter return.
func (query *sourceValueQuery) inheritedThenValues(get *sourceGetInputs, bindings sourceValueBindings, references []sourceThenReference, incomplete bool, effects *accessorCandidates) (populations []paidMayPopulation) {
	effects.opaque = effects.opaque || incomplete || !get.freshReturn
	if get.freshReturn {
		effects.values = append(effects.values, sourceValue{undefined: true})
	}
	for _, reference := range references {
		if !query.charge(effects, reference.operation) {
			return populations
		}
		effects.opaque = effects.opaque || reference.uncertain
		if reference.descriptor == nil {
			effects.opaque = true
			continue
		}
		if !ast.IsObjectLiteralExpression(reference.descriptor) {
			effects.opaque = true
			continue
		}
		for _, field := range reference.descriptor.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(effects, field) {
				return populations
			}
			if field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || !ast.IsPropertyAssignment(field) && !ast.IsMethodDeclaration(field) {
				effects.opaque = true
				continue
			}
			name := callableNameText(field.Name())
			if name == "value" && ast.IsPropertyAssignment(field) {
				previous := query.creators
				query.creators = reference.scope.creators
				terms := query.originsAt(field.Initializer(), reference.operation, reference.scope.bindings, effects)
				query.creators = previous
				effects.values = append(effects.values, terms...)
				if len(terms) == 0 {
					effects.opaque = true
				}
			}
			if name != "get" {
				continue
			}
			body := field
			if ast.IsPropertyAssignment(field) {
				body = unwrapSourceCallableReference(field.Initializer())
			}
			if body == nil || !ast.IsFunctionLike(body) || body.Body() == nil {
				effects.opaque = true
				continue
			}
			observed := query.acquireGetResult(body, get, reference.scope, effects)
			effects.opaque = effects.opaque || observed.incomplete
			population := paidMayPopulation{start: len(effects.values), receipt: importPaidGetterMayObservation(query.owner.language, observed)}
			for _, term := range observed.values {
				effects.values = append(effects.values, term.value)
			}
			population.end = len(effects.values)
			populations = append(populations, population)
		}
	}
	return populations
}

func sourceThenValuesNoncallable(values []sourceValue) bool {
	if len(values) == 0 {
		return false
	}
	for _, value := range values {
		if value.undefined || value.copied != nil || value.rest != nil {
			continue
		}
		if value.node == nil || len(value.path) != 0 || !sourcePrimitiveValue(value.node) && !ast.IsObjectLiteralExpression(value.node) && !ast.IsArrayLiteralExpression(value.node) {
			return false
		}
	}
	return true
}

// Known callable then alternatives retain their existing conservative body facts.
// No resolver arguments, settlement value or actual execution are fabricated.
func retainCallableThenEffects(result *accessorCandidates, operation *ast.Node, populations ...paidMayPopulation) {
	for i, value := range result.values {
		imported := false
		for populationIndex := range populations {
			p := populations[populationIndex]
			donor, claimed := p.donorAt(i)
			if !claimed {
				continue
			}
			imported = true
			if donor != nil {
				result.retainCallableEffect(operation, donor)
			}
			break
		}
		if imported {
			continue
		}
		if value.node != nil && len(value.path) == 0 && ast.IsFunctionLike(value.node) && value.node.Body() != nil {
			result.retainCallableEffect(operation, value.node)
		}
	}
}
