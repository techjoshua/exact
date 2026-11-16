package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func relativeInvokedEffect(demand sourceRelativeInvokedInput, owner string) EnvironmentEffectSource {
	effect := environmentSource("unknown", "invoked callable input", owner)
	effect.Opaque, effect.provenanceIncomplete = true, true
	effect.relativeInput = &demand
	// Legacy actual consumers may still satisfy the original Call's exact
	// contextual obligation. No outcome or completion receipt is fabricated.
	effect.callOrigin = &sourceCallOutcome{declaration: enclosingCallableNode(demand.origin), operation: demand.origin, dependencies: true}
	return effect
}

func relativeInvokedSourceIdentity(source EnvironmentEffectSource) string {
	if source.relativeInput == nil {
		return ""
	}
	demand := source.relativeInput
	return fmt.Sprintf(":relative-input:%d:%d:%p:%d:%p:%t:%p:%p:%p:%p:%p", demand.kind, demand.role.kind, demand.role.declaration, demand.role.slot, demand.role.binding, demand.role.lexical, demand.origin, demand.cut.reading, demand.cut.initializing, demand.cut.returning, demand.cut.invoking)
}

type sourceRelativeCallSubscriber struct {
	getterReader *sourceStagedOperationRequest // Exact original Get source input owner.
	caller       int
	id           string
	call         sourceStagedDeclarationCall
	returned     *sourceStagedReturnedInvocation
}

type sourceRelativeInvocationDelta struct {
	mutation   *sourceRelativeFieldMutation // Explicit SOURCE operator; never an invoked role.
	producer   int
	demand     sourceRelativeInvokedInput
	subscriber *sourceRelativeCallSubscriber // A late subscriber receives only prior source demands.
}

