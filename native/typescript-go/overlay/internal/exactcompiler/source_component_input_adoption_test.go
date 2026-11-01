package exactcompiler

import (
	"crypto/sha256"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"path/filepath"
	"strings"
	"testing"
)

func TestComponentInputLiteralDelivery(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "component-input-literal.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>window.alert('mounted'));return()=> <p>Ready</p>}export function Parent(){return()=> <Page operation="onMount"/>}`})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("compile: %s %#v", r.Error, r.Diagnostics)
			}
			for _, c := range r.Analysis.Components {
				if c.Name == "Page" && c.Placement != "unknown" {
					t.Fatal("generic public placement changed", c)
				}
				if c.Name == "Parent" {
					if c.SubgraphPlacement != "isomorphic" || len(c.RenderEdges) != 1 || c.RenderEdges[0].Placement != "isomorphic" {
						t.Fatalf("literal delivery not adopted: %#v", c)
					}
				}
			}

			t.Logf("emitted %s sha256=%x", target, sha256.Sum256([]byte(r.Code)))
			if strings.Contains(r.Code, "window.alert") != (target == TargetClient) {
				t.Fatal("callback crossed target boundary")
			}
		})
	}
}

// Unsupported delivery families retain the input obligation rather than
// borrowing the neutral body projection or assuming raw props are DATA.
func TestComponentInputDeliveryRefusals(t *testing.T) {
	for _, test := range []struct {
		name, setup, input string
		browser            bool
	}{
		{"spread", `const input={operation:'onMount' as const};`, `{...input}`, false},
		{"getter", `const input={get operation(){document.title;return 'onMount' as const}};`, `{...input}`, true},
		{"proxy", `const input=new Proxy({operation:'onMount' as const},{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}});`, `{...input}`, true},
		{"operand", `function read(){document.title;return 'onMount' as const}`, `operation={read()}`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `import{type Component}from'@exactjs/core';declare global{namespace JSX{interface Element{} interface IntrinsicElements{p:{children?:string}}}}` + test.setup + `function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}export function Parent(){return()=> <Page ` + test.input + `/>}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "component-input-refusal.tsx", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid control: %s %#v", r.Error, r.Diagnostics)
			}
			found := false
			for _, c := range r.Analysis.Components {
				if c.Name == "Parent" {
					found = true
					if len(c.RenderEdges) != 1 || c.RenderEdges[0].Placement != "unknown" {
						t.Fatal("unsupported recipe adopted", c)
					}
				}
			}
			if !found {
				t.Fatal("parent absent")
			}
			if test.browser {
				known := false
				for _, c := range r.Analysis.Callables {
					for _, e := range c.EffectSources {
						known = known || e.Environment == "browser"
					}
				}
				if !known {
					t.Fatal("known delivery browser effect lost")
				}
			}
		})
	}
}

// Mutated copies cannot turn another target or unpublished demand into an
// adoption. Exact immutable copies keep only the original source recipe.
func TestComponentInputAdoptionIdentity(t *testing.T) {
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "component-input-identity.tsx", Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p/>}export function Parent(){return()=> <Page operation="onMount"/>}`})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		for node, links := range project.componentLinks {
			if len(links.inputs) == 0 {
				continue
			}
			checked = true
			record := projectComponent{candidate: componentCandidate{node: node}}
			edge := links.edges[0]
			if !componentInputEdgeAdopted(project, record, edge) {
				t.Fatal("original recipe refused")
			}
			original := links.inputs[0]
			for _, name := range []string{"target", "slot", "source", "mode", "generation", "input", "missing"} {
				changed := original
				switch name {
				case "target":
					changed.target = node
				case "slot":
					changed.demand.field.slot = nil
				case "source":
					changed.demand.authority.source = nil
				case "mode":
					changed.demand.authority.mode = "foreign"
				case "generation":
					changed.demand.authority.generation++
				case "input":
					changed.input = original.demand.field.operation
				case "missing":
					links.inputs = nil
				}
				if name != "missing" {
					links.inputs = []sourceComponentInputAdoption{changed}
				}
				project.componentLinks[node] = links
				if componentInputEdgeAdopted(project, record, edge) {
					t.Fatal("wrong recipe adopted", name)
				}
			}
			links.inputs = []sourceComponentInputAdoption{original}
			project.componentLinks[node] = links
		}
	}
	if !checked {
		t.Fatal("no actual JSX recipe")
	}
}

