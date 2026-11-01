package exactcompiler

import (
	"context"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
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

// These are copied historical tuples. No disposed operation is revalidated or
// adopted as live. A genuine active project owns the effect-only lookup domain.
func TestModuleOriginProjectionIdentity(t *testing.T) {
	req := Request{Kind: "analyze", ID: "/virtual/module-origin.ts", Source: moduleOriginFactory + `const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`}
	project, diagnostics, err := newProjectState(req, req.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), req.ID, req.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, req), nil, nil)
	owner := project.callableCache.owner
	v := owner.values
	var projections []*moduleInitializerProjection
	var read *ast.Node
	for _, statement := range generation.sourceFile.Statements.Nodes {
		if ast.IsVariableStatement(statement) {
			for _, d := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if ast.IsIdentifier(d.Name()) && d.Name().Text() == "value" {
					read = d
				}
			}
		}
	}
	for _, p := range v.initializerDeclarations {
		if p.Draft.Mode == "CallEffectOrigin" {
			projections = append(projections, p)
		}
	}
	if len(projections) != 2 || read == nil {
		t.Fatalf("missing actual origins: %d", len(projections))
	}
	q := sourceValueQuery{owner: v, executable: owner, reading: read}
	for _, p := range projections {
		encoded, err := json.Marshal(p.Draft)
		if err != nil || strings.Contains(string(encoded), `"OriginMode"`) || strings.Contains(string(encoded), `"Origins"`) || strings.Contains(string(encoded), `"OriginGeneration"`) {
			t.Fatalf("private projection leaked into serialized metadata: %s %v", encoded, err)
		}
		call := p.Draft.Origins[0].Call
		if len(q.moduleCallEffectOrigins(call)) != 1 {
			t.Fatal("actual original projection refused")
		}
		for _, kind := range []string{"unsealed", "generation", "mode", "capture", "call", "before", "normal-domain"} {
			t.Run(kind, func(t *testing.T) {
				copy := *p
				copy.Draft = cloneModuleInitializerDraft(p.Draft)
				query := q
				switch kind {
				case "unsealed":
					copy.Sealed = false
				case "generation":
					copy.Draft.OriginGeneration = nil
				case "mode":
					copy.Draft.OriginMode[0] ^= 1
				case "capture":
					copy.Draft.Origins[0].Captures[0].Origin = copy.Draft.Origins[0].Origin
				case "call":
					copy.Draft.Origins[0].Call = projections[0].Draft.Origins[0].Call
					if copy.Draft.Origins[0].Call == call {
						copy.Draft.Origins[0].Call = projections[1].Draft.Origins[0].Call
					}
				case "before":
					query.reading = copy.Draft.Declaration
				case "normal-domain":
					query.inputs = &sourceValueInputs{}
				}
				v.initializerDeclarations[p.Draft.Declaration] = &copy
				defer func() { v.initializerDeclarations[p.Draft.Declaration] = p }()
				if len(query.moduleCallEffectOrigins(call)) != 0 {
					t.Fatal("mismatched projection accepted")
				}
			})
		}
	}
	a, b := projections[0].Draft.Origins[0], projections[1].Draft.Origins[0]
	if a.Origin != b.Origin || a.Call == b.Call || a.Captures[0].Origin == b.Captures[0].Origin {
		t.Fatal("creating families coalesced")
	}
	clone := cloneModuleInitializerDraft(projections[0].Draft)
	clone.Origins[0].Captures[0].Origin = b.Captures[0].Origin
	if projections[0].Draft.Origins[0].Captures[0].Origin != a.Captures[0].Origin {
		t.Fatal("clone aliases published capture")
	}
	generation.release()
	if len(q.moduleCallEffectOrigins(a.Call)) != 0 {
		t.Fatal("disposed generation used as current effect domain")
	}
}

func TestModuleOriginRequestInvalidation(t *testing.T) {
	session := NewSession()
	source := moduleOriginFactory + `const safe=make({value:'safe'});const box=make({get value(){return document.title}});export const safeValue=safe.value;export const value=box.value;`
	var old *moduleInitializerDraft
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
		for _, e := range r.Analysis.Exports {
			if e.Name == "safeValue" && e.Placement != "isomorphic" || e.Name == "value" && e.Placement != want {
				t.Fatalf("request%d stale placement: %s %s", i, e.Name, e.Placement)
			}
		}
		found := false
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			v := project.callableCache.owner.values
			for _, p := range v.initializerDeclarations {
				if p.Draft.Mode != "CallEffectOrigin" {
					continue
				}
				found = true
				if p.Draft.OriginGeneration != v.generation {
					t.Fatal("stale origin published")
				}
				if old != nil && p.Draft.OriginGeneration == old.OriginGeneration {
					t.Fatal("old construction restamped/reused")
				}
				if old == nil || i != 0 {
					old = p.Draft
				}
				break
			}
		}
		if !found {
			t.Fatal("lost actual producer projection")
		}
	}
}

func TestModuleOriginWritableFormalRefuses(t *testing.T) {
	source := `function make(input:{value:string}){input={value:'new'};return {get value(){return input.value}}}const box=make({value:'safe'});export const value=box.value;`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/module-origin-writable.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, p := range project.callableCache.owner.values.initializerDeclarations {
			if len(p.Draft.Origins) != 0 {
				t.Fatal("writable capture detached")
			}
		}
	}
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

// A supported return beside an unresolved alternative must not publish a
// partial origin family. An independent browser demand survives that refusal.
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
					for _, project := range session.projects {
						if project.callableCache == nil {
							continue
						}
						for _, p := range project.callableCache.owner.values.initializerDeclarations {
							if p.Draft != nil && p.Draft.Declaration != nil && p.Draft.Declaration.Name().Text() == "box" && len(p.Draft.Origins) != 0 {
								t.Fatal("compile published partial origin family")
							}
						}
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
