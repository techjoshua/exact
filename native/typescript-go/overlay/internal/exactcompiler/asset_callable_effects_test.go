package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeclaredAssetInitializersBesideJSXHelpers(t *testing.T) {
	for _, specifier := range []string{"@fixture/kit/styles.css", "./styles.css", "@fixture/kit/styles.scss?inline", "/virtual/styles.css"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(specifier+"/"+string(target), func(t *testing.T) {
				request := Request{Kind: "compile", ID: "/virtual/asset-helper.tsx", Target: target,
					Source: `import "` + specifier + `"; export function receipt(){return <output>ready</output>;}`}
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("declared asset was treated as opaque code: %q %#v", response.Error, response.Diagnostics)
				}
				if strings.Contains(response.Code, specifier) != (target == TargetClient) {
					t.Fatalf("asset import escaped its evaluation target: %s", response.Code)
				}
				request.PreserveClientAssetImports = true
				preserved := NewSession().Execute(request)
				if preserved.Error != "" || len(preserved.Diagnostics) != 0 || !strings.Contains(preserved.Code, specifier) {
					t.Fatalf("bundler asset collection lost the import: %#v", preserved)
				}
			})
		}
	}
}

func TestDeclaredAssetRulesInvalidateCallableClassification(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "compile", ID: "/virtual/custom-helper.tsx", Target: TargetClient,
		Source: `import "@fixture/kit/bootstrap.resource"; export function receipt(){return <output>ready</output>;}`}
	for _, evaluation := range []string{"", "client", "server", "both", ""} {
		request.AssetRules = nil
		if evaluation != "" {
			request.AssetRules = []AssetRule{{Extensions: []string{".resource"}, Kind: "custom", EvaluationTarget: evaluation, DeliveryTarget: "embedded"}}
		}
		response := session.Execute(request)
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if evaluation == "" {
			if !containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
				t.Fatal("undeclared executable import lost its opaque-effect rejection")
			}
			continue
		}
		if len(response.Diagnostics) != 0 {
			t.Fatalf("declared %s asset was rejected: %#v", evaluation, response.Diagnostics)
		}
		if strings.Contains(response.Code, "@fixture/kit/bootstrap.resource") != (evaluation != "server") {
			t.Fatalf("custom asset lowering ignored evaluation target %s: %s", evaluation, response.Code)
		}
		for _, callable := range response.Analysis.Callables {
			if callable.Kind != "module-initializer" {
				continue
			}
			want := map[string]string{"client": "browser", "server": "server", "both": "neutral"}[evaluation]
			if callable.Effect != want || len(callable.Calls) != 0 {
				t.Fatalf("asset evaluation was confused with delivery or JS execution: %#v", callable)
			}
		}
	}
}

func TestImportedAssetInitializersUseCurrentProjectRules(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "asset.ts")
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "view.tsx")
	source := `import "./asset.js"; export function receipt(){return <output>ready</output>;}`
	for filename, contents := range map[string]string{
		helper: `import "@fixture/kit/bootstrap.resource";`,
		config: `{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","jsx":"preserve"}}`,
		entry:  source,
	} {
		if err := os.WriteFile(filename, []byte(contents), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	request := Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetClient}
	for _, evaluation := range []string{"client", "server", "both", ""} {
		request.AssetRules = nil
		if evaluation != "" {
			request.AssetRules = []AssetRule{{Extensions: []string{".resource"}, Kind: "custom", EvaluationTarget: evaluation}}
		}
		entryResponse := session.Execute(request)
		if entryResponse.Error != "" {
			t.Fatal(entryResponse.Error)
		}
		seeded := false
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			for file, analysis := range project.callableCache.bySource {
				if file.FileName() != helper {
					continue
				}
				seeded = true
				for _, callable := range analysis.summaries {
					want := map[string]string{"client": "browser", "server": "server", "both": "neutral", "": "unknown"}[evaluation]
					if callable.Kind == "module-initializer" && callable.Effect != want {
						t.Fatalf("dependency seeded with stale asset contract: %#v", callable)
					}
				}
			}
		}
		if !seeded {
			t.Fatal("fixture did not exercise provisional dependency analysis")
		}
		// The entry seeds its dependency provisionally before that dependency
		// receives authoritative requested-source facts. Both must use current rules.
		response := session.Execute(Request{Kind: "compile", ID: helper, Root: root, ConfigFile: config, Source: `import "@fixture/kit/bootstrap.resource";`, Target: TargetClient, AssetRules: request.AssetRules})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if evaluation == "" {
			if !containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
				t.Fatal("imported opaque initializer lost its rejection after removing the declaration")
			}
			continue
		}
		if len(response.Diagnostics) != 0 {
			t.Fatalf("imported declared asset rejected: %#v", response.Diagnostics)
		}
		for _, callable := range response.Analysis.Callables {
			if callable.Kind == "module-initializer" && callable.Effect != map[string]string{"client": "browser", "server": "server", "both": "neutral"}[evaluation] {
				t.Fatalf("imported asset effect retained stale rules: %#v", callable)
			}
		}
	}
}

func TestDeclaredAssetExplicitPlacementOverridesDefaults(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/server-asset.tsx", Target: target,
			Source: `import "@fixture/kit/styles.css" with {exact:"server"}; export function receipt(){return <output>ready</output>;}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("explicit asset placement rejected: %q %#v", response.Error, response.Diagnostics)
		}
		if strings.Contains(response.Code, "@fixture/kit/styles.css") != (target == TargetServer) {
			t.Fatalf("explicit asset placement lost during lowering: %s", response.Code)
		}
		if strings.Contains(response.Code, "exact:") {
			t.Fatal("compiler placement attributes leaked into the host import")
		}
	}
}

// Absolute executable imports remain opaque work rather than external-package
// authority. Bound CSS imports retain their value instead of being pruned as code.
func TestAssetAdjacentImportModes(t *testing.T) {
	for _, source := range []string{
		`import "/virtual/executable.js";export function receipt(){return <p/>;}`,
		`import styles from "./styles.css";export function Receipt(){return()=> <p>{styles}</p>;}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/import-mode.tsx", Source: source, Target: target})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if strings.Contains(source, "executable.js") {
				found := false
				for _, callable := range r.Analysis.Callables {
					if callable.Kind == "module-initializer" {
						found = callable.Effect == "unknown" && len(callable.DirectEffectSources) == 1 && !callable.DirectEffectSources[0].Opaque
					}
				}
				if !found || !strings.Contains(r.Code, "executable.js") {
					t.Fatalf("absolute initializer lost its deferred execution obligation: %#v", r)
				}
			} else if !strings.Contains(r.Code, "styles.css") || len(r.Diagnostics) != 0 {
				t.Fatalf("bound CSS value lost: %#v", r)
			}
		}
	}
}
