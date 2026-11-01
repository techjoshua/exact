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

// Ordinary source relationships do not require detached normal initializer history.
func TestPossibleProxyOriginalNewProducer(t *testing.T) {
	source := `export{};const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});`
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/possible-proxy-producer.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	checked := false
	for _, project := range s.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		walkNode(project.program.GetSourceFile("/virtual/possible-proxy-producer.ts").AsNode(), func(site *ast.Node) bool {
			if !ast.IsNewExpression(site) {
				return true
			}
			q := sourceValueQuery{owner: owner.values, executable: owner, dependenciesOnly: true, remaining: 4096, active: make(map[*ast.Node]bool)}
			inputs, possible := q.sourceProxyInputs(site, nil)
			args := site.AsNewExpression().Arguments.Nodes
			if !possible || len(inputs[0]) != 1 || len(inputs[1]) != 1 || inputs[0][0].node != args[0] || inputs[1][0].node != args[1] {
				t.Fatal("original acquired target/handler relation missing", inputs)
			}
			checked = true
			return false
		})
		for _, fact := range project.callableCache.merged.facts {
			if !strings.HasPrefix(fact.summary.Name, "module@") {
				continue
			}
			if fact.normalInputs != nil || len(fact.normalCalls) != 0 {
				t.Fatal("source association entered normal execution")
			}
			for _, effect := range fact.summary.EffectSources {
				if effect.Environment == "browser" {
					t.Fatal("handler body eagerly ran at construction", fact.summary)
				}
			}
			for _, edge := range fact.summary.Calls {
				if edge.Resolved && edge.Name == "get" {
					t.Fatal("trap body edge at construction")
				}
			}
		}
	}
	if !checked {
		t.Fatal("original source New absent")
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

// A source MAY relation cannot renew the separate normal recipient authority.
func TestPossibleProxyDetachedLifetimeRefusal(t *testing.T) {
	s, _, _ := currentProxyCaller(t, possibleProxyDirectSource, "read(input);")
	checked := false
	for _, project := range s.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		walkNode(project.program.GetSourceFile("/virtual/possible-proxy.ts").AsNode(), func(site *ast.Node) bool {
			if !ast.IsNewExpression(site) {
				return true
			}
			source := sourceValueQuery{owner: owner.values, executable: owner, dependenciesOnly: true, remaining: 4096, active: make(map[*ast.Node]bool)}
			if _, ok := source.sourceProxyInputs(site, nil); !ok {
				t.Fatal("genuine source relation absent")
			}
			normal := sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
			result := accessorCandidates{}
			normal.possibleProxyGetEffects(site, []string{"value"}, "", accessorRead, nil, &result)
			if len(result.effects) != 0 || len(result.environmentEffects) != 0 || len(result.values) != 0 || len(result.normalCalls) != 0 || len(result.fieldOutcomes) != 0 || len(result.ownedGets) != 0 {
				t.Fatal("source relation renewed normal output/effect authority")
			}
			sourceResult := accessorCandidates{}
			source.sourceProxyGetDependencies(site, []string{"value"}, "", accessorRead, nil, &sourceResult, nil)
			if !sourceResult.opaque || !sourceResult.valueIncomplete {
				t.Fatal("possible Get lost residual")
			}
			if len(sourceResult.values) != 0 || len(sourceResult.normalCalls) != 0 || len(sourceResult.fieldCalls) != 0 || len(sourceResult.fieldOutcomes) != 0 || len(sourceResult.ownedGets) != 0 {
				t.Fatal("possible Get minted DATA or normal authority")
			}
			checked = true
			return false
		})
	}
	if !checked {
		t.Fatal("original source New absent")
	}
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
		{"supplied-default", `const input=new Proxy({value:'safe'},{get(_target={value:document.title},_key:string|symbol=document.title){return 'safe'}});read(input);`, "safe", 0},
		{"direct-receiver-default", `const input=new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return 'safe'}});read(input);`, "safe", 0},
		{"reflect-undefined-receiver", `const input=new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return receiver}});Reflect.get(input,'value',undefined);`, "title", 1},
		{"handler-receiver", `const handler={get title(){return document.title},get(){return this.title}};const input=new Proxy({value:'safe'},handler);read(input);`, "title", 1},
		{"generator-extra-default", `const handler:ProxyHandler<{value:string}>={*get(_target,_key,_receiver,extra=document.title){yield extra}};const input=new Proxy({value:'safe'},handler);read(input);`, "[object Generator]", 1},
		{"generator-body", `const input=new Proxy({value:'safe'},{*get(){document.title;yield 'proxy'}});read(input);`, "[object Generator]", 0},
		{"argument-get-phase", `const args={get handler(){document.title;return {get(){return 'safe'}}}};const input=new Proxy({value:'safe'},args.handler);read(input);`, "safe", 1},
		{"throw", `const input=new Proxy({value:'safe'},{get(){document.title;throw 9}});read(input);`, "throw9", 1},
	} {
		for _, target := range []string{"client", "server"} {
			t.Run(c.name+"/"+target, func(t *testing.T) {
				source := read + c.body
				r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/possible-proxy-runtime.ts", Source: source, Target: Target(target), Diagnostics: "semantic", SourceMap: true})
				denied := false
				for _, d := range r.Diagnostics {
					denied = denied || d.Severity == "error" && d.Code == "EXACT2101"
				}
				if r.Error != "" || !denied || r.Code != "" || r.SourceMap != nil {
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
