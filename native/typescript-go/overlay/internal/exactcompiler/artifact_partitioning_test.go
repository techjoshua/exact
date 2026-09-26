package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Offsets are file-local: an unrelated initializer must neither erase another module's
// declarations nor prevent the owning initializer from being removed in the opposite target.
func TestArtifactPruningUsesInitializerSourceOwnership(t *testing.T) {
	for _, test := range []struct {
		name, source string
		owner        Target
	}{
		{"server-write", `process.env.EXACT_TEST = "fixture"; export {};`, TargetServer},
		{"server-delete", `delete process.env.EXACT_TEST; export {};`, TargetServer},
		{"client-write", `window.name = "fixture"; export {};`, TargetClient},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "tsconfig.json")
			entry := filepath.Join(root, "entry.ts")
			setup := filepath.Join(root, "setup.ts")
			source := `export function retained() { return "retained-value"; }`
			for filename, contents := range map[string]string{
				config: `{"compilerOptions":{"module":"esnext","target":"es2022"},"include":["*.ts"]}`,
				entry:  source, setup: test.source,
			} {
				if err := os.WriteFile(filename, []byte(contents), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			for _, target := range []Target{TargetClient, TargetServer} {
				response := session.Execute(Request{ID: entry, Root: root, ConfigFile: config, Kind: "compile", Target: target, Source: source})
				if response.Error != "" || !strings.Contains(response.Code, "export function retained") {
					t.Fatalf("%s lost an unrelated export: %s\n%s", target, response.Error, response.Code)
				}
				own := session.Execute(Request{ID: setup, Root: root, ConfigFile: config, Kind: "compile", Target: target, Source: test.source})
				if own.Error != "" {
					t.Fatal(own.Error)
				}
				marker := "fixture"
				if test.name == "server-delete" {
					marker = "delete process.env"
				}
				if strings.Contains(own.Code, marker) != (target == test.owner) {
					t.Fatalf("%s initializer partition: %s", target, own.Code)
				}
			}
		})
	}
}
