package exactcompiler

import (
	"encoding/json"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

const possibleProxyDirectSource = `export{};function read(input:{value:string}){return input.value}const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});read(input);`

func currentProxyCaller(t *testing.T, source, call string) (*Session, Response, CallableSummary) {
	t.Helper()
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/possible-proxy.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid source", r.Diagnostics)
		}
	}
	name := fmt.Sprint("module@", strings.LastIndex(source, call))
	for _, f := range r.Analysis.Callables {
		if f.Name == name {
			return s, r, f
		}
	}
	t.Fatal("original current caller absent", name)
	return nil, Response{}, CallableSummary{}
}
func TestPossibleProxyDirectGetConservesEffects(t *testing.T) {
	_, _, caller := currentProxyCaller(t, possibleProxyDirectSource, "read(input);")
	browser, unknown := false, false
	for _, e := range caller.EffectSources {
		browser = browser || e.Environment == "browser"
		unknown = unknown || e.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatal("actual direct Get must retain possible handler browser AND unknown", caller.EffectSources)
	}
}

func TestPossibleProxyOriginalNewProducer(t *testing.T) {
	source := `export{};const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});`
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/possible-proxy-producer.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" {
		t.Fatal(r.Error)
	}
	for _, d := range r.Diagnostics {
		if strings.HasPrefix(d.Code, "TS") {
			t.Fatal("invalid source", r.Diagnostics)
		}
	}
	rows := 0
	for _, project := range s.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		for _, fact := range project.callableCache.merged.facts {
			if fact.initializerDraft == nil {
				t.Log("no draft", fact.summary.Name, fact.summary.DirectEffectSources)
				continue
			}
			d := fact.initializerDraft
			for _, row := range d.PossibleProxyGets {
				rows++
				if row.Site != d.Declaration.Initializer() || row.ConstructorRead != row.Site.Expression() || row.Entry == nil || !row.Entry.once || row.Entry.region != nil || row.Entry.node != row.Site || row.Entry.statement != fact.node || row.Entry != owner.values.indexes[d.Source].normalOccurrences[row.Site] || d.Program != owner.values.program || d.Checker != owner.checker || d.OriginGeneration != owner.values.generation || d.OriginMode != fact.descriptorMode {
					t.Fatal("original New/source/slot envelope missing")
				}
				global := owner.checker.GetGlobalSymbol("Proxy", ast.SymbolFlagsValue, nil)
				if global == nil || row.Constructor != global.ValueDeclaration || row.Target != row.Site.AsNewExpression().Arguments.Nodes[0] || row.Handler != row.Site.AsNewExpression().Arguments.Nodes[1] {
					t.Fatal("actual canonical constructor/observed target-handler origins")
				}
				if fact.normalInputs != nil || len(fact.normalCalls) != 0 || len(d.Rows) != 1 || d.Rows[0].Domain != "Unrepresented" {
					t.Fatal("possible effect association minted normal output or retained frame")
				}
				for _, effect := range fact.summary.EffectSources {
					if effect.Environment == "browser" {
						t.Fatal("handler body eagerly ran at construction")
					}
				}
				for _, edge := range fact.summary.Calls {
					if edge.Resolved && edge.Name == "get" {
						t.Fatal("handler edge at construction")
					}
				}
			}
		}
	}
	if rows != 1 {
		t.Fatal("original reached New has no unique possible constructor/args producer", rows)
	}
}

