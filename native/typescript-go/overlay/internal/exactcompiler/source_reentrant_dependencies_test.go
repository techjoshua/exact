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

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

const reentrantCallbackSource = `declare const pick:boolean;declare function foreign():string;function invoke(read:()=>string){return read()}function forward(read:()=>string){return invoke(read)}function make(input:{value:string}){return ()=>forward(()=>input.value)}const a=make({value:'safe'});const b=make({get value(){document.title;return foreign()}});const reader=pick?a:b;export const value=forward(reader);`

// A finite higher-order reentry has different acquired callback inputs, even
// when it selects the same lexical wrapper declaration.
func TestSymbolicReentrantCallbackDonors(t *testing.T) {
	for _, test := range []struct{ name, source string }{
		{"original", reentrantCallbackSource},
		{"direct", strings.Replace(reentrantCallbackSource, "value=forward(reader)", "value=reader()", 1)},
		{"reversed alternatives", strings.Replace(reentrantCallbackSource, "reader=pick?a:b", "reader=pick?b:a", 1)},
		{"reversed creators", strings.Replace(reentrantCallbackSource, `const a=make({value:'safe'});const b=make({get value(){document.title;return foreign()}});`, `const b=make({get value(){document.title;return foreign()}});const a=make({value:'safe'});`, 1)},
		{"expanding captures", `declare const repeat:boolean;function loop(read:()=>string):string{if(repeat)return loop(()=>read());return read()}export const value=loop(()=>document.title);`},
		{"recursive", `declare const repeat:boolean;` + strings.Replace(reentrantCallbackSource, `return invoke(read)`, `if(repeat)return forward(read);return invoke(read)`, 1)},
	} {
		t.Run(test.name, func(t *testing.T) { assertSymbolicInitializerDonors(t, test.source) })
	}
}

// A joined or dormant callback must not manufacture a host donor. Pure joined
// outputs may remain imprecise without asserting a normal value.
func TestSymbolicReentrantCallbackControls(t *testing.T) {
	for _, test := range []struct {
		name, source string
		unknown      bool
	}{
		{"pure", strings.Replace(reentrantCallbackSource, `document.title;return foreign()`, `return 'safe'`, 1), false},
		{"unknown only", strings.Replace(reentrantCallbackSource, `document.title;return foreign()`, `return foreign()`, 1), true},
		{"deferred", strings.Replace(reentrantCallbackSource, `value=forward(reader)`, `value=reader`, 1), false},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reentrant.ts", Source: test.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, test.source, test.name != "deferred")
			if browser || test.unknown && !unknown {
				t.Fatalf("browser=%v unknown=%v", browser, unknown)
			}
		})
	}
}

// No instantiated capture facts survive a request or source replacement.
func TestSymbolicReentrantCallbackReplacement(t *testing.T) {
	session := NewSession()
	for _, browser := range []bool{true, false, true} {
		source := reentrantCallbackSource
		if !browser {
			source = strings.Replace(source, `document.title;`, "", 1)
		}
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/reentrant.ts", Source: source, Diagnostics: "semantic"})
		known, unknown := reentrantInitializerEffects(t, r, source, true)
		if known != browser || !unknown {
			t.Fatalf("browser=%v want=%v unknown=%v", known, browser, unknown)
		}
	}
}

func reentrantInitializerEffects(t *testing.T, r Response, source string, required bool) (bool, bool) {
	t.Helper()
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	name := fmt.Sprint("module@", strings.LastIndex(source, "export const value="))
	for _, fact := range r.Analysis.Callables {
		if fact.Name == name {
			browser, unknown := false, false
			for _, effect := range fact.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			return browser, unknown
		}
	}
	if !required {
		for _, exported := range r.Analysis.Exports {
			if exported.Name == "value" {
				return false, false
			}
		}
	}
	t.Fatal("missing exported initializer")
	return false, false
}

