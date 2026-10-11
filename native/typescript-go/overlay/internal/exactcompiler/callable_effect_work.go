package exactcompiler

import (
	"sort"
	"strings"
)

// callableEffectWork schedules only callers whose inputs changed. Ascending passes retain
// the original solver's traversal order, including cycle widening and path tie breaking.
// Opaque effects and prior summary signatures remain immutable between input changes.
type callableEffectWork struct {
	dirty      []bool
	callers    [][]int
	opaque     [][]StateEffect
	signatures []callableEffectSignatures
}

type callableEffectSignatures struct {
	environment, reads, writes, contexts string
}

func newCallableEffectWork(facts []callableFacts) callableEffectWork {
	work := callableEffectWork{
		dirty: make([]bool, len(facts)), callers: make([][]int, len(facts)),
		opaque: make([][]StateEffect, len(facts)), signatures: make([]callableEffectSignatures, len(facts)),
	}
	for index := range facts {
		fact := &facts[index]
		work.dirty[index] = true
		work.opaque[index] = opaqueCallStateEffects(fact)
		work.signatures[index] = callableEffectSignatures{
			environment: environmentSourcesSignature(fact.summary.EffectSources),
			reads:       stateEffectsSignature(fact.summary.StateReads),
			writes:      stateEffectsSignature(fact.summary.StateWrites),
			contexts:    contextEffectSetSignature(fact.summary.Contexts),
		}
		for _, target := range fact.targets {
			if !facts[target].progressReceiver {
				work.callers[target] = append(work.callers[target], index)
			}
		}
	}
	return work
}

// Context effects describe a set of capabilities. Recursive callers can reorder the same
// set indefinitely, so convergence compares canonical membership without changing emission order.
func contextEffectSetSignature(values []ContextEffect) string {
	if len(values) < 2 {
		return contextEffectsSignature(values)
	}
	ordered := append([]ContextEffect(nil), values...)
	sort.Slice(ordered, func(left, right int) bool {
		a, b := ordered[left], ordered[right]
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		if a.Token != b.Token {
			return a.Token < b.Token
		}
		return strings.Compare(a.Confidence, b.Confidence) < 0
	})
	return contextEffectsSignature(ordered)
}
