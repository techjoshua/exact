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

const stagedWriterResultSource = `function factory(){return()=>{window.name;return undefined}}export function invoke(){const map=new WeakMap<object,object>();map.get=factory();return map.get({})}`

func TestStagedWriterResultSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/writer-result.ts", Source: stagedWriterResultSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "writer-result.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('window');return 'known'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.invoke(),undefined);assert.deepEqual(events,['window']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s: %v %s", target, err, output)
		}
	}
}

func TestStagedWriterResultUndefinedCapture(t *testing.T) {
	for _, row := range []struct {
		source   string
		captured bool
	}{
		{stagedWriterResultSource, false},
		{`function factory(undefined:()=>string){return()=>{window.name;return undefined()}}export function invoke(){return factory(()=>document.title)}`, true},
	} {
		withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, call *ast.Node) {
			symbol := owner.checker.GetSymbolAtLocation(call.Expression())
			templates := describeStagedReturnTemplates(symbol.ValueDeclaration, owner.values)
			if len(templates) != 1 || templates[0].unknown || (len(templates[0].captures) != 0) != row.captured || stagedCallReturnLiteralHasCapture(templates[0].callable, owner.values) != row.captured {
				t.Fatal("intrinsic undefined and original shadow capture confused")
			}
		})
	}
}

func TestStagedWriterResultPrivateAllocation(t *testing.T) {
	for _, row := range []struct {
		name, source string
		private      bool
	}{
		{"exported callable", `function factory(){}export function invoke(){const map=new WeakMap<object,object>();factory();map.get({})}`, true},
		{"returned allocation", `function factory(){}export function invoke(){const map=new WeakMap<object,object>();factory();map.get({});return map}`, false},
		{"exported allocation", `export const map=new WeakMap<object,object>();function factory(){}export function invoke(){factory();map.get({})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, creating *ast.Node) {
				file := ast.GetSourceFileOfNode(creating)
				var site, read *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						site = node
					}
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
						read = node
					}
					return true
				})
				facts := stagedReturnSourceFacts(file)
				restore := registerPendingMemberFacts(owner, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				region := enclosingCallableNode(site)
				if region == nil {
					region = sourceStagedModuleOwner(site)
				}
				visitImplicitAccessors(site, owner.checker, nil, owner, region, nil, func(accessorCandidates) {})
				caller := work.memberNodes[enclosingCallableNode(read)]
				request, represented := work.prepareConstructedResultSource(facts, caller, read, owner)
				root := work.operationRecipes[request.producer]
				if !represented || len(root.constructedGroup) != 1 {
					t.Fatal("original construction/member publication missing")
				}
				if work.constructedUsesCovered(facts, &root.constructedGroup[0], owner) != row.private {
					t.Fatal("callable export confused with an actual allocation escape")
				}
			})
		})
	}
}

func writerResultBodyID(session *Session, body *ast.Node) string {
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.node == body {
			return fact.summary.ID
		}
	}
	return ""
}
