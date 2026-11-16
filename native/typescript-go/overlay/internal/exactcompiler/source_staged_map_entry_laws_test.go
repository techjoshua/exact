package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Original selected enumeration and DATA terminals issue different local laws.
// Supplied callbacks observe those events without granting queue/source closure.
func TestStagedMapEntryLawsOriginalOwners(t *testing.T) {
	for _, row := range []struct {
		name, source string
		enum         bool
		data         int
	}{
		{"empty", `export function invoke(){return Object.defineProperties({},{})}`, true, 0},
		{"data and eager getter", `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title},get other(){window.name;return{value:1}}})}`, true, 1},
		{"initializer not replayed", `declare function makeDescriptor():PropertyDescriptor;export function invoke(){return Object.defineProperties({},{run:makeDescriptor()})}`, true, 1},
		{"shorthand and stored method", `export function invoke(){const run={value:()=>document.title};return Object.defineProperties({},{run,other:{value(){window.name}}})}`, true, 2},
		{"unrepresented population", `export function invoke(extras:PropertyDescriptorMap){const key='other';return Object.defineProperties({},{...extras,[key]:{value:1},run:{value:()=>document.title}})}`, true, 2},
		{"aliased group", `export function invoke(){const map={run:{value:()=>document.title}};return Object.defineProperties({},map)}`, false, 0},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				var entries []sourceStagedMapEntry
				revoke, installed := beginStagedMapProtocolSource(query, source, func(entry sourceStagedMapEntry) bool {
					if entry.member != nil {
						entries = append(entries, entry)
					}
					return true
				})
				if !installed {
					t.Fatal("original map borrow missing")
				}
				defer revoke()
				borrow := query.stagedMap
				enumerated, data := false, make(map[*ast.Node]bool)
				borrow.noUserEntry = func(get *sourceGetInputs, group *ast.Node) bool {
					event := borrow.noUserPublication
					if event == nil || event.get != get || event.group != group || get != borrow.get || group != borrow.receiver.expression {
						t.Fatal("law lost its original event/Get/group")
					}
					if query.observeStagedMapEntryLaw(get, group, event.law) {
						t.Fatal("event callback reentered its source loan")
					}
					switch event.law {
					case stagedMapOrdinaryOwnKeysNoUserEntry:
						if borrow.reading || borrow.currentRead != nil || !query.traceModeKnown || query.traceMode != accessorEnumerate|accessorNoGet {
							t.Fatal("enumeration law escaped its original phase")
						}
						enumerated = true
					case stagedMapOwnDataGetNoUserEntry:
						read := borrow.currentRead
						if !borrow.reading || query.traceModeKnown || read == nil || read.getter != nil || read.entry.getter != nil || !sameOperationEndpoint(read.descriptor, read.entry.descriptor) {
							t.Fatal("DATA law used getter/output inference instead of original terminal")
						}
						data[read.entry.member] = true
					default:
						t.Fatal("unknown local law")
					}
					return true
				}
				saved := borrow.noUserEntry
				result := query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
				if len(result.effects)+len(result.environmentEffects)+len(result.fieldCalls)+len(result.normalCalls) != 0 || len(result.values) != 0 {
					t.Fatal("ordinary source enumeration executed bodies or acquired output")
				}
				for _, entry := range entries {
					if entry.descriptor.expression == nil && entry.getter == nil {
						continue
					}
					request, valid := stagedMapEntryRequest(source, entry)
					if !valid || !consumeStagedMapEntrySource(query, source, entry, request, func(read sourceStagedMapEntryRead) bool {
						if read.getter != nil && data[read.entry.member] {
							t.Fatal("getter body acquired DATA law")
						}
						return true
					}) {
						t.Fatal("original entry source read missing")
					}
				}
				if enumerated != row.enum || len(data) != row.data || borrow.noUserPublication != nil || !borrow.pending {
					t.Fatalf("enum=%t DATA=%d pending=%t", enumerated, len(data), borrow.pending)
				}
				if query.observeStagedMapEntryLaw(borrow.get, borrow.receiver.expression, stagedMapOrdinaryOwnKeysNoUserEntry) || query.observeStagedMapEntryLaw(borrow.get, borrow.receiver.expression, stagedMapOwnDataGetNoUserEntry) {
					t.Fatal("finished source phase retained law rights")
				}
				// A saved callback is not a source event. Its consumer must require
				// the ephemeral marker, as the actual graph callback does.
				borrow.noUserEntry = func(get *sourceGetInputs, group *ast.Node) bool {
					return borrow.noUserPublication != nil && saved(get, group)
				}
				if borrow.noUserEntry(borrow.get, borrow.receiver.expression) {
					t.Fatal("raw callback supplied an original semantic event")
				}
			})
		})
	}
}

