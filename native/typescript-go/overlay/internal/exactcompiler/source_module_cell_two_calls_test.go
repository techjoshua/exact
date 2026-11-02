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

func TestModuleCellTwoCallsEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			const source = `export{};const box={current:0};const write=()=>{box.current=box.current+1;return 0};write();write();`
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/two-call-runtime.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "two-call.mjs")
			if err := os.WriteFile(file, []byte(r.Code+`;if(box.current!==2)throw Error('two source Calls current state');console.log('PASS');`), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			out, err := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != "PASS" {
				t.Fatalf("runtime %v %s", err, out)
			}
		})
	}
}
