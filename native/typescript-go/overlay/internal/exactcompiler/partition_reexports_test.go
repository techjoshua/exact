package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPartitionReexportsFollowTheirLoadedDeclarationOwner(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "index.ts")
	values := filepath.Join(root, "values.ts")
	config := filepath.Join(root, "tsconfig.json")
	source := `export {browser as width,shared} from './values.js';export {default as defaultWidth,withDefault} from './values.js';`
	for f, s := range map[string]string{
		config: `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler"},"include":["*.ts"]}`,
		values: `export const browser=window.innerWidth;export default window.innerWidth;export function withDefault(value=window.innerWidth){return value;}export const shared=1;`, entry: source,
	} {
		if err := os.WriteFile(f, []byte(s), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Target: target, Source: source})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("valid barrel rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "shared") {
			t.Fatalf("%s removed the shared re-export:\n%s", target, response.Code)
		}
		for _, name := range []string{"width", "defaultWidth", "withDefault"} {
			if strings.Contains(response.Code, name) != (target == TargetClient) {
				t.Fatalf("%s barrel retained/removed opposite export %s:\n%s", target, name, response.Code)
			}
		}
	}
}
