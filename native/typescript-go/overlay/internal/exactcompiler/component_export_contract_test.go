package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Re-export chains must retain the component's canonical owner instead of a barrel-local identity.
func TestComponentExportChainsRetainRenderOwner(t *testing.T) {
	for _, shape := range []struct{ name, export, barrel, imported string }{
		{"named", "export", `export {Child as Selected} from './child.js';`, `import {Selected} from './barrel.js';`},
		{"star", "export", `export * from './child.js';`, `import {Child as Selected} from './barrel.js';`},
		{"default", "export default", `export {default as Selected} from './child.js';`, `import {Selected} from './barrel.js';`},
	} {
		t.Run(shape.name, func(t *testing.T) {
			root := t.TempDir()
			child := filepath.Join(root, "child.tsx")
			barrel := filepath.Join(root, "barrel.ts")
			page := filepath.Join(root, "page.tsx")
			childSource := shape.export + ` function Child(){return()=> <button onClick={()=>undefined}>child</button>;}`
			pageSource := shape.imported + `export function Page(){return()=> <Selected/>;}`
			for file, content := range map[string]string{child: childSource, barrel: shape.barrel, page: pageSource} {
				if err := os.WriteFile(file, []byte(content), 0600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			owned := session.Execute(Request{Kind: "analyze", ID: child, Root: root, Source: childSource})
			if owned.Error != "" || len(owned.Analysis.Components) != 1 {
				t.Fatalf("missing child owner: %#v", owned.Analysis.Components)
			}
			expected := owned.Analysis.Components[0].ID
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				result := session.Execute(Request{Kind: "analyze", ID: page, Root: root, Source: pageSource, Target: target})
				if result.Error != "" || len(result.Analysis.Components) != 1 {
					t.Fatalf("missing parent: %#v", result.Analysis.Components)
				}
				edges := result.Analysis.Components[0].RenderEdges
				if len(edges) != 1 || edges[0].ComponentID != expected {
					t.Fatalf("barrel changed component owner: %#v want %s", edges, expected)
				}
			}
		})
	}
}