// The finite abstract relation saturates cyclic capture/rest/copied graphs and
// repeated member paths. Fresh Go containers cannot authorize another entry.
func TestSourceDependencyEntrySaturation(t *testing.T) {
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/entry.ts", Path: tspath.Path("/entry.ts")}, `function read(){}const input={};`, core.ScriptKindTS)
	declaration, origin := source.Statements.Nodes[0], source.Statements.Nodes[1]
	query := &sourceValueQuery{dependenciesOnly: true, active: make(map[*ast.Node]bool)}
	copied := make(map[string][]sourceValue)
	copied["self"] = []sourceValue{{node: origin, copied: copied}}
	rest := make([][]sourceValue, 1)
	rest[0] = []sourceValue{{node: origin, rest: rest}}
	capture := &acquiredCallableScope{bindings: make(sourceValueBindings)}
	capture.bindings[1] = []sourceValue{{node: origin, capture: capture}}
	bindings := sourceValueBindings{1: {{node: origin, copied: copied, rest: rest, capture: capture, path: []string{"next", "next", "next"}}}}
	result := accessorCandidates{}
	release, fresh := query.enterDependencyBody(declaration, bindings, nil, nil, &result)
	if !fresh || result.opaque {
		t.Fatal("unconsumed cyclic inputs manufactured an effect")
	}
	query.active[declaration] = true
	size := len(query.dependencyEntries[declaration].alternatives)
	for i := 0; i < 8; i++ {
		// Copies model newly allocated input plans with the same source meaning.
		next := sourceValueBindings{1: append([]sourceValue(nil), bindings[1]...)}
		next[1][0].path = append(next[1][0].path, "next")
		done, entered := query.enterDependencyBody(declaration, next, nil, nil, &result)
		done()
		if entered || len(query.dependencyEntries[declaration].alternatives) != size {
			t.Fatal("repeated path or fresh plan grew the active relation")
		}
	}
	if !result.opaque {
		t.Fatal("merged cyclic entry lost uncertainty")
	}
	additions := sourceValueBindings{2: {{node: source.AsNode()}}}
	done, entered := query.enterDependencyBody(declaration, additions, nil, nil, &result)
	done()
	if !entered || !result.opaque {
		t.Fatal("saturation discarded a new source alternative or its residual")
	}
	done, entered = query.enterDependencyBody(declaration, additions, nil, nil, &result)
	done()
	if entered {
		t.Fatal("stable joined source alternative reentered")
	}
	release()
	if len(query.dependencyEntries) != 0 {
		t.Fatal("active source inputs retained after body exit")
	}
	done, entered = query.enterDependencyBody(declaration, bindings, nil, nil, &result)
	done()
	if entered {
		t.Fatal("unrelated active fence bypassed")
	}
	// Recombined inputs are a distinct alternative even when every individual
	// symbol/origin atom appeared in an earlier context.
	delete(query.active, declaration)
	query.dependencyEntries = nil
	left := sourceValueBindings{1: {{node: origin}}, 2: {{node: declaration}}}
	right := sourceValueBindings{1: {{node: declaration}}, 2: {{node: origin}}}
	combined := sourceValueBindings{1: {{node: origin}}, 2: {{node: origin}}}
	outer, entered := query.enterDependencyBody(declaration, left, nil, nil, &result)
	if !entered {
		t.Fatal("initial alternative refused")
	}
	query.active[declaration] = true
	for _, alternative := range []sourceValueBindings{right, combined} {
		done, entered = query.enterDependencyBody(declaration, alternative, nil, nil, &result)
		done()
		if !entered {
			t.Fatal("reordered/recombined inputs lost an alternative")
		}
	}
	safeScope := &acquiredCallableScope{bindings: sourceValueBindings{3: {{node: origin}}}}
	otherScope := &acquiredCallableScope{bindings: sourceValueBindings{3: {{node: declaration}}}}
	for _, alternative := range []sourceValueBindings{
		{1: {{node: declaration, capture: safeScope}}, 2: {{node: declaration, capture: otherScope}}},
		{1: {{node: declaration, capture: otherScope}}, 2: {{node: declaration, capture: safeScope}}},
	} {
		done, entered = query.enterDependencyBody(declaration, alternative, nil, nil, &result)
		done()
		if !entered {
			t.Fatal("capture alternatives lost their root formal association")
		}
	}
	outer()
	query.dependenciesOnly = false
	done, entered = query.enterDependencyBody(declaration, bindings, nil, nil, &result)
	done()
	if entered || len(query.dependencyEntries) != 0 {
		t.Fatal("normal entry adopted source context guard")
	}
}

// Host-preserved exported functions retain normal JavaScript behavior on both
// targets. Analysis does not execute the selected getter or foreign callback.
func TestSymbolicReentrantCallbackEmitted(t *testing.T) {
	const source = `declare function foreign():string;function invoke(read:()=>string){return read()}function forward(read:()=>string){return invoke(read)}function make(input:{value:string}){return ()=>forward(()=>input.value)}export function read(pick:boolean){const a=make({value:'safe'});const b=make({get value(){document.title;return foreign()}});return forward(pick?a:b)}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reentrant-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "reentrant.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const doc=Object.getOwnPropertyDescriptor(globalThis,'document'),fn=Object.getOwnPropertyDescriptor(globalThis,'foreign');let gets=0,calls=0;try{Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){gets++;return 'browser'}}});Object.defineProperty(globalThis,'foreign',{configurable:true,value:()=>{calls++;return 'foreign'}});const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(gets,0);assert.equal(calls,0);assert.equal(m.read(true),'safe');assert.equal(gets,0);assert.equal(calls,0);assert.equal(m.read(false),'foreign');assert.equal(gets,1);assert.equal(calls,1)}finally{for(const[k,d]of[['document',doc],['foreign',fn]]){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),doc);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'foreign'),fn);`
			if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("emitted reentry: %v %s", err, out)
			}
		})
	}
}
