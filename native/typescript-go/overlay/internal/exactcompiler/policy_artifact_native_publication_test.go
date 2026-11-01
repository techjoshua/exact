package exactcompiler

import "testing"

// An application augmentation remains a stored-data contract when its native
// container is retained in a deferred class field. Placement is a separate gate.
func TestPolicyArtifactNativeAugmentationPublication(t *testing.T) {
	for _, test := range []struct {
		name, declarations, field string
		denied                    bool
	}{
		{"stored augmentation", `declare global{interface Array<T>{extra:Tagged}}`, `value:Array<string>=Object.assign([] as string[],{extra:{value:'PRIVATE_AUGMENT_PAYLOAD'}})`, true},
		{"public augmentation", `declare global{interface Array<T>{extra:string}}`, `value:Array<string>=Object.assign([] as string[],{extra:'public'})`, false},
		{"standard native", "", `value:Array<string>=['public']`, false},
		{"native secret payload", "", `value:Array<Tagged>=[{value:'PRIVATE_AUGMENT_PAYLOAD'}]`, true},
		{"deferred method contract", `declare global{interface Array<T>{extra():Tagged}};declare const payload:Array<string>`, `value:Array<string>=payload`, false},
		{"phantom contract", `interface Phantom<T>{label:string}`, `value:Array<Phantom<Tagged>>=[{label:'public'}]`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};interface Tagged{
/** @exact keep=secret */ value:string}
` + test.declarations + `;let reads=0;const record={get label(){reads++;return 'public'},factory:class{` + test.field + `}};export function work(){return {label:record.label,reads}}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "native-augmentation-publication.ts", Source: source, Target: TargetClient, SourceMap: true})
			if response.Error != "" || hasDiagnosticCode(response.Diagnostics, "EXACT2101") {
				t.Fatalf("artifact contract not reached: %s %#v", response.Error, response.Diagnostics)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3022") != test.denied {
				t.Fatalf("artifact containment mismatch: %#v", response.Diagnostics)
			}
			if test.denied {
				if response.Code != "" || response.SourceMap != nil {
					t.Fatal("qualified retained initializer delivered")
				}
			} else {
				if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("public sibling rejected: %#v", response.Diagnostics)
				}
				artifactEvalNode(t, response.Code, `const r=sandbox.exports.work();if(r.label!=='public'||r.reads!==1)throw Error(JSON.stringify(r));`)
			}
		})
	}
}