// These supplied-event controls test lifetime only, never semantic readiness.
func TestStagedMapEntryLawLifetime(t *testing.T) {
	for _, mode := range []string{"live", "refused", "revoked", "trace", "reading", "event", "copy-query", "copy-get", "generation", "cut"} {
		t.Run(mode, func(t *testing.T) {
			withStagedMapProtocolSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:1}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				revoke, installed := beginStagedMapProtocolSource(query, source, func(sourceStagedMapEntry) bool { return true })
				if !installed {
					t.Fatal("original borrow missing")
				}
				defer revoke()
				borrow := query.stagedMap
				get, group := borrow.get, borrow.receiver.expression
				priorMode, priorKnown, priorReading := query.traceMode, query.traceModeKnown, query.reading
				query.traceMode, query.traceModeKnown = accessorEnumerate|accessorNoGet, true
				defer func() { query.traceMode, query.traceModeKnown, query.reading = priorMode, priorKnown, priorReading }()
				calls := 0
				borrow.noUserEntry = func(input *sourceGetInputs, selected *ast.Node) bool {
					calls++
					if input != get || selected != group || borrow.noUserPublication == nil {
						t.Fatal("callback lost exact source event")
					}
					switch mode {
					case "refused":
						return false
					case "revoked":
						revoke()
					case "trace":
						query.traceMode = accessorAcquire
					case "reading":
						borrow.reading = true
					case "event":
						borrow.noUserPublication = &sourceStagedMapEntryLawEvent{get: get, group: group, law: stagedMapOrdinaryOwnKeysNoUserEntry}
					case "generation":
						borrow.generation = &projectGeneration{}
					case "cut":
						query.reading = nil
					}
					return true
				}
				issuer, input := query, get
				if mode == "copy-query" {
					copy := *query
					issuer = &copy
				}
				if mode == "copy-get" {
					copy := *get
					input = &copy
				}
				if issuer.observeStagedMapEntryLaw(input, group, stagedMapOrdinaryOwnKeysNoUserEntry) != (mode == "live") || borrow.noUserPublication != nil {
					t.Fatal("invalid event accepted or temporary publication leaked")
				}
				if (mode == "copy-query" || mode == "copy-get") && calls != 0 {
					t.Fatal("copied source identity reached callback")
				}
				if borrow.observed || len(borrow.entries) != 0 || !borrow.pending {
					t.Fatal("local law manufactured source population/closure")
				}
			})
		})
	}
}

func TestStagedMapDataEntryLawCurrentReceipt(t *testing.T) {
	for _, changed := range []bool{false, true} {
		withStagedMapProtocolSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
			var entry sourceStagedMapEntry
			revoke, installed := beginStagedMapProtocolSource(query, source, func(candidate sourceStagedMapEntry) bool {
				if candidate.member != nil {
					entry = candidate
				}
				return true
			})
			if !installed {
				t.Fatal("original source borrow missing")
			}
			defer revoke()
			borrow := query.stagedMap
			query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, borrow.get)
			observed := false
			borrow.noUserEntry = func(*sourceGetInputs, *ast.Node) bool {
				if borrow.noUserPublication == nil || borrow.noUserPublication.law != stagedMapOwnDataGetNoUserEntry || borrow.currentRead == nil {
					t.Fatal("DATA event lacks original terminal receipt")
				}
				observed = true
				if changed {
					copy := *borrow.currentRead
					borrow.currentRead = &copy
				}
				return true
			}
			request, valid := stagedMapEntryRequest(source, entry)
			published := false
			accepted := consumeStagedMapEntrySource(query, source, entry, request, func(sourceStagedMapEntryRead) bool { published = true; return true })
			if !valid || !observed || accepted != !changed || published != !changed || borrow.noUserPublication != nil {
				t.Fatal("copied current receipt retained DATA event/publication authority")
			}
		})
	}
}
