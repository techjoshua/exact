package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Callee Get effects are independent of native selection and the later Call's
// writes. Authored getters/replacements and independent argument work survive.
func TestReflectiveCalleeGetEffects(t *testing.T) {
	for _, test := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"shadowed", `const Object={get defineProperty(){document.title;return ()=>1}};export const value=Object.defineProperty();`, true, false},
		{"overwritten", `Object.defineProperty=function<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{document.title;return target};export const value=Object.defineProperty({},'x',{value:1});`, true, false},
		{"actual-accessor", `const original=Object.defineProperty;Object.defineProperty(Object,'defineProperty',{get(){document.title;return original},configurable:true});export const value=Object.defineProperty({},'x',{value:1});`, true, false},
		{"independent-argument-write", `const target={x:0};export const value=Object.defineProperty(target,'x',{value:(document.title='kept',1)}).x;`, true, false},
		{"write-before-unknown", `declare function foreign(value:unknown):number;const target={x:0};export const value=Object.defineProperty(target,'x',{value:(document.title='kept',foreign(target),1)}).x;`, true, true},
		{"unknown-before-write", `declare function foreign(value:unknown):number;const target={x:0};export const value=Object.defineProperty(target,'x',{value:(foreign(target),document.title='kept',1)}).x;`, true, true},
		{"nested-body-write", `function write(){document.title='kept';return 1}const target={x:0};export const value=Object.defineProperty(target,'x',{value:write()}).x;`, true, false},
		{"nested-saved-before-argument", `const original=Object.defineProperty;const target={x:0};const replacement:typeof Object.defineProperty=(target,key,descriptor)=>{document.title;return target};export const value=original(target,'x',(Object.defineProperty=replacement,{value:1})).x;`, false, false},
		{"saved-before-argument", `const original=Object.defineProperty;const replacement:typeof Object.defineProperty=(target,key,descriptor)=>{document.title;return target};export const value=original({},'x',(Object.defineProperty=replacement,{value:1}));`, false, false},
		{"replaced-global", `declare const replacement:typeof Object;globalThis.Object=replacement;export const value=Object.defineProperty({},'x',{value:1});`, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-callee-" + test.name + ".ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, d := range response.Diagnostics {
				if d.Severity == "error" && d.Code != "EXACT2101" {
					t.Fatal("invalid source witness", response.Diagnostics)
				}
			}
			browser, unknown, found := false, false, false
			for _, fact := range response.Analysis.Callables {
				if fact.Kind != "module-initializer" {
					continue
				}
				found = true
				for _, effect := range fact.EffectSources {
					browser = browser || effect.Environment == "browser"
					unknown = unknown || effect.Environment == "unknown"
				}
			}
			if !found || browser != test.browser || test.unknown && !unknown {
				t.Fatalf("callee/argument effects browser=%t unknown=%t found=%t: %#v", browser, unknown, found, response.Analysis.Callables)
			}
		})
	}
}

// A method name never restores an intrinsic adapter over an actual own data
// slot. Node executes the emitted code, so accidentally invoking read fails.
func TestOwnInvocationDataOverrideEmitted(t *testing.T) {
	for _, method := range []string{"call", "apply", "bind"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(method+"/"+string(target), func(t *testing.T) {
				args := "undefined"
				if method == "apply" {
					args += ",[]"
				}
				source := `function read(){return document.title}Object.defineProperty(read,'` + method + `',{value:()=> 'safe'});export const value=read.` + method + `(` + args + `);`
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/own-" + method + ".ts", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				module := filepath.Join(t.TempDir(), "own.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const native=Object.defineProperty;
const nativeDescriptor=Object.getOwnPropertyDescriptor(Object,'defineProperty');
const method=process.argv[2];
let target,before,installed,result;
// Observe the real installation outside compiled source. Forward once without
// touching its descriptor or evaluating the installed function.
Object.defineProperty=function(receiver,key,descriptor){
 if(typeof receiver==='function' && key===method){target=receiver;before=Object.getOwnPropertyDescriptor(receiver,key);}
 return Reflect.apply(native,Object,[receiver,key,descriptor]);
};
try{result=await import(pathToFileURL(process.argv[1]).href);}
finally{
 Reflect.defineProperty(Object,'defineProperty',nativeDescriptor);
 if(target)installed=Object.getOwnPropertyDescriptor(target,method);
}
assert.ok(target);
// The unchanged fixture deliberately creates a nonconfigurable own slot.
// Its isolated function dies with this child. Preserve native constraints.
assert.equal(before,undefined);
assert.equal(installed.configurable,false);
assert.equal(Reflect.deleteProperty(target,method),false);
assert.deepEqual(Object.getOwnPropertyDescriptor(target,method),installed);
assert.deepEqual(Object.getOwnPropertyDescriptor(Object,'defineProperty'),nativeDescriptor);
assert.equal(result.value,'safe');
console.log('safe');`, module, method).CombinedOutput()
				if err != nil || strings.TrimSpace(string(output)) != "safe" {
					t.Fatalf("own override: %v %s", err, output)
				}
			})
		}
	}
}
