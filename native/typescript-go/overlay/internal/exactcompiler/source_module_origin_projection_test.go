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

const moduleOriginFactory = `function make(input:{value:string}){return {get value(){return input.value}}}`

func TestModuleOriginCurrentDependencies(t *testing.T) {
	for _, c := range []struct{ name, source, want string }{
		{"original", `const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`, "client"},
		{"field-write", `const input={value:'safe'};const box=make(input);input.value=document.title;export const value=box.value;`, "client"},
		{"alias-write", `const input={value:'safe'};const alias=input;const box=make(alias);alias.value=document.title;export const value=box.value;`, "client"},
		{"unknown-input", `declare function provide():{value:string};const box=make(provide());export const value=box.value;`, "unknown"},
		{"unknown-mutation", `declare function mutate(input:{value:string}):void;const input={value:'safe'};const box=make(input);mutate(input);export const value=box.value;`, "unknown"},
		{"descriptor-replacement", `const input={value:'safe'};const box=make(input);Object.defineProperty(input,'value',{get(){return document.title}});export const value=box.value;`, "unknown"},
	} {
		t.Run(c.name, func(t *testing.T) {
			if c.want != "unknown" {
				assertClosurePlacement(t, moduleOriginFactory+c.source, c.want)
				return
			}
			session := NewSession()
			source := moduleOriginFactory + c.source
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/origin-refusal.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, e := range response.Analysis.Exports {
				if e.Name == "value" {
					found = true
					if e.Placement != "unknown" {
						t.Fatalf("unresolved origin lost uncertainty: %s", e.Placement)
					}
				}
			}
			if !found {
				t.Fatal("missing export")
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				r := session.Execute(Request{Kind: "compile", ID: "/virtual/origin-refusal.ts", Source: source, Target: target, Diagnostics: "semantic"})
				refused := false
				for _, d := range r.Diagnostics {
					refused = refused || d.Code == "EXACT2101"
				}
				if !refused {
					t.Fatalf("unresolved initializer compiled without refusal: %s %v", r.Error, r.Diagnostics)
				}
			}
		})
	}
}

func TestModuleOriginRequestInvalidation(t *testing.T) {
	session := NewSession()
	source := moduleOriginFactory + `const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`
	for i, current := range []string{source, source, strings.ReplaceAll(source, "document.title", "'safe'"), source} {
		if i == 3 {
			if r := session.Execute(Request{Kind: "reset"}); r.Error != "" {
				t.Fatal(r.Error)
			}
		}
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/module-origin-cache.ts", Source: current, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		want := "client"
		if i == 2 {
			want = "isomorphic"
		}
		found := map[string]bool{}
		for _, e := range r.Analysis.Exports {
			found[e.Name] = true
			if e.Name == "safeValue" && e.Placement != "isomorphic" || e.Name == "value" && e.Placement != want {
				t.Fatalf("request%d stale placement: %s %s", i, e.Name, e.Placement)
			}
		}
		if !found["safeValue"] || !found["value"] {
			t.Fatal("source replacement lost an export")
		}
	}
}

// A returned getter follows the creator's reassigned formal rather than the
// caller's original object. This checks source behavior, not detached metadata.
func TestModuleOriginWritableFormalDependencies(t *testing.T) {
	source := `function make(input:{value:string}){input={value:'new'};return {get value(){return input.value}}}const box=make({value:'safe'});export const value=box.value;`
	assertClosurePlacement(t, source, "isomorphic")
}

// Execute each actual emitted namespace. Server pruning must remove the browser
// read while preserving the independent safe capture and its real getter result.
func TestModuleOriginActualNamespaces(t *testing.T) {
	const source = moduleOriginFactory + `const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-origin-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			path := filepath.Join(t.TempDir(), "origin.mts")
			if err := os.WriteFile(path, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.document=Object.defineProperty({},'title',{get(){reads++;return 'browser'}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.safeValue,'safe');if(process.argv[2]==='client'){assert.equal(m.value,'browser');assert.equal(reads,1)}else{assert.equal('value'in m,false);assert.equal(reads,0)}`
			if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, path, string(target)).CombinedOutput(); err != nil {
				t.Fatalf("actual namespace: %v %s", err, out)
			}
		})
	}
}

