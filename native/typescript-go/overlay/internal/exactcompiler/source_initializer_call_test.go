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

const initializerCallSource = `export{};const box={current:0};const write=()=>{box.current=1;return 7};const selected=write();`

func TestInitializerCallRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/initializer-runtime.ts", Source: initializerCallSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "initializer.mjs")
			if e := os.WriteFile(file, []byte(r.Code+`;if(selected!==7||box.current!==1)throw Error('initializer value/order');console.log('PASS');`), 0600); e != nil {
				t.Fatal(e)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			out, e := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if e != nil || strings.TrimSpace(string(out)) != "PASS" {
				t.Fatalf("runtime %v %s", e, out)
			}
		})
	}
}
