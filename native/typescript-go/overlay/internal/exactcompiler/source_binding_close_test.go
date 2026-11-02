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

// These source fixtures keep the explicit typed receiver that owns each protocol
// operation. A default Throw must keep its value while Close still performs work.
func bindingCloseSource(defined, getter bool) string {
	value := "undefined"
	if defined {
		value = "5"
	}
	close := `return: function(this: {closeResult: typeof C}): typeof C { try { throw 7; } finally {} }`
	if getter {
		close = `get return(): () => typeof C { try { throw 7; } finally {} }`
	}
	return `export {};
let mark = 0;
const fail = () => { try { throw 9; } finally {} };
const Q = {done: false, value: ` + value + `};
const C = {value: 0};
const I = {
    result: Q, closeResult: C, scalar: 9,
    next: function(this: {result: typeof Q}) { return this.result; },
    ` + close + `
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const [x = (mark = 3, fail())] = O;`
}

// Compile through the ordinary host and execute its TypeScript output with the
// supported Node loader, without a private runner or observer hooks.
func TestBindingDefaultCloseEmitted(t *testing.T) {
	for _, test := range []struct {
		defined, getter bool
		want            string
	}{{false, false, "9"}, {true, false, "7"}, {false, true, "9"}} {
		source := bindingCloseSource(test.defined, test.getter)
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/binding-emitted.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		// Node's supported TypeScript loader erases the retained type annotations.
		root := t.TempDir()
		module := filepath.Join(root, "binding.mts")
		if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		t.Cleanup(cancel)
		command := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import {pathToFileURL} from 'node:url';try { await import(pathToFileURL(process.argv[1]).href); throw new Error('missing Throw'); } catch (error) { console.log(String(error)); }`, module)
		output, err := command.Output()
		if err != nil || strings.TrimSpace(string(output)) != test.want {
			t.Fatalf("emitted Close completion: %v %s", err, output)
		}
	}
}
