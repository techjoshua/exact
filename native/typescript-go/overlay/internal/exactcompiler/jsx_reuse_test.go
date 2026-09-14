package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"os"
	"path/filepath"
	"testing"
)

func TestJSXRuntimeReuseRetainsResolutionWithoutSharingSyntheticParents(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	file := filepath.Join(root, "Page.tsx")
	stable := filepath.Join(root, "Stable.tsx")
	source := `export const page = <main />;`
	for name, text := range map[string]string{config: `{"compilerOptions":{"jsx":"preserve","jsxImportSource":"@exactjs/jsx"}}`, file: source, stable: `export const stable = <aside />;`} {
		if err := os.WriteFile(name, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	state, _, err := newProjectState(Request{Root: root, ConfigFile: config, Source: source}, file)
	if err != nil {
		t.Fatal(err)
	}
	old := state.program
	oldFile := old.GetSourceFile(file)
	oldModule, oldSpecifier := old.GetJSXRuntimeImportSpecifier(oldFile.Path())
	if oldSpecifier == nil {
		t.Fatal("configured JSX fixture has no implicit import")
	}
	state.fs.set(file, source+"\n")
	host := compiler.NewCompilerHost(state.currentDirectory, state.fs, bundled.LibPath(), nil, nil, nil)
	next, newFile, reused := old.ReuseProgram(oldFile.Path(), host, nil)
	if !reused {
		t.Fatal("unchanged JSX runtime import discarded the program")
	}
	module, specifier := next.GetJSXRuntimeImportSpecifier(newFile.Path())
	if module != oldModule || specifier == oldSpecifier || specifier.Parent.Parent != newFile.AsNode() || oldSpecifier.Parent.Parent != oldFile.AsNode() {
		t.Fatal("reused JSX import did not preserve resolution and independent AST ownership")
	}
	if next.GetSourceFile(stable) != old.GetSourceFile(stable) {
		t.Fatal("unchanged source identity was discarded")
	}
	state.fs.set(file, "/** @jsxImportSource other-runtime */\n"+source)
	if _, _, reused := next.ReuseProgram(newFile.Path(), host, nil); reused {
		t.Fatal("changed JSX runtime incorrectly reused module resolution")
	}
	state.fs.set(file, "import './new-dependency.js';\n"+source)
	if _, _, reused := next.ReuseProgram(newFile.Path(), host, nil); reused {
		t.Fatal("changed authored imports incorrectly reused module resolution")
	}
}
