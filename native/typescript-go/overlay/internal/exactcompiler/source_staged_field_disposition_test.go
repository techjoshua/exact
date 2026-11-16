package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Scalar controls qualify classification only. They do not manufacture source
// observations or establish original Has/Get authority or staged field closure.
func TestStagedFieldDispositionClassification(t *testing.T) {
	for _, row := range []struct {
		name     string
		presence sourcePropertyPresence
		has, get sourceEffectAccounting
		getter   bool
		want     sourceStagedFieldDispositionKind
	}{
		{"positive absence", propertyAbsent, sourceEffectsAccounted, sourceEffectsBypassed, false, stagedFieldDispositionAbsent},
		{"data read", propertyPresent, sourceEffectsAccounted, sourceEffectsAccounted, false, stagedFieldDispositionData},
		{"data effects without precise output", propertyUnknown, sourceEffectsAccounted, sourceEffectsAccounted, false, stagedFieldDispositionData},
		{"getter read", propertyPresent, sourceEffectsAccounted, sourceEffectsAccounted, true, stagedFieldDispositionGetter},
		{"getter effects without normal output", propertyUnknown, sourceEffectsAccounted, sourceEffectsAccounted, true, stagedFieldDispositionGetter},
		{"unknown Has", propertyUnknown, sourceEffectsUnaccounted, sourceEffectsAccounted, false, stagedFieldDispositionUnknown},
		{"unknown Get", propertyPresent, sourceEffectsAccounted, sourceEffectsUnaccounted, true, stagedFieldDispositionUnknown},
		{"refused Get", propertyPresent, sourceEffectsAccounted, sourceEffectsRefused, false, stagedFieldDispositionUnknown},
		{"unresolved bypass", propertyUnknown, sourceEffectsAccounted, sourceEffectsBypassed, false, stagedFieldDispositionUnknown},
		{"absence without Has coverage", propertyAbsent, sourceEffectsUnaccounted, sourceEffectsBypassed, false, stagedFieldDispositionUnknown},
		{"absence with reached getter", propertyAbsent, sourceEffectsAccounted, sourceEffectsBypassed, true, stagedFieldDispositionUnknown},
		{"absence with reached data Get", propertyAbsent, sourceEffectsAccounted, sourceEffectsAccounted, false, stagedFieldDispositionUnknown},
	} {
		t.Run(row.name, func(t *testing.T) {
			got := classifyStagedFieldDisposition(row.presence, sourceReflectiveFieldEffects{has: row.has, get: row.get, getter: row.getter})
			if got != row.want {
				t.Fatalf("classification=%v want=%v", got, row.want)
			}
		})
	}
}

// Events are supplied explicitly to isolate observer aggregation and lifetime.
// This does not establish positive source Has/Get outcomes, absence authority or
// integrated field closure. The receiver and getter are original source nodes.
func TestStagedFieldObservationAggregation(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, func(query *sourceValueQuery, call *ast.Node) {
		receiver := restrictedInvocationArguments(call.AsCallExpression())[2]
		getter := receiver.AsObjectLiteralExpression().Properties.Nodes[0]
		observation := &sourceStagedFieldObservation{phase: stagedFieldObservationHas}
		borrow := &sourceStagedFieldGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, operation: call, receiver: receiver, field: "value", cut: query.relativeInputCut(call), observation: observation}
		query.stagedFieldGet = borrow
		defer func() { query.stagedFieldGet = nil; borrow.issuer = nil; borrow.observation = nil }()
		get := &sourceGetInputs{operation: call, receiver: sourceValue{node: receiver}, propertyKey: "value", hasOnly: true, stagedEffects: borrow}
		other := &sourceStagedFieldObservation{phase: stagedFieldObservationHas}
		query.observeStagedFieldHas(get, propertyAbsent, sourceEffectsAccounted, other)
		if other.hasSeen {
			t.Fatal("another observation inherited the borrow")
		}
		copied := *query
		copied.observeStagedFieldHas(get, propertyAbsent, sourceEffectsAccounted, observation)
		if observation.hasSeen {
			t.Fatal("copied issuer established Has accounting")
		}
		query.observeStagedFieldHas(get, propertyPresent, sourceEffectsAccounted, observation)
		query.observeStagedFieldHas(get, propertyUnknown, sourceEffectsUnaccounted, observation)
		query.observeStagedFieldHas(get, propertyPresent, sourceEffectsAccounted, observation)
		if observation.effects.has == sourceEffectsAccounted || observation.presence != propertyUnknown {
			t.Fatal("positive branch erased unresolved Has")
		}
		query.observeStagedFieldRead(get, getter, sourceEffectsAccounted, observation)
		if observation.getSeen {
			t.Fatal("Get observed during the Has phase")
		}
		observation.phase = stagedFieldObservationGet
		get.hasOnly = false
		query.observeStagedFieldRead(get, getter, sourceEffectsRefused, observation)
		query.observeStagedFieldRead(get, nil, sourceEffectsAccounted, observation)
		if observation.effects.get == sourceEffectsAccounted || len(observation.effects.invoked) != 1 || observation.effects.invoked[0].declaration != getter || observation.effects.invoked[0].alternative.endpoint.expression != receiver || observation.effects.invoked[0].alternative.endpoint.cut != borrow.cut {
			t.Fatal("refused sibling or known getter association lost")
		}
		if classifyStagedFieldDisposition(observation.presence, observation.effects) != stagedFieldDispositionUnknown {
			t.Fatal("partial known contributions settled aggregate coverage")
		}
		observation.phase = stagedFieldObservationFinished
		query.observeStagedFieldRead(get, getter, sourceEffectsAccounted, observation)
		if len(observation.effects.invoked) != 1 {
			t.Fatal("finished observation accepted later work")
		}
	})
}

