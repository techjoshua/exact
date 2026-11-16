package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These production entries require DATA from an original nested Call before
// invoking its formal. The replacement gate prevents recursive legacy recovery
// from concealing a missing input/result subscriber.
func TestStagedInputProjectionSessionAndArtifacts(t *testing.T) {
	for _, forward := range []bool{false, true} {
		source := `declare function foreign():void;
function factory(){foreign();return()=>{window.name;return()=>document.title}}
function consume(callback:()=>()=>string){return callback()}
export function invoke(){return consume(factory())}`
		if forward {
			source = strings.Replace(source, `export function invoke(){return consume(factory())}`, `function forward(callback:()=>()=>string){return consume(callback)}
export function invoke(){return forward(factory())}`, 1)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/input-projection.ts", Source: source, Target: target, Diagnostics: "semantic", stagedReplacement: true})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("forward=%t target=%s: %s %#v", forward, target, response.Error, response.Diagnostics)
			}
			known, unknown, dormant := false, false, false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
				dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
			}
			if !known || !unknown || dormant {
				t.Fatalf("input DATA lost invoked donor/unknown or invoked stored return: %#v", executableSummary(t, response, "invoke"))
			}
			connected := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" {
					continue
				}
				if fact.staged.operationsPending {
					t.Fatal("terminal input reading remains pending")
				}
				for _, edge := range fact.summary.Calls {
					connected = connected || strings.Contains(edge.ID, ":invoked-input:") && edge.Resolved
				}
			}
			if !connected {
				t.Fatal("actual argument never reached invoked-formal consumer")
			}
			filename := filepath.Join(t.TempDir(), "input-projection.mts")
			if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.foreign=()=>events.push('factory');globalThis.window={get name(){events.push('callback');return 'known'}};globalThis.document={get title(){events.push('later');return 'later'}};const m=await import(pathToFileURL(process.argv[1]).href);const stored=m.invoke();assert.equal(typeof stored,'function');assert.deepEqual(events,['factory','callback']);assert.equal(stored(),'later');assert.deepEqual(events,['factory','callback','later']);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatalf("forward=%t target=%s runtime: %v %s", forward, target, err, output)
			}
		}
	}
}

