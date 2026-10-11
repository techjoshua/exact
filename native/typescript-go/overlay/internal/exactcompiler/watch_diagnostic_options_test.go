package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// Watch diagnostics must use the project's TypeScript file-checking policy.
func TestWatchDiagnosticsRespectProjectCheckingOptions(t *testing.T) {
	for _, fixture := range []struct {
		name                      string
		skipLib, checkJS, noCheck bool
	}{
		{"skip-library-unchecked-js", true, false, false},
		{"check-library-unchecked-js", false, false, false},
		{"skip-library-checked-js", true, true, false},
		{"check-library-checked-js", false, true, false},
		{"no-check", false, true, true},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			root := t.TempDir()
			source := `export const value: number = "invalid";`
			file := filepath.Join(root, "model.ts")
			for name, text := range map[string]string{
				"model.ts":      source,
				"types.d.ts":    `declare const dependency: MissingDeclarationType;`,
				"legacy.js":     `export const result = missingJavaScriptValue;`,
				"tsconfig.json": fmt.Sprintf(`{"compilerOptions":{"allowJs":true,"skipLibCheck":%t,"checkJs":%t,"noCheck":%t,"module":"ESNext","target":"ES2022"},"include":["*.ts","*.js"]}`, fixture.skipLib, fixture.checkJS, fixture.noCheck),
			} {
				if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
					t.Fatal(err)
				}
			}
			result := NewSession().Execute(Request{Kind: "diagnose", Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), ID: file, Source: source, Diagnostics: "semantic"})
			if result.Error != "" {
				t.Fatal(result.Error)
			}
			seen := map[string]bool{}
			for _, diagnostic := range result.Diagnostics {
				seen[filepath.Base(diagnostic.FileName)] = true
			}
			for name, want := range map[string]bool{"model.ts": !fixture.noCheck, "types.d.ts": !fixture.skipLib && !fixture.noCheck, "legacy.js": fixture.checkJS && !fixture.noCheck} {
				if seen[name] != want {
					t.Fatalf("%s diagnostics=%v, expected=%v: %#v", name, seen[name], want, result.Diagnostics)
				}
			}
		})
	}
}

// Retained checkers must preserve program filtering, including directives and plain JavaScript.
func TestWatchDiagnosticsPreserveProgramFiltering(t *testing.T) {
	root := t.TempDir()
	source := `export const value: number = "invalid";`
	for name, text := range map[string]string{
		"model.ts":      source,
		"ignored.ts":    "// @ts-ignore\nexport const ignored: number = \"invalid\";\n// @ts-expect-error\nexport const expected: number = \"invalid\";",
		"unused.ts":     "// @ts-expect-error\nexport const valid: number = 1;",
		"plain.js":      `export const result = missingJavaScriptValue;`,
		"checked.js":    "// @ts-check\nexport const result = missingCheckedJavaScriptValue;",
		"tsconfig.json": `{"compilerOptions":{"allowJs":true,"skipLibCheck":true,"module":"ESNext","target":"ES2022"},"include":["*.ts","*.js"]}`,
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	result := session.Execute(Request{Kind: "diagnose", Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), ID: filepath.Join(root, "model.ts"), Source: source, Diagnostics: "semantic"})
	if result.Error != "" {
		t.Fatal(result.Error)
	}
	seen := map[string]bool{}
	for _, diagnostic := range result.Diagnostics {
		seen[filepath.Base(diagnostic.FileName)] = true
	}
	for name, want := range map[string]bool{"model.ts": true, "ignored.ts": false, "unused.ts": true, "plain.js": false, "checked.js": true} {
		if seen[name] != want {
			t.Errorf("%s diagnostics=%v, expected=%v: %#v", name, seen[name], want, result.Diagnostics)
		}
	}
}

// A consumer watch checks authored dependencies, while paired artifacts keep their producer's proof.
func TestWatchDiagnosticsDoNotRecheckLoweredTargets(t *testing.T) {
	root := t.TempDir()
	source := `import {value} from './view.exact.client.js'; export const authored: number = "invalid"; export {value};`
	for name, text := range map[string]string{
		"model.ts":             source,
		"view.exact.client.ts": `export const value: number = "lowered";`,
		"neighbor.ts":          `export const value: number = "authored";`,
		"tsconfig.json":        `{"compilerOptions":{"skipLibCheck":true,"module":"ESNext","target":"ES2022"},"include":["*.ts"]}`,
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	result := NewSession().Execute(Request{Kind: "diagnose", Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), ID: filepath.Join(root, "model.ts"), Source: source, Diagnostics: "semantic"})
	if result.Error != "" {
		t.Fatal(result.Error)
	}
	seen := map[string]bool{}
	for _, diagnostic := range result.Diagnostics {
		seen[filepath.Base(diagnostic.FileName)] = true
	}
	for name, want := range map[string]bool{"model.ts": true, "view.exact.client.ts": false, "neighbor.ts": true} {
		if seen[name] != want {
			t.Errorf("%s diagnostics=%v, expected=%v: %#v", name, seen[name], want, result.Diagnostics)
		}
	}
}
