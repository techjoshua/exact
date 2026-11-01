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
func (query *sourceValueQuery) occurrenceOrigins(node, at, origin *ast.Node, bindings sourceValueBindings, result *accessorCandidates) []sourceValue {
	var values []sourceValue
	for _, value := range query.originsAt(node, at, bindings, result) {
		// A live instance projection without its actual field Get output is not
		// another opportunity to reacquire that same constructing receiver.
		if value.instance != nil && len(value.path) != 0 {
			result.opaque, result.valueIncomplete = true, true
			continue
		}
		// The same completed factory occurrence can name its directly returned
		// object without reacquiring all of that object's members or getters.
		if len(value.path) == 0 {
			for _, creator := range query.creators {
				if creator.invocation == value.node && creator.returning == origin {
					value.node = origin
				}
			}
		}
		if value.node == origin || len(value.path) == 0 || value.node != nil && value.node.Kind == ast.KindThisKeyword || sourceFunctionPrototype(value, query.owner.checker) {
			values = append(values, value)
			continue
		}
		acquired := query.accessors(value.node, value.path, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(result, acquired)
		values = append(values, acquired.values...)
	}
	return values
}

// occurrenceSourceView visits only the defining source and actual acquisition,
// receiving and return occurrences already owned by this query. Indexes are not
// merged, and positions in different sources never establish execution order.
func (query *sourceValueQuery) occurrenceSourceView(origin *ast.Node, result *accessorCandidates) []sourceValueIndex {
	return query.occurrenceSourceViewIn(origin, result, nil)
}

// occurrenceSourceViewIn adds only explicitly selected dependency indexes. Their
// references still pass the ordinary occurrence and write-producer checks.
func (query *sourceValueQuery) occurrenceSourceViewIn(origin *ast.Node, result *accessorCandidates, selected []*ast.SourceFile) []sourceValueIndex {
	var sources []*ast.SourceFile
	var indexes []sourceValueIndex
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

// memberValues joins relevant ordered writes through the same finite source relation
// used for acquisition and live reads. A direct source replacement can supersede the
// initializer at a proved acquisition or factory return, without selected-callee authority.
func (query *sourceValueQuery) memberValues(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool)) bool {
	return query.memberValuesAtOperation(origin, projection, name, mode, bindings, result, visit, sourceMemberOperationProof{})
}

// memberValuesAtOperation keeps candidate effects within an independently admitted
// operation prefix. Incomplete proofs retain may alternatives and actual body effects.
func (query *sourceValueQuery) memberValuesAtOperation(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), operation sourceMemberOperationProof) bool {
	return query.memberValuesAtGet(origin, projection, name, mode, bindings, result, visit, operation, nil)
}

