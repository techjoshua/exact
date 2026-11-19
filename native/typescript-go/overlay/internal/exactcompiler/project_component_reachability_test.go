package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestProjectComponentRecordsFollowRenderReachability(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "Entry.tsx")
	child := filepath.Join(root, "Child.tsx")
	unrelated := filepath.Join(root, "Unrelated.tsx")
	writeSource := func(path, source string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	writeSource(config, `{"compilerOptions":{"jsx":"preserve","jsxImportSource":"@exactjs/jsx","module":"esnext","moduleResolution":"bundler"},"include":["*.tsx"]}`)
	entrySource := `
		import { Child } from "./Child.js";
		export function Entry() { return () => <main><Child /><Child /></main>; }
		export function Sibling() { return () => <aside />; }
	`
	childSource := `export function Child() { return () => <span />; }`
	changedChild := `
		import { Unrelated } from "./Unrelated.js";
		export function Child() { return () => <Unrelated />; }
	`
	unrelatedSource := `export function Unrelated() { window.name = "client"; return () => <b />; }`
	writeSource(entry, entrySource)
	writeSource(child, childSource)
	writeSource(unrelated, unrelatedSource)

	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			writeSource(child, childSource)
			session := NewSession()
			request := Request{Kind: "compile", ID: entry, Source: entrySource, Root: root, ConfigFile: config, Target: target, SourceMap: true}
			before := session.Execute(request)
			if before.Error != "" || before.Code == "" || before.SourceMap == nil || len(before.Analysis.Components) != 2 ||
				before.Counters.ComponentSourceAnalyses != 1 || before.Counters.ComponentLinkWalks != 3 {
				t.Fatalf("expected both entry records and one reachable dependency: %q, %#v", before.Error, before.Counters)
			}
			writeSource(child, changedChild)
			edit := request
			edit.ID, edit.Source = child, changedChild
			edited := session.Execute(edit)
			if edited.Error != "" || edited.Counters.ComponentSourceAnalyses != 1 ||
				len(edited.Analysis.Components) != 1 || len(edited.Analysis.Components[0].RenderEdges) != 1 ||
				edited.Analysis.Components[0].RenderEdges[0].Placement != "client" {
				t.Fatalf("the newly reachable source did not participate in the edited child: %q, %#v", edited.Error, edited.Counters)
			}
			after := session.Execute(request)
			fresh := NewSession().Execute(request)
			if after.Error != "" || fresh.Error != "" || after.Code != fresh.Code || !reflect.DeepEqual(after.SourceMap, fresh.SourceMap) ||
				!reflect.DeepEqual(after.Analysis, fresh.Analysis) || !reflect.DeepEqual(after.Diagnostics, fresh.Diagnostics) ||
				len(after.Analysis.Components) != 2 {
				t.Fatalf("cached render closure differs from a fresh compile after the edge edit: %q / %q", after.Error, fresh.Error)
			}
		})
	}
}
