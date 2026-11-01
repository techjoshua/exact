package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func normalDefaultSource(defined, exhausted bool) string {
	value, done := "undefined", "false"
	if defined {
		value = "3"
	}
	if exhausted {
		value, done = "9", "true"
	}
	return `export {};
let mark = 0;
const Q = {done: ` + done + `, value: ` + value + `};
const C = {value: 0};
const I = {
 result: Q, closeResult: C,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {closeResult: typeof C}) { return this.closeResult; }
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const [x = (mark = 3, 4)] = O;`
}

// Public compilation and emitted execution protect the source triad. Detached
// receipts additionally distinguish the real Initialize from selected undefined.
func TestBindingNormalDefault(t *testing.T) {
	for _, test := range []struct {
		name               string
		defined, exhausted bool
		value, mark        float64
	}{
		{"default", false, false, 4, 3}, {"defined-bypass", true, false, 3, 0}, {"exhausted-no-close", false, true, 4, 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/binding-normal-default.ts"
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: id, Source: normalDefaultSource(test.defined, test.exhausted), Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			h := bindingCloseHistory(session, id)
			if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 2 || h.roots != 1 || h.publications != 1 {
				t.Fatal("one source publication and S/U alternatives")
			}
			a, u := h.receipt.alternatives[0], h.receipt.alternatives[1]
			c := a.binding
			if c == nil || !c.complete(a) || !c.normalDefaultInitialized(a) || a.completion != languageNormal || a.value != (languageValue{}) || c.initialization == nil || len(c.initialization.alternatives) != 1 || c.origin == nil || len(c.origin.alternatives) != 1 {
				t.Fatal("actual completed Initialize/Park relation")
			}
			if u.completion != languageResidual || u.binding != nil {
				t.Fatal("independent unresolved alternative")
			}
			before, pending := c.initialization.alternatives[0], c.origin.alternatives[0]
			n, known := numericNumberPayload(before.value)
			record, valid := bindingInitializationRecord(c, pending, c.target)
			if !known || float64(n) != test.value || !valid || record == nil || pending.branch.state.storage != record || record.previous != before.branch.state.storage || before.binding.initialization != nil {
				t.Fatal("actual result and single source write")
			}
			if test.defined {
				if before.branch != c.selected.alternatives[0].branch {
					t.Fatal("defined input executed default")
				}
			} else if !c.selected.alternatives[0].value.undefined {
				t.Fatal("selected undefined replaced")
			}
			if test.exhausted {
				if !c.done || c.close != nil || c.returnGet != nil || c.valueReceipt != nil || a.callHistory != c.step {
					t.Fatal("exhausted iterator invented Close")
				}
			} else if c.done || c.close == nil || !c.closeNormalAssociation(a) {
				t.Fatal("missing actual object-returning Close")
			}
			markFound := false
			for _, lexical := range c.step.entry.inputs.lexicals {
				if lexical.declaration != nil && lexical.declaration.Name() != nil && ast.IsIdentifier(lexical.declaration.Name()) && lexical.declaration.Name().Text() == "mark" {
					for s := a.branch.state.storage; s != nil; s = s.previous {
						if s.cell == lexical.cell {
							v, k := numericNumberPayload(s.value)
							if !k || float64(v) != test.mark {
								t.Fatal("default write/bypass")
							}
							markFound = true
							break
						}
					}
				}
			}
			if !markFound {
				t.Fatal("missing authored mark")
			}
			broken := *c
			broken.initialization = nil
			forged := a
			forged.binding = &broken
			if broken.complete(forged) {
				t.Fatal("lost initialization receipt accepted")
			}
			root := t.TempDir()
			module := filepath.Join(root, "normal-default.mts")
			if err := os.WriteFile(module, []byte(response.Code+"\nexport {x,mark};"), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import {pathToFileURL} from 'node:url'; const m=await import(pathToFileURL(process.argv[1]).href); console.log(m.x+','+m.mark);`, module)
			output, err := cmd.CombinedOutput()
			want := "4,3"
			if test.defined {
				want = "3,0"
			}
			if err != nil || strings.TrimSpace(string(output)) != want {
				t.Fatalf("emitted result: %v %s", err, output)
			}
		})
	}
}
