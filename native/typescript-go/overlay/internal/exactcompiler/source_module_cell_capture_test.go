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

func TestModuleCellCaptureEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "module-cell-runtime.ts", Target: target, Diagnostics: "semantic", Source: `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};box.current=4;write();`})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "emitted.mjs")
			code := response.Code + `;if(box.current!==5)throw Error('current branch lost');write();if(box.current!==6)throw Error('runtime repeated closure');console.log('PASS');`
			if err := os.WriteFile(file, []byte(code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			output, err := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if err != nil || strings.TrimSpace(string(output)) != "PASS" {
				t.Fatalf("runtime %v %s", err, output)
			}
		})
	}
}
