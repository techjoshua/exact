package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnhancementFragmentConfiguration(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "entry.tsx")
	for name, source := range map[string]string{
		config:                                   `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		filepath.Join(root, "motion.ts"):         `export { Motion as fade, Other as slide } from "./implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "implementation.ts"): `export function Motion(props: { children?: unknown }) { return props.children; } export function Other(props: { children?: unknown }) { return props.children; }`,
	} {
		if err := os.WriteFile(name, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct {
		expression string
		activated  bool
		invalid    bool
	}{
		{`<_ motion:fade motion:intrinsicFragment="em">text</_>`, true, false},
		{`<_ motion:fade motion:intrinsicFragment={"em" as const}>text</_>`, true, false},
		{`<_ motion:fade {...fragmentConfig}>text</_>`, true, false},
		{`<_ motion:intrinsicFragment="em" other:slide motion:fade>text</_>`, true, false},
		{`<_ motion:intrinsicFragment="em">text</_>`, false, false},
		{`<_ motion:fade motion:intrinsicFragment={Math.random() ? "em" : "span"}>text</_>`, true, true},
		{`<_ motion:fade {...dynamicConfig}>text</_>`, true, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `import * as motion from "./motion.js" with { type: "exact-enhancement" }; import * as other from "./motion.js" with { type: "exact-enhancement" }; const fragmentConfig = { "motion:intrinsicFragment": "em" } as const; const dynamicConfig = Math.random() ? fragmentConfig : { "motion:intrinsicFragment": "span" } as const; export const view = ` + test.expression + `;`
			if err := os.WriteFile(entry, []byte(source), 0o600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config})
			if test.invalid {
				if !containsDiagnosticCode(response.Diagnostics, "EXACT6019") {
					t.Fatalf("missing static tag diagnostic: %#v", response.Diagnostics)
				}
				continue
			}
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, `identity: "./motion.js#fade"`) != test.activated {
				t.Fatalf("configuration activated a component: %s", response.Code)
			}
			if test.activated && !strings.Contains(response.Code, `intrinsicFragment: "em"`) {
				t.Fatalf("missing static tag metadata: %s", response.Code)
			}
			if strings.Contains(test.expression, "other:slide") && strings.Index(response.Code, `identity: "./motion.js#slide"`) > strings.Index(response.Code, `identity: "./motion.js#fade"`) {
				t.Fatalf("configuration reordered activators: %s", response.Code)
			}
			if strings.Contains(response.Code, `__exactFragment({ "motion:intrinsicFragment":`) {
				t.Fatalf("configuration escaped into host props: %s", response.Code)
			}
		}
	}
}
