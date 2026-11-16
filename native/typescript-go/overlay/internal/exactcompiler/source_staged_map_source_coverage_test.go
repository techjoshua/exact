package exactcompiler

import "testing"

// Every group comes from original selected map enumeration. Local coverage is
// tested independently of still-required key/enumerability/target/RHS closure.
func TestStagedMapSourcePrivateUseCoverage(t *testing.T) {
	for _, row := range []struct {
		name, source string
		covered      bool
	}{
		{"direct", `export function invoke(){return Object.defineProperties({},{run:{value:()=>window.name}})}`, true},
		{"private alias", `export function invoke(){const map={run:{value:()=>window.name}};const alias=map;return Object.defineProperties({},alias)}`, true},
		{"exported alias", `export const map={run:{value:()=>window.name}};export function invoke(){return Object.defineProperties({},map)}`, false},
		{"foreign escape", `declare function foreign(value:unknown):void;const map={run:{value:1}};foreign(map);export function invoke(){return Object.defineProperties({},map)}`, false},
		{"returned alias", `const map={run:{value:1}};export function expose(){return map}export function invoke(){return Object.defineProperties({},map)}`, false},
		{"stored escape", `const map={run:{value:1}};const holder={map};export function invoke(){return Object.defineProperties({},map)}`, false},
		{"delivered writer", `function put(map:PropertyDescriptorMap,next:PropertyDescriptor){map.run=next}const map:PropertyDescriptorMap={run:{value:1}};put(map,{value:()=>window.name});export function invoke(){return Object.defineProperties({},map)}`, true},
		{"writer formal escapes", `declare function foreign(value:unknown):void;function put(map:PropertyDescriptorMap,next:PropertyDescriptor){map.run=next;foreign(map)}const map:PropertyDescriptorMap={run:{value:1}};put(map,{value:()=>window.name});export function invoke(){return Object.defineProperties({},map)}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				facts := installationSourceFacts(query)
				work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
				request := source.descriptorMap.protocol
				if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
					t.Fatal("selected source registration missing")
				}
				id, required := work.requireOperation(facts, request)
				if !required {
					t.Fatal("original map request missing")
				}
				work.prepareStagedDescriptorMapSource(facts, id, query.executable)
				protocol := work.operationRecipes[request.producer]
				if protocol.mapProtocol == nil || len(protocol.mapProtocol.entries) == 0 {
					t.Fatal("original source group observation missing")
				}
				group := protocol.mapProtocol.entries[0].group
				parent := stagedMapProtocolPhaseRequest(source, "own-writers")
				before := work.operationRecipes[parent.producer]
				covered := work.stagedMapSourceUsesCovered(source, group, query.executable)
				if covered != row.covered {
					t.Fatalf("source coverage=%v want=%v", covered, row.covered)
				}
				after := work.operationRecipes[parent.producer]
				if before.delta.extracted != after.delta.extracted || len(before.writerRequired) != len(after.writerRequired) || !operationDeltaPrefix(before.delta, after.delta) || !operationDeltaPrefix(after.delta, before.delta) {
					t.Fatal("descriptive use coverage consumed or discarded RHS obligations")
				}
				if row.name == "delivered writer" && len(after.writerRequired) == 0 {
					t.Fatal("writer coverage was inferred without original delivered source relationships")
				}
				if protocol.mapProtocol.keysAccounted || protocol.mapProtocol.enumerabilityAccounted || protocol.mapProtocol.targetAccounted || work.closedOperationDependencies()[id.index] {
					t.Fatal("private-use predicate paid unrelated map protocols")
				}
				wrong := *source
				plan := *source.descriptorMap
				plan.descriptors = plan.target
				wrong.descriptorMap = &plan
				if work.stagedMapSourceUsesCovered(&wrong, group, query.executable) {
					t.Fatal("wrong selected map input association granted coverage")
				}
			})
		})
	}
}
