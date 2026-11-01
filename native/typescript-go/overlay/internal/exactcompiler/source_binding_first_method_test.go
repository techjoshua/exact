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

func firstMethodSource(empty, callable bool) string {
	target := "[x]"
	if empty {
		target = "[]"
	}
	replacement := "9"
	if callable {
		replacement = "function(this: {iterator: typeof I}) { return this.iterator; }"
	}
	return `export {};
const Q = {done: false, value: 3};
const I = {
 result: Q,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {result: typeof Q}) { return this.result; }
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const A: {[Symbol.iterator]: number | ((this: {iterator: typeof I}) => typeof I)} = O;
A[Symbol.iterator] = ` + replacement + `;
const ` + target + ` = O;`
}

// A completed DATA Get and sealed acquired header establish numeric TypeError
// before Call or iterator-record creation. The callable sibling takes that path.
func TestBindingFirstMethodNumber(t *testing.T) {
	for _, test := range []struct {
		name            string
		empty, callable bool
	}{
		{"ONE-number", false, false}, {"EMPTY-number", true, false}, {"callable-sibling", false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/binding-first-method.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: firstMethodSource(test.empty, test.callable), Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 2 || h.roots != 1 || h.publications != 1 {
				t.Fatal("one source root and independent S/U")
			}
			a, u := h.receipt.alternatives[0], h.receipt.alternatives[1]
			c := a.binding
			if u.completion != languageResidual || u.binding != nil || u.callHistory != nil {
				t.Fatal("independent U acquired authority")
			}
			if c == nil || !c.complete(a) {
				t.Fatal("actual completed binding", a.completion, a.remaining)
			}
			if test.callable {
				if c.firstMethod != nil || c.first == nil || c.step == nil || c.close == nil || a.completion != languageNormal {
					t.Fatal("callable sibling lost actual protocol Calls")
				}
			} else {
				if a.completion != languageThrow || a.value != (languageValue{text: "TypeError"}) || c.firstMethod == nil || !bindingFirstMethodReceipt(a, c.plan.recipe, c.firstMethod) || c.first != nil || c.step != nil || c.close != nil || c.origin != nil || c.initialization != nil || c.target != (languageCell{}) || a.callHistory != nil || a.callInputs != nil || a.storage != nil {
					t.Fatal("pre-Call TypeError invented protocol work")
				}
				if test.empty {
					if c.plan.elementNode(0) != nil {
						t.Fatal("EMPTY acquired target")
					}
				} else {
					if _, ok := bindingUninitializedTarget(c.plan.elementAt(0), a.branch, c.firstMethod.lexicals); !ok {
						t.Fatal("ONE target initialized before acquisition")
					}
				}
				broken := *c
				broken.firstMethod = nil
				forged := a
				forged.binding = &broken
				if broken.complete(forged) {
					t.Fatal("missing header accepted")
				}
			}
			root := t.TempDir()
			module := filepath.Join(root, "first-method.mts")
			if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import {pathToFileURL} from 'node:url'; try {await import(pathToFileURL(process.argv[1]).href);console.log('normal')}catch(e){console.log(e instanceof TypeError?'TypeError':String(e))}`, module)
			output, err := cmd.CombinedOutput()
			want := "TypeError"
			if test.callable {
				want = "normal"
			}
			if err != nil || strings.TrimSpace(string(output)) != want {
				t.Fatalf("emitted result: %v %s", err, output)
			}
		})
	}
}
