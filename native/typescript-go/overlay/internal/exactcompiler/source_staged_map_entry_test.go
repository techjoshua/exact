package exactcompiler

import "testing"

// Source enumeration and entry Get are separate demands under the original
// selected native issuer. Neither demand supplies converted descriptor values.
func TestStagedMapEntryOriginalRead(t *testing.T) {
	for _, row := range []struct {
		name, source    string
		getter, capture bool
	}{
		{"data dormant", `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title}})}`, false, false},
		{"original initializer Call not replayed", `declare function makeDescriptor():PropertyDescriptor;export function invoke(){const map={run:makeDescriptor()};return Object.defineProperties({},map)}`, false, false},
		{"shorthand does not replay initializer", `declare function makeDescriptor():PropertyDescriptor;export function invoke(){const run=makeDescriptor();return Object.defineProperties({},{run})}`, false, false},
		{"method dormant", `export function invoke(){const map:any={run(){window.name}};return Object.defineProperties({},map)}`, false, false},
		{"getter real receiver", `export function invoke(){return Object.defineProperties({},{get run(){window.name;return{value:()=>document.title}}})}`, true, false},
		{"getter capture pending", `export function invoke(capture:PropertyDescriptor){return Object.defineProperties({},{get run(){return capture}})}`, true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				var entry sourceStagedMapEntry
				phaseAttempt := false
				revoke, installed := beginStagedMapProtocolSource(query, source, func(candidate sourceStagedMapEntry) bool {
					if candidate.member != nil {
						entry = candidate
						request, valid := stagedMapEntryRequest(source, candidate)
						if !valid {
							t.Fatal("original entry request refused")
						}
						phaseAttempt = true
						if consumeStagedMapEntrySource(query, source, candidate, request, func(sourceStagedMapEntryRead) bool { t.Fatal("enumeration executed entry Get"); return true }) {
							t.Fatal("discovery granted entry read")
						}
					}
					return true
				})
				if !installed {
					t.Fatal("original map borrow refused")
				}
				defer revoke()
				borrow := query.stagedMap
				result := query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
				if !phaseAttempt || entry.member == nil || len(result.effects)+len(result.environmentEffects)+len(result.fieldCalls)+len(result.normalCalls) != 0 {
					t.Fatal("source entry missing or discovery invoked body")
				}
				request, valid := stagedMapEntryRequest(source, entry)
				if !valid || request.producer.selector.occurrence != entry.member || request.producer.selector.field != "descriptor-entry-get" || request.producer.operation != source.request.producer.operation || request.cut != source.request.cut || request.use != source.request.use || request.consumer != source.request.consumer || request.inputs != nil {
					t.Fatal("entry request lost original graph association")
				}
				beforeWork := query.owner.work
				called := false
				if !consumeStagedMapEntrySource(query, source, entry, request, func(read sourceStagedMapEntryRead) bool {
					called = true
					if !sameOperationRequest(read.request, request) || !sameStagedMapEntry(read.entry, entry) || read.entry.cut != borrow.cut || read.entry.receiver.cut != source.request.cut {
						t.Fatal("entry Get retargeted original/live source cuts")
					}
					if row.getter {
						if read.getter != entry.getter || read.descriptor.expression != nil || read.bound.declaration != entry.getter || read.bound.operation != source.request.producer.operation || read.bound.cut != entry.cut || read.bound.use != nil {
							t.Fatal("getter fabricated result, delivery or graph-cut B")
						}
						if len(read.bound.bindings) != 1 || read.bound.bindings[0].target.kind != relativeRoleReceiver || read.bound.bindings[0].target.declaration != entry.getter || len(read.bound.bindings[0].sources) != 1 {
							t.Fatal("original Get receiver binding missing")
						}
						receiver := read.bound.bindings[0].sources[0]
						if receiver.expression != entry.group || receiver.producer != source.request.producer.operation || receiver.get != entry.member || receiver.cut != entry.cut {
							t.Fatal("selected source group receiver changed")
						}
						if row.capture {
							if read.bound.unsupported != relativeInputsUnsupportedCapture || read.accounting != sourceEffectsUnaccounted {
								t.Fatal("missing creating captures manufactured B authority")
							}
						} else if read.bound.unsupported != relativeInputsSupported || read.accounting != sourceEffectsAccounted {
							t.Fatal("capture-free real receiver refused")
						}
					} else if read.getter != nil || !sameOperationEndpoint(read.descriptor, entry.descriptor) || read.accounting != sourceEffectsAccounted {
						t.Fatal("data initializer was replaced by acquired output")
					}
					return true
				}) || !called {
					t.Fatal("original accepted entry Get refused")
				}
				if query.owner.work != beforeWork || !borrow.pending {
					t.Fatal("entry Get replayed source work or completed map")
				}
			})
		})
	}
}

