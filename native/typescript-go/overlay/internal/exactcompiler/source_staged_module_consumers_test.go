package exactcompiler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Invocation effects and captured module availability are independent. A
// Identifier-based re-export route must preserve both, without executing dormant definitions or
// treating an authored type-only dependency as a runtime module import.
func TestStagedModuleIdentifierClosureConsumers(t *testing.T) {
	root, config := collectionSourceFixture(t)
	// This fixture uses the real Node ambient process declaration, just as the
	// existing module-partition controls do. Its type annotation grants no effect.
	configBytes, err := os.ReadFile(config)
	if err != nil {
		t.Fatal(err)
	}
	var options map[string]any
	if err := json.Unmarshal(configBytes, &options); err != nil {
		t.Fatal(err)
	}
	options["compilerOptions"].(map[string]any)["types"] = []string{"node"}
	configBytes, err = json.Marshal(options)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, configBytes, 0600); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		// The body consumes the captured binding for Effects but returns no host
		// object, so this control does not require a host-object DATA/identity law.
		"leaf.ts":     `declare function foreign():void;const eager=process;export function read(){window.name;foreign();void eager}export function dormant(){return document.title}`,
		"barrel.ts":   `export {read} from './leaf.js';`,
		"types.ts":    `export type Shape=void;export const ignored=document.title;`,
		"entry.ts":    `import {read} from './barrel.js';import type {Shape} from './types.js';export const value:Shape=read();`,
		"typeOnly.ts": `import type {Shape} from './types.js';export const safe:Shape=undefined;`,
	}
	sources := make([]ProjectSource, 0, len(files))
	for name, source := range files {
		id := filepath.Join(root, name)
		if err := os.WriteFile(id, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		sources = append(sources, ProjectSource{ID: id, Source: source})
	}
	session := NewSession()
	prepared := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: sources})
	if prepared.Error != "" || hasErrorDiagnostic(prepared.Diagnostics) {
		t.Fatal("source synchronization", prepared.Error, frameworkConsumerDiagnostics(prepared.Diagnostics))
	}
	request := func(kind, file string, target Target) Request {
		return Request{Kind: kind, Root: root, ConfigFile: config, ID: filepath.Join(root, file), Source: files[file], Target: target, Diagnostics: "semantic", SourceMap: true, stagedReplacement: true}
	}
	leaf := session.Execute(request("analyze", "leaf.ts", TargetDefault))
	assertModuleConsumerAnalysis(t, leaf)
	read := executableSummary(t, leaf, "read")
	assertModuleConsumerEffects(t, read.EffectSources, true, false, true)
	assertModuleConsumerEffects(t, executableSummary(t, leaf, "dormant").EffectSources, true, false, false)
	eager := moduleConsumerInitializer(t, leaf)
	assertModuleConsumerEffects(t, eager.EffectSources, false, true, false)

	barrel := session.Execute(request("analyze", "barrel.ts", TargetDefault))
	assertModuleConsumerAnalysis(t, barrel)
	reexport := false
	for _, record := range barrel.Analysis.SemanticGraph.Exports {
		reexport = reexport || record.ExportedName == "read" && record.ImportedName == "read" && record.ModuleSpecifier == "./leaf.js" && !record.TypeOnly
	}
	if !reexport {
		t.Fatal("original retained re-export route absent", barrel.Analysis.SemanticGraph.Exports)
	}
	entry := session.Execute(request("analyze", "entry.ts", TargetDefault))
	assertModuleConsumerAnalysis(t, entry)
	invocation := moduleConsumerInitializer(t, entry)
	assertModuleConsumerEffects(t, invocation.EffectSources, true, false, true)
	resolved := false
	for _, call := range invocation.Calls {
		resolved = resolved || call.Resolved && call.TargetID == read.ID
	}
	if !resolved {
		t.Fatal("actual entry Call lost the original re-exported producer", invocation.Calls, read.ID)
	}
	for _, effect := range invocation.EffectSources {
		if effect.Description == "document" {
			t.Fatal("dormant body or type-only module became an entry invocation effect", effect)
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		if !t.Run(string(target), func(t *testing.T) {
			neutral := session.Execute(request("compile", "typeOnly.ts", target))
			assertDefinitionConsumerCompile(t, neutral)
			assertModuleConsumerEffects(t, moduleConsumerInitializer(t, neutral).EffectSources, false, false, false)
			typeOnly := false
			for _, declaration := range neutral.Analysis.SemanticGraph.Declarations {
				typeOnly = typeOnly || declaration.Name == "Shape" && declaration.ModuleSpecifier == "./types.js" && declaration.TypeOnly
			}
			if !typeOnly || len(neutral.Analysis.Exports) != 1 || neutral.Analysis.Exports[0].Name != "safe" || neutral.Analysis.Exports[0].Placement != "isomorphic" {
				t.Fatal("type-only import changed runtime availability", neutral.Analysis.Exports, typeOnly)
			}
			denied := session.Execute(request("compile", "entry.ts", target))
			if denied.Error != "" || !containsDiagnosticCode(denied.Diagnostics, "EXACT2101") || denied.Code != "" || denied.SourceMap != nil {
				t.Fatal("retained closure lost independent initialization/body requirements", denied.Error, frameworkConsumerDiagnostics(denied.Diagnostics))
			}
			for _, diagnostic := range denied.Diagnostics {
				if strings.HasPrefix(diagnostic.Code, "TS") {
					t.Fatal("invalid source fixture", diagnostic.Code, diagnostic.Message)
				}
			}
		}) {
			return
		}
	}
}

func assertModuleConsumerAnalysis(t *testing.T, response Response) {
	t.Helper()
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal("public module analysis", response.Error, frameworkConsumerDiagnostics(response.Diagnostics))
	}
}

func moduleConsumerInitializer(t *testing.T, response Response) CallableSummary {
	t.Helper()
	var found *CallableSummary
	for i := range response.Analysis.Callables {
		candidate := &response.Analysis.Callables[i]
		if candidate.Kind == "module-initializer" {
			if found != nil {
				t.Fatal("fixture has more than one runtime initializer", response.Analysis.Callables)
			}
			found = candidate
		}
	}
	if found == nil {
		t.Fatal("original runtime initializer missing")
	}
	return *found
}

func assertModuleConsumerEffects(t *testing.T, effects []EnvironmentEffectSource, browser, server, unknown bool) {
	t.Helper()
	b, s, u := false, false, false
	for _, effect := range effects {
		b, s, u = b || effect.Environment == "browser", s || effect.Environment == "server", u || effect.Environment == "unknown"
		if effect.provenanceIncomplete {
			t.Fatal("module consumer reclassified compiler debt as runtime MAY", effect.Description)
		}
	}
	if b != browser || s != server || u != unknown {
		t.Fatalf("module effect ownership changed: browser/server/unknown=%t/%t/%t want=%t/%t/%t effects=%#v", b, s, u, browser, server, unknown, effects)
	}
}
