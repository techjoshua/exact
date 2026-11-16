package exactcompiler

import (
	"bytes"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"strings"
	"testing"
)

// Imported component protocol reads must retain their real receiver donors.
// The source-only default-member relation cannot replace authored accessors.
func TestBoundComponentContextProbeOriginalSources(t *testing.T) {
	for _, row := range []struct {
		name, setup, argument, placement string
		requireProbe                     bool
	}{
		{"component", "", "this", "isomorphic", true},
		{"authored-getter", `Object.defineProperty(this,'hasContext',{get(){document.title;return()=>false}});`, "this", "client", false},
		{"ordinary-getter", `const ordinary={get hasContext(){document.title;return()=>false}};`, "ordinary as unknown as Component<{}>", "client", false},
		{"authored-method", `this.hasContext=()=>{document.title;return false};`, "this", "client", false},
		{"mixed", `const ordinary={get hasContext(){document.title;return()=>false}};const selectedOwner=Math.random()?this:ordinary;`, "selectedOwner as unknown as Component<{}>", "client", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('probe');function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){` + row.setup + `const selected=read.call(undefined,` + row.argument + `);return()=> <output>{String(selected)}</output>}`
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "bound-component-context-" + row.name + ".tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("actual source compilation failed: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != row.placement {
				t.Fatalf("component probe lost its actual receiver source: %#v", response.Analysis.Components)
			}
			if !row.requireProbe {
				browser := false
				for _, fact := range qualifiedIncrementalProject(t, session).callableCache.merged.facts {
					if fact.summary.Name != "Page" {
						continue
					}
					for _, effect := range fact.summary.EffectSources {
						browser = browser || effect.Environment == "browser" && effect.Description == "document"
					}
				}
				if !browser {
					t.Fatal("authored receiver lost its known getter/method donor")
				}
			}
			// Authored receivers must retain getter donors; a Component cast or
			// method name does not establish the framework probe semantic arm.
			probe := false
			for _, effect := range response.Analysis.Components[0].Contexts {
				probe = probe || effect.Token == "Token" && effect.Kind == "probe"
			}
			if row.requireProbe && !probe {
				t.Fatal("original context probe relation lost")
			}
		})
	}
}

// The caller's field outcomes must be current per-use facts. The imported or
// local helper definition keeps its ordinary unknown receiver contract.
func TestBoundComponentContextTwoUsePortableSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			const source = `import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('probe');function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){const first=read.call(undefined,this);const second=read.call(undefined,this);return()=> <output>{String(first&&second)}</output>}`
			var application Response
			for _, packageType := range []string{"application", "library"} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "bound-context-two-use.tsx", Source: source, Target: target, PackageType: packageType, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatal("original context consumer did not close", response.Analysis.Components)
				}
				checkLocalPageContextAttachment(t, response.Code)
				checkBoundComponentContextFieldEntry(t, session)
				if packageType == "application" {
					application = response
				} else {
					left, err := json.Marshal(application.Analysis.Components)
					if err != nil {
						t.Fatal(err)
					}
					right, err := json.Marshal(response.Analysis.Components)
					if err != nil {
						t.Fatal(err)
					}
					if application.Code != response.Code || !bytes.Equal(left, right) || !reflect.DeepEqual(application.Diagnostics, response.Diagnostics) {
						t.Fatal("caller/package context changed component implementation or contract")
					}
				}
			}
		})
	}
}

func checkBoundComponentContextFieldEntry(t *testing.T, session *Session) {
	t.Helper()
	project := qualifiedIncrementalProject(t, session)
	cache := project.callableCache
	if cache == nil || cache.owner == nil || cache.merged.facts == nil || len(cache.merged.pending) != 0 || !cache.ownsGeneration(project.program, cache.owner.checker) {
		t.Fatal("UNREACHED: canonical merged component source")
	}
	var page, read *callableFacts
	for i := range cache.merged.facts {
		f := &cache.merged.facts[i]
		if f.summary.Name == "Page" {
			page = f
		}
		if f.summary.Name == "read" {
			read = f
		}
	}
	if page == nil || read == nil || page.staged.operationsPending {
		t.Fatal("original component still has compiler work")
	}
	fallback := false
	for _, effect := range read.summary.EffectSources {
		fallback = fallback || effect.fieldOrigin != nil && effect.provenanceIncomplete
	}
	if !fallback {
		t.Fatal("canonical caller erased helper definition's receiver fallback")
	}
	uses := make(map[*ast.Node]bool)
	for _, call := range page.fieldCalls {
		if call.target != read.node || !call.dependencies || !call.complete || call.operation == nil {
			continue
		}
		for _, outcome := range call.outcomes {
			d := outcome.demand
			if d.declaration == read.node && d.key == "hasContext" && d.operation != nil && ast.IsPropertyAccessExpression(d.operation) && ast.IsParameterDeclaration(d.slot) && (outcome.fulfilled || outcome.installedMember != nil) {
				uses[call.operation] = true
			}
		}
	}
	if len(uses) != 2 {
		t.Fatal("UNREACHED: two distinct original helper field consumers", len(uses))
	}
	for _, effect := range page.summary.EffectSources {
		if effect.provenanceIncomplete {
			t.Fatal("component acquired caller coverage without paying its source", effect)
		}
	}
}

// Missing primitive inputs remain compiler source debt. A runtime-unknown
// effect alone cannot stand in for an unowned token Get or internal-slot source.
func TestBoundComponentContextPrimitiveInputRefusers(t *testing.T) {
	for _, row := range []struct{ name, token, setup string }{
		{"unknown-token", `declare const Token:import('@exactjs/core').ContextToken<number>;`, ""},
		{"authored-token-getter", `const Token=createContext<number>('probe');`, `Object.defineProperty(Token,'id',{get(){document.title;return Symbol()}});`},
		{"internal-slot-write", `const Token=createContext<number>('probe');`, `Object.defineProperty(this,'contextTokens',{get(){document.title;return new Map()}});`},
		{"escaped-token", `const Token=createContext<number>('probe');`, `const ordinary={hasContext(token:import('@exactjs/core').ContextToken<unknown>){Object.defineProperty(token,'id',{get(){document.title;return Symbol()}});return false}};read.call(undefined,ordinary as unknown as Component<{}>);`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {createContext,type Component} from '@exactjs/core';` + row.token + `function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){` + row.setup + `const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`
			session := NewSession()
			r := session.Execute(Request{Kind: "compile", ID: "bound-context-refuser-" + row.name + ".tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if hasErrorDiagnostic(r.Diagnostics) {
				if row.name != "escaped-token" {
					t.Fatal("invalid source refuser", r.Diagnostics)
				}
				opaque := false
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, "task placement depends on an opaque call") {
						t.Fatal("unrelated task error hid the original source refuser", r.Diagnostics)
					}
					opaque = true
				}
				if !opaque || r.Code != "" || r.Error != "" {
					t.Fatal("original opaque task refusal was not reached", r.Error, r.Diagnostics)
				}
				// Continue below: placement refusal cannot replace the original SOURCE
				// refuser inspection or turn a false TaskContext argument into acceptance.
			}
			if r.Error != "" {
				if !strings.HasPrefix(r.Error, "Compiler analysis coverage gap:") || r.Code != "" {
					t.Fatal("unexpected source refusal", r.Error)
				}
				return
			}
			project := qualifiedIncrementalProject(t, session)
			debt := false
			for _, fact := range project.callableCache.merged.facts {
				if fact.summary.Name != "Page" {
					continue
				}
				for _, effect := range fact.summary.EffectSources {
					debt = debt || effect.provenanceIncomplete
				}
			}
			if !debt {
				t.Fatal("missing primitive source became clean runtime semantics")
			}
		})
	}
}

