package exactcompiler

import (
	"strings"
	"testing"
)

// Public list forms exercise provenance, argument publication and rendered-value paths.
// Each witness must remain isomorphic and pass generated TypeScript in both artifacts.
func TestCollectionSubsystemOutcomeSources(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, setup, expression string
		keyed                   bool
	}{
		{"authored-literal", "const rows=props.rows;", `rows.map(row=><li key="slot">{row.label}</li>)`, false},
		{"authored-pattern", "const rows=props.rows;", `rows.map(({id,label})=><li key={label}>{id}</li>)`, false},
		{"authored-local", "const rows=props.rows;", `rows.map(row=>{const key=row.label;return <li key={key}>{row.id}</li>})`, false},
		{"authored-cast", "const rows=props.rows;", `rows.map(row=>(<li key={row.label}>{row.id}</li> as import('@exactjs/core').Child))`, false},
		{"native-key-scope", "const rows=props.rows;", `rows.map(outer=>{const key=outer.id;return <section key={key}>{rows.map(row=><li key={row.id}>{row.label}</li>)}</section>})`, true},
		{"destructured-function", "const rows=props.rows;", `rows.map(function render({id,label}){return <li>{label}</li>})`, true},
		{"declared-key-field", "const rows=/** @exact key=id */props.rows;", `rows.map(row=><li>{row.label}</li>)`, true},
		{"slice", "const rows=props.rows.slice(1);", `rows.map(row=><li>{row.label}</li>)`, true},
		{"sorted", "const rows=props.rows.toSorted((a,b)=>a.id.localeCompare(b.id));", `rows.map(row=><li>{row.label}</li>)`, true},
		{"reversed", "const rows=props.rows.toReversed();", `rows.map(row=><li>{row.label}</li>)`, true},
		{"projection", "const rows=props.rows.map(row=>({...row}));", `rows.map(row=><li>{row.label}</li>)`, true},
		{"narrowing", "const rows=props.mixed.filter((row):row is Row=>typeof row!=='number');", `rows.map(row=><li>{row.label}</li>)`, true},
		{"custom-filter", "const source={filter(){return props.rows}};const rows=source.filter();", `rows.map(row=><li>{row.label}</li>)`, true},
		{"array-spread", "const rows=props.rows;", `[...rows.map(row=><li key={row.id}>{row.label}</li>)]`, true},
		{"array-satisfies", "const rows=props.rows;", `rows.map(row=><li key={row.id}>{row.label}</li>) satisfies unknown[]`, true},
		{"or-left", "const rows=props.rows;", `rows.map(row=><li key={row.id}>{row.label}</li>) || null`, true},
		{"and-right", "const rows=props.rows;", `props.enabled && rows.map(row=><li key={row.id}>{row.label}</li>)`, true},
		{"and-left-data", "const rows=props.rows;", `rows.map(row=><li key={row.id}>{row.label}</li>) && null`, false},
		{"indexed-native-outer", "const rows=props.rows;", `rows['map']((outer,index)=><section key={outer.id}>{rows.map(row=><li key={row.id}>{row.label+index}</li>)}</section>)`, true},
		{"manual-direct", "", `this.map(props.rows,row=>row.id,row=><li>{row.label}</li>)`, true},
		{"manual-local", "const rows=props.rows;", `this.map(rows,row=>row.id,row=><li>{row.label}</li>)`, true},
		{"manual-derived", "const rows=props.rows.filter(row=>row.label);", `this.map(rows,row=>row.id,row=><li>{row.label}</li>)`, true},
		{"manual-id", "", `this.map(props.rows,row=>row.id,row=><li>{row.label}</li>,'site')`, true},
		{"manual-provenance", "", `this.map(props.rows,row=>row.id,row=><li>{row.label}</li>,'site',props.rows)`, true},
		{"manual-identity", "", `this.map(props.rows,row=>row.id,row=><li>{row.label}</li>,'site',props.rows,'member:id')`, true},
		{"manual-key-block", "", `this.map(props.rows,row=>{return row.id},row=><li>{row.label}</li>)`, true},
		{"manual-key-call", "", `this.map(props.rows,row=>String(row.id),row=><li>{row.label}</li>)`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';interface Row{/** @exact key */ id:string;label:string}export function Lists(this:Component<{}>,props:{rows:Row[];mixed:(Row|number)[];enabled:boolean}){` + c.setup + `return()=> <ul>{` + c.expression + `}</ul>}`
				response := collectionCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("lost portable list source: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
				if c.keyed && !strings.Contains(response.Code, ".id") {
					t.Fatalf("key selector lost in %s", response.Code)
				}
			})
		}
	}
}

