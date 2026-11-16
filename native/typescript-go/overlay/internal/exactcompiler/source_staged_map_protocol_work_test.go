package exactcompiler

import "testing"

// Original selected admission and actual ordered enumeration supply the source
// records. The queue driver connects those records to field work without paying
// writer, OwnKeys, enumerability, target or getter-output prerequisites.
func TestStagedMapWorkOriginalEntryPipeline(t *testing.T) {
	for row, fixture := range []string{
		`export function invoke(){return Object.defineProperties({},{first:{value:()=>document.title},get second(){window.name;return{value:1}}})}`,
		`export function invoke(extra:PropertyDescriptorMap){return Object.defineProperties({},{first:{value:1},...extra})}`,
	} {
		withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
			facts := installationSourceFacts(query)
			work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
			request := source.descriptorMap.protocol
			if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
				t.Fatal("original selected protocol registration refused")
			}
			id, required := work.requireOperation(facts, request)
			if !required {
				t.Fatal("original protocol request refused")
			}
			work.prepareStagedDescriptorMapSource(facts, id, query.executable)
			protocol := work.operationRecipes[request.producer]
			if protocol.mapProtocol == nil || len(protocol.mapProtocol.entries) != 2 || protocol.delta.extracted != (row == 0) || protocol.mapProtocol.keysAccounted || protocol.mapProtocol.enumerabilityAccounted || protocol.mapProtocol.targetAccounted {
				t.Fatal("source entries missing or unissued protocol coverage granted")
			}
			if !validStagedMapProtocolRecipe(protocol) {
				t.Fatal("published map source envelope invalid")
			}
			for _, role := range []string{"own-writers", "own-keys", "enumerability", "target"} {
				phase := stagedMapProtocolPhaseRequest(source, role)
				recipe, found := work.operationRecipes[phase.producer]
				if !found || recipe.delta.extracted != (role == "own-writers" || role == "target" || row == 0 && role == "own-keys") || !validStagedMapProtocolRecipe(recipe) {
					t.Fatal("independent protocol source debt missing")
				}
			}
			for _, entry := range protocol.mapProtocol.entries {
				request, valid := stagedMapEntryRequest(source, entry)
				if !valid {
					t.Fatal("original entry source key lost")
				}
				recipe, found := work.operationRecipes[request.producer]
				if !found || !validStagedMapEntryRecipe(recipe) {
					t.Fatal("entry source producer not connected")
				}
				contribution := recipe.mapEntry
				for _, field := range reflectiveDescriptorKeys {
					fieldRequest := stagedMapEntryFieldRequest(contribution, field)
					fieldRecipe, found := work.operationRecipes[fieldRequest.producer]
					if !found || fieldRecipe.nativeGet == nil || fieldRecipe.nativeGet.descriptorEntry == nil || len(fieldRecipe.delta.required) != 2 {
						t.Fatal("field/source requirements missing before entry conversion")
					}
					for _, child := range fieldRecipe.delta.required {
						if _, found := work.operationRecipes[child.producer]; !found {
							t.Fatal("descriptor source membership missing")
						}
					}
				}
				if entry.descriptor.expression != nil {
					if contribution.read == nil || len(recipe.delta.exposures) != 1 || !sameOperationEndpoint(recipe.delta.exposures[0].endpoint, entry.descriptor) {
						t.Fatal("original dormant descriptor endpoint lost")
					}
				} else if entry.getter != nil {
					body := stagedMapEntryGetterRequest(contribution)
					if contribution.read == nil || contribution.read.getter != entry.getter || len(contribution.read.bound.bindings) != 1 || recipe.delta.extracted || work.operationRecipes[body.producer].mapEntry.read == nil {
						t.Fatal("real getter receiver/body relation lost or completed prematurely")
					}
				}
			}
			if work.closedOperationDependencies()[id.index] {
				t.Fatal("map entry prefix settled aggregate protocols")
			}
		})
	}
}

// The original enum writer owner, not the map literal inventory, publishes the
// prior installation. Its RHS remains an independent required source producer.
func TestStagedMapWorkOriginalWriterSubscription(t *testing.T) {
	const fixture = `function browser(){return window.name}function put(map:PropertyDescriptorMap,descriptor:PropertyDescriptor){map.run=descriptor}const map:PropertyDescriptorMap={run:{value:()=> 'safe'}};put(map,{value:browser});export function invoke(){return Object.defineProperties({},map)}`
	withStagedMapProtocolSource(t, fixture, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
		request := source.descriptorMap.protocol
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
			t.Fatal("selected protocol registration missing")
		}
		id, required := work.requireOperation(facts, request)
		if !required {
			t.Fatal("protocol request refused")
		}
		work.prepareStagedDescriptorMapSource(facts, id, query.executable)
		parent := stagedMapProtocolPhaseRequest(source, "own-writers")
		recipe, found := work.operationRecipes[parent.producer]
		if !found || len(recipe.writerRequired) == 0 {
			t.Fatal("actual enum writer publication was not subscribed before source traversal")
		}
		if recipe.delta.extracted || !validStagedMapProtocolRecipe(recipe) || recipe.mapProtocol.keysAccounted || recipe.mapProtocol.enumerabilityAccounted || recipe.mapProtocol.targetAccounted {
			t.Fatal("writer prefix paid aggregate map protocol coverage")
		}
		for _, request := range recipe.writerRequired {
			child, exists := work.operationRecipes[request.producer]
			if !exists || child.writer == nil || !sameOperationRequest(child.writer.parent, parent) || !sameOperationRequest(child.writer.request, request) || !validWriterRHSRequirement(parent.producer, request) {
				t.Fatal("writer RHS child lost original parent association")
			}
			for _, read := range child.writer.reads {
				if read.call == nil || read.readCut.use != source.request.use || read.value.creation != read.call || read.observation.operation != source.request.producer.operation {
					t.Fatal("creating Call or original map read retargeted")
				}
			}
		}
		if work.closedOperationDependencies()[id.index] {
			t.Fatal("RHS registration settled whole map")
		}
	})
}
