package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// These are authored named-input programs, not replacements for the original
// nested acceptance fixture. Calls remain in their actual JavaScript order.
func TestStagedNativeInputBindingSession(t *testing.T) {
	for _, row := range []struct{ name, source, runtime string }{
		{"local", `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`,
			`const first=m.invoke();assert.notEqual(m.invoke(),first);assert.equal(first.x,1);assert.equal(Object.isFrozen(first),true);`},
		{"stored-getter", `export function invoke(){const value=Object.defineProperties({}, {x:{get(){throw 'stored'}}});return Object.freeze(value)}`,
			`const value=m.invoke();assert.equal(Object.isFrozen(value),true);assert.equal(typeof Object.getOwnPropertyDescriptor(value,'x').get,'function');assert.throws(()=>value.x,e=>e==='stored');`},
	} {
		t.Run(row.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				f := newExecutableFixture(t, map[string]string{"entry.ts": row.source})
				request := f.request("compile", "entry.ts")
				request.Target = target
				response := f.session.Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				module := filepath.Join(t.TempDir(), "named-input.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				runtime := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runtime
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runtime, module).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("%s emitted named input: %v %s", target, err, output)
				}
			}
		})
	}
}
