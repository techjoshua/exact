package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The standard undefined read law cannot turn an authored shadow or a later
// mutable value into an undefined result while binding actual Call arguments.
func TestUndefinedArgumentSourceBehavior(t *testing.T) {
	for _, test := range []struct{ name, source, want string }{
		{"global", `function read(value:unknown){return value}export const value=read(undefined);`, "undefined"},
		{"shadowed", `const undefined=7;function read(value:number){return value}export const value=read(undefined);`, "7"},
		{"mutated", `let undefined=1;undefined=2;function read(value:number){return value}export const value=read(undefined);`, "2"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/undefined-" + test.name + ".ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			module := filepath.Join(t.TempDir(), "undefined.mts")
			if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			t.Cleanup(cancel)
			command := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", `import {pathToFileURL} from 'node:url';const result=await import(pathToFileURL(process.argv[1]).href);console.log(String(result.value));`, module)
			output, err := command.Output()
			if err != nil || strings.TrimSpace(string(output)) != test.want {
				t.Fatalf("undefined argument: %v %s", err, output)
			}
		})
	}
}
