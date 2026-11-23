package exactcompiler

import (
	"context"
	"crypto/sha256"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"path/filepath"
	"strings"
	"testing"
)

func TestPreparedScalarPropSetupPlacement(t *testing.T) {
	const component = `export function Consumer(props:{value?:string}){const value=props.value??'fallback';this.onMount(()=>{});return()=> <output>{value}</output>}`
	for _, row := range []struct {
		name, source, consumer, host string
		protected                    bool
	}{
		{"no caller", component, "isomorphic", "", false},
		{"captured scalar setup call", `export function Consumer(props:{value:string}){function read(){const value=props.value;return value}const key=read();return()=> <output>{key}</output>}`, "isomorphic", "", false},
		{"repeated consumed setup calls", `export function Consumer(props:{value:string}){function read(){return props.value}const first=read();const second=read();return()=> <output>{first}{second}</output>}`, "isomorphic", "", false},
		{"two scalar reads and two setup helpers", `export function Consumer(props:{value:string;unit:string}){function read(){return props.value+props.unit}function unit(){return props.unit}const first=read();const second=unit();return()=> <output>{first}{second}</output>}`, "isomorphic", "", false},
		{"captured scalar and browser spread", `export function Consumer(props:{value:string}){function read(){return props.value}const key=read();return()=> <output>{key}</output>}export function Host(){return()=> <Consumer {...{get value(){return document.title}}}/>}`, "isomorphic", "client", false},
		{"helper with browser getter", `export function Consumer(props:{value:string}){const other={get value(){return document.title}};function read(){return props.value+other.value}const key=read();return()=> <output>{key}</output>}`, "client", "", false},
		{"shadowed receiver", `export function Consumer(props:{value:string}){function read(props:{value:string}){return props.value}const key=read({get value(){return document.title}});return()=> <output>{key}</output>}`, "client", "", false},
		{"dormant helper", `export function Consumer(props:{value:string}){function read(){return props.value+document.title}return()=> <output>idle</output>}`, "isomorphic", "", false},
		{"reactive scalar", `export function Consumer(props:{value:string}){const cell=this.reactive(()=>props.value);return()=> <output>{cell.get()}</output>}`, "isomorphic", "", false},
		{"reactive scalar and browser", `export function Consumer(props:{value:string}){const cell=this.reactive(()=>props.value+document.title);return()=> <output>{cell.get()}</output>}`, "client", "", false},
		{"reactive scalar and getter spread", `export function Consumer(props:{value:string}){const cell=this.reactive(()=>props.value);return()=> <output>{cell.get()}</output>}export function Host(){return()=> <Consumer {...{get value(){return document.title}}}/>}`, "isomorphic", "client", false},
		{"plain spread", component + `export function Host(){return()=> <Consumer {...{value:'plain'}}/>}`, "isomorphic", "isomorphic", false},
		{"getter spread", component + `export function Host(){return()=> <Consumer {...{get value(){return document.title}}}/>}`, "isomorphic", "client", false},
		{"proxy spread", component + `export function Host(){const input=new Proxy({value:'plain'},{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}});return()=> <Consumer {...input}/>}`, "isomorphic", "client", false},
		{"reassigned", `export function Consumer(props:{value:string}){props={get value(){return document.title}};const value=props.value;return()=> <output>{value}</output>}`, "unknown", "", false},
		{"member receiver", `export function Consumer(props:{value:string}){const value=props.value.slice(1);return()=> <output>{value}</output>}`, "unknown", "", false},
		{"nested", `export function Consumer(props:{value:{label:string}}){const value=props.value.label;return()=> <output>{value}</output>}`, "unknown", "", false},
		{"unknown", `export function Consumer(props:{value:unknown}){const value=String(props.value);return()=> <output>{value}</output>}`, "unknown", "", false},
		{"protected", `declare const brand:unique symbol;
/** @exact keep=secret */
type Private=string&{readonly[brand]:true};export function Consumer(props:{value:Private}){const value=props.value;return()=> <output>{value}</output>}`, "isomorphic", "", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			const framework = `import{type Component}from'@exactjs/core';`
			source := framework + strings.Replace(row.source, "function Consumer(props", "function Consumer(this:Component<{}>,props", 1)
			fixture := newPublicAwaitRequiredFixture(t, source)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				request.PackageType = "application"
				application := NewSession().Execute(request)
				request.PackageType = "library"
				library := NewSession().Execute(request)
				for _, response := range []Response{application, library} {
					if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) != row.protected || containsDiagnosticCode(response.Diagnostics, "EXACT3020") != row.protected || (response.Code == "") != row.protected {
						t.Fatal(target, response.Error, response.Diagnostics)
					}
					placements := map[string]string{}
					for _, c := range response.Analysis.Components {
						placements[c.Name] = c.Placement
					}
					if placements["Consumer"] != row.consumer || placements["Host"] != row.host {
						t.Fatal(target, placements)
					}
					if row.name == "captured scalar setup call" {
						capability := response.Analysis.Components[0].RenderCapability
						if capability.Server != "supported" || capability.Client != "supported" {
							t.Fatal(target, capability)
						}
						ordinary := false
						for _, callable := range response.Analysis.Callables {
							ordinary = ordinary || callable.Name == "read" && callable.Effect == "unknown"
						}
						if !ordinary {
							t.Fatal(target, "missing ordinary callable uncertainty")
						}
					}
					if row.name == "reactive scalar and browser" && strings.Contains(response.Code, "document.title") != (target == TargetClient) {
						t.Fatal(target, "browser producer crossed its placement boundary")
					}
				}
				if application.Code != library.Code {
					t.Fatal(target, "application and library emitted different implementations")
				}
			}
		})
	}
}