// A declared runtime token is a genuinely unresolved source alternative.
// It retains the authored browser donor and generic helper uncertainty without
// manufacturing an undelivered compiler task or a precise DEFAULT result.
func TestBoundComponentContextUnresolvedKeepsAuthoredSource(t *testing.T) {
	for _, row := range []struct{ name, setup string }{
		{"getter", `Object.defineProperty(this,'hasContext',{get(){document.title;return()=>false}});`},
		{"method", `this.hasContext=()=>{document.title;return false};`},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {type Component,type ContextToken} from '@exactjs/core';declare const Token:ContextToken<number>;function read(owner:Component<{}>){return owner.hasContext(Token)}export function Page(this:Component<{}>){` + row.setup + `const selected=read.call(undefined,this);return()=> <output>{String(selected)}</output>}`
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "bound-context-pending-donor-" + row.name + ".tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			project := qualifiedIncrementalProject(t, session)
			cache := project.callableCache
			if cache == nil || cache.owner == nil || !cache.ownsGeneration(project.program, cache.owner.checker) {
				t.Fatal("UNREACHED: current original component source owner")
			}
			var page, read *callableFacts
			for i := range cache.merged.facts {
				fact := &cache.merged.facts[i]
				if fact.summary.Name == "Page" {
					page = fact
				}
				if fact.summary.Name == "read" {
					read = fact
				}
			}
			if page == nil || read == nil {
				t.Fatal("UNREACHED: current original source facts")
			}
			browser, unresolved, entry := false, false, false
			for _, effect := range page.summary.EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "document"
				unresolved = unresolved || effect.provenanceIncomplete
			}
			for _, call := range page.fieldCalls {
				if call.target != read.node || !call.dependencies || call.operation == nil {
					continue
				}
				for _, outcome := range call.outcomes {
					d := outcome.demand
					entry = entry || d.declaration == read.node && d.key == "hasContext" && d.operation != nil && ast.IsPropertyAccessExpression(d.operation) && ast.IsParameterDeclaration(d.slot)
				}
			}
			if !entry {
				t.Fatal("UNREACHED: original canonical formal/member source consumer")
			}
			if !browser || !unresolved {
				t.Fatal("known supplier and unresolved source must coexist", browser, unresolved)
			}
			if page.staged.operationsPending || len(page.staged.pending) != 0 {
				t.Fatal("unresolved source cannot pay actual compiler debt")
			}
			if read.summary.Effect != "unknown" {
				t.Fatal("component caller changed generic helper effect", read.summary.Effect)
			}
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatal("known plus unresolved source lost its public output", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "client" {
				t.Fatal("known browser source lost placement beside unresolved input", response.Analysis.Components)
			}
		})
	}
}
