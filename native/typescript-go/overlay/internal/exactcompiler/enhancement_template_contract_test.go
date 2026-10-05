package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Quoted namespaced props share TypeScript's string-literal assignability,
// including unbounded bigint values and mapped strings. No runtime coercion occurs.
func TestEnhancementQuotedTemplateTypes(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "entry.tsx")
	for file, source := range map[string]string{"tsconfig.json": `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`, "facade.ts": `export { schema } from "./impl.js" with {type:"exact-enhancement"};`} {
		if err := os.WriteFile(filepath.Join(root, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct {
		kind, value string
		valid       bool
	}{
		{"bigint", "123456789012345678901234567890", true},
		{"bigint", "-123456789012345678901234567890", true},
		{"bigint", "0x10", true},
		{"bigint", "0b101", true},
		{"bigint", "0o17", true},
		{"bigint", "12n", false},
		{"bigint", "1.5", false},
		{"bigint", "", false},
		{"number", "0x10", true},
		{"number", "0b101", true},
		{"number", "1e3", true},
		{"number", "-1.5", true},
		{"number", "NaN", false},
		{"number", "Infinity", false},
		{"number", "", false},
		{"boolean", "true", true},
		{"boolean", "false", true},
		{"boolean", "other", false},
		{"null | undefined", "null", true},
		{"null | undefined", "undefined", true},
		{"null | undefined", "other", false},
		{"Uppercase<string>", "NAME", true},
		{"Uppercase<string>", "Name", false},
	}
	for _, test := range cases {
		t.Run(test.kind+"/"+test.value, func(t *testing.T) {
			impl := `export function schema(props:{value:` + "`${" + test.kind + "}`" + `;children?:unknown}){return props.children;}`
			if err := os.WriteFile(filepath.Join(root, "impl.ts"), []byte(impl), 0600); err != nil {
				t.Fatal(err)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				for _, quoted := range []bool{true, false} {
					value := `"` + test.value + `"`
					if !quoted {
						value = `{"` + test.value + `"}`
					}
					source := `import { schema } from "./facade.js" with {type:"exact-enhancement"};export const view=<div schema:value=` + value + `/>;`
					if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
						t.Fatal(err)
					}
					response := NewSession().Execute(Request{ID: entry, Kind: "compile", Source: source, ConfigFile: config, Target: target})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					rejected := containsDiagnosticCode(response.Diagnostics, "EXACT6011")
					if rejected == test.valid {
						t.Fatalf("%s quoted=%v valid=%v diagnostics=%#v", target, quoted, test.valid, response.Diagnostics)
					}
					if test.valid && response.Code == "" {
						t.Fatal("valid source did not lower")
					}
				}
			}
		})
	}
}