// A source recipe belongs to one delivery edge. Its sibling and the exported
// declaration/global partition node retain unresolved external input authority.
func TestComponentInputMixedDeliveries(t *testing.T) {
	for _, test := range []struct{ name, setup string }{
		{"unresolved", `declare const input:{operation:'onMount'};`},
		{"getter", `const input={get operation(){document.title;return 'onMount' as const}};`},
		{"proxy", `const input=new Proxy({operation:'onMount' as const},{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}});`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "component-input-mixed.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';` + test.setup + `export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}export function Parent(){return()=> <><Page operation="onMount"/><Page {...input}/></>}`})
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					t.Fatal(r.Error, r.Diagnostics)
				}
				pageID := ""
				for _, c := range r.Analysis.Components {
					if c.Name == "Page" {
						pageID = c.ID
						if c.Placement != "unknown" {
							t.Fatal("exported target gained placement", c)
						}
					}
					if c.Name == "Parent" {
						if c.SubgraphPlacement != "unknown" || len(c.RenderEdges) != 2 || c.RenderEdges[0].Placement != "isomorphic" || c.RenderEdges[1].Placement != "unknown" {
							t.Fatalf("edge recipes conflated: %#v", c)
						}
					}
				}
				found := false
				for _, node := range r.Analysis.PartitionPlan.Nodes {
					if node.Kind == "component" && node.ComponentContract == pageID {
						found = true
						if !node.Conservative {
							t.Fatal("global partition target gained authority", node)
						}
					}
				}
				if !found {
					t.Fatal("target global partition node absent")
				}
			})
		}
	}
}

// Runtime phase controls use this same receiving definition with unqualified
// external inputs. Exporting it does not create a literal-delivery recipe.
func TestComponentInputRuntimePhaseArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "component-input-raw-phase.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>window.alert('mounted'));return()=> <p>Ready</p>}`})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		if len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
			t.Fatal("raw input gained placement", r.Analysis.Components)
		}

		t.Logf("emitted %s sha256=%x", target, sha256.Sum256([]byte(r.Code)))
	}
}

