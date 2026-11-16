package exactcompiler

import "testing"

// Discovery registers every original entry before any entry Get. Source order
// and dormant data/getter bodies survive this split without becoming runtime
// OwnKeys order or completed map conversion.
func TestStagedMapConversionOrderedSource(t *testing.T) {
	const fixture = `declare function makeDescriptor():PropertyDescriptor;export function invoke(){const map={first:makeDescriptor(),get second(){window.name;return{value:()=>document.title}},third:{value:()=>document.title}};return Object.defineProperties({},map)}`
	withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		var discovered []sourceStagedMapEntry
		var reads []sourceStagedMapEntryRead
		revoke, installed := beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool {
			if len(reads) != 0 {
				t.Fatal("entry Get preceded completion of source discovery")
			}
			if consumeStagedMapConversionSource(query, source, func(sourceStagedMapEntryRead) bool { t.Fatal("enumeration recursively converted map"); return true }) {
				t.Fatal("enumeration granted conversion")
			}
			if entry.member != nil {
				discovered = append(discovered, entry)
			}
			return true
		})
		if !installed {
			t.Fatal("original source borrow missing")
		}
		defer revoke()
		borrow := query.stagedMap
		if !consumeStagedMapConversionSource(query, source, func(read sourceStagedMapEntryRead) bool {
			if query.traceModeKnown || len(discovered) != 3 {
				t.Fatal("Get executed during enumeration or before all entry registrations")
			}
			if len(reads) >= len(discovered) || !sameStagedMapEntry(read.entry, discovered[len(reads)]) {
				t.Fatal("original source publication order lost")
			}
			if read.entry.cut != borrow.cut || read.entry.receiver.cut != source.request.cut || read.request.cut != source.request.cut || read.request.use != source.request.use {
				t.Fatal("graph/live source cuts conflated")
			}
			if read.getter != nil {
				if read.getter != read.entry.getter || read.descriptor.expression != nil || read.bound.operation != borrow.operation || read.bound.cut != borrow.cut || read.bound.unsupported != relativeInputsSupported || len(read.bound.bindings) != 1 || read.bound.bindings[0].sources[0].expression != read.entry.group {
					t.Fatal("original getter B or source receiver relationship lost")
				}
			} else if !sameOperationEndpoint(read.descriptor, read.entry.descriptor) {
				t.Fatal("data initializer replaced by reacquired descriptor")
			}
			reads = append(reads, read)
			if consumeStagedMapConversionSource(query, source, func(sourceStagedMapEntryRead) bool { return true }) {
				t.Fatal("read callback recursively converted original map")
			}
			return true
		}) {
			t.Fatal("known original entry contributions not represented")
		}
		if len(reads) != 3 || reads[0].entry.name != "first" || reads[1].entry.name != "second" || reads[2].entry.name != "third" || !borrow.pending {
			t.Fatal("ordered prefix lost or source conversion completed protocol debt")
		}
		originalWork := query.owner.work
		if consumeStagedMapConversionSource(query, source, func(sourceStagedMapEntryRead) bool { t.Fatal("finished borrow replayed entry Get"); return true }) || query.owner.work != originalWork {
			t.Fatal("original enumeration demand replayed")
		}
		revoke()
		if borrow.accepted != nil || borrow.entries != nil || consumeStagedMapConversionSource(query, source, func(sourceStagedMapEntryRead) bool { return true }) {
			t.Fatal("revoked order/membership retained authority")
		}
	})
}

