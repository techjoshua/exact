package exactcompiler

import (
	"context"
	"testing"
)

// Erased declarations belong to the same complete main-file use population as
// runtime references. They cannot hide actual entry, exposure or component use.
func TestPrivateErasedDeclarationMainFileCoverage(t *testing.T) {
	const id = "/virtual/private-erased-main.tsx"
	const jsxID = "/virtual/private-erased-jsx.d.ts"
	const jsxSource = `declare namespace JSX {interface Element {} interface IntrinsicElements {span:{children?:unknown}}}`
	// This is the unchanged generic/interface/type-alias prefix from the public
	// selected-recursive policy test. It stays in the MAIN source, not a .d.ts.
	const prefix = `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
interface Chain<T>{value:T;resolved:Chain<Awaited<T>>;not:Chain<unknown>;}
function select<T>(value:T):Chain<T>{return {value} as Chain<T>;}
interface Service{select<T>(value:T):Chain<T>;field:<T>(value:T)=>Chain<T>;readonly selected:typeof select;}
declare const service:Service;
declare const credential:Protected<string>;
function overloaded(value:number):Chain<number>;
function overloaded(value:Protected<string>):Chain<Protected<string>>;
function overloaded(value:unknown):Chain<unknown>{return {value} as Chain<unknown>;}
`
	const setup = `/// <reference path="./private-erased-jsx.d.ts" />
declare function foreign():void;const box={run:1};`
	const body = `function Install():any{box.run=2;foreign();Object.defineProperty(box,'run',{value:3});return 0}`
	const componentBody = `function Install():any{box.run=2;foreign();Object.defineProperty(box,'run',{value:3});return()=> <span/>}`
	const suffix = `function reference(){void select;void service.select;void overloaded;}function decoration(){return <span/>}export function invoke(){return box.run}`
	rows := []struct {
		name, definition, exposure string
		excluded, refused          bool
	}{
		{"erased-main-private", body, "", true, false},
		{"runtime-callback", body, `declare function retain(cb:()=>unknown):void;retain(Install);`, false, false},
		{"private-after-callback", body, "", true, false},
		{"runtime-default-initializer", body, `export function run(value=Install()){return value}`, false, false},
		{"private-after-default", body, "", true, false},
		{"runtime-computed-key", body, `const keyed={[Install()]:0};`, false, true},
		{"private-after-computed-key", body, "", true, false},
		{"exported", `export ` + body, "", false, false},
		{"alias", body, `const handle=Install;`, false, false},
		{"implicit-component", componentBody, "", false, false},
		{"final-private", body, "", true, false},
	}
	first := setup + prefix + body + suffix
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: first, Diagnostics: "semantic"}, id, map[string]string{id: first, jsxID: jsxSource})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			source := setup + prefix + row.definition + row.exposure + suffix
			generation, err := project.advance(context.Background(), id, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
				t.Fatal("main-file semantic preflight", diagnostics)
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			prepareCallableSourceInventory(generation.sourceFile, owner.checker, collectComponents(generation.sourceFile), owner, nil)
			// Reuses the qualified real Get/C output+current/APPLIED/closure consumer
			// and graph-clone refusal; no operation state or receipt is manufactured.
			assertPrivateCandidateSource(t, owner, generation.sourceFile, row.excluded, row.refused)
		})
	}
}
