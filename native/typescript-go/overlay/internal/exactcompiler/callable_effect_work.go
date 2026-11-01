package exactcompiler

import (
	"fmt"
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
			reads:       stateEffectSetSignature(fact.summary.StateReads),
			writes:      stateEffectSetSignature(fact.summary.StateWrites),
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

// State effects are unordered obligations. Compare full member identities without mutating
// their retained order or removing duplicates. Paths keep structured property boundaries,
// and unknown confidence and receiver ownership remain distinct during convergence.
func stateEffectSetSignature(values []StateEffect) string {
	keys := make([]string, 0, len(values))
	for _, effect := range values {
		receiverKind, receiverRoot, receiverIndex := "", "", 0
		if effect.Receiver != nil {
			receiverKind, receiverRoot, receiverIndex = effect.Receiver.Kind, effect.Receiver.Root, effect.Receiver.Index
		}
		keys = append(keys, arrayRootProofSignature(effect.ArrayRoots)+fmt.Sprintf("%q:%q:%q:%q:%q:%t:%q:%d:%q",
			effect.Kind, effect.Path, stateEffectPathKey(effect), effect.Confidence, effect.Operation,
			effect.Receiver != nil, receiverKind, receiverIndex, receiverRoot))
	}
	sort.Strings(keys)
	return strings.Join(keys, "\n")
}
