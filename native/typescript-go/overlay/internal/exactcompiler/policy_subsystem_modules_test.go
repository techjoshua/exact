package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Source-owned result policy crosses imports even when the checker sees public literals.
func TestPolicySubsystemImportedSourceResults(t *testing.T) {
	for _, helper := range []struct {
		source, expression string
		denied             bool
	}{
		{`/** @exact keep=secret */ declare const credential:string;export function label(){if(credential)return 'a';return 'b';}`, `label()`, true},
		{`/** @exact keep=secret */ declare const credential:string;export const label=()=>{if(credential)return 'a';return 'b';};`, `label()`, true},
		{`/** @exact keep=secret */ declare const credential:string;export class RecordValue{get label(){if(credential)return 'a';return 'b';}}export const value=new RecordValue();`, `value.label`, true},
		{`/** @exact keep=secret */ declare const credential:string;const alias=credential;export function label(){if(alias)return 'a';return 'b';}`, `label()`, true},
		{`/** @exact keep=secret */ declare const credential:string;function inner(){if(credential)return 'a';return 'b';}export function label(){return inner();}`, `label()`, true},
		{`declare const marker:unique symbol;
/** @exact keep=secret */ type Protected=string&{readonly[marker]:true};
/** @exact shared */ declare const credential:Protected;export function label(){if(credential)return 'a';return 'b';}`, `label()`, true},
		{`/** @exact keep=secret */ declare const credential:string;function inner(){if(credential)return 'a';return 'b';}export function label(){return inner()+inner();}`, `label()`, true},
		{`type PublicInput={label:string;next?:PublicInput};declare const publicInput:PublicInput;export function label(){return publicInput.label+publicInput.label;}`, `label()`, false},
		{`declare const credential:string;export function label(){if(credential)return 'a';return 'b';}`, `label()`, false},
		{`/** @exact keep=secret */ declare const credential:string;export function label(){function unused(){if(credential)return 'a';return 'b';}return 'public';}`, `label()`, false},
	} {
		root := t.TempDir()
		config := filepath.Join(root, "tsconfig.json")
		page := filepath.Join(root, "page.tsx")
		source := `import * as helper from './helper.js';export function Page(){return()=> <p>{helper.` + helper.expression + `}</p>;}`
		for file, contents := range map[string]string{config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","jsx":"preserve"}}`, filepath.Join(root, "helper.ts"): helper.source, page: source} {
			if err := os.WriteFile(file, []byte(contents), 0600); err != nil {
				t.Fatal(err)
			}
		}
		session := NewSession()
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			r := session.Execute(Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Source: source, Target: target})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != helper.denied {
				t.Errorf("%s %s incorrect imported result policy: %#v", target, helper.source, r.Diagnostics)
			}
		}
	}
}
