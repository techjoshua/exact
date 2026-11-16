package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The public module composition journey calls this on its actual Session facts.
// Settlement is the ordinary queue's conjunction, not an isolated observer pass.
// The paired artifacts in that same journey retain the runtime behavior checks.
func assertStagedMapEnumProductionParents(t *testing.T, session *Session) {
	t.Helper()
	facts := stagedDeclarationFacts(session)
	recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
	var latent *ast.Node
	browser, unknown := false, false
	for _, fact := range facts {
		if fact.summary.Name == "latentWriter" {
			latent = fact.node
			for _, effect := range fact.summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown" && effect.callOrigin != nil && effect.callOrigin.operation != nil && ast.IsCallExpression(effect.callOrigin.operation) && ast.IsIdentifier(effect.callOrigin.operation.Expression()) && effect.callOrigin.operation.Expression().Text() == "foreign"
			}
		}
		for _, recipe := range fact.staged.operationRecipes {
			recipes[recipe.key] = recipe
		}
	}
	connected := false
	for _, fact := range facts {
		for _, use := range fact.staged.operationUses {
			root := recipes[use.request.producer]
			source := root.nativeGet
			if source == nil || source.kind != sourceNativeObjectDefineProperties || root.key != source.request.producer {
				continue
			}
			// The immutable root retains original acquisition. The selected
			// algorithm recipe owns its descriptor-map refinement.
			algorithm := recipes[nativeRootDebtRequest(source, "algorithm").producer]
			if !sameNativeGetSource(source, algorithm.nativeGet) || !validNativeDescriptorMapRecipe(algorithm) {
				t.Fatal("production root lost its selected descriptor-map algorithm")
			}
			source = algorithm.nativeGet
			connected = true
			if !fact.staged.settled || fact.staged.operationsPending || !sameOperationRequest(use.request, source.request) {
				t.Fatal("production map consumer did not settle its exact original source root")
			}
			writers := stagedMapProtocolPhaseRequest(source, "own-writers")
			writer := recipes[writers.producer]
			if !validStagedMapProtocolRecipe(writer) || writer.mapProtocol.writerSource == nil || !writer.delta.extracted {
				t.Fatal("production enum did not receive its original post-writer disposition")
			}
			proof := writer.mapProtocol.writerSource
			expected := stagedMemberCoverageRequest(source.request, proof.group, proof.cut)
			found := false
			for _, child := range writer.delta.required {
				found = found || sameOperationRequest(child, expected)
			}
			coverage := recipes[expected.producer]
			if !found || !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || !sameOperationRequest(coverage.memberSource.parent, source.request) || coverage.memberSource.generation != proof.generation || coverage.memberSource.coverage.origin != proof.group || coverage.memberSource.coverage.cut != proof.cut {
				t.Fatal("production own-writers phase omitted its original enum source-set child")
			}
			writerExcluded, protocolExcluded := false, false
			for _, child := range coverage.delta.required {
				recipe, registered := recipes[child.producer]
				if !registered || !validOperationEnvelope(recipe) || child.consumer != source.request.consumer || child.inputs != nil || child.cut != source.request.cut {
					t.Fatal("production enum source interval lost an original writer/protocol requirement")
				}
				if member := recipe.memberSource; member != nil && member.candidate.region == latent {
					deferredWriter := member.writeEffects && plainStagedAssignment(member.candidate.operation)
					deferredProtocol := member.candidate.protocol && ast.IsCallExpression(member.candidate.operation) && ast.IsIdentifier(member.candidate.operation.Expression()) && member.candidate.operation.Expression().Text() == "foreign"
					if deferredWriter || deferredProtocol {
						exclusion := member.moduleExcluded
						if exclusion == nil || !exclusion.supported || !exclusion.accounted || exclusion.source.read != source.request.use || exclusion.source.cut != proof.cut || exclusion.source.generation != proof.generation || !sameOperationRequest(exclusion.source.request, source.request) {
							t.Fatal("deferred enum source was omitted or paid without its original initial-OwnKeys disposition")
						}
						writerExcluded = writerExcluded || deferredWriter
						protocolExcluded = protocolExcluded || deferredProtocol
					}
				}
			}
			if latent == nil || !browser || !unknown || !writerExcluded || !protocolExcluded {
				t.Fatal("production enum did not exercise both deferred source roles while retaining their dormant donors")
			}
			for _, effect := range fact.summary.EffectSources {
				if effect.Environment == "browser" || effect.Environment == "unknown" {
					t.Fatal("initial enum activated a deferred source body")
				}
			}
			protocol := recipes[source.descriptorMap.protocol.producer]
			if !validStagedMapProtocolRecipe(protocol) || !protocol.delta.extracted || len(protocol.mapProtocol.entries) == 0 {
				t.Fatal("production enum did not connect entry conversion to the same source protocol")
			}
			for _, entry := range protocol.mapProtocol.entries {
				request, valid := stagedMapEntryRequest(source, entry)
				child := recipes[request.producer]
				if !valid || !validStagedMapEntryRecipe(child) || child.mapEntry.read == nil || !sameStagedMapEntry(child.mapEntry.read.entry, entry) {
					t.Fatal("production enum entry relationship was not delivered to its original Get")
				}
			}
		}
	}
	if !connected {
		t.Fatal("production map source parent was not exercised")
	}
}

