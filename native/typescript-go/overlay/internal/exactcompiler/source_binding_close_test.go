package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
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

// Historical receipt inspection is needed here because public diagnostics alone
// cannot distinguish an uninitialized binding from a discarded initialized value.
func bindingCloseHistory(s *Session, id string) *closedPrefixHistory {
	for _, project := range s.projects {
		if project.callableCache != nil {
			for source, history := range project.callableCache.owner.values.closedPrefixes {
				if source.FileName() == id {
					return history
				}
			}
		}
	}
	return nil
}

func TestBindingDefaultThrowClose(t *testing.T) {
	for _, test := range []struct {
		name            string
		defined, getter bool
		want            float64
	}{
		{"default-call-throw", false, false, 9},
		{"defined-bypass", true, false, 7},
		{"default-getter-throw", false, true, 9},
	} {
		t.Run(test.name, func(t *testing.T) {
			const id = "/virtual/binding-close.ts"
			session := NewSession()
			source := bindingCloseSource(test.defined, test.getter)
			request := Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"}
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("invalid source witness", response.Error, response.Diagnostics)
			}
			history := bindingCloseHistory(session, id)
			if history == nil || history.receipt == nil || len(history.receipt.alternatives) != 2 || history.roots != 1 || history.publications != 1 {
				t.Fatal("expected one acquired binding history and its independent residual")
			}
			row := history.receipt.alternatives[0]
			binding := row.binding
			number, known := numericNumberPayload(row.value)
			if binding == nil || !binding.complete(row) || !binding.routed || row.completion != languageThrow || !known || float64(number) != test.want {
				t.Fatal("Close changed the incoming completion", row.completion, row.remaining)
			}
			if row.storage != nil || row.callInputs != nil || binding.origin == nil || len(binding.origin.alternatives) != 1 {
				t.Fatal("working inputs leaked into the completed binding")
			}
			if test.defined {
				if binding.defaultWinner(row) || !binding.closeInitializedTarget(row) || binding.origin.alternatives[0].completion != languageNormal {
					t.Fatal("defined value entered default or lost initialized target")
				}
			} else {
				incoming := binding.origin.alternatives[0]
				if !binding.defaultWinner(row) || incoming.completion != languageThrow || incoming.callHistory == nil || incoming.callHistory.converted || row.callHistory == incoming.callHistory {
					t.Fatal("Close replaced the incoming Throw history or skipped its own work")
				}
				if _, ok := bindingUninitializedTarget(binding.currentElement(), incoming.branch, incoming.callHistory.entry.inputs.lexicals, binding.target); !ok {
					t.Fatal("abrupt default initialized its target")
				}
			}
			if test.getter {
				if binding.close != nil || binding.returnGet != nil || row.callHistory == nil || row.callHistory.completion != languageThrow {
					t.Fatal("return Getter was treated as a method Call")
				}
			} else if binding.close == nil || binding.close != row.callHistory || binding.close.completion != languageThrow {
				t.Fatal("actual return Call was lost")
			}
			inner, known := numericNumberPayload(row.callHistory.value)
			if !known || float64(inner) != 7 {
				t.Fatal("Close work did not retain its independent Throw7")
			}
			lexicals := row.callHistory.entry.inputs.lexicals
			markFound := false
			for _, lexical := range lexicals {
				declaration := lexical.declaration
				if declaration == nil || !ast.IsIdentifier(declaration.Name()) || declaration.Name().Text() != "mark" {
					continue
				}
				for state := row.branch.state.storage; state != nil; state = state.previous {
					if state.cell != lexical.cell || !state.initialized {
						continue
					}
					mark, known := numericNumberPayload(state.value)
					want := 3.0
					if test.defined {
						want = 0
					}
					if !known || float64(mark) != want {
						t.Fatal("default effect was lost or executed on the bypass path")
					}
					markFound = true
					break
				}
			}
			if !markFound {
				t.Fatal("missing source marker cell")
			}
			if history.receipt.alternatives[1].completion != languageResidual || history.receipt.alternatives[1].binding != nil {
				t.Fatal("independent residual was adopted into the binding")
			}
			if _, live := history.receipt.project(); live {
				t.Fatal("generation release left execution authority live")
			}
			again := session.Execute(request)
			if again.Error != "" || hasErrorDiagnostic(again.Diagnostics) || again.Code != response.Code || bindingCloseHistory(session, id) != history || history.roots != 1 || history.publications != 1 {
				t.Fatal("retained request replayed a completed binding")
			}
		})
	}
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

func TestAnalysisPolicyRetainsBindingSemantics(t *testing.T) {
	const id = "/virtual/advisory-binding.ts"
	session := NewSession()
	request := Request{Kind: "compile", ID: id, Source: bindingCloseSource(false, false), Diagnostics: "semantic"}
	first := session.Execute(request)
	history := bindingCloseHistory(session, id)
	if first.Error != "" || hasErrorDiagnostic(first.Diagnostics) || history == nil {
		t.Fatal("invalid source witness", first.Error, first.Diagnostics)
	}
	for _, threshold := range []string{"1", "4096", "false"} {
		request.Analysis.EstimatedCostWarningThreshold = []byte(threshold)
		request.TraceAnalysisCost = true
		response := session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code != first.Code || !reflect.DeepEqual(response.Analysis, first.Analysis) || bindingCloseHistory(session, id) != history || history.roots != 1 || history.publications != 1 {
			t.Fatal("reporting changed semantic facts or replayed the binding")
		}
		warnings := 0
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Code == "EXACT_ANALYSIS_COST" {
				warnings++
				if diagnostic.Severity != "warning" {
					t.Fatal("advisory policy rejected valid source")
				}
			}
		}
		if warnings > 1 || threshold == "false" && warnings != 0 || threshold == "1" && (warnings != 1 || response.Counters.EstimatedAnalysisCost <= 1) {
			t.Fatal("cached cost was not reclassified", threshold, warnings)
		}
	}
}