// An edited source must rebuild the setup-call projection in its new checker
// generation. An unchanged historical call location cannot lend coverage.
func TestPreparedScalarPropCallGeneration(t *testing.T) {
	const source = `import{type Component}from'@exactjs/core';
export function Consumer(this:Component<{}>,props:{value:string}){
	function read(){return props.value}
	const key=read();
	return()=> <output>{key}</output>;
}`
	request, inputs := componentCallProjectionInputs(t, "setup-call-generation.tsx", source)
	project, diagnostics, err := newProjectStateWithSources(request, request.ID, inputs)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	oldFile, oldChecker := generation.sourceFile, generation.checker
	old := collectProjectCallableEffects(project, oldFile, oldChecker, collectComponents(oldFile), nil, nil, nil, assetAnalysis{}, nil)
	if calls := old.preparedSetupCallsFor(oldFile, oldChecker); len(calls.calls) != 1 || len(calls.fields) != 1 {
		generation.release()
		t.Fatal("setup-call projection missing from settled original source")
	}
	generation.release()

	next, err := project.advance(context.Background(), request.ID, strings.Replace(source, "return()=>", "read();return()=>", 1))
	if err != nil {
		t.Fatal(err)
	}
	defer next.release()
	if next.program == generation.program || next.sourceFile == oldFile {
		t.Fatal("fixture did not replace the source generation")
	}
	if calls := old.preparedSetupCallsFor(oldFile, oldChecker); len(calls.calls) != 0 || len(calls.fields) != 0 {
		t.Fatal("retired checker generation provided setup-call coverage")
	}
	fresh := collectProjectCallableEffects(project, next.sourceFile, next.checker, collectComponents(next.sourceFile), nil, nil, nil, assetAnalysis{}, nil)
	if len(fresh.pending) != 0 {
		t.Fatal("edited source did not settle", fresh.pending)
	}
	if calls := fresh.preparedSetupCallsFor(next.sourceFile, next.checker); len(calls.calls) != 0 || len(calls.fields) != 0 {
		t.Fatal("discarded call failed to block the shared scalar Get")
	}
}

// A separate setup Call or an ambiguous selection keeps the ordinary diagnostic.
func TestPreparedScalarPropCallControls(t *testing.T) {
	const header = `import{type Component}from'@exactjs/core';
export function Consumer(this:Component<{}>,props:{value:string;alternate:boolean}){`
	for _, row := range []struct{ name, setup, code string }{
		{"discarded call", `function read(){return props.value}const key=read();read();`, "EXACT2001"},
		{"ambiguous target", `function read(){return props.value}const choose=props.alternate?read:()=>document.title;const key=choose();`, "EXACT2202"},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newPublicAwaitRequiredFixture(t, header+row.setup+`return()=> <output>{key}</output>}`)
			for _, target := range []Target{TargetClient, TargetServer} {
				for _, mode := range []string{"application", "library"} {
					request := fixture.request("compile", "entry.tsx")
					request.Target, request.PackageType = target, mode
					response := NewSession().Execute(request)
					if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, row.code) || response.Code != "" {
						t.Fatal(target, mode, response.Error, response.Diagnostics)
					}
				}
			}
		})
	}
}