// memberValuesAtGet supplies the selected operation's actual receiver to the
// existing descriptor owner. Inherited lookup origin and receiver are distinct.
func (query *sourceValueQuery) memberValuesAtGet(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), operation sourceMemberOperationProof, get *sourceGetInputs) bool {
	restoreDeferredRead := query.beginDeferredRead(get)
	defer restoreDeferredRead()
	// A confined receiver has no alias available to generic call/write/descriptor
	// candidates. Its field values and ordinary execution effects remain separate.
	if query.ownsDataSlot(get, origin, projection, name, mode) || query.confinedEnvelope(origin, projection, name, mode, result) {
		return false
	}
	capture := query.interferenceInSources(origin, projection, name, mode, bindings, result, operation.sources)
	restoreOperation := query.suspendOperation()
	defer restoreOperation()
	var alternatives []sourceValue
	var replacements []sourceValueReplacement
	demand := append(append([]string{}, projection...), name)
	for _, index := range query.occurrenceSourceViewIn(origin, result, operation.sources) {
		// The existing source-relative producer and occurrence checks below decide
		// reachability. Membership in this view alone never proves a write performed.
		known, dynamic := index.memberOrigins[origin], index.dynamicMembers
		for i, j := 0, 0; i < len(known) || j < len(dynamic); {
			var assignment sourceValueAssignment
			if j == len(dynamic) || i < len(known) && known[i].left.Pos() < dynamic[j].left.Pos() {
				assignment = known[i]
				i++
			} else {
				assignment = dynamic[j]
				j++
			}
			operation := assignment.right.Parent
			if query.afterRead(assignment.left) {
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

			assignmentBindings := bindings
			var setterProducer *ast.Node
			if writer := enclosingCallableNode(assignment.left); writer != nil && ast.IsSetAccessorDeclaration(writer) {
				setterProducer, assignmentBindings = query.setterWriteProducer(assignment.left, bindings)
			}
			root, key := accessorReceiver(assignment.left)
			if key == "" {
				key = "*"
			}
			temporary := accessorCandidates{}
			origins := query.occurrenceOrigins(root, assignment.left, origin, assignmentBindings, &temporary)
			for _, value := range origins {
				if sourceFunctionPrototype(value, query.owner.checker) && query.sourceCallableImplementation(origin, result) && sourceProjectionOverlap([]string{key}, demand) {
					result.opaque = true
					result.cause = assignment.left
				}
			}
			for _, value := range origins {
				if get != nil && get.receiver.native != nil && query.nativeReceiverMatches(value, get.descriptorReceiver()) {
					// The selected native receiver has consumed this acquired prefix.
					value.node, value.path = origin, nil
				}
				if value.node != origin {
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
				if sourceProjectionOverlap(written, demand) {
					var possible bool
					// Once this receiver route is incomplete, another possible writer lookup
					// cannot establish performed execution. Keep all RHS alternatives below.
					possible = true
					if producer == nil && (!result.opaque || enclosingCallableNode(assignment.left) == nil || query.creators[enclosingCallableNode(assignment.left)].invocation != nil) {
						producer, possible = query.moduleWriteProducer(assignment.left, bindings)
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
				if len(written) >= len(demand) {
					if mode&accessorReachable != 0 && len(projection) == 0 {
						visit(assignment.right, nil, false)
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
						next = append(next, sourceValue{node: assignment.right, path: demand[len(written) : len(demand)-1]})
					}
					occurrence := operation
					if producer != nil {
						occurrence = producer
					}
					alternatives = append(alternatives, next...)
					replacements = append(replacements, sourceValueReplacement{occurrence, operation, next, assignmentBindings, replacement})
				}
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
			value, possible := query.reflectiveMemberValueAtGet(origin, projection, name, call, fallbackMode, bindings, result, get)
			if !possible {
				continue
			}
			// Descriptor operations are retained effects, not a native identity or
			// performed-call certificate. Their possible body uses raw method inputs.
			result.opaque = true
			result.ownOperation = true
			result.cause = call
			if value != nil {
				next := []sourceValue{{node: value}}
				alternatives = append(alternatives, next...)
				replacements = append(replacements, sourceValueReplacement{call, call, next, bindings, false})
			}
		}
	}
	alternatives, replaced := query.mergeReplacements(alternatives, replacements, result)
	for _, value := range alternatives {
		visit(value.node, value.path, false)
	}
	return replaced
}

// sourceArrayIndex keeps canonical element keys distinct from ordinary named slots.
func sourceArrayIndex(key string) (uint64, bool) {
	index, err := strconv.ParseUint(key, 10, 32)
	return index, err == nil && index < 4294967295 && strconv.FormatUint(index, 10) == key
}

// arrayValues applies the same finite member demand to native array syntax. Holes retain
// their positions. A spread's iterator and length are unproved, so suffix positions widen.
// Receiver calls are not append facts: even a method named push can be replaced.
func (query *sourceValueQuery) arrayValues(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool)) {
	if query.memberValues(origin, projection, name, mode, bindings, result, visit) {
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
			// Keep the unresolved inherited value beside authored alternatives. Library
			// declarations are candidates here, not concrete runtime method identities.
			member := query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeAtLocation(origin), selection)
			if member == nil || len(projection) != 1 {
				result.opaque = true
			} else {
				for _, declaration := range member.Declarations {
					result.values = append(result.values, sourceValue{node: declaration})
				}
			}
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