// Original result DATA can expose a known callback beside an unavailable Get.
// The consumer registers its canonical body without paying the independent Get
// or factory-body debt, and without fabricating a delivered binder edge.
func TestStagedInputProjectionKnownPrefixAndInputGaps(t *testing.T) {
	for _, row := range []struct {
		name, factory string
		known         bool
	}{
		{"known beside pending Get", `if(choice)return other.value;return()=>window.name`, true},
		{"capture", `let value='captured';return()=>value`, false},
		{"default", `return(value=window.name)=>value`, false},
		{"rest", `return(...values:string[])=>window.name`, false},
		{"receiver", `return function(this:{value:string}){return this.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare const choice:boolean;declare const other:{value:()=>string};function factory(){` + row.factory + `}function consume(callback:()=>string){callback()}export function invoke(){consume(factory())}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, producing *ast.Node) {
				outer := producing.Parent
				for outer != nil && !ast.IsCallExpression(outer) {
					outer = outer.Parent
				}
				if outer == nil {
					t.Fatal("original outer Call missing")
				}
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(producing))
				work := registerCallableEffectWork(facts)
				caller := work.memberNodes[enclosingCallableNode(outer)]
				work.extracting = caller
				for _, operation := range []*ast.Node{outer, producing} {
					if !work.stageSourceDeclarationCall(facts, caller, operation, owner) {
						t.Fatal("original source association refused", operation.Pos())
					}
				}
				work.extracting = -1
				var association sourceStagedDeclarationCall
				for _, call := range facts[caller].staged.calls {
					if call.invocation.operation == outer {
						association = call
					}
				}
				consumer := work.memberNodes[association.invocation.declaration]
				var invoked *ast.Node
				walkNode(facts[consumer].node.Body(), func(node *ast.Node) bool {
					if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "callback" {
						invoked = node
					}
					return true
				})
				demand, valid := stageInvokedFormal(&facts[consumer], invoked, owner)
				if !valid {
					t.Fatal("actual invoked-formal source owner refused")
				}
				facts[consumer].staged.invoked = append(facts[consumer].staged.invoked, demand)
				work.prepareRelativeInvocations(facts, owner)
				known := false
				for _, edge := range facts[caller].summary.Calls {
					known = known || strings.Contains(edge.ID, ":invoked-input:") && edge.Resolved
				}
				if known != row.known {
					t.Fatalf("known DATA body transfer=%t want %t", known, row.known)
				}
				readingFound := false
				for _, use := range facts[caller].staged.operationUses {
					if use.request.reading.selector.field != "input-result-source" {
						continue
					}
					readingFound = true
					id := work.operationIDs[use.request.producer]
					if id.index == 0 || work.closedOperationDependencies()[id.index] {
						t.Fatal("DATA prefix paid missing producer/body closure")
					}
					if use.call != nil || use.request.inputs != nil {
						t.Fatal("source DATA use became an invoked Call or B")
					}
				}
				if !readingFound {
					t.Fatal("input consumer omitted typed DATA reading")
				}
				if association.inputs != nil {
					t.Fatal("sourceInputs was upgraded to delivered B")
				}
			})
		})
	}
}

// A real binder can lend the same original Call-result argument. Its delivered
// pointer and physical cut are retained; a structurally equal copy has no rights
// in the current source Call fact. Source-input registration alone cannot pass
// this control because the test obtains B through the original binder.
func TestStagedInputProjectionDeliveredAssociation(t *testing.T) {
	const source = `function factory(){return()=>window.name}function consume(callback:()=>string){callback()}export function invoke(){consume(factory())}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, producing *ast.Node) {
		outer := producing.Parent
		for outer != nil && !ast.IsCallExpression(outer) {
			outer = outer.Parent
		}
		if outer == nil {
			t.Fatal("original argument owner missing")
		}
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(producing))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(outer)]
		work.extracting = caller
		for _, operation := range []*ast.Node{outer, producing} {
			if !work.stageSourceDeclarationCall(facts, caller, operation, owner) {
				t.Fatal("original source Call refused")
			}
		}
		work.extracting = -1
		installed := -1
		for i, call := range facts[caller].staged.calls {
			if call.invocation.operation == outer {
				installed = i
			}
		}
		if installed < 0 {
			t.Fatal("current original Call missing")
		}
		original := facts[caller].staged.calls[installed]
		bound, delivered := bindStagedDeclarationInputs(&facts[caller], original.invocation, owner)
		if !delivered || bound == nil || !bound.delivered {
			t.Fatal("actual original binder did not deliver")
		}
		current := sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: bound.request, inputs: bound}
		facts[caller].staged.calls[installed] = current
		var endpoint sourceRelativeEndpoint
		for _, binding := range bound.relative.bindings {
			if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 && len(binding.sources) == 1 {
				endpoint = binding.sources[0]
			}
		}
		if endpoint.kind != relativeEndpointResult || endpoint.expression != producing {
			t.Fatal("real B lost original argument endpoint")
		}
		if !work.prepareSourceInputProjection(facts, caller, current, endpoint, owner) {
			t.Fatal("real current B could not register DATA")
		}
		copied := current
		copyEdge := *bound
		copied.inputs = &copyEdge
		if work.prepareSourceInputProjection(facts, caller, copied, endpoint, owner) {
			t.Fatal("copied B acquired current-facts authority")
		}
		projection := work.requireSourceInputProjection(facts, caller, current, endpoint, owner)
		if !projection.owned || len(projection.alternatives) != 1 || projection.alternatives[0].endpoint.creation != producing {
			t.Fatal("real B consumer lost DATA prefix/creating cut")
		}
		if current.sourceInputs != nil || current.inputs != bound {
			t.Fatal("source and delivered provenance were interchanged")
		}
	})
}
