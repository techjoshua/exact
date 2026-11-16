package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedFieldDispositionKind describes original Has/Get effect extraction,
// not a field value, property descriptor, normal completion or NoWrites proof.
// Getter extraction still requires the independently mapped body/receiver edge.
type sourceStagedFieldDispositionKind uint8

const (
	stagedFieldDispositionUnknown sourceStagedFieldDispositionKind = iota
	stagedFieldDispositionAbsent
	stagedFieldDispositionData
	stagedFieldDispositionGetter
	stagedFieldDispositionSources
)

// sourceStagedFieldDisposition is a detached original semantic-owner payload.
// The scoped publisher authenticates its issuer and live cut separately from the
// graph's required request. Matching these fields alone supplies no authority.
// Unknown retains known invocation associations without certifying empty work.
// No query, normal frame, acquired value or graph admission callback is retained.
type sourceStagedFieldDisposition struct {
	terminal            sourceStagedFieldTerminal // Original Finished snapshot only; not empty membership or currency.
	operation, receiver *ast.Node
	field               string
	cut                 sourceRelativeCut
	has, get            sourceEffectAccounting
	kind                sourceStagedFieldDispositionKind
	invoked             []sourceStagedOperationInvocation
}

// sourceStagedFieldObservation belongs to one original source Has/Get traversal.
// Central installs its exact pointer on the scoped field borrow. Only semantic
// owner hooks contribute accounting. The phase prevents nested or later Gets
// from completing this observation. It never enters a recipe or subscriber.
type sourceStagedFieldObservation struct {
	hasTraversal, getTraversal sourceStagedTraversalTerminal
	getBypassed                bool // Set only by the original accounted-absent Has branch.
	presence                   sourcePropertyPresence
	effects                    sourceReflectiveFieldEffects
	hasSeen, getSeen           bool
	sourceHas, sourceGet       bool // original source-role coverage, never selected presence or Value
	phase                      sourceStagedFieldObservationPhase
}

// sourceStagedFieldObservationPhase separates the original ordered Has and Get.
// The zero value has not run. A finished observation cannot be reused as a lease.
type sourceStagedFieldObservationPhase uint8

const (
	stagedFieldObservationUnstarted sourceStagedFieldObservationPhase = iota
	stagedFieldObservationHas
	stagedFieldObservationGet
	stagedFieldObservationFinished
)

// classifyStagedFieldDisposition projects explicit original Has/Get accounting
// into an Effects-only disposition. Presence must come from the Has owner. A
// bypassed Get is absence only after a positive absent Has, never after an empty
// acquisition or unresolved lookup. Accounted data/getter reads are independent
// of optional value output and runtime normal/abrupt completion. This pure
// classifier neither authenticates those observations nor settles dependencies.
func classifyStagedFieldDisposition(presence sourcePropertyPresence, effects sourceReflectiveFieldEffects) sourceStagedFieldDispositionKind {
	if effects.has != sourceEffectsAccounted {
		return stagedFieldDispositionUnknown
	}
	if presence == propertyAbsent {
		if effects.get == sourceEffectsBypassed && !effects.getter {
			return stagedFieldDispositionAbsent
		}
		return stagedFieldDispositionUnknown
	}
	if effects.get != sourceEffectsAccounted {
		return stagedFieldDispositionUnknown
	}
	if effects.getter {
		return stagedFieldDispositionGetter
	}
	return stagedFieldDispositionData
}

// observeStagedFieldHas consumes an explicit outcome of the original Has owner.
// Refused/unknown branches are sticky for this observation. Another positive
// branch cannot erase them, and joining presence never invents an absent result.
func (query *sourceValueQuery) observeStagedFieldHas(get *sourceGetInputs, presence sourcePropertyPresence, accounting sourceEffectAccounting, observation *sourceStagedFieldObservation) {
	if observation == nil || observation.phase != stagedFieldObservationHas || get == nil || !get.hasOnly || !query.liveStagedFieldGet(get) || get.stagedEffects.observation != observation {
		return
	}
	if !observation.hasSeen {
		observation.presence = presence
		observation.effects.has = accounting
	} else {
		if observation.presence != presence {
			observation.presence = propertyUnknown
		}
		if observation.effects.has != sourceEffectsAccounted || accounting != sourceEffectsAccounted {
			observation.effects.has = sourceEffectsUnaccounted
		}
	}
	observation.hasSeen = true
	if publisher := get.stagedEffects.mutationHas; publisher != nil {
		publisher(query, get, observation)
	}
}

// observeStagedFieldRead records a terminal data/getter selection at the actual
// source Get. It never projects or counts returned values. Known invoked bodies
// survive refused siblings. Body/capture/receiver transport remains independent
// work of the existing original binder and central summary consumer.
func (query *sourceValueQuery) observeStagedFieldRead(get *sourceGetInputs, getter *ast.Node, accounting sourceEffectAccounting, observation *sourceStagedFieldObservation) {
	if observation == nil || observation.phase != stagedFieldObservationGet || get == nil || get.hasOnly || !query.liveStagedFieldGet(get) || get.stagedEffects.observation != observation {
		return
	}
	if !observation.getSeen {
		observation.effects.get = accounting
	} else if observation.effects.get != sourceEffectsAccounted || accounting != sourceEffectsAccounted {
		observation.effects.get = sourceEffectsUnaccounted
	}
	observation.getSeen = true
	if getter != nil {
		observation.effects.getter = true
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.receiver.node, producer: get.operation, get: get.receiver.node, cut: query.relativeInputCut(get.operation)}
		observation.effects.invoked = append(observation.effects.invoked, sourceStagedOperationInvocation{declaration: getter, operation: get.operation, alternative: sourceStagedOperationAlternative{endpoint: endpoint}})
	}
}
