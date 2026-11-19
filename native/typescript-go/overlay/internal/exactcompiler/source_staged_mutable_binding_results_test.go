package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const stagedMutableBindingSource = `
function consume(callback:()=>string){return callback()}
function dormant(){return document.title}
function nativeFactory(){return Object.freeze({})}
export function conditional(choose:boolean){let selected=()=> 'quiet';if(choose)selected=()=>window.name;return consume(selected)}
export function partial(choose:boolean,other:()=>string){let selected=()=>window.name;if(choose)selected=other;return consume(selected)}
export function expose(choose:boolean){let selected=()=> 'quiet';if(choose)selected=()=>window.name;return selected}
export function reassigned(){let fn=()=>window.name;fn=()=>document.title;return fn()}
export function nativeResult(){const result=Object.freeze({});return result}
export function nativeReturned(){return nativeFactory()}
`

// Same-activation binding DATA joins source alternatives before actual input
// substitution. It does not invoke stored callbacks or choose a current write.
func TestStagedMutableBindingSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/mutable-binding.ts", Source: stagedMutableBindingSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "mutable-binding.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('window');return 'known'}};globalThis.document={get title(){events.push('document');return 'doc'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(Object.isFrozen(m.nativeResult()),true);assert.equal(Object.isFrozen(m.nativeReturned()),true);assert.deepEqual(events,[]);assert.equal(m.conditional(false),'quiet');assert.deepEqual(events,[]);assert.equal(m.conditional(true),'known');assert.deepEqual(events,['window']);events.length=0;const saved=m.expose(true);assert.deepEqual(events,[]);assert.equal(saved(),'known');events.length=0;assert.equal(m.partial(true,()=>{events.push('other');return 'other'}),'other');assert.deepEqual(events,['other']);events.length=0;assert.equal(m.reassigned(),'doc');assert.deepEqual(events,['document']);assert.throws(()=>m.partial(true,()=>{throw 'sentinel'}),e=>e==='sentinel');`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s runtime: %v %s", target, err, output)
		}
	}
}

func TestStagedMutableBindingOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, body string
		complete   bool
	}{
		{"same activation", `let selected=()=> 'quiet';if(choose)selected=()=>window.name;return selected`, true},
		{"nested writer", `let selected=()=>window.name;function write(){selected=()=>document.title}write();return selected`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function factory(choose:boolean){` + row.body + `}export function invoke(){return factory(true)}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
				declaration := owner.checker.GetSymbolAtLocation(call.Expression()).ValueDeclaration
				var read *ast.Node
				for _, statement := range declaration.Body().AsBlock().Statements.Nodes {
					if ast.IsReturnStatement(statement) {
						read = statement.AsReturnStatement().Expression
					}
				}
				plan := describeStagedBindingData(read, declaration, owner)
				if plan.locallyRepresented != row.complete || len(plan.branches) == 0 {
					t.Fatalf("original binding source incomplete=%t branches=%d", !plan.locallyRepresented, len(plan.branches))
				}
				for _, branch := range plan.branches {
					if branch.endpoint.expression == nil || branch.endpoint.producer == nil || branch.endpoint.cut.reading != read {
						t.Fatal("binding source lost original endpoint/read cut")
					}
				}
			})
		})
	}
}

// An original binding/completion projection is a DATA reader. It requires the
// selected native result and full Effects, without inventing a member Get loan.
func TestStagedBindingNativeResultOriginalSource(t *testing.T) {
	const source = `function factory(){return 0}export function invoke(){const result=Object.freeze({});return result}factory()`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, final *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(final))
		work := registerCallableEffectWork(facts)
		caller := -1
		var native, read *ast.Node
		for i, fact := range facts {
			if fact.summary.Name == "invoke" {
				caller = i
				statements := fact.node.Body().AsBlock().Statements.Nodes
				native = statements[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].Initializer()
				read = statements[1].AsReturnStatement().Expression
			}
		}
		if caller < 0 || !work.stageNativeInputCall(facts, caller, native, owner) {
			t.Fatal("original native source unavailable")
		}
		source, described := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !described || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			t.Fatal("original binding source unavailable")
		}
		id, required := work.requireOperation(facts, source.request)
		if !required {
			t.Fatal("binding result subscription refused")
		}
		work.prepareOperationUses(facts, owner)
		data, delivered := work.stagedCallResultData(source.request)
		if !delivered || !data.delta.extracted || len(data.delta.exposures) != 1 || data.delta.exposures[0].endpoint.expression != native || len(data.delta.required) != 1 {
			t.Fatalf("binding native DATA unavailable: delivered=%v delta=%+v", delivered, data.delta)
		}
		child := work.operationRecipes[data.delta.required[0].producer]
		root := work.operationRecipes[sourceStagedOperationKey{declaration: facts[caller].node, operation: native, kind: relativeDemandEffects}].nativeGet
		if root == nil || len(child.delta.required) != 1 || !sameOperationRequest(child.delta.required[0], root.request) || work.operations[id.index].resultProjection == nil {
			t.Fatal("native DATA lost source projection/full Effects")
		}
		projection := work.operations[id.index].resultProjection
		work.operations[id.index].resultProjection = nil
		if work.freshStagedCallResultReading(child) {
			t.Fatal("missing original current projection supplied reader")
		}
		work.operations[id.index].resultProjection = projection
		callee := work.operationIDs[nativeRootDebtRequest(root, "callee-get").producer]
		proof := work.operations[callee.index].nativeCallee
		work.operations[callee.index].nativeCallee = nil
		if work.passiveStagedNativeResultReady(child) {
			t.Fatal("binding reader replaced actual native callee authority")
		}
		work.operations[callee.index].nativeCallee = proof
	})
}
