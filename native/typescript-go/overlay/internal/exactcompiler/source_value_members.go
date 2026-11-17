package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
)

// occurrenceOrigins resolves finite projected import/alias values for receiver
// matching. A matching parent keeps its relative path, so matching a nested write
// cannot reacquire that same parent while its value is being acquired. Other member
// acquisitions retain Get effects, but never invoke their bodies
// or upgrades a matching declaration into a completed mutation certificate.
func (query *sourceValueQuery) occurrenceOrigins(node, at, origin *ast.Node, bindings sourceValueBindings, result *accessorCandidates, receivers ...sourceValue) []sourceValue {
	origins := query.originsAt(node, at, bindings, result)
	// The input outer vector is owned; nested source payloads retain their ownership.
	// A changed result gets separate storage so expansion cannot overwrite input.
	var values []sourceValue
	changed := false
	for i, value := range origins {
		// A live instance projection without its actual field Get output is not
		// another opportunity to reacquire that same constructing receiver.
		if value.instance != nil && len(value.path) != 0 {
			result.opaque, result.valueIncomplete = true, true
			if !changed {
				values = append(values, origins[:i]...)
				changed = true
			}
			continue
		}
		// The same completed factory occurrence can name its directly returned
		// object without reacquiring all of that object's members or getters.
		originalNode := value.node
		if len(value.path) == 0 {
			for _, creator := range query.creators {
				if creator.invocation == value.node && creator.returning == origin {
					value.node = origin
				}
			}
		}
		relativeReceiver := false
		for _, receiver := range receivers {
			relativeReceiver = relativeReceiver || receiver.node != nil && value.node == receiver.node && len(receiver.path) == 0
		}
		direct := relativeReceiver || value.node == origin || len(value.path) == 0 || value.node != nil && value.node.Kind == ast.KindThisKeyword || sourceFunctionPrototype(value, query.owner.checker)
		if !changed && (!direct || value.node != originalNode) {
			values = append(values, origins[:i]...)
			changed = true
		}
		if direct {
			if changed {
				values = append(values, value)
			}
			continue
		}
		acquired := query.accessors(value.node, value.path, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(result, acquired)
		values = append(values, acquired.values...)
	}
	if !changed && len(origins) != 0 {
		return origins
	}
	return values
}

// occurrenceSourceView visits only the defining source and actual acquisition,
// receiving and return occurrences already owned by this query. Indexes are not
// merged, and positions in different sources never establish execution order.
func (query *sourceValueQuery) occurrenceSourceView(origin *ast.Node, result *accessorCandidates, storage []sourceValueIndex) []sourceValueIndex {
	return query.occurrenceSourceViewIn(origin, result, nil, storage)
}

// occurrenceSourceViewIn adds only explicitly selected dependency indexes. Their
// references still pass the ordinary occurrence and write-producer checks. All
// index values are copied before a consumer runs, including incomplete or not-yet
// import-prepared entries. Storage belongs to this caller until consumption ends.
// Additional sources grow the slice normally, without imposing a source limit.
func (query *sourceValueQuery) occurrenceSourceViewIn(origin *ast.Node, result *accessorCandidates, selected []*ast.SourceFile, storage []sourceValueIndex) []sourceValueIndex {
	var sources []*ast.SourceFile
	indexes := storage[:0]
	for _, node := range []*ast.Node{origin, query.initializing, query.reading, query.returning} {
		if node == nil || !query.charge(result, node) {
			continue
		}
		source := ast.GetSourceFileOfNode(node)
		if source == nil {
			continue
		}
		found := false
		for _, previous := range sources {
			found = found || previous == source
		}
		if !found {
			sources = append(sources, source)
			indexes = append(indexes, query.owner.index(source))
		}
	}

	for _, source := range selected {
		if source == nil || !query.charge(result, source.AsNode()) {
			continue
		}
		found := false
		for _, previous := range sources {
			found = found || previous == source
		}
		if !found {
			sources = append(sources, source)
			indexes = append(indexes, query.owner.index(source))
		}
	}
	return indexes
}

// memberValuesAtGet supplies the selected operation's actual receiver to the
// existing descriptor owner. Inherited lookup origin and receiver are distinct.
// Alternatives include their source capture, which must survive the next visitor.
func (query *sourceValueQuery) memberValuesAtGet(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue), operation sourceMemberOperationProof, get *sourceGetInputs, cuts ...*sourceMemberWriterReadCut) bool {
	return query.memberValuesAtGetWithStandard(origin, projection, name, mode, bindings, result, visit, operation, get, nil, cuts...)
}

