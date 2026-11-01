package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Eager source evaluation owns effects independently of expression/result shape.
func TestModuleEvaluationOwners(t *testing.T) {
	for _, test := range []struct{ name, source, want string }{
		{"static field", `class C{static value=document.title}export const value=1;`, "browser"},
		{"static block", `class C{static{document.title}}export const value=1;`, "browser"},
		{"computed method", `class C{[document.title](){return 'safe'}}export const value=1;`, "browser"},
		{"block", `{document.title}export const value=1;`, "browser"},
		{"conditional", `if(true){document.title}export const value=1;`, "browser"},
		{"export", `export default document.title;`, "browser"},
		{"deferred", `class C{value=document.title;read(){return document.title}}export const value=1;`, "neutral"},
		{"disposal", `/// <reference lib="esnext.disposable" />
{using value={[Symbol.dispose](){}}}export const result=1;`, "unknown"},
		{"abrupt acquisition", `/// <reference lib="esnext.disposable" />
{function stop():never{throw 9}using resource=stop()}export const value=1;`, "neutral"},
		{"throw prefix", `{throw 9;document.title}export const result=1;`, "neutral"},
		{"unreachable", `if(false){document.title}export const value=1;`, "neutral"},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/module-evaluation.ts", Source: test.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			found := false
			for _, fact := range r.Analysis.Callables {
				if fact.Kind == "module-initializer" && fact.Name == "module@0" {
					found = true
					if fact.Effect != test.want {
						t.Fatalf("effect=%s want=%s", fact.Effect, test.want)
					}
				}
			}
			if !found {
				t.Fatal("missing original module evaluation owner")
			}
		})
	}
}

// Effect ownership cannot reorder class keys/static work or erase Throw.
func TestModuleEvaluationEmitted(t *testing.T) {
	for _, fixture := range []struct {
		name, source string
		abrupt       bool
	}{
		{"class order", `class C{static value=document.title;[document.title](){return document.title}static{document.title}}export const value=C.value;`, false},
		{"throw", `{throw 9;document.title}export const value=1;`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fixture.name+"/"+string(target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-evaluation.ts", Source: fixture.source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" && target == TargetClient {
					t.Fatal(r.Error, r.Diagnostics)
				}
				file := filepath.Join(t.TempDir(), "module.mts")
				if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';let gets=0;const before=Object.getOwnPropertyDescriptor(globalThis,'document');try{Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){return String(++gets)}}});if(process.argv[3]==='true'){await assert.rejects(import(pathToFileURL(process.argv[1]).href),e=>e===9);assert.equal(gets,0)}else{const m=await import(pathToFileURL(process.argv[1]).href);if(process.argv[2]==='client'){assert.equal(gets,3);assert.equal(m.value,'2')}else{assert.equal(gets,0);assert.equal('value' in m,false)}}}finally{if(before)Object.defineProperty(globalThis,'document',before);else delete globalThis.document}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),before);`
				abrupt := "false"
				if fixture.abrupt {
					abrupt = "true"
				}
				if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file, string(target), abrupt).CombinedOutput(); err != nil {
					t.Fatalf("emitted module: %v %s", err, out)
				}
			})
		}
	}
}