// These controls drive original source member selection, ordered Has/Get and
// scoped publication. No observation events or disposition scalars are supplied
// by the test. Passing requires native execution of the controls, not just their
// presence. Independent callee/eager and getter-body transport remain explicit.
func TestStagedFieldDispositionOriginalSourceReceipts(t *testing.T) {
	for _, row := range []struct {
		name, source    string
		want            sourceStagedFieldDispositionKind
		invoked, window bool
		closed          bool
	}{
		{"data callback", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, stagedFieldDispositionData, false, false, true},
		{"data method", `export function invoke(){return Object.defineProperty({},'run',{value(){return document.title}})}`, stagedFieldDispositionData, false, false, true},
		{"getter returns dormant callback", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, stagedFieldDispositionGetter, true, true, false},
		{"throwing getter has no normal output", `export function invoke(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, stagedFieldDispositionGetter, true, true, false},
		{"known getter beside unresolved descriptor fields", `declare const extras:Record<string,unknown>;export function invoke(){return Object.defineProperty({},'run',{...extras,get value(){window.name;return ()=>document.title}})}`, stagedFieldDispositionUnknown, true, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				descriptor := restrictedInvocationArguments(call.AsCallExpression())[2]
				request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: descriptor, request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "original-field-disposition", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
				work := callableEffectWork{extracting: -1}
				revoke, installed := beginStagedNativeDescriptorSource(query, &work, facts, request)
				if !installed {
					t.Fatal("original source registration refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				work.prepareOperationUses(facts, query.executable)
				key := request.request.producer
				key.selector = sourceStagedOperationSelector{occurrence: descriptor, field: "value"}
				id, found := work.operationIDs[key]
				if !found {
					t.Fatal("original value-field requirement missing")
				}
				state := &work.operations[id.index]
				receipt := state.fieldDisposition
				if state.revision == 0 {
					t.Fatal("authenticated source disposition did not advance its revision")
				}
				if receipt == nil || receipt.operation != call || receipt.receiver != descriptor || receipt.field != "value" || receipt.cut.operation != call || receipt.cut.reading != call || receipt.kind != row.want {
					t.Fatalf("original source receipt=%#v want=%v", receipt, row.want)
				}
				if row.want != stagedFieldDispositionUnknown && (receipt.has != sourceEffectsAccounted || receipt.get != sourceEffectsAccounted) {
					t.Fatal("terminal disposition lacked independent Has/Get accounting")
				}
				if (len(receipt.invoked) != 0) != row.invoked {
					t.Fatal("stored callable invoked or known getter lost")
				}
				for _, invocation := range receipt.invoked {
					if invocation.operation != call || invocation.alternative.endpoint.expression != descriptor || invocation.alternative.endpoint.cut != receipt.cut {
						t.Fatal("getter receiver or original live cut lost")
					}
				}
				// Missing fields cannot become empty DATA/Get coverage. A later
				// positive original Has absence may legitimately account their skip.
				for _, field := range reflectiveDescriptorKeys {
					if field == "value" {
						continue
					}
					other := key
					other.selector.field = field
					otherState := &work.operations[work.operationIDs[other].index]
					if otherState.fieldDisposition == nil {
						t.Fatal("original Has/Get field source did not publish")
					}
					missing := otherState.fieldDisposition
					if missing.kind != stagedFieldDispositionUnknown && missing.kind != stagedFieldDispositionSources && (missing.kind != stagedFieldDispositionAbsent || missing.has != sourceEffectsAccounted || missing.get != sourceEffectsBypassed) {
						t.Fatal("missing field acquired unsupported disposition")
					}
				}
				if query.inputs != nil || query.operation != nil || work.closedOperationDependencies()[work.operationIDs[request.request.producer].index] != row.closed {
					t.Fatal("field source closure disagrees with represented bodies or manufactured a normal frame")
				}
				for _, role := range []string{"callee-get", "eager-inputs"} {
					debt := request.request.producer
					debt.selector = sourceStagedOperationSelector{occurrence: request.get, field: role}
					state := &work.operations[work.operationIDs[debt].index]
					if !state.delta.extracted {
						continue
					}
					ownerRecipe := work.operationRecipes[debt]
					source := ownerRecipe.nativeGet
					if state.revision == 0 || source == nil || !sameOperationRequest(source.request, request.request) {
						t.Fatal("ready root role lost original source owner", role)
					}
					if role == "callee-get" {
						if ownerRecipe.delta.extracted || state.nativeCallee == nil || state.nativeCallee.generation != query.owner.generation || !validStagedNativeCalleeEffects(*state.nativeCallee, source) {
							t.Fatal("callee readiness lacks graph-local original Get proof")
						}
					} else if source.eager == nil || !validStagedNativeEagerInputs(*source.eager, source) {
						t.Fatal("eager readiness lacks independent creation proof")
					}
				}
				resolveCallableEffects(facts, query.executable)
				parent := &facts[work.memberNodes[declaration]]
				window, document := false, false
				for _, effect := range parent.summary.EffectSources {
					window = window || effect.Environment == "browser" && effect.Description == "window"
					document = document || effect.Environment == "browser" && effect.Description == "document"
				}
				if window != row.window || document {
					t.Fatalf("known/dormant donors: window=%t want=%t document=%t", window, row.window, document)
				}
			})
		})
	}
}
