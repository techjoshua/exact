package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Deferred linking must observe helper effect changes on the next parent request.
// Browser-only setup work is a client task while the static child remains isomorphic.
func TestDeferredComponentLinksAfterHelperEdits(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "helper.ts")
	child := filepath.Join(root, "Child.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	childSource := `import {touch} from './helper.js';export function Child(){touch();return()=> <span>child</span>;}`
	pageSource := `import {Child} from './Child.js';export function Page(){return()=> <main><Child/></main>;}`
	for file, source := range map[string]string{config: `{"compilerOptions":{"jsx":"preserve","module":"esnext","moduleResolution":"bundler"}}`, child: childSource, page: pageSource} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	for _, browser := range []bool{false, true, false} {
		source := `export function touch(){}`
		if browser {
			source = `export function touch(){window.name="browser";}`
		}
		if err := os.WriteFile(helper, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		response := session.Execute(Request{Kind: "compile", ID: helper, Root: root, ConfigFile: config, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if response.Counters.ComponentSourceAnalyses != 0 || response.Counters.ComponentLinkWalks != 0 {
			t.Fatal("ordinary helper performed component dependency linking")
		}
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			for _, module := range []struct{ path, source string }{{page, pageSource}, {child, childSource}} {
				request := Request{Kind: "compile", ID: module.path, Root: root, ConfigFile: config, Source: module.source, Target: target, SourceMap: true}
				retained, fresh := session.Execute(request), NewSession().Execute(request)
				if retained.Error != "" || fresh.Error != "" {
					t.Fatalf("retained %s, fresh %s", retained.Error, fresh.Error)
				}
				if retained.Code != fresh.Code || !reflect.DeepEqual(retained.Analysis, fresh.Analysis) || !reflect.DeepEqual(retained.Diagnostics, fresh.Diagnostics) || !reflect.DeepEqual(retained.SourceMap, fresh.SourceMap) {
					t.Fatalf("deferred placement diverged for %s", target)
				}
				if len(retained.Analysis.Components) != 1 || retained.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatal("static render lost isomorphic placement")
				}
				if module.path == child && browser {
					if len(retained.Analysis.Tasks) != 1 || retained.Analysis.Tasks[0].Placement != "client" {
						t.Fatal("helper browser effect lost its client task")
					}
				} else if module.path == child && len(retained.Analysis.Tasks) != 0 {
					t.Fatal("removed browser effect retained a stale task")
				}
			}
		}
	}
}
