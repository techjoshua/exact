package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The real normal walker owns callee/argument/body effects on the initializer.
// Later property preparation references that owner without adopting its effects.
func TestModuleCallOwnerEffects(t *testing.T) {
	for _, test := range []struct {
		name, prefix, call string
		browser            bool
	}{
		{"pure", `function read(){return 1}`, `read.call(undefined)`, false},
		{"body", `function read(){document.title;return 1}`, `read.call(undefined)`, true},
		{"argument", `function read(x:unknown){return 1}`, `read.call(undefined,document.title)`, true},
		{"callee", `function read(){return 1}const box={get invoke(){document.title;return read}};`, `box.invoke()`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};` + test.prefix + `;export const value=` + test.call + `;Object.defineProperty(read,'call',{value:()=> 'safe'});`
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/module-call-owner.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			found := false
			for _, p := range s.projects {
				if p.callableCache == nil {
					continue
				}
				for _, f := range p.callableCache.merged.facts {
					if f.node == nil || !ast.IsVariableStatement(f.node) || moduleCallInitializer(p.callableCache.owner.values, f.node) == nil {
						continue
					}
					found = true
					browser, unknown := false, false
					for _, e := range f.summary.EffectSources {
						browser = browser || e.Environment == "browser"
						unknown = unknown || e.Environment == "unknown"
					}
					if browser != test.browser || unknown {
						t.Fatalf("original initializer effects: %#v", f.summary.EffectSources)
					}
				}
			}
			if !found {
				t.Fatal("missing original Call statement fact")
			}
		})
	}
}

// Invalid associations cannot borrow an indexed original Call's ownership.
// No mutation of the cached facts or their immutable source maps is needed.
func TestModuleCallOwnerRelation(t *testing.T) {
	fixture := newExecutableFixture(t, map[string]string{"entry.ts": `import type {Other} from './foreign.js';function read(){return 1}export const value=read.call(undefined);`, "foreign.ts": `export type Other=number;`})
	session := NewSession()
	request := fixture.request("analyze", "entry.ts")
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		values := project.callableCache.owner.values
		for _, original := range project.callableCache.merged.facts {
			operation := moduleCallInitializer(values, original.node)
			if operation == nil {
				continue
			}
			checked = true
			foreign := project.program.GetSourceFile(fixture.request("analyze", "foreign.ts").ID)
			if foreign == nil {
				t.Fatal("missing foreign source")
			}
			for _, name := range []string{"valid", "missing-owner", "wrong-source", "wrong-node", "missing-edge", "missing-index"} {
				t.Run(name, func(t *testing.T) {
					donor := original
					donor.summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), original.summary.DirectEffectSources...)
					independent := environmentSource("browser", "independent source", "requester")
					facts := []callableFacts{donor, {sourceFile: original.sourceFile, summary: CallableSummary{DirectEffectSources: []EnvironmentEffectSource{independent}}, ownedObligations: []sourceOwnedObligations{{owner: original.node, operation: operation}}}}
					targets := map[*ast.Node]int{original.node: 0}
					owner := values
					switch name {
					case "missing-owner":
						delete(targets, original.node)
					case "wrong-source":
						facts[0].sourceFile = foreign
					case "wrong-node":
						facts[0].node = operation
					case "missing-edge":
						facts[0].fieldEdgeOperations = nil
					case "missing-index":
						owner = newSourceValueOwner(values.checker)
					}
					applySourceOwnedObligations(facts, targets, owner)
					if len(facts[1].summary.DirectEffectSources) == 0 || facts[1].summary.DirectEffectSources[0].Environment != "browser" {
						t.Fatal("independent effect lost")
					}
					unknown := false
					for _, e := range facts[1].summary.DirectEffectSources {
						unknown = unknown || e.Environment == "unknown"
					}
					if unknown != (name != "valid") {
						t.Fatalf("owner validation %s: %#v", name, facts[1].summary.DirectEffectSources)
					}
					if name == "valid" {
						applySourceOwnedObligations(facts, targets, owner)
						if len(facts[1].summary.DirectEffectSources) != 1 {
							t.Fatal("original operation adopted twice")
						}
					}
				})
			}
		}
	}
	if !checked {
		t.Fatal("no actual indexed Call initializer")
	}
}
