package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These callbacks observe original semantic events only. They supply no graph
// tickets, source coverage, normal field values or aggregate no-user-entry proof.
func TestStagedFieldEntryLawsOriginalOwner(t *testing.T) {
	for _, row := range []struct {
		source string
		data   bool
		has    bool
	}{
		{`export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, true, true},
		{`export function invoke(){return Object.defineProperty({},'run',{value(){document.title}})}`, true, true},
		{`export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return 1}})}`, false, true},
		{`export function invoke(){const key='value';return Object.defineProperty({},'run',{[key]:1})}`, false, false},
	} {
		withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
			receiver := restrictedInvocationArguments(call.AsCallExpression())[2]
			observation := &sourceStagedFieldObservation{}
			borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call), observation: observation}
			previous := query.stagedFieldGet
			query.stagedFieldGet = borrow
			defer func() { query.stagedFieldGet = previous; borrow.issuer = nil; borrow.noUserEntry = nil }()
			seen := make(map[sourceStagedFieldEntryLaw]bool)
			borrow.noUserEntry = func(get *sourceGetInputs, law sourceStagedFieldEntryLaw) bool {
				event := borrow.noUserPublication
				if event == nil || event.get != get || event.law != law || !query.liveStagedFieldGet(get) || !query.traceModeKnown {
					t.Fatal("semantic event lost its exact live Get/trace")
				}
				if query.observeStagedFieldEntryLaw(get, law) {
					t.Fatal("reentrant observer acquired publication rights")
				}
				seen[law] = true
				return true
			}
			// Transfer any actual getter body to its existing required owner. This
			// event control does not execute it or acquire its returned value.
			borrow.consume = func(*ast.Node, sourceRelativeBoundInputs) bool { return true }
			get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", stagedEffects: borrow}
			consumeStagedFieldDispositionSource(query, get, observation)
			if seen[stagedFieldOwnDataNoUserEntry] != row.data || seen[stagedFieldOrdinaryHasNoUserEntry] != row.has {
				t.Fatalf("source=%s DATA=%t Has=%t", row.source, seen[stagedFieldOwnDataNoUserEntry], seen[stagedFieldOrdinaryHasNoUserEntry])
			}
			if borrow.noUserPublication != nil || query.observeStagedFieldEntryLaw(get, stagedFieldOwnDataNoUserEntry) {
				t.Fatal("finished original driver retained event rights")
			}
		})
	}
}

// Supplied observer calls protect scoped transport, not source semantic authority.
func TestStagedFieldEntryLawLifetime(t *testing.T) {
	for _, mode := range []string{"live", "refused", "revoked", "phase", "trace", "event", "replaced-event", "copy", "untraced"} {
		t.Run(mode, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{})}`, func(query *sourceValueQuery, call *ast.Node) {
				receiver := restrictedInvocationArguments(call.AsCallExpression())[2]
				observation := &sourceStagedFieldObservation{phase: stagedFieldObservationHas}
				borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call), observation: observation}
				previous, priorMode, priorKnown := query.stagedFieldGet, query.traceMode, query.traceModeKnown
				query.stagedFieldGet, query.traceMode, query.traceModeKnown = borrow, accessorNoGet, true
				defer func() { query.stagedFieldGet, query.traceMode, query.traceModeKnown = previous, priorMode, priorKnown }()
				get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", stagedEffects: borrow, hasOnly: true}
				calls := 0
				borrow.noUserEntry = func(input *sourceGetInputs, law sourceStagedFieldEntryLaw) bool {
					calls++
					if input != get || borrow.noUserPublication == nil || borrow.noUserPublication.get != get || borrow.noUserPublication.law != law {
						t.Fatal("callback received no exact event")
					}
					switch mode {
					case "refused":
						return false
					case "revoked":
						borrow.issuer = nil
					case "phase":
						observation.phase = stagedFieldObservationGet
					case "trace":
						query.traceMode = accessorAcquire
					case "event":
						borrow.noUserPublication = nil
					case "replaced-event":
						borrow.noUserPublication = &sourceStagedFieldEntryEvent{get: get, law: law}
					}
					return true
				}
				issuer := query
				if mode == "copy" {
					copy := *query
					issuer = &copy
				}
				if mode == "untraced" {
					query.traceModeKnown = false
				}
				if issuer.observeStagedFieldEntryLaw(get, stagedFieldOrdinaryHasNoUserEntry) != (mode == "live") || borrow.noUserPublication != nil {
					t.Fatal("expired/refused event accepted or publication leaked")
				}
				if (mode == "copy" || mode == "untraced") && calls != 0 {
					t.Fatal("invalid source issuer reached callback")
				}
				if observation.hasSeen || observation.getSeen || observation.sourceHas || observation.sourceGet {
					t.Fatal("local event manufactured field accounting")
				}
			})
		})
	}
}
