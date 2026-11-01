package exactcompiler

import (
	"strings"
	"testing"
)

// Async settlement must retain implicit then-Get effects, alongside explicit
// member Gets and cleanup, without treating returned records as fulfilled data.
func TestOperationResultPublicTable(t *testing.T) {
	for _, row := range []struct{ name, id, source string }{
		{"sync-own-getter", "/virtual/implicit-public-sync-own-getter.ts", "function make(){return {get kind(){return window.location.href}}} export function read(){return make().kind}\n"},
		{"async-own-getter", "/virtual/implicit-public-async-own-getter.ts", "async function make(){return {get kind(){return window.location.href}}} export async function read(){return (await make()).kind}\n"},
		{"async-own-then-getter", "/virtual/implicit-public-async-own-then-getter.ts", "async function make(){return {kind:\"audit\",get then(){window.name;return undefined}}} export async function read(){return (await make()).kind}\n"},
		{"async-inherited-then-getter", "/virtual/implicit-public-async-inherited-then-getter.ts", "Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(this:object){window.name;Object.defineProperty(this,\"kind\",{value:\"changed\",configurable:true});return undefined}}); async function make(){return {kind:\"audit\"}} export async function read(){return (await make()).kind}\n"},
		{"captured-forward-finally", "/virtual/implicit-public-captured-forward-finally.ts", "async function make(){return {kind:\"audit\"}} function cleanup(){return window.name} async function forward(run:()=>Promise<{kind:string}>){try{return await run()}finally{cleanup()}} export async function read(){return (await forward(()=>make())).kind}\n"},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: row.id, Source: row.source, Diagnostics: "semantic"}
			response := NewSession().Execute(request)

			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Errorf("invalid contract source: %#v", response)
				return
			}
			found, browser := false, false
			for _, c := range response.Analysis.Callables {
				if c.Name != "read" {
					continue
				}
				found = true
				for _, e := range c.EffectSources {
					browser = browser || e.Environment == "browser" && strings.Contains(e.Description, "window")
				}
			}
			if !found || !browser {
				t.Errorf("required named browser source missing: found=%v browser=%v", found, browser)
			}
		})
	}
}
