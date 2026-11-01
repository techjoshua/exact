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

func firstIteratorGetterThrowSource() string {
	return `export {};
const Q = {done: true, value: 9};
const I = {
 result: Q,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {result: typeof Q}) { return this.result; }
};
const O = {
 iterator: I,
 get [Symbol.iterator](): () => typeof I {
  try { throw 9; } finally {}
 }
};
const [] = O;`
}

// The finished implicit Get owns Throw9 before a factory Call or iterator record
// exists. Emitted execution independently protects JavaScript's abrupt behavior.
func TestBindingFirstIteratorGetterThrow(t *testing.T) {
	for _, binding := range []string{"EMPTY", "ONE"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			name := string(target)
			if target == TargetDefault {
				name = "unpartitioned"
			}
			t.Run(binding+"/"+name, func(t *testing.T) {
				const id = "/virtual/first-iterator-getter.ts"
				session := NewSession()
				source := firstIteratorGetterThrowSource()
				if binding == "ONE" {
					source = strings.Replace(source, "const [] = O;", "const [x] = O;", 1)
				}
				response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				if target == TargetDefault {
					if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
						t.Fatal(response.Diagnostics)
					}
				} else {
					// The independent unresolved Symbol alternative still prevents
					// a selected partition from claiming this initializer portable.
					refused := false
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Severity == "error" {
							if diagnostic.Code != "EXACT2101" {
								t.Fatal(response.Diagnostics)
							}
							refused = true
						}
					}
					if !refused {
						t.Fatal("unresolved alternative certified a selected partition")
					}
				}
				h := bindingCloseHistory(session, id)
				if h == nil || h.receipt == nil || len(h.receipt.alternatives) != 2 || h.roots != 1 || h.publications != 1 {
					t.Fatal("one source publication and independent alternatives")
				}
				a, u := h.receipt.alternatives[0], h.receipt.alternatives[1]
				c := a.binding
				n, known := numericNumberPayload(a.value)
				if !known || float64(n) != 9 || a.completion != languageThrow || a.remaining != "" || c == nil || !c.complete(a) || !c.firstGetterThrowOutput(a) {
					t.Fatal("finished first GetThrow9", a.completion, a.remaining)
				}
				if c.first != nil || c.firstMethod != nil || c.step != nil || c.close != nil || c.origin != nil || c.initialization != nil || c.returnGet != nil || c.target != (languageCell{}) || c.doneKnown || c.routed || a.storage != nil || a.callInputs != nil {
					t.Fatal("Get invented factory/record/step/Close work")
				}
				if u.completion != languageResidual || u.binding != nil || u.callHistory != nil {
					t.Fatal("independent unresolved alternative gained authority")
				}
				entry := a.callHistory.entry
				if entry == nil || entry.inputs == nil || validOwnGetterTarget(a.branch.owner, entry.inputs) {
					t.Fatal("historical Get renewed live entry")
				}
				if binding == "ONE" {
					if c.plan.elementNode(0) == nil {
						t.Fatal("missing authored ONE target")
					}
					targetCell, mapped := bindingUninitializedTarget(c.plan.elementAt(0), a.branch, entry.inputs.lexicals)
					if !mapped || targetCell == (languageCell{}) || targetCell.environment != entry.caller.id || targetCell.environment == entry.activation.env.id {
						t.Fatal("historical caller target must remain TDZ outside Getter scope")
					}
					count := a.branch.owner.next
					for _, kind := range []string{"missing-map", "duplicate", "wrong-cell", "initialized"} {
						lexicals := append([]languageLexical(nil), entry.inputs.lexicals...)
						branch := a.branch
						slot := c.plan.recipe.events[c.plan.elementLabels(0).initialize].cell
						if slot < 0 || slot >= len(lexicals) {
							t.Fatal("missing source target ordinal")
						}
						switch kind {
						case "missing-map":
							lexicals = nil
						case "duplicate":
							lexicals = append(lexicals, lexicals[slot])
						case "wrong-cell":
							lexicals[slot].cell = languageCell{}
						case "initialized":
							state := *branch.state
							state.storage = &languageStorage{cell: targetCell, initialized: true, value: a.value, previous: state.storage}
							branch.state = &state
						}
						if _, ok := bindingUninitializedTarget(c.plan.elementAt(0), branch, lexicals, targetCell); ok || a.branch.owner.next != count {
							t.Fatal("invalid caller target accepted or inspection issued identity", kind)
						}
					}
				} else if c.plan.elementNode(0) != nil {
					t.Fatal("EMPTY gained a target")
				}
				missing := a
				missing.objects = nil
				if c.firstGetterThrowOutput(missing) {
					t.Fatal("missing finished Get receipt accepted")
				}
				for _, kind := range []string{"wrong-history", "wrong-reference"} {
					row := a
					history := *a.callHistory
					row.callHistory = &history
					if kind == "wrong-history" {
						history.id = languageID{}
					} else {
						otherEntry := *entry
						header := *entry.inputs
						header.reference.id = languageID{}
						otherEntry.inputs = &header
						history.entry = &otherEntry
					}
					if c.firstGetterThrowOutput(row) {
						t.Fatal("foreign Getter history accepted", kind)
					}
				}
				wrong := *c
				wrong.initialization = &languageReceipt{}
				other := a
				other.binding = &wrong
				if wrong.complete(other) {
					t.Fatal("Normal-default receipt entered first-getter role")
				}
				r := c.plan.recipe
				definition := -1
				for pc, e := range r.events {
					if e.kind == "DefineAccessorSlot" {
						if definition >= 0 {
							t.Fatal("ambiguous Getter definition")
						}
						definition = pc
					}
				}
				if definition < 0 || !storageComputedGetterDefinition(r, definition) {
					t.Fatal("actual computed KEY/definition tuple")
				}
				altered := *r
				altered.events = append([]storageEvent(nil), r.events...)
				altered.events[definition].keyProducerPC = -1
				if storageComputedGetterDefinition(&altered, definition) {
					t.Fatal("missing actual computed-key producer accepted")
				}
				altered.events[definition] = r.events[definition]
				altered.events[definition].key = languageStringKey("Symbol.iterator")
				if storageComputedGetterDefinition(&altered, definition) {
					t.Fatal("string spelling impersonated iterator key")
				}
				if bindingFirstGetterSuspended(r, c.plan.first.get, a) {
					t.Fatal("finished output impersonated suspended transport")
				}
				if target != TargetDefault {
					return
				}
				root := t.TempDir()
				module := filepath.Join(root, "first-getter.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				command := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import {pathToFileURL} from 'node:url';try{await import(pathToFileURL(process.argv[1]).href);throw new Error('missing Getter Throw')}catch(error){if(error!==9)throw error;console.log('9')}`, module)
				output, err := command.CombinedOutput()
				if err != nil || strings.TrimSpace(string(output)) != "9" {
					t.Fatalf("emitted Getter Throw: %v %s", err, output)
				}
			})
		}
	}
}
