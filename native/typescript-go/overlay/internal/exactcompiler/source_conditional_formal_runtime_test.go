package exactcompiler

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// conditionalNodeCompletion erases only with the installed official TS7 CLI.
// All generated inputs are test-owned temporary files, never repository artifacts.
func conditionalNodeCompletion(t *testing.T, code string, want, gets int) {
	t.Helper()
	script := `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const window={get innerWidth(){gets++;return 42}};const value=vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:{},window});if(value!==Number(process.argv[2])||gets!==Number(process.argv[3]))throw Error(JSON.stringify({value,gets}));`
	sourceNodeScript(t, code, script, fmt.Sprint(want), fmt.Sprint(gets))
}

// sourceNodeScript runs an isolated emitted consumer after official TS7 erasure.
// Callers own the observable assertions, and all children/files stay test-owned.
func sourceNodeScript(t *testing.T, code, script string, args ...string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	resolve := exec.CommandContext(ctx, "node", "-p", `require.resolve('@typescript/native/package.json')`)
	output, err := resolve.CombinedOutput()
	if err != nil {
		t.Fatalf("official TS7 package: %v %s", err, output)
	}
	cli := filepath.Join(filepath.Dir(strings.TrimSpace(string(output))), "bin", "tsc")
	dir := t.TempDir()
	file := filepath.Join(dir, "fixture.cts")
	if err := os.WriteFile(file, []byte(code), 0600); err != nil {
		t.Fatal(err)
	}
	config := map[string]any{"compilerOptions": map[string]any{"module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "noCheck": true, "noResolve": true, "lib": []string{"ES2022"}, "types": []string{}, "outDir": filepath.Join(dir, "out")}, "files": []string{file}}
	data, _ := json.Marshal(config)
	configFile := filepath.Join(dir, "tsconfig.json")
	if err := os.WriteFile(configFile, data, 0600); err != nil {
		t.Fatal(err)
	}
	emit := exec.CommandContext(ctx, "node", cli, "-p", configFile)
	if output, err := emit.CombinedOutput(); err != nil {
		t.Fatalf("TS7 erasure: %v %s", err, output)
	}
	arguments := append([]string{"-e", script, filepath.Join(dir, "out", "fixture.cjs")}, args...)
	run := exec.CommandContext(ctx, "node", arguments...)
	if output, err := run.CombinedOutput(); err != nil {
		t.Fatalf("actual Node completion: %v %s", err, output)
	}
}

func TestConditionalFormalBrowserGetterSource(t *testing.T) {
	const definitions = `const read=(take:boolean,input:{value:number})=>take?input.value:0;`
	for _, take := range []bool{true, false} {
		t.Run(fmt.Sprint(take), func(t *testing.T) {
			use := fmt.Sprintf(`read(%v,{get value(){return window.innerWidth}})`, take)
			checkFormalGetterComponent(t, definitions, use, take)

			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/conditional-browser-getter.ts", Source: "export {};" + definitions + use + ";", Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			want, gets := 0, 0
			if take {
				want, gets = 42, 1
			}
			conditionalNodeCompletion(t, r.Code, want, gets)
		})
	}
}

// checkFormalGetterComponent tests the original branch/default in component
// setup. Dependency coverage retains effects without granting normal DATA.
func checkFormalGetterComponent(t *testing.T, definitions, use string, wantBrowser bool) {
	t.Helper()
	source := "import type { Component } from '@exactjs/core';\n" + definitions + `
export function Page(this: Component<{}>) {
	const display = ` + use + `;
	return () => display;
}`
	fixture := newExecutableFixture(t, map[string]string{"entry.ts": source})
	r := fixture.session.Execute(fixture.request("analyze", "entry.ts"))
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	page := findComponent(t, r.Analysis.Components, "Page")
	callable := findCallable(t, r.Analysis.Callables, "Page")
	browser := false
	for _, effect := range callable.EffectSources {
		browser = browser || effect.Environment == "browser"
	}
	if browser != wantBrowser || (page.Placement == "client") != wantBrowser {
		t.Fatalf("Page placement=%s and browser=%v, want browser=%v", page.Placement, browser, wantBrowser)
	}
	for _, project := range fixture.session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, fact := range project.callableCache.merged.facts {
			for _, call := range fact.fieldCalls {
				for _, outcome := range call.outcomes {
					if outcome.demand.key == "value" && outcome.fulfilled && !call.dependencies {
						t.Fatal("getter received normal DATA coverage")
					}
				}
			}
		}
	}
}

func TestConditionalFormalEmittedNode(t *testing.T) {
	for _, take := range []bool{true, false} {
		t.Run(fmt.Sprint(take), func(t *testing.T) {
			source := fmt.Sprintf(`export {};const read=(take:boolean,input:{value:number})=>take?input.value:0;read(%v,{value:9});`, take)
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/conditional-emitted.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			want := 0
			if take {
				want = 9
			}
			conditionalNodeCompletion(t, r.Code, want, 0)
		})
	}
}