func TestModuleEvaluationReplacementAndOpacity(t *testing.T) {
	session := NewSession()
	for _, initializer := range []string{"document.title", "'safe'", "document.title"} {
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/module-evaluation.ts", Source: "class C{static value=" + initializer + "}export const value=1;", Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		wanted := "browser"
		if initializer == "'safe'" {
			wanted = "neutral"
		}
		found := false
		for _, fact := range r.Analysis.Callables {
			if fact.Name == "module@0" {
				found = true
				if fact.Effect != wanted {
					t.Fatal(fact)
				}
			}
		}
		if !found {
			t.Fatal("missing replacement owner")
		}
	}
	const source = `/// <reference lib="esnext.disposable" />
{document.title;using resource={[Symbol.dispose](){}}}export const value=1;`
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-disposal.ts", Source: source, Target: target, Diagnostics: "semantic"})
		denied := false
		for _, diagnostic := range r.Diagnostics {
			denied = denied || diagnostic.Code == "EXACT2101"
		}
		if denied != (target == TargetServer) {
			t.Fatal("known browser disposal changed target authorization", target, r.Diagnostics)
		}
		for _, fact := range r.Analysis.Callables {
			if fact.Name == "module@0" {
				browser, unknown := false, false
				for _, effect := range fact.EffectSources {
					browser = browser || effect.Environment == "browser"
					unknown = unknown || effect.Opaque
				}
				if !browser || !unknown {
					t.Fatal("disposal lost known donor or residual", fact)
				}
			}
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/disposal-only.ts", Source: `/// <reference lib="esnext.disposable" />
{using resource={[Symbol.dispose](){}}}export const value=1;`, Target: target, Diagnostics: "semantic"})
		denied := false
		for _, diagnostic := range r.Diagnostics {
			denied = denied || diagnostic.Code == "EXACT2101"
		}
		if !denied {
			t.Fatal("unknown-only disposal lost artifact refusal", target, r.Diagnostics)
		}
	}

}

// The known browser target authorizes this artifact, while disposal itself
// retains an opaque effect. Native JavaScript owns exit-time disposal ordering.
func TestModuleDisposalEmitted(t *testing.T) {
	const source = `/// <reference lib="esnext.disposable" />
{if(String(document.title)!=='1')throw 9;using resource={[Symbol.dispose](){if(String(document.title)!=='3')throw 9}};if(String(document.title)!=='2')throw 9}export const value=1;`
	r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-disposal-runtime.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatal(r.Error, r.Diagnostics)
	}
	file := filepath.Join(t.TempDir(), "disposal.mts")
	if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';let gets=0;const before=Object.getOwnPropertyDescriptor(globalThis,'document');try{Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){return String(++gets)}}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(gets,3);assert.equal(m.value,1)}finally{if(before)Object.defineProperty(globalThis,'document',before);else delete globalThis.document}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),before);`
	if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
		t.Fatalf("emitted disposal: %v %s", err, out)
	}
}

// Implicit application has its own residual. Explicit factories and Gets still
// contribute eager effects, while decorated bodies remain deferred.
func TestModuleDecoratorEvaluation(t *testing.T) {
	for _, test := range []struct {
		name, source    string
		browser, opaque bool
	}{
		{"class", `function decorate(...args:unknown[]):void{document.title}@decorate class C{}export const value=1;`, false, true},
		{"safe application", `function decorate(...args:unknown[]):void{}@decorate class C{}export const value=1;`, false, true},
		{"unknown application", `declare const decorate:(...args:unknown[])=>void;@decorate class C{}export const value=1;`, false, true},
		{"factory", `function factory(){document.title;return (...args:unknown[]):void=>{}}@factory() class C{}export const value=1;`, true, true},
		{"method factory", `function factory(){document.title;return (...args:unknown[]):void=>{}}class C{@factory() method(){document.title}}export const value=1;`, true, true},
		{"pure method", `function factory(){document.title;return(...args:unknown[]):void=>{}}class C{@factory() method(){return 1}}export const value=1;`, true, true},
		{"accessor", `function decorate(...args:unknown[]):void{}class C{@decorate get value(){return document.title}}export const value=1;`, false, true},
		{"member get", `const decorators={get apply(){document.title;return (...args:unknown[]):void=>{}}};class C{@decorators.apply method(){}}export const value=1;`, true, true},
		{"called helper", `function decorate(...args:unknown[]):void{}function run(){@decorate class C{}}run();export const value=1;`, false, true},
		{"called false helper", `function decorate(...args:unknown[]):void{}function run(){if(false){@decorate class C{}}}run();export const value=1;`, false, false},
		{"dormant", `function decorate(...args:unknown[]):void{}function dormant(){@decorate class C{static value=document.title}}export const value=1;`, false, false},
		{"false branch", `function decorate(...args:unknown[]):void{}if(false){@decorate class C{static value=document.title}}export const value=1;`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/module-decorator.ts", Source: test.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser, opaque := false, false
			for _, fact := range r.Analysis.Callables {
				if fact.Kind == "module-initializer" {
					for _, effect := range fact.EffectSources {
						browser = browser || effect.Environment == "browser"
						opaque = opaque || effect.Opaque
					}
				}
			}
			if browser != test.browser || opaque != test.opaque {
				t.Fatalf("browser=%v opaque=%v want=%v/%v", browser, opaque, test.browser, test.opaque)
			}
			if test.name == "pure method" && executableSummary(t, r, "method").Effect != "neutral" {
				t.Fatal("method invocation repeated definition factory")
			}
		})
	}
}