// These metadata refusals supplement the production Session/Node journey. They
// do not manufacture a source event or relax the current graph receipt checks.
func TestStagedMapEnumSourceRequestRefusal(t *testing.T) {
	withStagedMapProtocolSource(t, `export function invoke(){return Object.defineProperties({},{run:{value:()=>document.title}})}`, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
		request := source.descriptorMap.protocol
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
			t.Fatal("original source protocol registration")
		}
		id, required := work.requireOperation(facts, request)
		if !required {
			t.Fatal("original source protocol membership")
		}
		work.prepareStagedDescriptorMapSource(facts, id, query.executable)
		writerRequest := stagedMapProtocolPhaseRequest(source, "own-writers")
		writer := work.operationRecipes[writerRequest.producer]
		if !validStagedMapProtocolRecipe(writer) {
			t.Fatal("actual enum source envelope invalid")
		}
		index := -1
		for i, child := range writer.delta.required {
			if validStagedMapMemberSourceRequest(source, child) {
				index = i
				break
			}
		}
		if index < 0 {
			t.Fatal("actual enum did not require the shared member source interval")
		}
		for _, change := range []func(*sourceStagedOperationRequest){
			func(r *sourceStagedOperationRequest) { r.edge += ":different" },
			func(r *sourceStagedOperationRequest) { r.inputs = &sourceRelativeInputEdge{} },
			func(r *sourceStagedOperationRequest) { r.cut.reading = source.get },
			func(r *sourceStagedOperationRequest) { r.producer.selector.field = "member-get-effects" },
		} {
			bad := writer
			bad.delta = cloneOperationDelta(writer.delta)
			change(&bad.delta.required[index])
			if validStagedMapProtocolRecipe(bad) {
				t.Fatal("another source request replaced the exact enum child")
			}
		}
		if work.admitStagedMapMemberSources(facts, query) || work.publishStagedMapWriterDisposition(facts, query, source) {
			t.Fatal("revoked enum loan retained source publication authority")
		}
	})
}

// The actual original enum finish lends the live source interval. Entry Get,
// ordinary read and callee-cut contexts cannot reuse that authority. This
// function reader also retains prior-state candidates without module exclusion.
func TestStagedMapEnumSourcePhaseAndReadCut(t *testing.T) {
	const fixture = `declare function foreign():void;function latentWriter(target:PropertyDescriptorMap){window.name;foreign();target.run={value:()=>document.title}}export function invoke(){return Object.defineProperties({},{run:{value:1}})}`
	withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
		writers := stagedMapProtocolPhaseRequest(source, "own-writers")
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: writers.producer, nativeGet: source, mapProtocol: &sourceStagedMapProtocolContribution{request: writers, generation: query.owner.generation}}) {
			t.Fatal("original own-writers role registration")
		}
		if _, adopted := work.requireOperation(facts, writers); !adopted {
			t.Fatal("original enum consumer membership")
		}
		revokeMap, installed := beginStagedMapProtocolSource(query, source, func(sourceStagedMapEntry) bool { return true })
		if !installed {
			t.Fatal("original map observation loan")
		}
		defer revokeMap()
		observed := false
		revokeMember, installed := query.beginStagedMemberSource(source.request, func(candidate sourceStagedMemberCandidate) bool {
			return work.registerStagedMemberCandidate(facts, query, source.request, candidate)
		}, func(receipt sourceStagedMemberDisposition) bool {
			if !work.registerStagedMemberDisposition(facts, query, receipt) {
				return false
			}
			if !work.admitStagedMapMemberSources(facts, query) {
				t.Fatal("original enum finish did not attach its required source parent")
			}
			observed = true
			borrow, member := query.stagedMap, query.stagedMember
			borrow.reading = true
			if work.admitStagedMapMemberSources(facts, query) {
				t.Fatal("entry Get inherited initial OwnKeys authority")
			}
			borrow.reading = false
			borrow.currentRead = &sourceStagedMapEntryRead{}
			if work.admitStagedMapMemberSources(facts, query) {
				t.Fatal("active entry publication inherited initial OwnKeys authority")
			}
			borrow.currentRead = nil
			mode := member.mode
			member.mode = accessorRead
			if work.admitStagedMapMemberSources(facts, query) {
				t.Fatal("ordinary Get inherited enum source authority")
			}
			member.mode = mode
			reading := query.reading
			query.reading = source.get
			if work.admitStagedMapMemberSources(facts, query) {
				t.Fatal("callee-before-actuals cut inherited initial OwnKeys authority")
			}
			query.reading = reading
			copied := *query
			if work.admitStagedMapMemberSources(facts, &copied) {
				t.Fatal("copied query inherited the original enum finish")
			}
			if work.operationRecipes[writers.producer].delta.extracted {
				t.Fatal("source interval admission completed own-writers without its original disposition")
			}
			return true
		})
		if !installed {
			t.Fatal("original member source loan")
		}
		defer revokeMember()
		query.accessorsAtGet(source.descriptorMap.descriptors.expression, nil, "", accessorEnumerate|accessorNoGet, nil, nil, query.stagedMap.get)
		if !observed || work.admitStagedMapMemberSources(facts, query) {
			t.Fatal("enum source observation missing or usable after original finish")
		}
		for _, recipe := range work.operationRecipes {
			if member := recipe.memberSource; member != nil && sameOperationRequest(member.parent, source.request) && member.moduleExcluded != nil {
				t.Fatal("function prior-state candidate borrowed a module prefix exclusion")
			}
		}
	})
}