// prepareRelativeInvocations is a phase of the existing callable effect work,
// before ordinary SCC/effect propagation. Its atoms are (declaration/formal,
// original invoked Call), not activation contexts or acquired query results.
// Each atom is delivered once to each registered declaration Call subscriber.
// The initial domain has zero invocation actuals and an empty projection, so no
// recursive path concatenation or rest/capture cross-product is generated.
func (work *callableEffectWork) prepareRelativeInvocations(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil {
		return
	}
	work.prepareRelativeSetEffects(facts, owner)
	work.prepareBindingInvocations(facts, owner)
	// Every canonical mutation-transfer table is reset and rebuilt below. This
	// clock only invalidates graph-local DATA retry bookkeeping.
	work.mutationTransferGeneration++
	nodes := make(map[*ast.Node]int, len(facts))
	ids := make([]map[string]bool, len(facts))
	for index := range facts {
		nodes[facts[index].node] = index
		ids[index] = make(map[string]bool, len(facts[index].summary.Calls))
		for _, edge := range facts[index].summary.Calls {
			ids[index][edge.ID] = true
		}
		facts[index].staged.transfers = nil
		facts[index].staged.mutationTransfers = nil
	}
	subscribers := make([][]sourceRelativeCallSubscriber, len(facts))
	for caller := range facts {
		for _, call := range facts[caller].staged.calls {
			producer, found := nodes[call.invocation.declaration]
			if !found || call.legacyInputs || call.sourceInputs == nil && (call.inputs == nil || !call.inputs.delivered || call.inputs.relative.unsupported != relativeInputsSupported) {
				continue
			}
			id := stagedDeclarationCallEdge(facts[caller].summary.ID, call.invocation)
			work.requireStagedSummary(facts, caller, producer, id, call.invocation.operation, call.invocation.cut)
			if call.inputConsumerWait != nil {
				continue // Retain the callee debt; no relative transfer from DEFER.
			}
			subscribers[producer] = append(subscribers[producer], sourceRelativeCallSubscriber{caller: caller, id: id, call: call})
		}
	}
	// Only an actual selected Get with its detached B/C input association may
	// subscribe to the getter's invoked capture roles. Declaration availability
	// is deliberately absent from this loop. It uses the same required edge.
	for index := 1; index < len(work.operations); index++ {
		for _, getter := range work.operations[index].getters {
			if getter.inputs == nil || !getter.inputs.delivered || !getter.bodyTransferred || getter.inputs.relative.unsupported != relativeInputsSupported {
				continue
			}
			producer := nodes[getter.declaration]
			caller := nodes[getter.demand.request.consumer]
			call := sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: getter.inputs.request, inputs: getter.inputs}
			reader := getter.demand.request
			subscribers[producer] = append(subscribers[producer], sourceRelativeCallSubscriber{caller: caller, id: getter.edge, call: call, getterReader: &reader})
		}
	}
	for index := 1; index < len(work.operations); index++ {
		source := work.operationRecipes[work.operations[index].key].writer
		if source == nil || !source.callable {
			continue
		}
		for _, method := range work.operations[index].writerMethods {
			if method.inputs == nil || !method.inputs.delivered || !method.transferred || !method.inputsMapped {
				continue
			}
			call := sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: method.inputs.request, inputs: method.inputs}
			subscribers[nodes[method.declaration]] = append(subscribers[nodes[method.declaration]], sourceRelativeCallSubscriber{caller: nodes[source.request.consumer], id: method.edge, call: call})
		}
	}
	for caller := range facts {
		for i := range facts[caller].staged.returnedInvocations {
			returned := &facts[caller].staged.returnedInvocations[i]
			producer, found := nodes[returned.alternative.endpoint.expression]
			if !found {
				facts[caller].staged.operationsPending = true
				continue
			}
			id := fmt.Sprintf("%s:operation-invoked:%d:%s", facts[caller].summary.ID, returned.later.operation.Pos(), facts[producer].summary.ID)
			work.requireStagedSummary(facts, caller, producer, id, returned.later.operation, returned.later.cut)
			subscribers[producer] = append(subscribers[producer], sourceRelativeCallSubscriber{caller: caller, id: id, call: sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: returned.later}, returned: returned})
		}
	}
	seen := make([]map[sourceRelativeInvokedInput]bool, len(facts))
	var queue []sourceRelativeInvocationDelta
	add := func(producer int, demand sourceRelativeInvokedInput) {
		if seen[producer] == nil {
			seen[producer] = make(map[sourceRelativeInvokedInput]bool)
		}
		if seen[producer][demand] {
			return
		}
		seen[producer][demand] = true
		queue = append(queue, sourceRelativeInvocationDelta{producer: producer, demand: demand})
	}
	mutationSeen := make(map[string]bool)
	for producer := range facts {
		for _, effect := range facts[producer].summary.DirectEffectSources {
			if effect.relativeMutation != nil {
				key := fmt.Sprintf("%d:%s", producer, relativeFieldMutationIdentity(effect.relativeMutation))
				if !mutationSeen[key] {
					mutationSeen[key] = true
					queue = append(queue, sourceRelativeInvocationDelta{producer: producer, mutation: cloneRelativeFieldMutation(effect.relativeMutation)})
				}
			}
		}
	}
	for producer := range facts {
		for _, demand := range facts[producer].staged.invoked {
			add(producer, demand)
		}
	}
	// DATA may reveal a returned closure after its source demand was visited.
	// Deliver those prior atoms to this exact new subscriber on the same queue;
	// future atoms still use the normal declaration subscriber list.
	processed := make([][]sourceRelativeInvokedInput, len(facts))
	processedMutations := make([][]*sourceRelativeFieldMutation, len(facts))
	lateSubscribers := make(map[string]bool)
	subscribeReturned := func(producer int, subscriber sourceRelativeCallSubscriber) {
		returned := subscriber.returned
		key := fmt.Sprintf("%d:%s:%p:%p", subscriber.caller, subscriber.id, returned.alternative.creating, returned.alternative.endpoint.returning)
		if lateSubscribers[key] {
			return
		}
		lateSubscribers[key] = true
		subscribers[producer] = append(subscribers[producer], subscriber)
		for _, demand := range processed[producer] {
			copy := subscriber
			queue = append(queue, sourceRelativeInvocationDelta{producer: producer, demand: demand, subscriber: &copy})
		}

		for _, mutation := range processedMutations[producer] {
			copy := subscriber
			queue = append(queue, sourceRelativeInvocationDelta{producer: producer, mutation: cloneRelativeFieldMutation(mutation), subscriber: &copy})
		}
	}
	for head := 0; head < len(queue); head++ {
		delta := queue[head]
		if delta.mutation != nil {
			if delta.subscriber == nil {
				processedMutations[delta.producer] = append(processedMutations[delta.producer], cloneRelativeFieldMutation(delta.mutation))
			}
			current := subscribers[delta.producer]
			if delta.subscriber != nil {
				current = []sourceRelativeCallSubscriber{*delta.subscriber}
			}
			for _, subscriber := range current {
				transferred, represented := work.transferRelativeFieldMutation(facts, subscriber, delta.mutation, owner)
				caller := &facts[subscriber.caller]
				if !represented {
					caller.staged.operationsPending = true
				}
				if caller.staged.mutationTransfers == nil {
					caller.staged.mutationTransfers = make(map[string]map[string]sourceRelativeMutationTransfer)
				}
				if caller.staged.mutationTransfers[subscriber.id] == nil {
					caller.staged.mutationTransfers[subscriber.id] = make(map[string]sourceRelativeMutationTransfer)
				}
				transfer := sourceRelativeMutationTransfer{field: delta.mutation.field, generation: relativeMutationTransferGeneration(delta.mutation), sources: transferred, represented: represented}
				if !represented {
					transfer.pending = cloneRelativeFieldMutation(delta.mutation)
				}
				caller.staged.mutationTransfers[subscriber.id][relativeFieldMutationIdentity(delta.mutation)] = transfer
				for _, effect := range transferred {
					if effect.relativeMutation != nil && !effect.relativeMutation.externalActive {
						work.recordCanonicalMutation(facts, subscriber.caller, effect.relativeMutation)
						key := fmt.Sprintf("%d:%s", subscriber.caller, relativeFieldMutationIdentity(effect.relativeMutation))
						if !mutationSeen[key] {
							mutationSeen[key] = true
							queue = append(queue, sourceRelativeInvocationDelta{producer: subscriber.caller, mutation: cloneRelativeFieldMutation(effect.relativeMutation)})
						}
					}
				}
			}
			continue
		}
		if delta.demand.kind != relativeDemandEffects {
			continue
		}
		current := subscribers[delta.producer]
		if delta.subscriber != nil {
			current = []sourceRelativeCallSubscriber{*delta.subscriber}
		} else {
			processed[delta.producer] = append(processed[delta.producer], delta.demand)
		}
		for _, subscriber := range current {
			caller := &facts[subscriber.caller]
			var plan sourceRelativeInputPlan
			if subscriber.returned != nil {
				plan = planStagedReturnedCaptureInvocation(subscriber.returned.alternative, delta.demand, subscriber.returned.later, owner.values)
			} else if subscriber.call.sourceInputs != nil {
				plan = substituteSourceRelativeInvokedInput(subscriber.call.sourceInputs.bindings, delta.demand.role, nil)
			} else {
				plan = substituteSourceRelativeInvokedInput(subscriber.call.inputs.relative, delta.demand.role, nil)
			}
			if plan.unsupported != relativeInputsSupported {
				if subscriber.returned != nil {
					caller.staged.operationsPending = true
				}
				continue // Explicitly unmigrated input domain, never covered empty.
			}
			var transferred []EnvironmentEffectSource
			pending := false
			unmapped := false
			for _, binding := range plan.bindings {
				unknown := binding.unknown
				type inputSource struct {
					alternative sourceStagedOperationAlternative
					projected   bool
				}
				var sources []inputSource
				for _, endpoint := range binding.sources {
					sources = append(sources, inputSource{alternative: sourceStagedOperationAlternative{endpoint: endpoint}})
				}
				for _, endpoint := range binding.pending {
					projection := work.requireSourceInputProjection(facts, subscriber.caller, subscriber.call, endpoint, owner)
					pending = pending || projection.pending
					unmapped = unmapped || !projection.owned
					for _, alternative := range projection.alternatives {
						sources = append(sources, inputSource{alternative: alternative, projected: true})
					}
				}
				for head := 0; head < len(sources); head++ {
					endpoint := sources[head].alternative.endpoint
					if endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal && endpoint.role.declaration == caller.node {
						demand := delta.demand
						demand.role = endpoint.role
						add(subscriber.caller, demand)
						transferred = append(transferred, relativeInvokedEffect(demand, caller.summary.Name))
						continue
					}
					if endpoint.kind == relativeEndpointUndefined {
						// There is no callable body. Throw/normal completion stays
						// with its operation owner, not this MAY edge.
						continue
					}
					producer, found := nodes[endpoint.expression]
					var returned *sourceStagedReturnedInvocation
					if sources[head].projected {
						mapped := endpoint.kind == relativeEndpointExpression && len(endpoint.projection) == 0 && found
						if mapped && !sourceProjectedCallableInputsMapped(endpoint.expression, owner) {
							// Creating B belongs to this graph's factory source. A
							// copied or stale alternative cannot supply capture inputs.
							mapped = work.currentStagedResultCreating(sources[head].alternative)
							if mapped {
								invocation, captured := sourceProjectedReturnedInvocation(sources[head].alternative, delta.demand, facts[producer].staged.invoked, owner)
								mapped = captured
								if captured {
									returned = &invocation
								}
							}
						}
						if !mapped {
							work.retainSourceInputProjectionGap(facts, subscriber.caller, subscriber.call, endpoint)
							pending, unmapped = true, true
							continue
						}
					} else if endpoint.kind != relativeEndpointExpression || len(endpoint.projection) != 0 || !found || !isWriterInputCallable(endpoint.expression) || endpoint.creation != nil || endpoint.returning != nil {
						if subscriber.call.sourceInputs == nil && endpoint.kind != relativeEndpointResult {
							unknown = true // Existing real-B alternative domain.
							continue
						}
						projection := work.requireSourceInputProjection(facts, subscriber.caller, subscriber.call, endpoint, owner)
						pending = pending || projection.pending
						unmapped = unmapped || !projection.owned
						for _, alternative := range projection.alternatives {
							sources = append(sources, inputSource{alternative: alternative, projected: true})
						}
						continue
					}
					id := fmt.Sprintf("%s:invoked-input:%d:%d:%s", caller.summary.ID, subscriber.call.invocation.operation.Pos(), delta.demand.origin.Pos(), facts[producer].summary.ID)
					work.requireStagedSummary(facts, subscriber.caller, producer, id, delta.demand.origin, delta.demand.cut)
					if returned != nil {
						subscribeReturned(producer, sourceRelativeCallSubscriber{caller: subscriber.caller, id: id, call: sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: returned.later}, returned: returned})
					}
					if !ids[subscriber.caller][id] {
						ids[subscriber.caller][id] = true
						work.operationInvocationOnEdge(facts, subscriber.caller, producer, delta.demand.origin, delta.demand.cut, id)
						caller.summary.Calls[len(caller.summary.Calls)-1].Name = strings.TrimSpace(sourceText(ast.GetSourceFileOfNode(delta.demand.origin), delta.demand.origin))
						if caller.fieldEdgeOperations == nil {
							caller.fieldEdgeOperations = make(map[string]*ast.Node)
						}
						caller.fieldEdgeOperations[id] = delta.demand.origin
					}
				}
				if unknown {
					effect := environmentSource("unknown", "unresolved invoked input alternative", caller.summary.Name)
					effect.Opaque, effect.provenanceIncomplete = true, true
					transferred = append(transferred, effect)
				}
			}
			if pending {
				if subscriber.returned != nil {
					caller.staged.operationsPending = true
				}
				// A registered DATA reading retains producer pending/closure on
				// its typed use. Keep known transfer prefixes without converting
				// the compiler's pending alternative into runtime unknown.
				if unmapped || subscriber.returned != nil {
					continue
				}
			}
			if caller.staged.transfers == nil {
				caller.staged.transfers = make(map[string]map[sourceRelativeInvokedInput][]EnvironmentEffectSource)
			}
			if caller.staged.transfers[subscriber.id] == nil {
				caller.staged.transfers[subscriber.id] = make(map[sourceRelativeInvokedInput][]EnvironmentEffectSource)
			}
			caller.staged.transfers[subscriber.id][delta.demand] = transferred
		}
	}
}

func stagedRelativeInputTransfer(fact *callableFacts, edge CallEdge, source EnvironmentEffectSource) ([]EnvironmentEffectSource, bool) {
	if source.relativeMutation != nil {
		return stagedRelativeMutationTransfer(fact, edge, source)
	}
	if source.relativeInput == nil {
		return nil, false
	}
	byDemand := fact.staged.transfers[edge.ID]
	transferred, found := byDemand[*source.relativeInput]
	return transferred, found
}