// Current source/normalization and reset own the component-link cache. A prior
// source recipe cannot survive replacement through a result-cache hit.
func TestComponentInputCacheReplacement(t *testing.T) {
	session := NewSession()
	id := "component-input-cache.tsx"
	prefix := `import{type Component}from'@exactjs/core';const input={operation:'onMount' as const};export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}export function Parent(){return()=> `
	for _, step := range []struct {
		source string
		want   string
		reset  bool
	}{
		{prefix + `<Page operation="onMount"/>}`, "isomorphic", false},
		{prefix + `<Page operation="onMount"/>}`, "isomorphic", false},
		{prefix + `<Page {...input}/>}`, "unknown", false},
		{prefix + `<Page operation="onMount"/>}`, "isomorphic", true},
	} {
		if step.reset {
			r := session.Execute(Request{Kind: "reset"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
		}
		r := session.Execute(Request{Kind: "compile", ID: id, Source: step.source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		found := false
		for _, c := range r.Analysis.Components {
			if c.Name == "Page" && c.Placement != "unknown" {
				t.Fatal("generic placement changed", c)
			}
			if c.Name == "Parent" {
				found = true
				if len(c.RenderEdges) != 1 || c.RenderEdges[0].Placement != step.want {
					t.Fatal("cache retained wrong recipe", c)
				}
			}
		}
		if !found {
			t.Fatal("parent missing")
		}
	}
}

// Copying both original immutable cache records does not renew their program
// authority. The consumer must compare the current project, not only old peers.
func TestComponentInputCopiedPriorProgramRefusal(t *testing.T) {
	session := NewSession()
	id := "component-input-stale.tsx"
	source := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}export function Parent(){return()=> <Page operation="onMount"/>}`
	r := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	var parent *ast.Node
	var links, targetLinks projectComponentLinkFacts
	var oldProgram *compiler.Program
	for _, project := range session.projects {
		oldProgram = project.program
		for node, candidate := range project.componentLinks {
			if len(candidate.inputs) != 0 {
				parent = node
				links = candidate
				links.inputs = append([]sourceComponentInputAdoption(nil), candidate.inputs...)
				targetLinks = project.componentLinks[candidate.inputs[0].target]
				targetLinks.demands = append([]sourceComponentInputDemand(nil), targetLinks.demands...)
			}
		}
	}
	if parent == nil {
		t.Fatal("original recipe absent")
	}
	r = session.Execute(Request{Kind: "compile", ID: id, Source: strings.Replace(source, "Ready", "Fresh", 1), Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		if project.program == oldProgram {
			t.Fatal("source replacement did not renew program")
		}
		project.componentLinks[parent] = links
		project.componentLinks[links.inputs[0].target] = targetLinks
		if componentInputEdgeAdopted(project, projectComponent{candidate: componentCandidate{node: parent}}, links.edges[0]) {
			t.Fatal("copied prior-program recipe adopted by current project")
		}
	}
}

// Independent envelope and current-index/dependency failures cannot be repaired
// by copying the component demand table alongside a mutated recipe.
func TestComponentInputCurrentLineageRefusals(t *testing.T) {
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "component-input-current-lineage.tsx", Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p/>}export function Parent(){return()=> <Page operation="onMount"/>}`})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		for parent, links := range project.componentLinks {
			if len(links.inputs) == 0 {
				continue
			}
			checked = true
			original := links.inputs[0]
			targetLinks := project.componentLinks[original.target]
			record := projectComponent{candidate: componentCandidate{node: parent}}
			if !componentInputEdgeAdopted(project, record, links.edges[0]) {
				t.Fatal("original current recipe refused")
			}
			for _, name := range []string{"checker", "source", "target", "mode", "generation", "index", "dependency"} {
				t.Run(name, func(t *testing.T) {
					changed := original
					switch name {
					case "checker":
						changed.demand.authority.checker = &checker.Checker{}
					case "source":
						for _, source := range project.program.GetSourceFiles() {
							if source != original.demand.authority.source {
								changed.demand.authority.source = source
								break
							}
						}
						if changed.demand.authority.source == original.demand.authority.source {
							t.Fatal("foreign source control setup")
						}
					case "target":
						changed.target = parent
						changed.demand.field.declaration = parent
					case "mode":
						changed.demand.authority.prefixMode[0] ^= 1
					case "generation":
						changed.demand.authority.generation++
					}
					alteredLinks := links
					alteredLinks.inputs = []sourceComponentInputAdoption{changed}
					project.componentLinks[parent] = alteredLinks
					alteredTarget := project.componentLinks[changed.target]
					alteredTarget.demands = []sourceComponentInputDemand{changed.demand}
					project.componentLinks[changed.target] = alteredTarget
					index := project.callableCache.owner.values.indexes[original.demand.authority.source]
					entry := index.normalOccurrences[original.demand.field.operation]
					analysis := project.callableCache.bySource[original.demand.authority.source]
					if name == "index" {
						delete(index.normalOccurrences, original.demand.field.operation)
					}
					if name == "dependency" {
						delete(project.callableCache.bySource, original.demand.authority.source)
					}
					if componentInputEdgeAdopted(project, record, links.edges[0]) {
						t.Error("foreign current context adopted", name)
					}
					index.normalOccurrences[original.demand.field.operation] = entry
					project.callableCache.bySource[original.demand.authority.source] = analysis
					project.componentLinks[parent] = links
					project.componentLinks[original.target] = targetLinks
				})
			}
		}
	}
	if !checked {
		t.Fatal("current recipe missing")
	}
}

// Imported target source replacement invalidates a previously selected literal
// recipe even when the parent JSX site remains byte-identical.
func TestComponentInputDependencyReplacement(t *testing.T) {
	root, config := collectionSourceFixture(t)
	child := filepath.Join(root, "Child.tsx")
	parent := filepath.Join(root, "Parent.tsx")
	body := `import{type Component}from'@exactjs/core';export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}`
	consumer := `import{Page}from'./Child.js';export function Parent(){return()=> <Page operation="onMount"/>}`
	session := NewSession()
	for _, step := range []struct{ body, want string }{{body, "isomorphic"}, {strings.Replace(body, `{this[props.operation]`, `{declareUnknown();this[props.operation]`, 1) + `;declare function declareUnknown():void;`, "unknown"}, {body, "isomorphic"}} {
		r := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: parent, Source: consumer}, {ID: child, Source: step.body}}})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal("sync", r.Error, r.Diagnostics)
		}
		r = session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: parent, Source: consumer, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal("compile", r.Error, r.Diagnostics)
		}
		found := false
		for _, c := range r.Analysis.Components {
			if c.Name == "Parent" {
				found = true
				if len(c.RenderEdges) != 1 || c.RenderEdges[0].Placement != step.want {
					t.Fatal("dependency recipe stale", step.want, c)
				}
			}
		}
		if !found {
			t.Fatal("parent missing")
		}
	}
}
