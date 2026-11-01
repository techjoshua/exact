package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Indexed deferred installers supply no named Get effect when complete private
// source uses cannot enter or expose their class. Possible construction keeps
// its independent donors without granting normal completion or value identity.
func TestDormantConstructionGetEffects(t *testing.T) {
	const ctor = `class Installer{constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`
	const field = `class Installer{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}`
	for _, row := range []struct {
		name, prefix string
		browser      bool
	}{
		{"dormant-constructor", ctor, false},
		{"dormant-field", field, false},
		{"observed-class", ctor + `void Installer;typeof Installer;`, false},
		{"reached-constructor", ctor + `new Installer();`, true},
		{"static-this-construction", `class Installer{static instance:unknown=new this();constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`, true},
		{"static-arrow-construction", `class Installer{static instance:unknown=(()=>new this())();constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`, true},
		{"reached-field", field + `new Installer();`, true},
		{"constructor-alias", ctor + `const Alias=Installer;new Alias();`, true},
		{"unresolved-alias", ctor + `const Alias=Installer;void Alias;`, true},
		{"escaped-class", ctor + `declare function retain(value:unknown):void;retain(Installer);`, true},
		{"exported-class", `export ` + ctor, true},
		{"unknown-selection", ctor + `declare const choose:boolean;const Selected=choose?Installer:class{};new Selected();`, true},
		{"async-body", `async function install(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}install();`, true},
		{"static-field", `class Installer{static field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/dormant-construction-" + row.name + ".ts", Source: row.prefix + `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			read := findCallable(t, r.Analysis.Callables, "read")
			if settlementBrowser(read) != row.browser {
				t.Errorf("browser=%v want=%v effect=%s", settlementBrowser(read), row.browser, read.Effect)
			}
			// This observation-only exclusion cannot close the unrelated missing
			// original call prefix. Do not substitute class privacy for that input.
			if !row.browser && findCallable(t, r.Analysis.Callables, "make").Effect != "unknown" {
				t.Error("dormant class exclusion supplied result-prefix authority")
			}
		})
	}
}

// Emitted JavaScript independently checks class phase behavior. Dormant source
// definitions must not install the getter, while reached construction does.
func TestDormantConstructionEmittedPhases(t *testing.T) {
	const ctor = `class Installer{constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`
	const field = `class Installer{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}`
	for _, row := range []struct {
		name, prefix string
		installed    bool
	}{
		{"dormant-constructor", ctor, false},
		{"dormant-field", field, false},
		{"reached-constructor", ctor + `new Installer();`, true},
		{"reached-field", field + `new Installer();`, true},
		{"constructor-alias", ctor + `const Alias=Installer;new Alias();`, true},
		{"static-this", `class Installer{static instance:unknown=new this();constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`, true},
		{"static-arrow", `class Installer{static instance:unknown=(()=>new this())();constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/dormant-phase-emitted-" + row.name + ".ts", Source: row.prefix + `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			module := filepath.Join(t.TempDir(), "phase.mts")
			if err := os.WriteFile(module, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			installed := "false"
			if row.installed {
				installed = "true"
			}
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const before=Object.getOwnPropertyDescriptor(Object.prototype,'then');const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');let reads=0;
Object.defineProperty(globalThis,'window',{configurable:true,value:{get name(){reads++;return 'browser'}}});
try{const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(typeof m.read,'function');assert.equal(await m.read(),'audit');assert.equal(reads>0,process.argv[2]==='true');}finally{if(before)Object.defineProperty(Object.prototype,'then',before);else delete Object.prototype.then;if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;}
assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype,'then'),before);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),oldWindow);`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, installed).CombinedOutput(); err != nil {
				t.Fatalf("emitted phase: %v %s", err, output)
			}
		})
	}
}
