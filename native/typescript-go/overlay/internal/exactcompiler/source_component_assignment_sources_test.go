package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// The positive is the unchanged original authored-method row, with no authored
// application Call to Page. Its component definition owns the MAY supplier.
const componentAssignmentOriginalSource = `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('probe');function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){this.hasContext=()=>{document.title;return false};const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`

func checkComponentAssignmentBodySource(t *testing.T, analysis callableAnalysis, wantBrowser bool) {
	t.Helper()
	var page, read, body *callableFacts
	var assignment *ast.Node
	for i := range analysis.facts {
		f := &analysis.facts[i]
		if f.summary.Name == "Page" {
			page = f
		}
		if f.summary.Name == "read" {
			read = f
		}
	}
	if page == nil || read == nil || page.staged.operationsPending {
		t.Fatal("original component supplier/source closure UNREACHED")
	}
	walkNode(page.node.Body(), func(node *ast.Node) bool {
		if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			left, right := node.AsBinaryExpression().Left, node.AsBinaryExpression().Right
			if ast.IsPropertyAccessExpression(left) && left.Expression().Kind == ast.KindThisKeyword && left.Name().Text() == "hasContext" && ast.IsArrowFunction(right) {
				assignment = right
			}
		}
		return true
	})
	for i := range analysis.facts {
		if analysis.facts[i].node == assignment {
			body = &analysis.facts[i]
		}
	}
	if assignment == nil || body == nil {
		t.Fatal("original authored supplier body UNREACHED")
	}
	browser := false
	for _, effect := range page.summary.EffectSources {
		browser = browser || effect.Environment == "browser" && effect.Description == "document"
	}
	if browser != wantBrowser {
		t.Fatal("canonical component lost/staled authored donor", wantBrowser, page.summary.EffectSources)
	}
	if wantBrowser {
		edge := false
		for _, call := range page.summary.Calls {
			edge = edge || call.Resolved && call.TargetID == body.summary.ID
		}
		if !edge {
			t.Fatal("actual component-to-authored BODY effect edge UNREACHED")
		}
	}
	if read.summary.Effect != "unknown" {
		t.Fatal("component source changed generic helper definition")
	}
	if wantBrowser && analysis.owner != nil {
		checked := 0
		walkNode(page.node.Body(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && sourceText(page.sourceFile, node.Expression()) == "read.call" {
				view, found := callableEffectForCall(analysis, page.sourceFile, node.Pos())
				known := false
				for _, effect := range view.EffectSources {
					known = known || effect.Environment == "browser" && effect.Description == "document"
				}
				if !found || !known || view.Effect != "browser" {
					t.Fatal("owned actual supplier call projection UNREACHED", found, view)
				}
				checked++
			}
			return true
		})
		if checked == 0 {
			t.Fatal("actual owned parent use UNREACHED")
		}
	}
}

func TestComponentAssignmentSourcePortableAndRetained(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var app Response
			for _, kind := range []string{"application", "library"} {
				session := NewSession()
				request := Request{Kind: "compile", ID: "component-assignment-source.tsx", Source: componentAssignmentOriginalSource, Target: target, PackageType: kind, Diagnostics: "semantic"}
				for i, source := range []string{componentAssignmentOriginalSource, strings.Replace(componentAssignmentOriginalSource, "document.title;", "", 1), componentAssignmentOriginalSource} {
					request.Source = source
					response := session.Execute(request)
					if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
						t.Fatal("real retained component compile", response.Error, response.Diagnostics)
					}
					wantBrowser := i != 1
					placement := "isomorphic"
					if wantBrowser {
						placement = "client"
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != placement {
						t.Fatal("component supplier placement", placement, response.Analysis.Components)
					}
					project := qualifiedIncrementalProject(t, session)
					checkComponentAssignmentBodySource(t, project.callableCache.merged, wantBrowser)
					if i == 0 {
						if kind == "application" {
							app = response
						} else {
							left, err := json.Marshal(app.Analysis.Components)
							if err != nil {
								t.Fatal(err)
							}
							right, err := json.Marshal(response.Analysis.Components)
							if err != nil {
								t.Fatal(err)
							}
							if app.Code != response.Code || !bytes.Equal(left, right) {
								t.Fatal("application caller context changed component contract")
							}
						}
					}
				}
			}
		})
	}
}