func TestModuleDecoratorArtifacts(t *testing.T) {
	const source = `function factory(){document.title;return(...args:unknown[]):void=>{document.title}}const decorators={get apply(){document.title;return(...args:unknown[]):void=>{document.title}}};@factory() class C{@factory() method(){document.title}@decorators.apply get value(){return document.title}}export const value=1;`
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/module-decorator-runtime.ts", Source: source, Target: target, Diagnostics: "semantic", SourceMap: true})
		if target == TargetServer {
			if !containsDiagnosticCode(r.Diagnostics, "EXACT2101") || r.Code != "" || r.SourceMap != nil {
				t.Fatal("opposite target decorator artifact released", r.Diagnostics)
			}
			continue
		}
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatal(r.Error, r.Diagnostics)
		}
		sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');const exports={};let reads=0;const document={get title(){reads++;return 'browser'}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,document});if(reads!==6||exports.value!==1)throw Error(JSON.stringify({reads,value:exports.value}));`)
	}
}

func TestModuleLegacyParameterDecorators(t *testing.T) {
	const factory = `function factory(){document.title;return(...args:unknown[]):void=>{}}`
	for _, test := range []struct {
		name, body      string
		browser, opaque bool
	}{
		{"method", `class C{method(@factory() value:string=document.title){document.title}}`, true, true},
		{"pure method", `class C{method(@factory() value:string="safe"){return 1}}`, true, true},
		{"constructor", `class C{constructor(@factory() value:string=document.title){document.title}}`, true, true},
		{"setter", `class C{set value(@factory() value:string){document.title}}`, true, true},
		{"dormant", `function dormant(){class C{method(@factory() value:string=document.title){document.title}}}`, false, false},
		{"false branch", `if(false){class C{constructor(@factory() value:string=document.title){document.title}}}`, false, false},
		{"default only", `class C{method(value:string=document.title){document.title}}`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, legacy := range []bool{true, false} {
				dir := t.TempDir()
				file := filepath.Join(dir, "input.cts")
				configFile := filepath.Join(dir, "tsconfig.json")
				source := factory + test.body + `export const result=1;`
				if err := os.WriteFile(file, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				config := fmt.Sprintf(`{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ES2022","strict":true,"types":[],"experimentalDecorators":%v},"files":["input.cts"]}`, legacy)
				if err := os.WriteFile(configFile, []byte(config), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				resolved, err := exec.CommandContext(ctx, "node", "-p", `require.resolve('@typescript/native/package.json')`).CombinedOutput()
				if err != nil {
					t.Fatal(err, string(resolved))
				}
				cli := filepath.Join(filepath.Dir(strings.TrimSpace(string(resolved))), "bin", "tsc")
				output, qualification := exec.CommandContext(ctx, "node", cli, "-p", configFile, "--noEmit").CombinedOutput()
				r := NewSession().Execute(Request{Kind: "analyze", ID: file, Source: source, ConfigFile: configFile, Diagnostics: "semantic"})
				invalid := !legacy && test.name != "default only"
				if invalid {
					if qualification == nil || !hasErrorDiagnostic(r.Diagnostics) {
						t.Fatal("parameter decorators accepted without legacy option", string(output), r.Diagnostics)
					}
					continue
				}
				if qualification != nil || r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					t.Fatal("strict TS7 fixture", qualification, string(output), r.Error, r.Diagnostics)
				}
				browser, opaque := false, false
				for _, fact := range r.Analysis.Callables {
					if fact.Kind == "module-initializer" {
						for _, effect := range fact.EffectSources {
							browser = browser || effect.Environment == "browser"
							opaque = opaque || effect.Opaque
						}
					}
				}
				if browser != test.browser || opaque != test.opaque {
					t.Fatalf("browser=%v opaque=%v want=%v/%v", browser, opaque, test.browser, test.opaque)
				}
				if test.name == "pure method" && executableSummary(t, r, "method").Effect != "neutral" {
					t.Fatal("parameter decorator repeated at method invocation")
				}
				if legacy && test.browser {
					baselineDir := filepath.Join(dir, "official")
					if output, err := exec.CommandContext(ctx, "node", cli, "-p", configFile, "--outDir", baselineDir).CombinedOutput(); err != nil {
						t.Fatal("strict official legacy emit", err, string(output))
					}
					const measure = `const fs=require('node:fs'),vm=require('node:vm');let reads=0;const exports={};const document={get title(){reads++;return 'browser'}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,document});console.log(JSON.stringify({reads,result:exports.result}));`
					baseline, err := exec.CommandContext(ctx, "node", "-e", measure, filepath.Join(baselineDir, "input.cjs")).CombinedOutput()
					if err != nil {
						t.Fatal(err, string(baseline))
					}
					t.Logf("official strict TS7 source completion: %s", baseline)
					emitted := NewSession().Execute(Request{Kind: "compile", ID: file, Source: source, ConfigFile: configFile, Target: TargetClient, Diagnostics: "semantic"})
					if emitted.Error != "" || hasErrorDiagnostic(emitted.Diagnostics) || emitted.Code == "" {
						t.Fatal(emitted.Error, emitted.Diagnostics)
					}
					if err := os.WriteFile(file, []byte(emitted.Code), 0600); err != nil {
						t.Fatal(err)
					}
					outDir := filepath.Join(dir, "out")
					if output, err := exec.CommandContext(ctx, "node", cli, "-p", configFile, "--noCheck", "--outDir", outDir).CombinedOutput(); err != nil {
						t.Fatal("TS7 legacy erasure", err, string(output))
					}
					// Setter parameter emission currently differs upstream from method and
					// constructor parameters. Preserve the official source completion without
					// using that omission as an analysis purity contract.
					if test.name != "setter" && strings.TrimSpace(string(baseline)) != `{"reads":1,"result":1}` {
						t.Fatal("official factory/default phase", string(baseline))
					}
					actual, err := exec.CommandContext(ctx, "node", "-e", measure, filepath.Join(outDir, "input.cjs")).CombinedOutput()
					if err != nil || strings.TrimSpace(string(actual)) != strings.TrimSpace(string(baseline)) {
						t.Fatal("legacy emitted/source mismatch", err, string(actual), string(baseline))
					}
				}
			}
		})
	}
}