func TestStagedMapConversionRetainsPendingPrefixes(t *testing.T) {
	for _, row := range []struct {
		name, source string
		names        []string
	}{
		{"capture", `export function invoke(capture:PropertyDescriptor){return Object.defineProperties({},{first:{value:1},get middle(){return capture},last:{value:()=>document.title}})}`, []string{"first", "middle", "last"}},
		{"spread", `export function invoke(extras:PropertyDescriptorMap){return Object.defineProperties({},{first:{value:1},...extras,last:{value:()=>document.title}})}`, []string{"first", "last"}},
		{"computed", `export function invoke(key:string){return Object.defineProperties({},{first:{value:1},[key]:{value:2},last:{value:()=>document.title}})}`, []string{"first", "", "last"}},
		{"unknown alternative", `export function invoke(choose:boolean,unknown:PropertyDescriptorMap){return Object.defineProperties({},choose?{first:{value:1}}:unknown)}`, []string{"first"}},
		{"empty is not absence", `export function invoke(){return Object.defineProperties({},{})}`, nil},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				revoke, installed := beginStagedMapProtocolSource(query, source, func(sourceStagedMapEntry) bool { return true })
				if !installed {
					t.Fatal("source borrow missing")
				}
				defer revoke()
				var names []string
				if consumeStagedMapConversionSource(query, source, func(read sourceStagedMapEntryRead) bool {
					names = append(names, read.entry.name)
					if row.name == "capture" && read.entry.name == "middle" && (read.bound.unsupported != relativeInputsUnsupportedCapture || read.accounting != sourceEffectsUnaccounted || read.getter == nil || len(read.bound.bindings) != 1) {
						t.Fatal("capture gap erased known getter receiver or fabricated creating inputs")
					}
					return true
				}) {
					t.Fatal("unrepresented source sibling became complete conversion")
				}
				if len(names) != len(row.names) {
					t.Fatalf("known source prefix lost: got %v want %v", names, row.names)
				}
				for index, name := range row.names {
					if names[index] != name {
						t.Fatalf("known source order changed: %v", names)
					}
				}
				if !query.stagedMap.pending {
					t.Fatal("pending OwnKeys/enumerability/entry dependencies were settled")
				}
				if row.name == "unknown alternative" {
					borrow := query.stagedMap
					if len(borrow.unrepresented) != 1 {
						t.Fatal("original unresolved input alternative lost its provenance")
					}
					gap := borrow.unrepresented[0]
					if gap.expression == nil || gap.expression.Text() != "unknown" || gap.declaration == nil || gap.declaration.Name() == nil || gap.declaration.Name().Text() != "unknown" || gap.cut != borrow.cut {
						t.Fatal("unresolved input retargeted to another source or cut")
					}
					before := len(borrow.unrepresented)
					query.observeStagedMapUnrepresentedInput(gap.expression, gap.declaration, borrow.get, accessorEnumerate|accessorNoGet)
					if len(borrow.unrepresented) != before {
						t.Fatal("finished trace manufactured additional source provenance")
					}
					revoke()
					if borrow.unrepresented != nil {
						t.Fatal("revoked borrow retained unresolved input source membership")
					}
				}
			})
		})
	}
}

func TestStagedMapConversionPublicationAndLifetime(t *testing.T) {
	const fixture = `export function invoke(){return Object.defineProperties({},{first:{value:1},middle:{value:2},last:{value:3}})}`
	for _, phase := range []string{"discovery refusal", "read refusal", "discovery revoke", "read revoke"} {
		t.Run(phase, func(t *testing.T) {
			withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				var revoke func()
				var installed bool
				revoke, installed = beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool {
					if entry.name == "middle" && phase == "discovery refusal" {
						return false
					}
					if entry.name == "middle" && phase == "discovery revoke" {
						revoke()
					}
					return true
				})
				if !installed {
					t.Fatal("source borrow missing")
				}
				defer revoke()
				borrow := query.stagedMap
				if consumeStagedMapConversionSource(query, source, nil) {
					t.Fatal("missing publisher granted conversion")
				}
				copied := *query
				if consumeStagedMapConversionSource(&copied, source, func(sourceStagedMapEntryRead) bool { return true }) || borrow.observed {
					t.Fatal("copied query acquired original issuer")
				}
				generation := borrow.generation
				borrow.generation = &projectGeneration{}
				if consumeStagedMapConversionSource(query, source, func(sourceStagedMapEntryRead) bool { return true }) || borrow.observed {
					t.Fatal("expired generation enumerated source")
				}
				borrow.generation = generation
				var names []string
				if consumeStagedMapConversionSource(query, source, func(read sourceStagedMapEntryRead) bool {
					names = append(names, read.entry.name)
					if read.entry.name == "middle" && phase == "read refusal" {
						return false
					}
					if read.entry.name == "middle" && phase == "read revoke" {
						revoke()
					}
					return true
				}) {
					t.Fatal("refused/revoked source publication granted conversion")
				}
				expected := []string{"first", "middle", "last"}
				switch phase {
				case "discovery refusal":
					expected = []string{"first"}
				case "discovery revoke":
					expected = nil
				case "read revoke":
					expected = []string{"first", "middle"}
				}
				if len(names) != len(expected) {
					t.Fatalf("publication prefix got %v want %v", names, expected)
				}
				for index, name := range expected {
					if names[index] != name {
						t.Fatalf("publication order changed: %v", names)
					}
				}
				if !borrow.pending {
					t.Fatal("refusal closed independent map source debt")
				}
			})
		})
	}
}
