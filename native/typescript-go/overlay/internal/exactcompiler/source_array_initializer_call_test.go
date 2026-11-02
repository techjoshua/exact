package exactcompiler

import (
	"testing"
)

const arrayInitializerCallSource = `export{};function make(input:{value:string}){return()=>input.value}const input={value:'safe'};const xs=[make(input)];`

// Ordinary source composition preserves the actual array and deferred callable
// without requiring a compile-time construction receipt.
func TestArrayInitializerCreationRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/array-creation-runtime.ts", Source: arrayInitializerCallSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal("original emitted creation unavailable", r.Error, r.Diagnostics)
			}
			script := `const vm=require('node:vm'),fs=require('node:fs');const c=vm.createContext({exports:{}});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);if(!vm.runInContext("Array.isArray(xs)&&xs.length===1&&Object.hasOwn(xs,'0')&&typeof xs[0]==='function'&&input.value==='safe'",c))throw Error('actual creation only');const d=vm.runInContext("Object.getOwnPropertyDescriptor(xs,'0')",c);if(!d.writable||!d.enumerable||!d.configurable)throw Error('slot descriptor');`
			sourceNodeScript(t, r.Code, script)
		})
	}
}