func TestStagedMapEntryMembershipAndLifetime(t *testing.T) {
	const fixture = `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title},other:{value:1}})}`
	withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		var entry sourceStagedMapEntry
		revoke, installed := beginStagedMapProtocolSource(query, source, func(candidate sourceStagedMapEntry) bool {
			if candidate.name == "run" {
				entry = candidate
			}
			return candidate.name != "other"
		})
		if !installed {
			t.Fatal("map source missing")
		}
		defer revoke()
		borrow := query.stagedMap
		query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
		request, valid := stagedMapEntryRequest(source, entry)
		if !valid || len(borrow.accepted) != 1 {
			t.Fatal("refused entry became source membership")
		}
		accept := func(sourceStagedMapEntryRead) bool { return true }
		refuse := func(q *sourceValueQuery, e sourceStagedMapEntry, r sourceStagedOperationRequest) {
			t.Helper()
			if consumeStagedMapEntrySource(q, source, e, r, accept) {
				t.Fatal("altered or expired source membership accepted")
			}
		}
		for _, alter := range []func(*sourceStagedMapEntry){
			func(e *sourceStagedMapEntry) { e.name = "other" },
			func(e *sourceStagedMapEntry) { e.ordinal++ },
			func(e *sourceStagedMapEntry) { e.cut.reading = nil },
			func(e *sourceStagedMapEntry) { e.descriptor.expression = e.member },
			func(e *sourceStagedMapEntry) { e.receiver.cut.use = nil },
			func(e *sourceStagedMapEntry) { e.group = e.member },
		} {
			changed := cloneStagedMapEntry(entry)
			alter(&changed)
			refuse(query, changed, request)
		}
		wrong := request
		wrong.edge += "wrong"
		refuse(query, entry, wrong)
		wrong = request
		wrong.inputs = &sourceRelativeInputEdge{}
		refuse(query, entry, wrong)
		copied := *query
		refuse(&copied, entry, request)
		generation := borrow.generation
		borrow.generation = &projectGeneration{}
		refuse(query, entry, request)
		borrow.generation = generation
		reading := query.reading
		query.reading = nil
		refuse(query, entry, request)
		query.reading = reading
		if consumeStagedMapEntrySource(query, source, entry, request, nil) {
			t.Fatal("missing publisher granted read")
		}
		if consumeStagedMapEntrySource(query, source, entry, request, func(sourceStagedMapEntryRead) bool { return false }) {
			t.Fatal("publication refusal became acceptance")
		}
		if !consumeStagedMapEntrySource(query, source, cloneStagedMapEntry(entry), request, func(sourceStagedMapEntryRead) bool {
			refuse(query, entry, request)
			return true
		}) {
			t.Fatal("original source relationship lost after rejected copies/reentry")
		}
		if consumeStagedMapEntrySource(query, source, entry, request, func(sourceStagedMapEntryRead) bool { revoke(); return true }) {
			t.Fatal("callback revocation retained completed source rights")
		}
		if borrow.accepted != nil {
			t.Fatal("revoked query retained accepted source membership")
		}
		refuse(query, entry, request)
	})
}

// The request factory describes original source membership, not a selected
// runtime object or an alternative map. No hand-built member enters the borrow.
func TestStagedMapEntryUnobservedSource(t *testing.T) {
	withStagedMapProtocolSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:1}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		revoke, installed := beginStagedMapProtocolSource(query, source, func(sourceStagedMapEntry) bool { return true })
		if !installed {
			t.Fatal("source borrow missing")
		}
		defer revoke()
		group := source.descriptorMap.descriptors.expression
		member := group.AsObjectLiteralExpression().Properties.Nodes[0]
		entry := sourceStagedMapEntry{request: source.descriptorMap.protocol, receiver: source.descriptorMap.descriptors, group: group, member: member, ordinal: 0, cut: query.stagedMap.cut, descriptor: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: member.AsPropertyAssignment().Initializer}}
		request, valid := stagedMapEntryRequest(source, entry)
		if !valid {
			t.Fatal("original request transport unexpectedly refused")
		}
		if consumeStagedMapEntrySource(query, source, entry, request, func(sourceStagedMapEntryRead) bool { return true }) {
			t.Fatal("unobserved syntax manufactured entry authority")
		}
	})
}