// Generic constraints use checker-owned value families rather than type display spelling.
func TestCollectionSubsystemOutcomeGenericKeys(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		constraint string
		keyed      bool
	}{{"string|number", true}, {"string|boolean", false}, {"boolean", false}} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.constraint+"/"+string(target), func(t *testing.T) {
				source := `export function Lists<T extends ` + c.constraint + `>(props:{rows:readonly T[]}){return()=> <ul>{props.rows.map(row=><li>{String(row)}</li>)}</ul>}`
				response := collectionCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("generic collection lost its portable contract: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
				keyed := strings.Contains(response.Code, "__exactMapKeyedChildren") || strings.Contains(response.Code, "__exactKeyedChild")
				if keyed != c.keyed {
					t.Fatalf("constraint %s inferred=%v, expected=%v", c.constraint, keyed, c.keyed)
				}
			})
		}
	}
}

// A retained derived cell must carry source provenance only across identity-preserving operations.
func TestCollectionSubsystemOutcomeProvenance(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct{ name, setup, expression string }{
		{"slice", `const rows=this.state.rows.slice(1);`, `rows.map(row=><li>{row.label}</li>)`},
		{"sorted", `const rows=this.state.rows.toSorted((a,b)=>a.id.localeCompare(b.id));`, `rows.map(row=><li>{row.label}</li>)`},
		{"reversed", `const rows=this.state.rows.toReversed();`, `rows.map(row=><li>{row.label}</li>)`},
		{"projection", `const rows=this.state.rows.map(row=>({...row}));`, `rows.map(row=><li>{row.label}</li>)`},
		{"narrowing", `const rows=this.state.mixed.filter((row):row is Row=>typeof row!=='number');`, `rows.map(row=><li>{row.label}</li>)`},
		{"custom", `const custom={filter:()=>this.state.rows};const rows=custom.filter();`, `rows.map(row=><li>{row.label}</li>)`},
		{"manual-derived", `const rows=this.state.rows.filter(row=>row.label);`, `this.map(rows,row=>row.id,row=><li>{row.label}</li>)`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component} from '@exactjs/core';interface Row{/** @exact key */ id:string;label:string}export function Lists(this:Component<{rows:Row[];mixed:(Row|number)[]}>){this.state.rows=[];this.state.mixed=[];` + c.setup + `return()=> <ul data-count={rows.length}>{` + c.expression + `}</ul>}`
				response := collectionCompileSource(t, root, config, source, target)
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("derived list contract lost: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
				if !strings.Contains(response.Code, ".id") {
					t.Fatalf("derived key selector lost: %s", response.Code)
				}
			})
		}
	}
}

// Asynchronous work and DOM mutations stay outside synchronous pure rendering.
func TestCollectionSubsystemOutcomeRenderBoundaries(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, body string
		reject     bool
	}{
		{"async-render", `return async()=> <p>unsafe</p>`, true},
		{"browser-render", `return()=> <p>{document.body.setAttribute('data-unsafe','yes')}</p>`, true},
		{"browser-event", `return()=> <button onClick={()=>{document.body.setAttribute('data-safe','yes');this.state.count++}}>safe</button>`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := collectionCompileSource(t, root, config, `import type {Component} from '@exactjs/core';export function Lists(this:Component<{count:number}>){this.state.count=0;`+c.body+`}`, target)
				if c.reject {
					if !hasDiagnosticCode(response.Diagnostics, "EXACT_RENDER") {
						t.Fatalf("render effect accepted: %v", collectionDiagnosticDetails(response.Diagnostics))
					}
					return
				}
				if len(response.Diagnostics) != 0 || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("event correction lost: %v", collectionDiagnosticDetails(response.Diagnostics))
				}
			})
		}
	}
}
