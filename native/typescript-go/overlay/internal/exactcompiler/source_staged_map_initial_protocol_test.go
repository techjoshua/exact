package exactcompiler

import "testing"

// Initial protocol semantics are consumed from an actual post-writer source
// receipt, not from an adapter-created event or a count of discovered entries.
func TestStagedMapInitialProtocolOriginalReceipt(t *testing.T) {
	for _, row := range []struct {
		name, source        string
		keys, enumerability bool
	}{
		{"empty", `export function invoke(){return Object.defineProperties({},{})}`, true, true},
		{"data dormant", `export function invoke(){return Object.defineProperties({},{run:{value:()=>window.name}})}`, true, true},
		{"computed independent eager", `export function invoke(key:string){return Object.defineProperties({},{[key]:{value:()=>window.name}})}`, true, true},
		{"numeric", `export function invoke(){return Object.defineProperties({},{'0':{value:1}})}`, true, true},
		{"getter ordering", `export function invoke(){return Object.defineProperties({},{get run(){window.name;return{value:1}},later:{value:2}})}`, true, false},
		{"setter ordering pending", `export function invoke(){return Object.defineProperties({},{set run(value:PropertyDescriptor){window.name}})}`, true, false},
		{"spread population pending", `export function invoke(extra:PropertyDescriptorMap){return Object.defineProperties({},{...extra,run:{value:1}})}`, false, false},
		{"prototype relation pending", `export function invoke(){return Object.defineProperties({},{__proto__:{value:1},run:{value:2}})}`, false, false},
		{"own proto shorthand omitted", `const __proto__:PropertyDescriptor={value:1};export function invoke(){return Object.defineProperties({},{__proto__,run:{value:2}})}`, false, false},
		{"own proto accessor omitted", `export function invoke(){return Object.defineProperties({},{get __proto__(){window.name;return{value:1}}})}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedMapProtocolSource(t, row.source, func(query *sourceValueQuery, source *sourceStagedNativeGetSource) {
				facts := installationSourceFacts(query)
				work := callableEffectWork{extracting: -1, operationGeneration: query.owner.generation}
				request := source.descriptorMap.protocol
				if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, nativeGet: source}) {
					t.Fatal("original selected source registration missing")
				}
				id, ok := work.requireOperation(facts, request)
				if !ok {
					t.Fatal("original map membership missing")
				}
				work.prepareStagedDescriptorMapSource(facts, id, query.executable)
				writer := work.operationRecipes[stagedMapProtocolPhaseRequest(source, "own-writers").producer]
				if writer.mapProtocol == nil || writer.mapProtocol.writerSource == nil {
					t.Fatal("original post-traversal receipt missing")
				}
				receipt := *writer.mapProtocol.writerSource
				before := callableAnalysisFingerprint(callableAnalysis{facts: facts})
				result, valid := describeStagedMapInitialProtocol(source, receipt)
				if !valid || result.keysAccounted != row.keys || result.enumerabilityAccounted != row.enumerability {
					t.Fatalf("initial protocol=%+v valid=%v", result, valid)
				}
				if callableAnalysisFingerprint(callableAnalysis{facts: facts}) != before {
					t.Fatal("pure helper published aggregate readiness")
				}
				for _, change := range []func(*sourceStagedMapWriterDisposition){
					func(r *sourceStagedMapWriterDisposition) { r.generation = nil },
					func(r *sourceStagedMapWriterDisposition) { r.group = source.descriptorMap.target.expression },
					func(r *sourceStagedMapWriterDisposition) {
						r.request = stagedMapProtocolPhaseRequest(source, "own-writers")
					},
					func(r *sourceStagedMapWriterDisposition) { r.cut.use = source.request.use },
					func(r *sourceStagedMapWriterDisposition) { r.cut.reading = nil },
				} {
					wrong := receipt
					change(&wrong)
					if _, valid := describeStagedMapInitialProtocol(source, wrong); valid {
						t.Fatal("mismatched association admitted")
					}
				}
			})
		})
	}
}
