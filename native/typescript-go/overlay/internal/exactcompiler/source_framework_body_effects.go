package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceBodyEffectsObservation borrows the installed dependency-only binder only
// until the original publisher returns. It is neither candidate payload nor a
// cached descriptor: no frame, callback or accounting outcome enters facts.
// The detached field record still carries every original fulfilled/unfulfilled
// outcome; accounting it cannot change one of those dispositions.
type sourceBodyEffectsObservation struct {
	sourceGet  *sourceGetInputs // borrowed exact SOURCE Get binder, stack-only; no normal Get receipt
	inputs     *sourceValueInputs
	call       sourceFieldCall
	consumer   *ast.Node
	generation *projectGeneration
	cut        sourceRelativeCut
}

// frameworkSourceBodyAccounting is a stack-local aggregate of actual source
// producer callbacks. Pointer equality associates the binder that this traversal
// already returned; it grants no input value or subsequent acquisition right.
type frameworkSourceBodyAccounting struct {
	consumer, operation, declaration *ast.Node
	generation                       *projectGeneration
	observed                         []sourceBodyEffectsObservation
}

func (a *frameworkSourceBodyAccounting) observe(o sourceBodyEffectsObservation) {
	a.observed = append(a.observed, o)
}

// represented accounts source relationships only after the original appender
// has retained their exact outcomes. Canonical MAY-summary subscribers remain
// separately mandatory, including every unresolved Get/Call contribution.
// Normal construction, mixed/unmatched records and foreign cuts stay pending.
func (a *frameworkSourceBodyAccounting) represented(c accessorCandidates, fact *callableFacts) bool {
	if fact == nil || fact.node != a.consumer || a.generation == nil {
		return false
	}
	root := false
	for _, o := range a.observed {
		for _, call := range c.fieldCalls {
			root = root || a.owns(o) && sameFrameworkSourceBodyRecord(call, o.call) && containsFrameworkSourceInput(c.inputs, o.inputs)
		}
	}
	body := false
	for _, effect := range c.effects {
		body = body || effect.operation == a.operation && effect.declaration == a.declaration
	}
	if !root || !body {
		return false
	}
	for _, input := range c.inputs {
		matched := false
		for _, o := range a.observed {
			if input == o.inputs && a.owns(o) {
				matched = true
			}
		}
		if !matched {
			return false
		}
	}
	for _, call := range c.fieldCalls {
		matched := false
		for _, o := range a.observed {
			if a.owns(o) && sameFrameworkSourceBodyRecord(call, o.call) && containsFrameworkSourceInput(c.inputs, o.inputs) {
				matched = true
			}
		}
		if !matched {
			return false
		}
		published := false
		for _, retained := range fact.fieldCalls {
			if sameFrameworkSourceBodyRecord(call, retained) {
				published = true
			}
		}
		if !published {
			return false
		}
		for _, outcome := range call.calls {
			retained := false
			for _, actual := range fact.callOutcomes {
				retained = retained || actual == outcome
			}
			if !retained {
				return false
			}
		}
	}
	return true
}

func (a *frameworkSourceBodyAccounting) owns(o sourceBodyEffectsObservation) bool {
	// This is the maintained newSourceDependencyQuery boundary, restored after
	// its installed body: no caller input frame, initializer or invocation is
	// installed on that original publisher. Other contexts remain unmigrated.
	expected := sourceRelativeCut{operation: a.operation, reading: a.operation}
	return o.consumer == a.consumer && o.generation == a.generation && o.cut == expected &&
		o.inputs != nil && !o.inputs.deferredBody && o.inputs.storage == nil && o.inputs.operationLifetime == nil && o.inputs.population == nil && o.inputs.consumedCall == nil && o.inputs.fulfilled == nil && o.inputs.get == nil && o.inputs.declaration == o.call.target && o.inputs.invocation == o.call.operation &&
		o.call.operation == a.operation && o.call.target == a.declaration && o.call.target != nil && o.call.dependencies && o.call.complete &&
		o.call.descriptorOccurrence == nil && len(o.call.descriptorEffects) == 0
}

func sameFrameworkSourceBodyRecord(a, b sourceFieldCall) bool {
	if a.operation != b.operation || a.target != b.target || !a.dependencies || !b.dependencies || !a.complete || !b.complete || a.descriptorOccurrence != nil || b.descriptorOccurrence != nil || len(a.descriptorEffects)+len(b.descriptorEffects) != 0 || len(a.outcomes) != len(b.outcomes) || len(a.calls) != len(b.calls) {
		return false
	}
	for i, outcome := range a.outcomes {
		if outcome != b.outcomes[i] {
			return false
		}
	}
	for i, outcome := range a.calls {
		if outcome != b.calls[i] {
			return false
		}
	}
	return true
}

func containsFrameworkSourceInput(inputs []*sourceValueInputs, installed *sourceValueInputs) bool {
	for _, input := range inputs {
		if input == installed {
			return true
		}
	}
	return false
}
