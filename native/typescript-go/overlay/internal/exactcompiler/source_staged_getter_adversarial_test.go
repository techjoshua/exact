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
	Name     string `json:"name"`
	Source   string `json:"source"`
	Analysis map[string]struct {
		Required []string `json:"required"`
		Absent   []string `json:"absent"`
		Unknown  *bool    `json:"unknown"`
	} `json:"analysis"`
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

// These are actual native public-fact checks. Source TS7/oracle preflight is
// separate evidence and does not qualify the compiler or a migrated route.
func TestGetterAdversarialAnalysis(t *testing.T) {
	for _, test := range stagedGetterCases(t) {
		t.Run(test.Name, func(t *testing.T) {
			if test.Name == "throwing-get-before-call" && os.Getenv("EXACT_STAGED_GETTER_ABRUPT_ACCEPTANCE") != "1" {
				t.Skip("unmigrated abrupt/no-return precision target, retained RED: set EXACT_STAGED_GETTER_ABRUPT_ACCEPTANCE=1 to qualify unchanged unknown=false expectation")
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/getter-" + test.Name + ".ts", Source: test.Source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("native source: %s %#v", response.Error, response.Diagnostics)
			}
			for name, expected := range test.Analysis {
				summary := executableSummary(t, response, name)
				known := map[string]bool{}
				unknown := false
				for _, effect := range summary.EffectSources {
					if effect.Environment == "browser" {
						known[effect.Description] = true
					}
					unknown = unknown || effect.Environment == "unknown"
				}
				for _, required := range expected.Required {
					if !known[required] {
						t.Fatalf("missing %s donor: %#v", required, summary.EffectSources)
					}
				}
				for _, absent := range expected.Absent {
					if known[absent] {
						t.Fatalf("dormant %s donor activated: %#v", absent, summary.EffectSources)
					}
				}
				if expected.Unknown != nil && unknown != *expected.Unknown {
					t.Fatalf("unknown=%t want %t: %#v", unknown, *expected.Unknown, summary.EffectSources)
				}
			}
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "entry" && fact.summary.Name != "member" && fact.summary.Name != "detached" {
					continue
				}
				if test.Name == "dormant-throwing-returned-callback" {
					if len(fact.staged.operationUses) != 1 || fact.staged.operationUses[0].request.producer.kind != relativeDemandEffects || fact.staged.operationUses[0].call != nil || !stagedGetterSkipped(fact, fact.staged.operationUses[0].request.producer.operation) {
						t.Fatal("getter acquisition did not use its eager-only source producer")
					}
				} else {
					// Abrupt/no-return, mutation, receiver and extended statement-list
					// domains are explicit legacy boundaries of this immediate slice.
					if len(fact.staged.operationUses) != 0 || len(fact.staged.legacy) == 0 {
						t.Fatal("unmigrated adjacent domain silently acquired getter coverage")
					}
				}
			}
		})
	}
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