func TestPossibleProxyFirstRoleBoundaries(t *testing.T) {
	read := `function read(input:{value:string}){return input.value}`
	for _, c := range []struct{ name, source string }{
		{"ordinary-method", `export{};` + read + `const input={value:'safe',get(){document.title;return 'not-trap'}};read(input);`},
		{"shadowed", `export{};` + read + `class Proxy{value='safe';constructor(_target:{value:string},_handler:{get():string}){}}const input=new Proxy({value:'safe'},{get(){document.title;return 'not-trap'}});read(input);`},
		{"replaced-global", `export{};` + read + `Proxy=class{value='safe'} as unknown as ProxyConstructor;const input=new Proxy({value:'safe'},{get(){document.title;return 'not-trap'}});read(input);`},
		{"replaced-alias", `export{};` + read + `let Constructor:ProxyConstructor=Proxy;Constructor=class{value='safe'} as unknown as ProxyConstructor;const input=new Constructor({value:'safe'},{get(){document.title;return 'not-trap'}});read(input);`},
	} {
		t.Run(c.name, func(t *testing.T) {
			s, _, caller := currentProxyCaller(t, c.source, "read(input);")
			for _, effect := range caller.EffectSources {
				if effect.Environment == "browser" {
					t.Fatal("ordinary method/shadow/replacement invoked dormant handler", caller.EffectSources)
				}
			}
			for _, project := range s.projects {
				if project.callableCache != nil {
					for _, fact := range project.callableCache.merged.facts {
						if fact.initializerDraft != nil && len(fact.initializerDraft.PossibleProxyGets) != 0 {
							t.Fatal("unrelated constructor/native identity inferred")
						}
					}
				}
			}
		})
	}
}

// All rows concern the exact current caller, never aggregate handler summaries.
func TestPossibleProxyCurrentHandlerEffects(t *testing.T) {
	read := `export{};function read(input:{value:string}){return input.value}`
	for _, c := range []struct{ name, body string }{
		{"target-getter", `const input=new Proxy({get value(){return document.title}},{});read(input);`},
		{"replacement", `const handler={get(){return 'safe'}};const input=new Proxy({value:'safe'},handler);handler.get=()=>document.title;read(input);`},
		{"unknown-writer", `declare function foreign(h:object):void;const handler={get(){document.title;return 'proxy'}};const input=new Proxy({value:'safe'},handler);foreign(handler);read(input);`},
		{"handler-getter", `const input=new Proxy({value:'safe'},{get get(){document.title;return ()=> 'proxy'}});read(input);`},
		{"handler-throw", `const input=new Proxy({value:'safe'},{get(){document.title;throw 9}});read(input);`},
		{"independent-unknown", `declare function foreign():void;const input=new Proxy({value:'safe'},{get(){document.title;foreign();return 'proxy'}});read(input);`},
	} {
		t.Run(c.name, func(t *testing.T) {
			s, _, caller := currentProxyCaller(t, read+c.body, "read(input);")
			browser, unknown := false, false
			for _, e := range caller.EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if !browser || !unknown {
				t.Fatal("current possible handler lost browser/unknown", caller.EffectSources)
			}
			for _, p := range s.projects {
				if p.callableCache != nil {
					for _, f := range p.callableCache.merged.facts {
						for _, call := range f.fieldCalls {
							for _, o := range call.outcomes {
								if o.fulfilled && o.demand.key == "value" {
									t.Fatal("possible Proxy received DATA coverage")
								}
							}
						}
					}
				}
			}
		})
	}
}

// These are post-analysis metadata/copy kernels, not intercepted live issuance.
func TestPossibleProxyDetachedLifetimeRefusal(t *testing.T) {
	s, _, _ := currentProxyCaller(t, possibleProxyDirectSource, "read(input);")
	for _, p := range s.projects {
		if p.callableCache == nil {
			continue
		}
		owner := p.callableCache.owner
		for _, projection := range owner.values.initializerDeclarations {
			d := projection.Draft
			if d == nil || len(d.PossibleProxyGets) != 1 {
				continue
			}
			copy := cloneModuleInitializerDraft(d)
			copy.PossibleProxyGets[0].Handler = nil
			if d.PossibleProxyGets[0].Handler == nil {
				t.Fatal("copy aliases original row slice")
			}
			for _, name := range []string{"no-live-recipient", "mode", "generation", "checker", "source", "entry"} {
				t.Run(name, func(t *testing.T) {
					changed := cloneModuleInitializerDraft(d)
					old := projection.Draft
					projection.Draft = changed
					defer func() { projection.Draft = old }()
					switch name {
					case "mode":
						changed.Mode = "wrong"
					case "generation":
						changed.OriginGeneration = &projectGeneration{}
					case "checker":
						changed.Checker = nil
					case "source":
						changed.Source = nil
					case "entry":
						changed.PossibleProxyGets[0].Entry = nil
					}
					q := sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
					result := accessorCandidates{}
					q.possibleProxyGetEffects(d.PossibleProxyGets[0].Site, []string{"value"}, "", accessorRead, nil, &result)
					if len(result.effects) != 0 || len(result.values) != 0 || len(result.normalCalls) != 0 || len(result.fieldOutcomes) != 0 || len(result.ownedGets) != 0 {
						t.Fatal("metadata renewed output/effect authority")
					}
				})
			}
			return
		}
	}
	t.Fatal("genuine producer missing")
}

