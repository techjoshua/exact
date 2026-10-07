package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Explicit project roots retain import facts when dependency discovery is disabled by noResolve.
func TestNeverEvaluatedProjectResolution(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	for file, source := range map[string]string{
		"tsconfig.json": `{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","noResolve":true,"skipLibCheck":true},"include":["*.tsx"]}`,
		"Sibling.tsx":   `export function read(){return window.innerWidth}export function Child(){return()=> <p>child</p>}`,
		"Entry.tsx":     `import {read,Child} from './Sibling.js';export function Page(){const width=read();return()=> <Child/>}`,
	} {
		if err := os.WriteFile(filepath.Join(root, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	source, err := os.ReadFile(filepath.Join(root, "Entry.tsx"))
	if err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{Kind: "analyze", ID: filepath.Join(root, "Entry.tsx"), Source: string(source), ConfigFile: config, Target: TargetClient, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	found := false
	for _, component := range response.Analysis.Components {
		if component.Name == "Page" {
			found = component.Placement == "client"
		}
	}
	if !found {
		t.Fatalf("project import lost browser placement: %#v", response.Analysis.Components)
	}
}

// Enhancements on root and non-tail intrinsic ranges preserve executable ownership in both targets.
func TestNeverEvaluatedEnhancementPrograms(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	for file, source := range map[string]string{
		"implementation.tsx": `export function Skin(props:{value?:number;children?:unknown}){return()=> <_>{props.children}</_>}`,
		"facade.ts":          `export {Skin as default} from './implementation.js' with {type:'exact-enhancement'};`,
	} {
		if err := os.WriteFile(filepath.Join(root, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, view := range []string{`<section skin:value={1}>root</section>`, `<section><div skin:value={1}>enhanced</div><p>tail</p></section>`, `<section><div skin:value={1}/><p>tail</p></section>`, `<section><div skin:value={props.value}/><p>{props.value}</p></section>`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `import skin from './facade.js' with {type:'exact-enhancement'};export function Page(props:{value:number}){return()=> ` + view + `}`
			entry := filepath.Join(root, "Entry.tsx")
			if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{Kind: "compile", ID: entry, Source: source, ConfigFile: config, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatalf("lost enhancement %s %s: %s %#v", target, view, response.Error, response.Diagnostics)
			}
		}
	}
}
