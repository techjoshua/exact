package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// An expression Get is an original source actual, independently of the lexical
// Call's migrated Effects association. The Get may invoke or throw at runtime;
// its unavailable DATA is not supplied by the number annotation or pure callee.
func TestStagedDeclarationArgumentGetConsumer(t *testing.T) {
	const source = `function leaf(input:number){return input;}export function root(input:{value:number}){return leaf(input.value);}`
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-refusal-argument-getter.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		unknown := false
		for _, effect := range executableSummary(t, response, "root").EffectSources {
			unknown = unknown || effect.Environment == "unknown"
		}
		if !unknown {
			t.Fatal("runtime argument getter lost its independent MAY effects")
		}
		associated, pendingData := false, false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name != "root" {
				continue
			}
			for _, call := range fact.staged.calls {
				if call.invocation.declaration == nil || callableNameText(call.invocation.declaration.Name()) != "leaf" {
					continue
				}
				associated = true
				if call.legacyInputs || call.sourceInputs == nil || call.inputs != nil || call.inputConsumerWait != nil || len(call.invocation.actuals) != 1 {
					t.Fatal("original Get source association conflated with acquired input")
				}
				actual := call.invocation.actuals[0]
				if !ast.IsPropertyAccessExpression(actual.expression) || actual.endpoint.expression != actual.expression || actual.endpoint.get != nil || actual.endpoint.cut.reading != actual.expression || actual.endpoint.cut.operation != call.invocation.operation {
					t.Fatal("original argument Get observation/cut lost")
				}
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.key.operation != actual.expression || recipe.callResult == nil || recipe.callResult.getResult == nil || recipe.callResult.getResult.role != "value" {
						continue
					}
					pendingData = true
					if recipe.delta.extracted || len(recipe.delta.exposures) != 0 {
						t.Fatal("unavailable formal-receiver Get DATA certified by source Call or type")
					}
				}
			}
		}
		if !associated || !pendingData {
			t.Fatal("UNREACHED: original lexical Call and independent pending Get DATA")
		}
		filename := filepath.Join(t.TempDir(), "argument-get.mts")
		if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const driver = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);let reads=0;assert.equal(m.root({get value(){reads++;return 7}}),7);assert.equal(reads,1);const sentinel={};assert.throws(()=>m.root({get value(){reads++;throw sentinel}}),e=>e===sentinel);assert.equal(reads,2);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", driver, filename).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s argument Get runtime: %v %s", target, err, output)
		}
	}
}