func TestPossibleProxyCurrentRequestReplacement(t *testing.T) {
	s := NewSession()
	id := "/virtual/possible-proxy-current.ts"
	for _, source := range []string{possibleProxyDirectSource, possibleProxyDirectSource, `export{};function read(input:{value:string}){return input.value}const input={value:'safe',get(){document.title;return 'not-trap'}};read(input);`, possibleProxyDirectSource} {
		r := s.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		found := false
		for _, f := range r.Analysis.Callables {
			if f.Name == fmt.Sprint("module@", strings.LastIndex(source, "read(input);")) {
				found = true
				browser := false
				for _, e := range f.EffectSources {
					browser = browser || e.Environment == "browser"
				}
				if browser != (source == possibleProxyDirectSource) {
					t.Fatal("stale source/request possible handler", f.EffectSources)
				}
			}
		}
		if !found {
			t.Fatal("current caller missing")
		}
	}
}

func TestPossibleProxyConservativeCompileAndSourceNodePhases(t *testing.T) {
	read := `export{};function read(input:{value:string}){return input.value}`
	for _, c := range []struct {
		name, body, completion string
		reads                  int
	}{
		{"dormant", `const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});`, "dormant", 0},
		{"read", `const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});read(input);`, "proxy", 1},
		{"handler-getter", `const input=new Proxy({value:'safe'},{get get(){document.title;return ()=>{document.title;return 'proxy'}}});read(input);`, "proxy", 2},
		{"throw", `const input=new Proxy({value:'safe'},{get(){document.title;throw 9}});read(input);`, "throw9", 1},
	} {
		for _, target := range []string{"client", "server"} {
			t.Run(c.name+"/"+target, func(t *testing.T) {
				source := read + c.body
				r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/possible-proxy-runtime.ts", Source: source, Target: Target(target), Diagnostics: "semantic"})
				denied := false
				for _, d := range r.Diagnostics {
					denied = denied || d.Severity == "error" && d.Code == "EXACT2101"
				}
				if r.Error != "" || !denied || r.Code != "" {
					t.Fatal("effects-only Proxy unexpectedly completed compilation", r.Error, r.Diagnostics)
				}
				script := `const fs=require('node:fs'),vm=require('node:vm');let reads=0;const document={get title(){reads++;return 'title'}};let outcome;try{const value=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{},document});outcome=process.argv[2]==='dormant'?'dormant':value===undefined?'undefined':String(value)}catch(e){outcome='throw'+String(e)};if(outcome!==process.argv[2]||reads!==Number(process.argv[3]))throw Error(JSON.stringify({outcome,reads}));`
				// This is actual authored JavaScript after official TS7 erasure, not
				// an emitted artifact success or a normal construction receipt.
				sourceNodeScript(t, source, script, c.completion, fmt.Sprint(c.reads))
			})
		}
	}
}

func TestPossibleProxyDormantAccessorBodies(t *testing.T) {
	source := `export{};const input=new Proxy({get value(){return document.title}},{get get(){document.title;return ()=> 'proxy'}});`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/possible-proxy-dormant-accessors.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	found := false
	for _, f := range r.Analysis.Callables {
		if strings.HasPrefix(f.Name, "module@") {
			found = true
			for _, e := range f.EffectSources {
				if e.Environment == "browser" {
					t.Fatal("dormant target/handler Get body at construction", f)
				}
			}
		}
	}
	if !found {
		t.Fatal("original New publisher absent")
	}
}

