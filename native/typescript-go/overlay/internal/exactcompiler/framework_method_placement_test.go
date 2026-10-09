package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Framework method declarations retain placement through interface aliases and mapped views.
func TestFrameworkMethodPlacement(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "request")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"@exactjs/request","types":"index.d.ts"}`,
		"index.d.ts":   `export interface Storage{getStore():string | undefined}`,
	} {
		if err := os.WriteFile(filepath.Join(pkg, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	platform := filepath.Join(root, "node_modules", "@types", "node")
	if err := os.MkdirAll(platform, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"@types/node","types":"index.d.ts"}`,
		"index.d.ts":   `export interface Storage{getStore():string | undefined}`,
	} {
		if err := os.WriteFile(filepath.Join(platform, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, fixture := range []struct{ name, prefix, call, placement string }{
		{"direct", `import type {Storage} from '@exactjs/request';declare const storage:Storage;`, `storage.getStore()`, "isomorphic"},
		{"readonly-alias", `import type {Storage} from '@exactjs/request';type Alias=Storage;declare const storage:Readonly<Alias>;`, `storage.getStore()`, "isomorphic"},
		{"literal-member", `import type {Storage} from '@exactjs/request';declare const storage:Storage;`, `storage['getStore']()`, "isomorphic"},
		{"unproven-platform-interface", `import type {Storage} from 'node';declare const storage:Storage;`, `storage.getStore()`, "unknown"},
		{"lookalike", `interface Storage{getStore():string | undefined}declare const storage:Storage;`, `storage.getStore()`, "unknown"},
		{"added-member", `import type {Storage} from '@exactjs/request';interface Extra extends Storage{other():string}declare const storage:Extra;`, `storage.other()`, "unknown"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			result := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, Root: root, ID: filepath.Join(root, "page.tsx"), Source: fixture.prefix + `export function Page(){const value=` + fixture.call + `;return()=> <p>{value}</p>;}`})
			if result.Error != "" || len(result.Analysis.Components) != 1 {
				t.Fatalf("missing component: %#v", result)
			}
			if got := result.Analysis.Components[0].Placement; got != fixture.placement {
				t.Fatalf("placement=%s, expected=%s: %#v", got, fixture.placement, result.Analysis.Components)
			}
			if fixture.placement == "isomorphic" && !strings.Contains(result.Code, `placement: "isomorphic"`) {
				t.Fatalf("portable method lost emitted placement: %s", result.Code)
			}
		})
	}
}