func TestModuleOriginKnownGetterEffectSurvivesUnknown(t *testing.T) {
	req := Request{Kind: "analyze", ID: "/virtual/module-origin-known-unknown.ts", Source: moduleOriginFactory + `declare function provide():string;const box=make({get value(){document.title;return provide()}});export const value=box.value;`}
	project, ds, err := newProjectState(req, req.ID)
	if err != nil || len(ds) != 0 {
		t.Fatal(err, ds)
	}
	g, err := project.advance(context.Background(), req.ID, req.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer g.release()
	collectProjectCallableEffects(project, g.sourceFile, g.checker, nil, nil, nil, nil, analyzeAssets(g.sourceFile, g.checker, req), nil, nil)
	last := g.sourceFile.Statements.Nodes[len(g.sourceFile.Statements.Nodes)-1].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0]
	a := newModuleDefinitionAnalysis(g.checker, project.callableCache.owner)
	a.symbol(g.checker.GetSymbolAtLocation(last.Name()), false)
	if !a.browser || !a.opaque {
		t.Fatalf("lost known effect or unresolved obligation: browser%v opaque%v", a.browser, a.opaque)
	}
}

// An unresolved return alternative retains its own uncertainty beside the
// supported source result and an independent browser demand.
func TestModuleOriginReturnAlternatives(t *testing.T) {
	for _, test := range []struct {
		name, alternative string
		opaque            bool
	}{
		{"supported-pair", `{get value(){return input.value}}`, false},
		{"unknown-return", `unknownValue`, true},
		{"proxy-return", `new Proxy({value:'safe'},{get(){return 'proxy'}})`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `declare const pick:boolean;declare const unknownValue:{value:string};function make(input:{value:string}){return pick?{get value(){return input.value}}:` + test.alternative + `}const box=make({get value(){return document.title}});export const value=(document.title,box.value);`
			request := Request{Kind: "analyze", ID: "/virtual/module-origin-alternatives.ts", Source: source, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil, nil)
			last := generation.sourceFile.Statements.Nodes[len(generation.sourceFile.Statements.Nodes)-1].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0]
			analysis := newModuleDefinitionAnalysis(generation.checker, project.callableCache.owner)
			analysis.symbol(generation.checker.GetSymbolAtLocation(last.Name()), false)
			if !analysis.browser || analysis.opaque != test.opaque {
				t.Fatalf("browser=%v opaque=%v wantOpaque=%v", analysis.browser, analysis.opaque, test.opaque)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				r := session.Execute(Request{Kind: "compile", ID: request.ID, Source: source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if test.opaque {
					// Value availability is independent of initializer execution
					// placement. This plain comma initializer can be emitted, but
					// must never turn incomplete return provenance into portability.
					unknown := false
					for _, e := range r.Analysis.Exports {
						unknown = unknown || e.Name == "value" && e.Placement == "unknown"
					}
					if !unknown {
						t.Fatalf("mixed return lost unknown availability: %#v", r.Analysis.Exports)
					}
				}
				if !test.opaque {
					found := false
					for _, export := range r.Analysis.Exports {
						if export.Name == "value" {
							found = true
							if export.Placement != "client" {
								t.Fatalf("supported return placement: %#v", export)
							}
						}
					}
					if !found {
						t.Fatal("supported return export missing")
					}
					emitted := strings.Contains(r.Code, "const value =")
					if emitted != (target == TargetClient) {
						t.Fatalf("browser export emission for %s: %v", target, emitted)
					}
				}
				if !test.opaque && (r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "") {
					t.Fatal(r.Error, r.Diagnostics)
				}
			}
		})
	}
}