// memberValuesAtGetWithStandard retains a conditional standard alternative while
// indexed own writers keep their original inputs, captures and descriptor paths.
// Unfinished interference remains unknown. The candidate cannot close that debt,
// prove a replacement or supply any normal-operation authority.
func (query *sourceValueQuery) memberValuesAtGetWithStandard(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(sourceValue), operation sourceMemberOperationProof, get *sourceGetInputs, standard *sourceValue, cuts ...*sourceMemberWriterReadCut) bool {
	// Publish the conditional source branch and required debts before inventory.
	// This leaves the original Get, writers and every authored sibling intact.
	query.publishStagedNativeGetSource(get, standard, projection, name, bindings)
	var cut *sourceMemberWriterReadCut
	if len(cuts) > 0 {
		cut = cuts[0]
	}
	if cut == nil {
		cut = query.memberWriterReadCut(nil, bindings, result, get)
	}
	restoreReader := query.memberWriterRead(get, cut)
	defer restoreReader()
	restoreEntrySource := query.beginNativeEntryMemberGet(get, cut, mode)
	defer restoreEntrySource()
	restoreMemberSource := query.enterStagedMemberSource(get, cut, result)
	defer restoreMemberSource()
	returned := func() bool {
		var sourceIndexes [4]sourceValueIndex
		var indexes []sourceValueIndex
		sourceInterval := query.liveStagedMemberSource(query.stagedMember, get, cut)
		if sourceInterval {
			if query.liveStagedFieldMemberSource(get) {
				selected, complete := query.stagedFieldDiscoverySources(get)
				query.stagedMember.represented = query.stagedMember.represented && complete
				for _, source := range selected {
					operation.sources = append(operation.sources, source.source)
				}
			}
			indexes = query.occurrenceSourceViewIn(origin, result, operation.sources, sourceIndexes[:0])
			query.prepareStagedMemberSources(get, cut, origin, projection, name, mode, indexes, result, standard)
			query.publishOriginalGetMutationSource(get, cut, mode, origin, projection, name, standard)
			query.acquireConstructedCoverageReceiver(get, cut, mode, result)
			if query.transferStagedMapMemberEffects(origin, get, cut, mode, result) {
				return false
			}
			if query.liveStagedMapEntryMemberSource(get) {
				// This original DATA terminal requested source extraction only.
				// Refusal leaves its registered C child pending, never a request to
				// recover old values or replay a callable through the legacy owner.
				return false
			}
			if query.transferStagedFieldMemberEffects(origin, get, cut, mode, result) {
				return false
			}
			if query.transferStagedMemberGetEffects(origin, projection, name, mode, standard, get, cut, result) {
				return false
			}
		}
		if !sourceInterval {
			query.publishOriginalGetMutationSource(get, cut, mode, origin, projection, name, standard)
		}
		restoreWriterGet := query.enterStagedWriterGet(get, cut)
		defer restoreWriterGet()
		restoreDeferredRead := query.beginDeferredRead(get)
		defer restoreDeferredRead()
		// A confined receiver has no alias available to generic call/write/descriptor
		// candidates. Its field values and ordinary execution effects remain separate.
		if query.ownsDataSlot(get, origin, projection, name, mode) || query.confinedEnvelope(origin, projection, name, mode, result) {
			return false
		}
		inventory := query.inventoryMemberWrites(origin, projection, name, mode, bindings, result, operation.sources, cut)
		capture := sourceMemberOperationProof{}
		if standard != nil {
			// Standard containers do not need an implementation-integrity proof.
			// Actual inventory demands remain on their existing view, and indexed
			// own writers/descriptors below still contribute their own uncertainty.
			// Ordinary receivers retain their unfinished own-interference debt.
			// Neither path gains replacement precision from the standard candidate.
			standardAwait := len(projection) == 1 && name == "" && query.immediateScalarPromiseAwaitLookup(get, projection[0])
			if !standardNativeLookup(get) && !standardAwait && !query.stagedArrayGetEffectsLookup(origin, get, mode, standard) && !query.stagedStandardAssignmentLookup(get, standard, mode) && !query.stagedConstructedGetLookup(get, standard, mode) && !query.stagedStandardConstructedCallLookup(get, standard, mode) && !query.stagedConstructedResultCoverageLookup(get, standard, mode) {
				result.opaque = true
			}
			inventory = true
		} else if !inventory {
			capture = query.interferenceInSources(origin, projection, name, mode, bindings, result, operation.sources, cut)
		}
		restoreOperation := query.suspendOperation()
		defer restoreOperation()
		var alternatives []sourceValue
		var replacements []sourceValueReplacement
		demand := append(append([]string{}, projection...), name)
		if !sourceInterval {
			indexes = query.occurrenceSourceViewIn(origin, result, operation.sources, sourceIndexes[:0])
		}
		for _, index := range indexes {
			// The existing source-relative producer and occurrence checks below decide
			// reachability. Membership in this view alone never proves a write performed.
			cursor := index.memberAssignments(origin)
			for {
				assignment, found := cursor.next()
				if !found {
					break
				}
				// Interference has already been collected. An opaque source acquisition
				// needs no writer inputs when its static final key cannot occur in the
				// demanded path. Keep structural and unknown keys on the ordinary route.
				// Opacity is required: input matching also retains refused writer/setter
				// scopes. A disjoint RHS key alone cannot exclude those effects.
				if query.dependenciesOnly && result.opaque && mode == accessorAcquire {
					_, key := accessorReceiver(assignment.left)
					if !sourceMemberKeyMaySupply(key, demand) {
						continue
					}
				}
				operation := assignment.right.Parent
				if query.afterRead(assignment.left) {
					continue
				}
				if query.moduleWriterExcluded(operation, get, cut) {
					continue
				}
				if query.excludeStagedPrivateWriter(get, cut, assignment, origin) {
					continue
				}
				if query.transferStagedSetWriterSource(get, cut, assignment, origin) {
					continue
				}
				// Relative effect transfer precedes admission's optional reconstruction
				// of earlier Call outputs. Only a complete nonmatching receiver can
				// settle this exact writer obligation here. Matching/unknown receivers
				// keep their original ordering, branch, donor and input consumers.
				if _, settled := query.pendingWriterCapture(assignment, origin, bindings, result, get, true); settled {
					continue
				}
				if possible, _ := query.reachable(assignment.left, bindings); !possible {
					continue
				}
				// A completed eager own-data acquisition can exclude deferred writers
				// outside its actual reached regions. This is no value-completeness or
				// replacement certificate and failed/exhausted proofs retain may writes.
				if capture.closed && capture.regions != nil {
					writer := query.functionOperationOwner(assignment.left, result)
					if writer != nil && !capture.regions[writer] {
						continue
					}
				}

				query.pendingWriterGet(assignment, origin, bindings, get)
				var inputs []sourceMemberWriterInput
				if relative, transferred := query.pendingWriterCapture(assignment, origin, bindings, result, get, false); transferred {
					if relative == nil {
						continue
					}
					inputs = append(inputs, *relative)
				} else {
					inputs = query.memberWriterInputs(assignment.left, bindings, result, cut)
				}
				for _, input := range inputs {
					// Entering an actual input/capture scope creates this migration
					// debt. Candidate discovery alone supplies no acquired inputs;
					// reconstruction keeps its own marker even if it returns none.
					if query.stagedNativeGet != nil {
						_, key := accessorReceiver(assignment.left)
						if sourceMemberKeyMaySupply(key, demand) {
							query.stagedNativeGet.writerDependent = true
						}
					}
					query.memberWriterScope(input, func() {
						assignmentBindings := input.scope.bindings
						var setterProducer *ast.Node
						if writer := enclosingCallableNode(assignment.left); writer != nil && ast.IsSetAccessorDeclaration(writer) {
							setterProducer, assignmentBindings = query.setterWriteProducer(assignment.left, bindings)
						}
						root, key := accessorReceiver(assignment.left)
						if key == "" {
							key = "*"
						}
						temporary := accessorCandidates{opaque: input.incomplete}
						var receivers []sourceValue
						if query.dependenciesOnly && get != nil && get.receiver.native == nil && get.receiver.node != nil && ast.IsNewExpression(get.receiver.node) && get.lookupOwner != nil && get.lookupOwner.node == origin && len(get.lookupOwner.path) == 0 {
							receivers = []sourceValue{get.receiver}
						}
						origins := query.occurrenceOrigins(root, assignment.left, origin, assignmentBindings, &temporary, receivers...)
						for _, value := range origins {
							if sourceFunctionPrototype(value, query.owner.checker) && query.sourceCallableImplementation(origin, result) && sourceProjectionOverlap([]string{key}, demand) {
								result.opaque = true
								result.cause = assignment.left
							}
						}
						for _, value := range origins {
							receiverRoute := query.componentAssignmentReceiverSource(input, assignment.left, origin, value, cut)
							if receiverRoute {
								// Same-definition SOURCE correspondence is MAY only; keep
								// original nodes and forbid replacement/own-slot precision.
								temporary.opaque = true
							}
							for _, receiver := range receivers {
								creator := query.creators[enclosingCallableNode(receiver.node)].invocation
								if receiver.node != nil && len(receiver.path) == 0 && (value.node == receiver.node || creator != nil && query.sourceCreatorValue(value, enclosingCallableNode(receiver.node), creator)) {
									// Keep the selected receiver's relative write route beside
									// the lookup owner. This MAY association supplies no alias
									// identity, performed replacement or DATA authority.
									receiverRoute = true
									temporary.opaque = true
								}
							}
							if receiverRoute && sourceFieldOwnsDemand(origin, projection, name) {
								continue // The existing New-field consumer owns these writes.
							}
							if get != nil && get.receiver.native != nil && query.nativeReceiverMatches(value, get.descriptorReceiver()) {
								// The selected native receiver has consumed this acquired prefix.
								value.node, value.path = origin, nil
							}
							if value.node != origin && !receiverRoute {
								// Two authored references to the same standard binding can carry
								// a possible prototype write. This never proves it performed or
								// removes the unknown original member alternative.
								if len(projection) == 0 || !sourceFunctionPrototype(value, query.owner.checker) || !sourceFunctionPrototype(sourceValue{node: origin, path: projection[:1]}, query.owner.checker) || query.owner.checker.GetSymbolAtLocation(value.node) != query.owner.checker.GetSymbolAtLocation(origin) {
									continue
								}
								result.opaque = true
							}
							if frozen := query.nativeFreezeFor(get, origin, assignment.left, result); frozen != nil {
								blocked := true
								for _, row := range frozen.nested {
									if row.key == key && row.fields["set"].presence == propertyPresent {
										blocked = false
									}
								}
								if blocked {
									// RHS effects remain with the original assignment. The native
									// integrity event forbids a successful data/new-slot write.
									// Completion remains conservative, never a performed PutValue.
									result.opaque = true
									continue
								}
							}
							written := append(append([]string{}, value.path...), key)
							producer := setterProducer
							// A MAY RHS consumer needs the original receiver/key relation,
							// not a performed module write or replacement proof. Publish
							// before those stronger value consumers can recover invocation.
							if len(written) < len(demand) && sourceProjectionOverlap(written, demand) && query.publishStagedWriterSource(get, cut, assignment, input, origin, demand[len(written):len(demand)-1], false, input.incomplete || input.call != nil, func(value sourceValue) { alternatives = append(alternatives, value) }) {
								result.valueIncomplete = true
								continue
							}
							if sourceProjectionOverlap(written, demand) {
								var possible bool
								// Once this receiver route is incomplete, another possible writer lookup
								// cannot establish performed execution. Keep all RHS alternatives below.
								possible = true
								if producer == nil && (!result.opaque || enclosingCallableNode(assignment.left) == nil || query.creators[enclosingCallableNode(assignment.left)].invocation != nil) {
									if input.incomplete {
										producer, possible = nil, true
									} else if input.call != nil {
										producer, possible = nil, true
										if !input.incomplete && query.moduleCallWriteProducer(assignment.left, enclosingCallableNode(assignment.left), input.call, assignmentBindings) {
											producer = input.call
										}
									} else {
										producer, possible = query.moduleWriteProducer(assignment.left, assignmentBindings, result)
									}
								}
								if !possible {
									continue
								}
								if producer != nil && len(origins) == 1 && !temporary.opaque && len(written) <= len(demand) && directSourceDataSlot(origin, written, assignment.left, query.owner.checker) {
									result.producers = append(result.producers, producer)
								}
							}
							if containsString(written, "*") {
								result.opaque = true
								result.cause = assignment.left
							}
							// Enumeration borrows the exact original Get. Each reached writer
							// supplies its RHS relation before the terminal key branch.
							// This does not certify key population or enumerability.
							if len(projection) == 0 && name == "" && query.liveStagedMapObservation(get, mode) {
								if query.publishStagedWriterSource(get, cut, assignment, input, origin, nil, false, input.incomplete || input.call != nil && producer == nil) {
									result.valueIncomplete = true
								}
							}
							if len(written) >= len(demand) {
								if mode&accessorReachable != 0 && len(projection) == 0 {
									visit(sourceValue{node: assignment.right, capture: &input.scope})
								}
								continue
							}
							matches := sourceProjectionOverlap(written, demand)
							if matches {
								result.ownOperation = result.ownOperation || len(origins) == 1 && !temporary.opaque && query.functionMemberWrite(origin, written, assignment.left, producer, assignmentBindings, result)
								if query.moduleRead() != nil && producer == nil {
									result.opaque = true
								}
								at := query.initializing
								if at == nil {
									at = query.reading
								}
								replacement := !containsString(written, "*") && !containsString(written, "") && len(origins) == 1 && !temporary.opaque && query.replacesSourceValue(origin, written, assignment.left, mode, producer, assignmentBindings)
								writer := enclosingCallableNode(assignment.left)
								// This lookup adds only opacity. Existing incompleteness keeps its cause
								// (or the accessor's receiver fallback), while every RHS is still visited below.
								if !result.opaque && writer != nil && writer != enclosingCallableNode(at) && !replacement {
									// A captured write can reach an acquired object even when the call's
									// receiver is its former container. Index membership is only a may value.
								writerCalls:
									for _, call := range query.owner.index(ast.GetSourceFileOfNode(origin)).calls {
										if query.active[call] || query.pendingWriterInputExcluded(call, result) || query.afterRead(call) {
											continue
										}
										if !query.charge(result, call) {
											break
										}
										if disposition := query.stagedWriterRelevance(call, result); disposition.handled {
											continue
										}
										candidates := query.receiverCandidates(call, bindings)
										for _, candidate := range candidates.values {
											if candidate.node == writer {
												result.opaque = true
												result.cause = assignment.left
												break writerCalls
											}
										}
									}
								}
								var next []sourceValue
								if setterProducer != nil {
									for _, acquired := range query.originsAt(assignment.right, assignment.left, assignmentBindings, result) {
										acquired.path = append(acquired.path, demand[len(written):len(demand)-1]...)
										next = append(next, acquired)
									}
								} else {
									if input.call != nil {
										next = query.originsAt(assignment.right, assignment.left, assignmentBindings, result)
										for i := range next {
											next[i].path = append(next[i].path, demand[len(written):len(demand)-1]...)
											if next[i].capture == nil {
												scope := input.scope
												next[i].capture = &scope
											}
										}
									} else {
										value := sourceValue{node: assignment.right, path: demand[len(written) : len(demand)-1]}
										if query.dependenciesOnly && input.incomplete {
											// A refused invocation has captures, but no performed
											// Call. Keep that scope on its possible RHS value.
											scope := input.scope
											value.capture = &scope
										}
										next = append(next, value)
									}
								}
								occurrence := operation
								if input.call != nil {
									occurrence = input.call
								}
								if producer != nil {
									occurrence = producer
								}
								alternatives = append(alternatives, next...)
								replacements = append(replacements, sourceValueReplacement{at: occurrence, operation: operation, values: next, bindings: assignmentBindings, certain: replacement, unordered: input.incomplete || input.call != nil && producer == nil})
							}
						}
					})
				}
			}
			for _, call := range index.calls {
				// Only the existing descriptor operation can contribute this relation.
				// Its owner still checks binder identity, receiver, key and descriptor.
				_, method := restrictedInvocationMember(call.AsCallExpression().Expression, query.owner.checker)
				if method != "defineProperty" && (get == nil || get.receiver.native == nil) || operation.closed && !operation.calls[call] {
					continue
				}
				fallbackMode := mode
				if query.convertedMemberAtGet(call, origin, projection, name, mode, get, result) {
					if mode&accessorSet == 0 {
						continue
					}
					// Converted fields handled the Get only. Preserve the separate Set
					// effect fallback without replaying that Get or installing Get inputs.
					fallbackMode |= accessorNoGet
				}
				values, possible := query.reflectiveMemberValuesAtGet(origin, projection, name, call, fallbackMode, bindings, result, get, cut)
				if !possible {
					continue
				}
				// Descriptor operations are retained effects, not a native identity or
				// performed-call certificate. Their possible body uses raw method inputs.
				result.opaque = true
				result.ownOperation = true
				result.cause = call
				if len(values) > 0 {
					alternatives = append(alternatives, values...)
					replacements = append(replacements, sourceValueReplacement{at: call, operation: call, values: values, bindings: bindings})
				}
			}
		}
		// Pending write inspection cannot remove the old member or a possible RHS.
		// Its consumer must close interference before using replacement precision.
		replaced := false
		if !inventory {
			alternatives, replaced = query.mergeReplacements(alternatives, replacements, result)
		}
		for _, value := range alternatives {
			visit(value)
		}
		query.observeArrayGetEffects(origin, get, cut, mode, standard)
		query.observeStagedAssignmentStandardSet(origin, get, cut, mode, standard, result)
		query.observeStagedConstructedGetEffects(origin, get, cut, mode, standard, result)
		query.observeStagedConstructedResultCoverage(origin, get, cut, mode, standard, result)
		query.observeStagedStandardConstructedCall(origin, get, cut, mode, standard, result)
		return replaced
	}()
	query.finishGetPreparationDataRead()
	return returned
}

