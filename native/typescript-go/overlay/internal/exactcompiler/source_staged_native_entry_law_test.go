package exactcompiler

import "testing"

// Algorithm entry begins after actual evaluation. An eager computed-key Call
// must retain its own known body and external alternative before the next Get.
func TestStagedNativeAlgorithmEntryKeepsEagerChildren(t *testing.T) {
	const source = `declare function foreign():void;function makeKey(){window.name;foreign();return 'tag'}const prefix=Object.freeze(Object.defineProperties({}, {[makeKey()]:{value:true}}));export const store=new WeakMap<object,unknown>();export function invoke(){return prefix}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/native-algorithm-eager.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") || response.Code != "" {
			t.Fatal("eager user entry lost module placement requirement", response.Error, response.Diagnostics)
		}
		browser, unknown := false, false
		for _, fact := range stagedDeclarationFacts(session) {
			if !runtimeModuleEvaluation(fact.node) {
				continue
			}
			for _, effect := range fact.summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown" && effect.Opaque
			}
		}
		if !browser || !unknown {
			t.Fatal("algorithm law dropped eager known/unknown contributions", browser, unknown)
		}
	}
}
