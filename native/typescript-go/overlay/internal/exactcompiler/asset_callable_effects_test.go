package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
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

// A component module's imported initializer follows current request rules even
// when its unchanged source reuses a Program. Delivery does not decide execution.
func TestComponentAssetRulesRetainedContext(t *testing.T) {
	root, err := os.MkdirTemp(".", ".component-asset-rules-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	entry, config := filepath.Join(root, "Page.tsx"), filepath.Join(root, "tsconfig.json")
	const specifier = "@fixture/kit/bootstrap.resource"
	const source = `import "@fixture/kit/bootstrap.resource";export function Page(){return()=> <output>ready</output>;}`
	for file, contents := range map[string]string{entry: source, config: `{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","jsx":"preserve"}}`} {
		if err := os.WriteFile(file, []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, reset := range []bool{false, true} {
		session := NewSession()
		for index, evaluation := range []string{"client", "server", "both", "", "client"} {
			if reset {
				if response := session.Execute(Request{Kind: "reset"}); response.Error != "" {
					t.Fatal(response.Error)
				}
			}
			request := Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetClient}
			if evaluation != "" {
				request.AssetRules = []AssetRule{{Extensions: []string{".resource"}, Kind: "custom", EvaluationTarget: evaluation, DeliveryTarget: "embedded"}}
			}
			retained, fresh := session.Execute(request), NewSession().Execute(request)
			if retained.Error != "" || fresh.Error != "" {
				t.Fatal("component asset entry", retained.Error, fresh.Error)
			}
			if !reset && index > 0 && !retained.CacheHit {
				t.Fatal("unchanged component source did not exercise retained Program")
			}
			if retained.Code != fresh.Code || !reflect.DeepEqual(retained.Diagnostics, fresh.Diagnostics) || !reflect.DeepEqual(retained.Analysis.Components, fresh.Analysis.Components) || !reflect.DeepEqual(retained.Analysis.Assets, fresh.Analysis.Assets) {
				t.Fatalf("reset=%v evaluation=%q retained/fresh component outcome differs", reset, evaluation)
			}
			for _, response := range []Response{retained, fresh} {
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Name != "Page" {
					t.Fatal("original component consumer was not reached", response.Analysis.Components)
				}
				initializers := 0
				for _, callable := range response.Analysis.Callables {
					if callable.Kind == "module-initializer" {
						initializers++
						want := map[string]string{"client": "browser", "server": "server", "both": "neutral", "": "unknown"}[evaluation]
						if callable.Effect != want || evaluation != "" && len(callable.Calls) != 0 {
							t.Fatalf("current initializer contract lost: %#v", callable)
						}
					}
				}
				if initializers != 1 {
					t.Fatal("original imported initializer absent or ambiguous", initializers)
				}
				if evaluation == "" {
					if !containsDiagnosticCode(response.Diagnostics, "EXACT2101") || response.Code != "" || len(response.Analysis.Assets) != 0 {
						t.Fatal("removed rule retained executable asset authority", response.Diagnostics)
					}
					continue
				}
				if len(response.Diagnostics) != 0 || response.Code == "" || strings.Contains(response.Code, specifier) != (evaluation != "server") {
					t.Fatalf("current component artifact lost evaluation routing: %q %#v", evaluation, response.Diagnostics)
				}
				if len(response.Analysis.Assets) != 1 || response.Analysis.Assets[0].Specifier != specifier || response.Analysis.Assets[0].EvaluationTarget != evaluation || response.Analysis.Assets[0].DeliveryTarget != "embedded" {
					t.Fatal("current asset request contract lost", response.Analysis.Assets)
				}
			}
		}
	}
}
