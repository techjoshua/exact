package exactcompiler

import "testing"

// Native payload and authored augmentation members have separate disclosure
// obligations. Library method families cannot make a finite public payload secret.
func TestPolicyNativeAugmentedQualification(t *testing.T) {
	for _, test := range []struct {
		name, declarations, valueType, expression string
		secret                                    bool
	}{
		{"array public", `interface Array<T>{custom():void;label:string}`, `Array<number>`, `candidate`, false},
		{"readonly public", `interface ReadonlyArray<T>{custom():void;label:string}`, `ReadonlyArray<number>`, `candidate`, false},
		{"map public", `interface Map<K,V>{custom():void;label:string}`, `Map<string,number>`, `candidate`, false},
		{"merged public property", `interface Array<T>{length:number;label:string}`, `Array<number>`, `candidate`, false},
		{"merged protected property", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate`, true},
		{"merged protected leaf", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate.length`, true},
		{"merged public sibling", `interface Array<T>{
/** @exact keep=secret */ length:number;label:string}`, `Array<number>`, `candidate.label`, false},
		{"stored whole", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate`, true},
		{"stored public sibling", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate.label`, false},
		{"stored secret leaf", `interface Array<T>{extra:Tagged;label:string}`, `Array<number>`, `candidate.extra.value`, true},
		{"deferred whole", `interface Array<T>{extra():Tagged;label:string}`, `Array<number>`, `candidate`, true},
		{"deferred public sibling", `interface Array<T>{extra():Tagged;label:string}`, `Array<number>`, `candidate.label`, false},
		{"array payload", `interface Array<T>{custom():void}`, `Array<Tagged>`, `candidate`, true},
		{"map payload", `interface Map<K,V>{custom():void}`, `Map<string,Tagged>`, `candidate`, true},
		{"map payload unaugmented size", ``, `Map<string,Tagged>`, `candidate.size`, true},
		{"map payload size", `interface Map<K,V>{custom():void}`, `Map<string,Tagged>`, `candidate.size`, true},
		{"map augmentation", `interface Map<K,V>{extra:Tagged;label:string}`, `Map<string,number>`, `candidate`, true},
		{"map public sibling", `interface Map<K,V>{extra:Tagged;label:string}`, `Map<string,number>`, `candidate.label`, false},
		{"phantom public", `interface Array<T>{custom():void}`, `Array<Phantom<Tagged>>`, `candidate`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};interface Tagged{
/** @exact keep=secret */ value:string}
interface Phantom<T>{label:string}declare global{` + test.declarations + `};declare const candidate:` + test.valueType + `;export function work(){console.log(` + test.expression + `);}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "native-qualification.ts", Source: source, SourceMap: true, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if len(d.Code) > 2 && d.Code[:2] == "TS" {
					t.Fatal("invalid fixture", response.Diagnostics)
				}
			}
			secret := hasDiagnosticCode(response.Diagnostics, "EXACT3003") || hasDiagnosticCode(response.Diagnostics, "EXACT3020")
			if secret != test.secret {
				t.Fatalf("whole/selected qualification=%v want=%v: %#v", secret, test.secret, response.Diagnostics)
			}
			if test.secret && (response.Code != "" || response.SourceMap != nil) {
				t.Fatal("protected disclosure emitted artifact")
			}
			if !test.secret && (hasErrorDiagnostic(response.Diagnostics) || response.Code == "") {
				t.Fatal("public projection did not emit", response.Diagnostics)
			}
		})
	}
}