func TestPossibleProxyAuthoredConstructorAlternatives(t *testing.T) {
	for _, c := range []struct {
		name, prefix string
		browser      bool
	}{
		{"mixed-if", `declare const replace:boolean;if(replace){Proxy=class{constructor(){document.title}} as unknown as ProxyConstructor}`, true},
		{"mixed-choice", `declare const replace:boolean;Proxy=replace?(class{constructor(){document.title}} as unknown as ProxyConstructor):Proxy;`, true},
		{"authored", `Proxy=class{constructor(){document.title}} as unknown as ProxyConstructor;`, true},
		{"genuine", ``, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export{};` + c.prefix + `const input=new Proxy({},{});`
			s, _, f := currentProxyCaller(t, source, "const input")
			browser := false
			for _, e := range f.EffectSources {
				browser = browser || e.Environment == "browser"
			}
			rows := 0
			for _, p := range s.projects {
				if p.callableCache != nil {
					for _, fact := range p.callableCache.merged.facts {
						if fact.summary.Name == f.Name && fact.initializerDraft != nil {
							rows += len(fact.initializerDraft.PossibleProxyGets)
						}
					}
				}
			}
			if browser != c.browser {
				t.Fatalf("original dormant New constructor effects browser=%v expected=%v possible-native-rows=%d effects=%#v", browser, c.browser, rows, f.EffectSources)
			}
			t.Log("original New possible-native rows", rows, "calls", f.Calls)
		})
	}
}

func TestPossibleProxyCapturedCurrentHandlerCut(t *testing.T) {
	make := `export{};function make(input:{value:string}){return()=>input.value}`
	for _, c := range []struct {
		name, body string
		browser    bool
	}{
		{"before", `const handler={get(){return 'safe'}};const input=new Proxy({value:'safe'},handler);const selected=make(input);handler.get=()=>document.title;selected();`, true},
		{"after", `const handler={get(){return 'safe'}};const input=new Proxy({value:'safe'},handler);const selected=make(input);selected();handler.get=()=>document.title;`, false},
		{"target-getter", `const input=new Proxy({get value(){return document.title}},{});const selected=make(input);selected();`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			s, _, f := currentProxyCaller(t, make+c.body, "selected();")
			browser, unknown := false, false
			for _, e := range f.EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != c.browser || !unknown {
				t.Fatal("exact captured current caller handler cut", browser, unknown, c.browser, f.EffectSources)
			}
			for _, p := range s.projects {
				if p.callableCache != nil {
					for _, fact := range p.callableCache.merged.facts {
						if fact.summary.Name == f.Name {
							for _, call := range fact.fieldCalls {
								for _, o := range call.outcomes {
									if o.fulfilled {
										t.Fatal("possible Proxy granted DATA outcome")
									}
								}
							}
						}
					}
				}
			}
		})
	}
}

// This also supplies successful public Responses for a temporary stage-only
// observation parity check. It installs no production observer or receipt.
func TestPossibleProxySuccessfulResponses(t *testing.T) {
	for _, c := range []struct{ source, call string }{
		{possibleProxyDirectSource, "read(input);"},
		{`export{};function make(input:{value:string}){return()=>input.value}const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});const selected=make(input);selected();`, "selected();"},
	} {
		_, r, f := currentProxyCaller(t, c.source, c.call)
		browser, unknown := false, false
		for _, e := range f.EffectSources {
			browser = browser || e.Environment == "browser"
			unknown = unknown || e.Environment == "unknown"
		}
		if !browser || !unknown {
			t.Fatal("successful exact caller not reached", f.EffectSources)
		}
		b, err := json.Marshal(r)
		if err != nil {
			t.Fatal(err)
		}
		t.Log("PXFINAL_RESPONSE", string(b))
	}
}
