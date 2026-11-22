package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

type stagedGetterCase struct {
	Name   string `json:"name"`
	Source string `json:"source"`
	Oracle string `json:"oracle"`
}

// stagedGetterCases consumes the shared source recipes without copying them into
// Go. Ordinary checkouts resolve their repository ancestor. A separately staged
// Go tree may set EXACT_COMPILER_FIXTURE_ROOT to its owning source checkout.
func stagedGetterCases(t *testing.T) []stagedGetterCase {
	t.Helper()
	root := os.Getenv("EXACT_COMPILER_FIXTURE_ROOT")
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			t.Fatal(err)
		}
	}
	var module string
	for {
		candidate := filepath.Join(root, "packages/compiler/src/test-support/staged-getter-adversarial-cases.mjs")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			module = candidate
			break
		}
		parent := filepath.Dir(root)
		if parent == root {
			t.Fatal("shared staged getter cases not found")
		}
		root = parent
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	const reader = `import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);process.stdout.write(JSON.stringify(m.stagedGetterAdversarialCases));`
	data, err := exec.CommandContext(ctx, "node", "--input-type=module", "-e", reader, module).CombinedOutput()
	cancel()
	if err != nil {
		t.Fatalf("source recipe import: %v %s", err, data)
	}
	var cases []stagedGetterCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}

func TestGetterAdversarialEmission(t *testing.T) {
	for _, test := range stagedGetterCases(t) {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.Name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/getter-" + test.Name + ".ts", Source: test.Source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("native compile: %s %#v", response.Error, response.Diagnostics)
				}
				file := filepath.Join(t.TempDir(), "getter.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				// These source modules contain definitions only. The unchanged oracle
				// installs its host globals before invoking the imported entry points.
				runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + test.Oracle
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("compiled oracle: %v %s", err, output)
				}
			})
		}
	}
}