// A private cell method Get keeps its own placement independent of the
// producer's source fields and of the callers supplying object props.
func TestNestedReactiveReadPlacement(t *testing.T) {
	const setup = `import{type Component}from'@exactjs/core';
export function Consumer(this:Component<{}>,props:{input:{value:number;dormant?:string}}){`
	const render = `const next=this.reactive(()=>cell.get()+1);return()=> <output>{next.get()}</output>}`
	const delivered = setup + `const cell=this.reactive(()=>props.input.value);` + render
	for _, row := range []struct{ name, source, placement string }{
		{"plain field", setup + `const input={value:1};const cell=this.reactive(()=>input.value);` + render, "isomorphic"},
		{"reached getter", setup + `const input={get value(){return document.title.length}};const cell=this.reactive(()=>input.value);` + render, "client"},
		{"dormant getter", setup + `const input={value:1,get dormant(){return document.title}};const cell=this.reactive(()=>input.value);` + render, "isomorphic"},
		{"unresolved object prop", delivered, "unknown"},
		{"plain object caller", delivered + `export function Host(){return()=> <Consumer input={{value:1}}/>}`, "unknown"},
		{"getter object caller", delivered + `export function Host(){return()=> <Consumer input={{get value(){return document.title.length}}}/>}`, "unknown"},
		{"dormant getter caller", delivered + `export function Host(){return()=> <Consumer input={{value:1,get dormant(){return document.title}}}/>}`, "unknown"},
	} {
		t.Run(row.name, func(t *testing.T) {
			fixture := newPublicAwaitRequiredFixture(t, row.source)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.PackageType = target, "application"
				application := NewSession().Execute(request)
				request.PackageType = "library"
				library := NewSession().Execute(request)
				for _, response := range []Response{application, library} {
					if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
						t.Fatal(target, response.Error, response.Diagnostics)
					}
					if response.Analysis.Components[0].Placement != row.placement {
						t.Fatal(target, response.Analysis.Components)
					}
					if row.name == "reached getter" && strings.Contains(response.Code, "document.title") != (target == TargetClient) {
						t.Fatal(target, "reached getter crossed its placement boundary")
					}
				}
				if application.Code != library.Code {
					t.Fatal(target, "application and library emitted different implementations")
				}
			}
		})
	}
}

// An owned producer edge does not grant delivery proof to an ordinary call of the same function.
func TestReactiveScalarPropOrdinaryCall(t *testing.T) {
	fixture := newPublicAwaitRequiredFixture(t, `import{type Component}from'@exactjs/core';
export function Consumer(this:Component<{}>,props:{value:string}){
	const read=()=>props.value;
	const cell=this.reactive(read);
	read();
	return()=> <output>{cell.get()}</output>;
}`)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, mode := range []string{"application", "library"} {
			request := fixture.request("compile", "entry.tsx")
			request.Target, request.PackageType = target, mode
			response := NewSession().Execute(request)
			if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2001") || response.Code != "" {
				t.Fatal(target, mode, response.Error, response.Diagnostics)
			}
			unknownRead := false
			for _, summary := range response.Analysis.Callables {
				unknownRead = unknownRead || summary.Name == "read" && summary.Effect == "unknown"
			}
			if !unknownRead {
				t.Fatal(target, mode, "ordinary producer summary lost the unknown prop read")
			}
		}
	}
}

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
	// Inspect the neutral projection itself. Checking an executable target can
	// subsequently replace its callable cache with the independent authored proof.
	r := session.Execute(Request{Kind: "compile", ID: "component-input-identity.tsx", Target: TargetDefault, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p/>}export function Parent(){return()=> <Page operation="onMount"/>}`})
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
	for _, test := range []struct{ name, setup, spread string }{
		{"unresolved", `declare const input:{operation:'onMount'};`, "input"},
		{"getter", `const input={get operation(){document.title;return 'onMount' as const}};`, "input"},
		// Build the Proxy in the render that spreads it. A top-level opaque
		// initializer is a separate module placement boundary.
		{"proxy", "", `new Proxy({operation:'onMount' as const},{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}})`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "component-input-mixed.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';` + test.setup + `export function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p>Ready</p>}export function Parent(){return()=> <><Page operation="onMount"/><Page {...` + test.spread + `}/></>}`})
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
	// Inspect the neutral projection itself. Checking an executable target can
	// subsequently replace its callable cache with the independent authored proof.
	r := session.Execute(Request{Kind: "compile", ID: "component-input-current-lineage.tsx", Target: TargetDefault, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function Page(this:Component<{}>,props:{operation:'onMount'}){this[props.operation](()=>{});return()=> <p/>}export function Parent(){return()=> <Page operation="onMount"/>}`})
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
