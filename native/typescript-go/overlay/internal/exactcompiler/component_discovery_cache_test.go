package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Empty dependency discovery must not hide components introduced by later edits.
func TestComponentDiscoveryCacheTransitions(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "Child.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	pageSource := `import {Child} from './Child.js';export function Page(){return()=> <main><Child/></main>;}`
	for file, source := range map[string]string{config: `{"compilerOptions":{"jsx":"preserve"}}`, page: pageSource} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	for _, source := range []string{
		`export function Child(){return "plain";}`,
		`export function Child(){window.name="child";return()=> <span>child</span>;}`,
		`export function Child(){return "plain";}`,
		`export function Child(){return()=> <span>neutral</span>;}`,
	} {
		if err := os.WriteFile(child, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		response := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: child, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: page, Source: pageSource, Target: target}
			cached, fresh := session.Execute(request), NewSession().Execute(request)
			if cached.Error != "" || fresh.Error != "" {
				t.Fatalf("cached %s, fresh %s", cached.Error, fresh.Error)
			}
			if cached.Code != fresh.Code || !reflect.DeepEqual(cached.Analysis.Components, fresh.Analysis.Components) {
				t.Fatalf("discovery transition diverged for %s: %s", target, source)
			}
		}
	}
}