// Real clone collection regenerates the supplier from current source. An edit
// renews the actual Program/owner; no cached query/publisher receipt is retained.
func TestComponentAssignmentSourceCloneAndGeneration(t *testing.T) {
	analysis, file := collectComponentCallProjection(t, "component-assignment-clone.tsx", componentAssignmentOriginalSource)
	checkComponentAssignmentBodySource(t, analysis, true)
	project := analysis.owner.project
	cache := project.callableCache
	clone := beginProjectCallableCollection(cache, cache.owner)
	func() { defer clone.close(); clone.collect(); clone.resolve(file) }()
	current := collectProjectCallableEffects(project, file, analysis.owner.checker, collectComponents(file), nil, nil, nil, assetAnalysis{}, nil)
	checkComponentAssignmentBodySource(t, current, true)
	// A fresh Session consumer owns its own edit/lifetime. The public retained
	// control above exercises both edits; this negative is an actual compatibility
	// consumer, never a fabricated source generation or active flag.
	oldProgram := project.program
	generation := project.activeGeneration
	if generation == nil {
		t.Fatal("original owned generation UNREACHED")
	}
	generation.release()
	next, err := project.advance(context.Background(), file.FileName(), componentAssignmentOriginalSource+"\n")
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	if next.program == oldProgram {
		t.Fatal("actual edit did not replace Program")
	}
	fresh := collectProjectCallableEffects(project, next.sourceFile, next.checker, collectComponents(next.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	checkComponentAssignmentBodySource(t, fresh, true)
	if callableSourceProjectionCurrent(analysis, file) {
		t.Fatal("retired component source owner accepted")
	}
}

func TestComponentAssignmentSourceOrderAndOwnerRefusers(t *testing.T) {
	prefix := `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('probe');function read(owner:Component<{}>){return owner.hasContext(Token)}`
	for _, row := range []struct{ name, source string }{
		{"after-read", prefix + `export function Page(this:Component<{}>){const selected=read.call(undefined,this);this.hasContext=()=>{document.title;return false};return()=> <output>{String(selected)}</output>}`},
		{"dead-branch", prefix + `export function Page(this:Component<{}>){if(false){this.hasContext=()=>{document.title;return false}}const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`},
		{"nested-ordinary-this", prefix + `export function Page(this:Component<{}>){function unused(this:Component<{}>){this.hasContext=()=>{document.title;return false}}const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`},
		{"other-component", prefix + `export function Other(this:Component<{}>){this.hasContext=()=>{document.title;return false};return()=> <aside/>}export function Page(this:Component<{}>){const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "component-assignment-refuser-" + row.name + ".tsx", Source: row.source, Target: TargetClient, Diagnostics: "semantic"})
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatal("original refuser consumer", response.Error, response.Diagnostics)
			}
			page := findComponent(t, response.Analysis.Components, "Page")
			if page.Placement != "isomorphic" || page.EnvironmentEffect != "neutral" {
				t.Fatal("foreign/deferred/later source became current component supplier", page)
			}
		})
	}
}

// Two actual outer uses of the same helper/body retain separate contextual
// EFFECT descriptions. The generic inner operation never inherits a caller use.
func TestComponentAssignmentSourceDistinctUses(t *testing.T) {
	source := strings.Replace(componentAssignmentOriginalSource, "const selected=read.call(undefined,this);", "const first=read.call(undefined,this);const selected=read.call(undefined,this);", 1)
	analysis, file := collectComponentCallProjection(t, "component-assignment-two-uses.tsx", source)
	checkComponentAssignmentBodySource(t, analysis, true)
	var page, read *callableFacts
	for i := range analysis.facts {
		if analysis.facts[i].summary.Name == "Page" {
			page = &analysis.facts[i]
		}
		if analysis.facts[i].summary.Name == "read" {
			read = &analysis.facts[i]
		}
	}
	var calls []*ast.Node
	walkNode(page.node.Body(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && sourceText(file, node.Expression()) == "read.call" {
			calls = append(calls, node)
		}
		return true
	})
	if len(calls) != 2 || calls[0] == calls[1] {
		t.Fatal("two authentic component uses UNREACHED")
	}
	var tagged []sourceCallableEffect
	for _, call := range calls {
		foundBody := false
		for _, edge := range page.summary.Calls {
			if edge.sourceUse != call {
				continue
			}
			operation := page.fieldEdgeOperations[edge.ID]
			if operation == nil || operation == call {
				t.Fatal("contextual description renamed child operation")
			}
			for i := range analysis.facts {
				target := &analysis.facts[i]
				if target.summary.ID == edge.TargetID {
					tagged = append(tagged, sourceCallableEffect{operation: operation, declaration: target.node, use: edge.sourceUse})
					foundBody = true
				}
			}
		}
		if !foundBody {
			t.Fatal("actual parent/child source association UNREACHED")
		}
		view, found := callableEffectForCall(analysis, file, call.Pos())
		browser := false
		for _, effect := range view.EffectSources {
			browser = browser || effect.Environment == "browser" && effect.Description == "document"
		}
		if !found || !browser || view.Effect != "browser" {
			t.Fatal("per-use supplier effect consumer UNREACHED", found, view)
		}
	}
	walkNode(read.node.Body(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && sourceText(file, node.Expression()) == "owner.hasContext" {
			if view, found := callableEffectForCall(analysis, file, node.Pos()); found && view.Effect == "browser" {
				t.Fatal("caller contextual effect leaked into generic helper operation")
			}
		}
		return true
	})
	// This is a passive publisher copy/merge control using descriptions just
	// produced above. No execution/graph/current/APPLIED positive is inferred.
	if len(tagged) != 2 || tagged[0].use == tagged[1].use || tagged[0].operation != tagged[1].operation || tagged[0].declaration != tagged[1].declaration {
		t.Fatal("actual contextual donor descriptions missing")
	}
	local := callableFacts{node: page.node, sourceFile: file, summary: CallableSummary{ID: page.summary.ID, Name: page.summary.Name}}
	nodes := make(map[*ast.Node]int)
	for i := range analysis.facts {
		nodes[analysis.facts[i].node] = i
	}
	unbound := tagged[0]
	unbound.use = nil
	appendAccessorTargets(&local, tagged[0].operation, accessorCandidates{effects: []sourceCallableEffect{tagged[0], unbound, tagged[1], tagged[0], unbound}}, nodes, file)
	if len(local.summary.Calls) != 3 {
		t.Fatal("tagged/untagged source edge copies collapsed or duplicated", len(local.summary.Calls))
	}
	for _, edge := range local.summary.Calls {
		if local.fieldEdgeOperations[edge.ID] != tagged[0].operation {
			t.Fatal("passive copy lost actual operation")
		}
	}
	data, err := json.Marshal(local.summary.Calls)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("sourceUse")) {
		t.Fatal("private source description escaped process contract")
	}
}

// An ordinary original binding invocation still has its own effects, but no
// component parent-use description can be inferred from a body/operation alone.
func TestComponentAssignmentSourceUnboundParentRefusal(t *testing.T) {
	analysis, file := collectComponentCallProjection(t, "component-unbound-parent.ts", stagedBindingInvocationSource)
	var caller *callableFacts
	for i := range analysis.facts {
		if analysis.facts[i].summary.Name == "direct" {
			caller = &analysis.facts[i]
		}
	}
	if caller == nil || caller.staged.operationsPending {
		t.Fatal("ordinary binding source closure UNREACHED")
	}
	checked := false
	for _, edge := range caller.summary.Calls {
		if edge.sourceUse != nil {
			t.Fatal("unbound ordinary edge inherited component source parent")
		}
		operation := caller.fieldEdgeOperations[edge.ID]
		if operation == nil || !ast.IsCallExpression(operation) || !ast.IsIdentifier(operation.Expression()) || operation.Expression().Text() != "fn" {
			continue
		}
		view, found := callableEffectForCall(analysis, file, operation.Pos())
		if !found || view.Effect != "browser" {
			t.Fatal("ordinary original operation lost own effects", found, view)
		}
		checked = true
	}
	if !checked {
		t.Fatal("actual noncomponent consumer UNREACHED")
	}
}
