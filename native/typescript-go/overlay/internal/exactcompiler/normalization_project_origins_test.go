package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Imported normalized computations retain browser-data placement after synchronization and updates.
func TestNormalizationImportedTaskOrigins(t *testing.T) {
	root := t.TempDir()
	widget := filepath.Join(root, "Widget.tsx")
	page := filepath.Join(root, "Page.tsx")
	config := filepath.Join(root, "tsconfig.json")
	initial := `export function Widget(this:Component<{width:number}>){this.state.width=window.innerWidth;return()=> <button onClick={()=>this.state.width++}/>;}`
	neutral := `export function Widget(this:Component<{width:number}>){this.state.width=1;return()=> <button onClick={()=>this.state.width++}/>;}`
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"jsx":"preserve"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, synchronized := range []bool{false, true} {
		session := NewSession()
		for index, source := range []string{initial, neutral, initial} {
			pageSource := `import {Widget} from './Widget.js';export function Page(){return()=> <main><Widget/></main>;}` + strings.Repeat(" ", index)
			for file, text := range map[string]string{widget: source, page: pageSource} {
				if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if synchronized {
				r := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: widget, Source: source}, {ID: page, Source: pageSource}}})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
			} else {
				r := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: widget, Source: source, Target: TargetClient})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
			}
			r := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: page, Source: pageSource, Target: TargetServer})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			boundary := strings.Contains(r.Code, "__exactBoundary")
			if boundary != (index != 1) {
				t.Fatalf("imported placement lost normalization origin (synchronized=%t, transition=%d):\n%s", synchronized, index, r.Code)
			}
		}
	}
}