func TestModuleDecoratorDefaultPhases(t *testing.T) {
	for _, test := range []struct {
		name, source    string
		opaque, browser bool
	}{
		{"ordinary activated", `function run(value=(@decorate class{})){}run();`, true, false},
		{"generator activated", `function* run(value=(@decorate class{})){}run();`, true, false},
		{"ordinary supplied", `function run(value=(@decorate class{})){}run(class{});`, false, false},
		{"generator supplied", `function* run(value=(@decorate class{})){}run(class{});`, false, false},
		{"dormant default", `function* run(value=(@decorate class{})){}`, false, false},
		{"factory ordinary activated", `function run(value=(@factory() class{})){}run();`, true, true},
		{"body despite default bypass", `function run(value=(@factory() class{})){factory()}run(class{});`, false, true},
		{"unknown body despite bypass", `function run(value=(@uncertainFactory() class{})){uncertainFactory()}run(class{});`, true, true},
		{"unknown factory bypass", `function run(value=(@uncertainFactory() class{})){}run(class{});`, false, false},
		{"computed name activated", `function run(value=(class{[factoryKey()](){}})){}run();`, false, true},
		{"computed name bypass", `function run(value=(class{[factoryKey()](){}})){}run(class{});`, false, false},
		{"member factory activated", `function run(value=(class{@factory() method(){return 1}})){}run();`, true, true},
		{"member factory bypass", `function run(value=(class{@factory() method(){return 1}})){}run(class{method(){return 1}});`, false, false},
		{"factory generator activated", `function* run(value=(@factory() class{})){}run();`, true, true},
		{"factory ordinary supplied", `function run(value=(@factory() class{})){}run(class{});`, false, false},
		{"factory generator supplied", `function* run(value=(@factory() class{})){}run(class{});`, false, false},
		{"generator body", `function* run(){@decorate class C{}}run();`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `declare function observe():void;function decorate(...args:unknown[]):void{observe()}function factory(){document.title;return decorate}function factoryKey(){document.title;return "key"}declare function foreign():void;function uncertainFactory(){document.title;foreign();return decorate}` + test.source + `export const result=1;`
			dir := t.TempDir()
			file := filepath.Join(dir, "input.cts")
			config := filepath.Join(dir, "tsconfig.json")
			if err := os.WriteFile(file, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ES2022","strict":true,"types":[]},"files":["input.cts"]}`), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			resolved, err := exec.CommandContext(ctx, "node", "-p", `require.resolve('@typescript/native/package.json')`).CombinedOutput()
			if err != nil {
				t.Fatal(err, string(resolved))
			}
			cli := filepath.Join(filepath.Dir(strings.TrimSpace(string(resolved))), "bin", "tsc")
			if output, err := exec.CommandContext(ctx, "node", cli, "-p", config, "--noEmit").CombinedOutput(); err != nil {
				t.Fatal("strict TS7 source", err, string(output))
			}
			r := NewSession().Execute(Request{Kind: "analyze", ID: file, Source: source, ConfigFile: config, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			opaque, browser := false, false
			for _, fact := range r.Analysis.Callables {
				if fact.Kind == "module-initializer" {
					for _, effect := range fact.EffectSources {
						opaque = opaque || effect.Opaque
						browser = browser || effect.Environment == "browser"
					}
				}
			}
			if opaque != test.opaque || browser != test.browser {
				for _, fact := range r.Analysis.Callables {
					if fact.Name == "run" || fact.Kind == "module-initializer" {
						t.Logf("%s direct=%+v effects=%+v", fact.Name, fact.DirectEffectSources, fact.EffectSources)
					}
				}
				t.Fatalf("application browser=%v opaque=%v want=%v/%v", browser, opaque, test.browser, test.opaque)
			}
			if !test.browser {
				request := Request{Kind: "compile", ID: file, Source: source, ConfigFile: config, Target: TargetClient, Diagnostics: "semantic", SourceMap: true}
				targets := []Target{TargetClient, TargetServer}
				for _, target := range targets {
					request.Target = target
					strict := NewSession().Execute(request)
					if test.opaque {
						if !containsDiagnosticCode(strict.Diagnostics, "EXACT2101") || strict.Code != "" || strict.SourceMap != nil {
							t.Fatal("default application released strict artifact", target, strict.Diagnostics)
						}
						request.PreserveOrdinaryModules = true
					}
					emitted := NewSession().Execute(request)
					if emitted.Error != "" || hasErrorDiagnostic(emitted.Diagnostics) || emitted.Code == "" {
						t.Fatal("default phase artifact", target, emitted.Error, emitted.Diagnostics)
					}
					expected := "0"
					if test.opaque {
						expected = "1"
					}
					sourceNodeScript(t, emitted.Code, `const fs=require('node:fs'),vm=require('node:vm');let applications=0,reads=0;const exports={};const document={get title(){reads++;return 'browser'}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,document,observe(){applications++},foreign(){}});if(applications!==Number(process.argv[2])||reads!==0||exports.result!==1)throw Error(JSON.stringify({applications,reads,result:exports.result}));`, expected)
					request.PreserveOrdinaryModules = false
				}
			}

		})
	}
}
