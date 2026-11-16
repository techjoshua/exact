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

const stagedCapturedInputProjectionSource = `
function factory(callback:()=>string,unused:()=>string){return()=>callback()}
function browser(){return window.name}
function quiet(){return 'quiet'}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
export function direct(){return consume(factory(browser,dormant))}
export function saved(){const saved=factory(browser,dormant);const fresh=factory(quiet,dormant);return consume(saved)}
export function independent(){const first=factory(browser,dormant);const second=factory(quiet,dormant);consume(first);return consume(second)}
export function partial(other:()=>string){const known=factory(browser,dormant);const unknown=factory(other,dormant);consume(known);return consume(unknown)}
`

// This terminal path invokes a factory's captured formal only after its returned
// closure is passed to an actual invoked-formal consumer. A second factory Call
// cannot retarget the saved creating association. Its unused donor stays dormant.
func TestStagedCapturedInputProjectionSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/captured-input-projection.ts", Source: stagedCapturedInputProjectionSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		for name, wantUnknown := range map[string]bool{"direct": false, "saved": false, "independent": false, "partial": true} {
			known, unknown, dormant := false, false, false
			for _, effect := range executableSummary(t, response, name).EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == "window"
				unknown = unknown || effect.Environment == "unknown"
				dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
			}
			if !known || unknown != wantUnknown || dormant {
				t.Fatalf("%s lost donor/unknown, retargeted creation or invoked unused callback: %#v", name, executableSummary(t, response, name))
			}
		}
		for _, fact := range stagedDeclarationFacts(session) {
			switch fact.summary.Name {
			case "direct", "saved", "independent", "partial":
				if !fact.staged.settled || fact.staged.operationsPending {
					t.Fatalf("%s actual input result/capture consumer remains pending", fact.summary.Name)
				}
			}
		}
		file := filepath.Join(t.TempDir(), "captured-input.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('browser');return 'browser'}};globalThis.document={get title(){throw new Error('unused donor invoked')}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.direct(),'browser');assert.equal(m.saved(),'browser');assert.equal(m.independent(),'quiet');assert.equal(m.partial(()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['browser','browser','browser','browser','other']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// Source-only creating associations can expose a dormant closure but cannot pay
// a capture input. This uses actual source Call issuers without the original B
// creating owner, so the consumer must retain DATA/capture debt instead of using
// a fabricated completed activation or an unknown runtime alternative.
func TestStagedCapturedInputProjectionSourceInputsRemainPending(t *testing.T) {
	const source = `function factory(callback:()=>string){return()=>callback()}function browser(){return window.name}function consume(callback:()=>string){callback()}export function invoke(){consume(factory(browser))}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, creating *ast.Node) {
		outer := creating.Parent
		for outer != nil && !ast.IsCallExpression(outer) {
			outer = outer.Parent
		}
		if outer == nil {
			t.Fatal("original argument Call missing")
		}
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(creating))
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(outer)]
		work.extracting = caller
		for _, operation := range []*ast.Node{outer, creating} {
			if !work.stageSourceDeclarationCall(facts, caller, operation, owner) {
				t.Fatal("actual source-only Call issuer refused")
			}
		}
		work.extracting = -1
		var outerCall, creatingCall sourceStagedDeclarationCall
		for _, call := range facts[caller].staged.calls {
			if call.invocation.operation == outer {
				outerCall = call
			}
			if call.invocation.operation == creating {
				creatingCall = call
			}
		}
		consumer := work.memberNodes[outerCall.invocation.declaration]
		var formalCall *ast.Node
		walkNode(facts[consumer].node.Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) {
				formalCall = node
			}
			return true
		})
		demand, valid := stageInvokedFormal(&facts[consumer], formalCall, owner)
		if !valid {
			t.Fatal("original invoked-formal demand missing")
		}
		facts[consumer].staged.invoked = append(facts[consumer].staged.invoked, demand)
		template, valid := stagedReturnTemplate(creatingCall.invocation.declaration, owner.values)
		if !valid {
			t.Fatal("original factory return template missing")
		}
		closure := work.memberNodes[template.callable]
		capture, valid := stageReturnedCaptureBodyDemand(&facts[closure], template.callable.Body(), owner)
		if !valid {
			t.Fatal("original captured invocation demand missing")
		}
		facts[closure].staged.invoked = append(facts[closure].staged.invoked, capture)
		work.prepareRelativeInvocations(facts, owner)
		for _, edge := range facts[caller].summary.Calls {
			for _, fact := range facts {
				if fact.summary.Name == "browser" && edge.TargetID == fact.summary.ID && edge.Resolved {
					t.Fatal("sourceInputs supplied the creating capture's invoked donor")
				}
			}
		}
		readingFound := false
		for _, use := range facts[caller].staged.operationUses {
			if use.request.reading.selector.field != "input-result-source" {
				continue
			}
			readingFound = true
			delivery, available := work.stagedInputCallResultData(facts, use.request)
			if available {
				for _, alternative := range delivery.delta.exposures {
					if alternative.creating != nil {
						t.Fatal("sourceInputs became creating B")
					}
				}
			}
			id := work.operationIDs[use.request.producer]
			if id.index == 0 || work.closedOperationDependencies()[id.index] {
				t.Fatal("missing creating B paid DATA/capture closure")
			}
		}
		if !readingFound {
			t.Fatal("missing-B consumer dropped its required DATA reading")
		}
	})
}