// sourceMemberKeyMaySupply rejects only impossible final keys of indexed RHS
// contributions. The final empty demand is an acquisition sentinel. Earlier
// unknown segments and structural writes keep the full matching path.
func sourceMemberKeyMaySupply(key string, demand []string) bool {
	if key == "" || key == "*" || key == "__proto__" || key == "prototype" || key == "constructor" || key == "length" {
		return true
	}
	known := false
	for i, part := range demand {
		if part == "" && i == len(demand)-1 {
			continue
		}
		if part == "" || part == "*" || part == key {
			return true
		}
		known = true
	}
	return !known
}

// sourceArrayIndex keeps canonical element keys distinct from ordinary named slots.
func sourceArrayIndex(key string) (uint64, bool) {
	index, err := strconv.ParseUint(key, 10, 32)
	return index, err == nil && index < 4294967295 && strconv.FormatUint(index, 10) == key
}

// arrayValues applies the same finite member demand to native array syntax. Holes retain
// their positions. A spread's iterator and length are unproved, so suffix positions widen.
// Receiver calls are not append facts: even a method named push can be replaced.
func (query *sourceValueQuery) arrayValues(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), sourceVisit func(sourceValue), get *sourceGetInputs) {
	visitMember := func(value sourceValue) { visit(value.node, value.path, false) }
	if query.dependenciesOnly {
		visitMember = sourceVisit
	}
	var indexGet *sourceGetInputs
	if query.arrayIndexMayAtGet(get, origin, projection, name, mode) {
		indexGet = get
	} else if query.stagedLocalGetEffectsSelection(get, origin, projection, name, mode) && stagedEmptyArrayDataConstruction(origin) {
		// Same SOURCE lookup relation as the literal member visitor: preserve
		// the original receiver/Get, changing only the descriptive lookup root.
		selected := *get
		lookup := sourceValue{node: origin}
		selected.lookupOwner = &lookup
		indexGet = &selected
	}
	var standard *sourceValue
	var inherited []sourceValue
	if mode == accessorAcquire && len(projection) == 1 && name == "" {
		acquired := query.reading
		if get != nil && get.operation != nil {
			acquired = get.operation
		}
		member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeAtLocation(origin), projection[0])
		if member != nil {
			for _, declaration := range member.Declarations {
				candidate := standardArrayMemberValue(origin, declaration, acquired)
				inherited = append(inherited, candidate)
				if candidate.native != nil {
					standard = &candidate
				}
			}
		}
	}
	if query.memberValuesAtGetWithStandard(origin, projection, name, mode, bindings, result, visitMember, sourceMemberOperationProof{}, indexGet, standard) {
		return
	}
	selection, rest := name, []string(nil)
	if len(projection) > 0 {
		selection, rest = projection[0], projection[1:]
	}
	unknown := selection == "" || selection == "*"
	index, positional := sourceArrayIndex(selection)
	if len(projection) == 0 && mode&accessorReachable == 0 && mode != accessorInvoke {
		return
	}
	if unknown && mode&accessorReachable == 0 {
		result.opaque = true
	}
	if !unknown && !positional {
		if mode == accessorAcquire {
			if len(inherited) == 0 {
				result.opaque = true
			}
			result.values = append(result.values, inherited...)
		}
		return
	}
	shifted := false
	for i, element := range origin.AsArrayLiteralExpression().Elements.Nodes {
		if !query.charge(result, element) {
			return
		}
		if ast.IsSpreadElement(element) {
			if positional && !shifted && index < uint64(i) {
				break
			}
			shifted = true
			if unknown || positional {
				result.opaque = true
				visit(element.AsSpreadElement().Expression, append([]string{"*"}, rest...), false)
			}
			continue
		}
		if !ast.IsOmittedExpression(element) && (unknown || selection == strconv.Itoa(i) || (positional && shifted)) {
			if len(projection) > 0 || mode&accessorReachable != 0 || mode == accessorInvoke {
				visit(element, rest, false)
			}
		}
		if positional && !shifted && index == uint64(i) {
			break
		}
	}
}

// sourceProjectionOverlap compares finite prefixes. Unknown keys preserve possible
// interference, while disjoint own members cannot affect the demanded projection.
func sourceProjectionOverlap(left, right []string) bool {
	for i, key := range left {
		if i >= len(right) {
			break
		}
		if key != "*" && key != "" && right[i] != "*" && right[i] != "" && key != right[i] {
			return false
		}
	}
	return true
}
