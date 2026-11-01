package exactcompiler

import "testing"

func TestMapInputOpenDomainsAndCopies(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, prefix      string
		items             int
		readonly, browser bool
	}{
		{"data", `const rows=[{id:'a',label:'A'}];`, 1, true, false},
		{"getter-browser", `const rows=[{id:'a',get label(){document.title;return 'A'}}];`, 1, false, true},
		{"proxy-iterator", `const rows=new Proxy([{id:'a',label:'A'}],{get(target,key,receiver){document.title;return Reflect.get(target,key,receiver)}});`, 0, false, true},
		{"empty", `const rows:{id:string;label:string}[]=[];`, 0, true, false},
		{"empty-future-write", `const rows:{id:string;label:string}[]=[];export function change(){rows.push({id:'b',label:'B'})}`, 0, false, false},
		{"future-descriptor", `const rows=[{id:'a',label:'A'}];export function change(){Object.defineProperty(rows[0],'label',{get(){document.title;return 'B'}})}`, 1, false, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';` + c.prefix + `export function Lists(this:Component<{}>){return()=> <ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>}`
			session := NewSession()
			filename, err := normalizeFileName(root+"/Lists.tsx", "")
			if err != nil {
				t.Fatal(err)
			}
			response := session.Execute(Request{Kind: "compile", Target: TargetClient, ID: filename, Source: source, ConfigFile: config, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			if c.browser && len(response.Analysis.Components) == 1 && response.Analysis.Components[0].Placement == "isomorphic" {
				t.Fatal("independent browser effect lost")
			}
			found := false
			for _, project := range session.projects {
				if project.callableCache == nil {
					continue
				}
				facts := project.callableCache.merged.facts
				for _, fact := range facts {
					for _, input := range fact.mapInputs {
						found = true
						t.Logf("domain=%d items=%d readonly=%t reason=%s", input.domain, len(input.items), input.futureReadonly, input.reason)
						if input.domain != sourceMapInputOpen || input.reason == "" || len(input.items) != c.items || input.futureReadonly != c.readonly {
							t.Fatal("domain inventory mismatch")
						}
						if len(input.roles) != 2 || len(input.roles[0].demands) != 1 || len(input.roles[1].demands) != 1 {
							t.Fatal("original role/demand lost")
						}
						copied := cloneMapInput(input)
						if !sameMapInputPublication(copied, input) || copied.publication != input.publication {
							t.Fatal("publication identity lost")
						}
						copied.domain = sourceMapInputClosed
						if sameMapInputPublication(copied, input) {
							t.Fatal("copy strengthened domain")
						}
						copied = cloneMapInput(input)
						copied.roles[0].demands[0].key = "other"
						if sameMapInputPublication(copied, input) || input.roles[0].demands[0].key == "other" {
							t.Fatal("role demand copy aliased")
						}
						if len(input.items) > 0 && len(input.items[0].descriptors) > 0 {
							copied = cloneMapInput(input)
							copied.items[0].descriptors[0] = nil
							if sameMapInputPublication(copied, input) || input.items[0].descriptors[0] == nil {
								t.Fatal("descriptor copy aliased")
							}
						}
					}
				}
			}
			if !found {
				t.Fatal("original map contribution missing")
			}
		})
	}
}

// A method named map on an ordinary object is not the selected framework owner.

func TestMapInputRejectsOrdinaryMethod(t *testing.T) {
	root, config := collectionSourceFixture(t)
	source := `type Row={id:string;label:string};const rows=[{id:'a',label:'A'}];const custom={map(items:Row[],key:(r:Row)=>string,render:(r:Row)=>string){return items.map(render)}};export const result=custom.map(rows,row=>row.id,row=>row.label);`
	session := NewSession()
	filename, err := normalizeFileName(root+"/custom.ts", "")
	if err != nil {
		t.Fatal(err)
	}
	response := session.Execute(Request{Kind: "analyze", ID: filename, Source: source, ConfigFile: config, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		if project.callableCache != nil {
			for _, fact := range project.callableCache.merged.facts {
				if len(fact.mapInputs) != 0 {
					t.Fatal("ordinary method acquired framework contribution")
				}
			}
		}
	}
}

// Placement consumes only the selected map's key/render MAY effects and its
// paid argument effects. Dormant event callbacks never become eager setup work.

func TestMapKnownEffectProjection(t *testing.T) {
	root, config := collectionSourceFixture(t)
	for _, c := range []struct {
		name, prefix, render string
		browser              bool
	}{
		{"getter", `const rows=[{id:'a',get label(){document.title;return 'A'}}];`, `<ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, true},
		{"computed-callee-getter", `const rows=[{id:'a',label:'A'}];const selector={get name(){document.title;return 'map' as const}};`, `<ul>{this[selector.name](rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, true},
		{"computed-callee-neutral", `const rows=[{id:'a',label:'A'}];const selector={get name(){return 'map' as const}};`, `<ul>{this[selector.name](rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, false},
		{"computed-literal-item-getter", `const rows=[{id:'a',get ['label'](){document.title;return 'A'}}];`, `<ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, true},
		{"computed-unknown-item-getter", `declare const fieldName:string;const rows=[{id:'a',get [fieldName](){document.title;return 'A'}}];`, `<ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, true},
		{"zero-formal-role", `const rows=[{id:'a',label:'A'}];`, `<ul>{this.map(rows,()=>document.title,row=><li>{row.label}</li>)}</ul>`, true},
		{"function-role", `const rows=[{id:'a',label:'A'}];function key(row:{id:string}){document.title;return row.id}`, `<ul>{this.map(rows,key,row=><li>{row.label}</li>)}</ul>`, true},
		{"key-role", `const rows=[{id:'a',label:'A'}];`, `<ul>{this.map(rows,row=>{document.title;return row.id},row=><li>{row.label}</li>)}</ul>`, true},
		{"render-role", `const rows=[{id:'a',label:'A'}];`, `<ul>{this.map(rows,row=>row.id,row=><li>{document.title}{row.label}</li>)}</ul>`, true},
		{"collection-get", `const items=[{id:'a',label:'A'}];const box={get rows(){document.title;return items}};`, `<ul>{this.map(box.rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, true},
		{"key-argument-get", `const rows=[{id:'a',label:'A'}];const box={get key(){document.title;return (row:{id:string})=>row.id}};`, `<ul>{this.map(rows,box.key,row=><li>{row.label}</li>)}</ul>`, true},
		{"plain", `const rows=[{id:'a',label:'A'}];`, `<ul>{this.map(rows,row=>row.id,row=><li>{row.label}</li>)}</ul>`, false},
		{"event-inside-render", `const rows=[{id:'a',label:'A'}];`, `<ul>{this.map(rows,row=>row.id,row=><li onClick={()=>{document.title='clicked'}}>{row.label}</li>)}</ul>`, false},
		{"map-inside-event", `const rows=[{id:'a',label:'A'}];`, `<button onClick={()=>{this.map(rows,row=>row.id,row=>document.title)}}>run</button>`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';` + c.prefix + `export function Lists(this:Component<{}>){return()=> ` + c.render + `}`
			response := collectionCompileSource(t, root, config, source, TargetClient)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Components) != 1 {
				t.Fatal("component missing")
			}
			component := response.Analysis.Components[0]
			t.Logf("placement=%s environment=%s diagnostics=%v", component.Placement, component.EnvironmentEffect, component.Diagnostics)
			if c.browser && component.EnvironmentEffect != "browser" {
				t.Fatal("known map browser effect not conserved")
			}
			if !c.browser && component.EnvironmentEffect == "browser" {
				t.Fatal("deferred or nonbrowser work became eager browser setup")
			}
		})
	}
}

// Source replacement and reset cannot retain a previous map's browser effects
// or use its published input in the new source generation.

func TestMapKnownEffectReplacement(t *testing.T) {
	root, config := collectionSourceFixture(t)
	filename, err := normalizeFileName(root+"/Lists.tsx", "")
	if err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	makeSource := func(read string) string {
		return `import type {Component} from '@exactjs/core';const rows=[{id:'a',label:'A'}];export function Lists(this:Component<{}>){return()=> <ul>{this.map(rows,row=>row.id,row=><li>{` + read + `}</li>)}</ul>}`
	}
	var oldInput *sourceMapInputContribution
	for _, step := range []struct {
		read           string
		browser, reset bool
	}{{`document.title+row.label`, true, false}, {`document.title+row.label`, true, false}, {`row.label`, false, false}, {`document.title+row.label`, true, true}} {
		if step.reset {
			if response := session.Execute(Request{Kind: "reset"}); response.Error != "" {
				t.Fatal(response.Error)
			}
		}
		response := session.Execute(Request{Kind: "compile", Target: TargetClient, ID: filename, Source: makeSource(step.read), ConfigFile: config, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Components) != 1 {
			t.Fatal(response.Error, response.Diagnostics)
		}
		if (response.Analysis.Components[0].EnvironmentEffect == "browser") != step.browser {
			t.Fatal("source replacement leaked/lost browser effects")
		}
		found := false
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			analysis := project.callableCache.merged
			for _, fact := range analysis.facts {
				for _, input := range fact.mapInputs {
					found = true
					// Execute has released its analysis owner. Inspect immutable
					// publication facts only, not a positive live-validity claim.
					if input.publication == nil || !sameMapInputPublication(input, input.publication) || input.owner != fact.node || input.source != fact.sourceFile {
						t.Fatal("original immutable publication missing")
					}
					if oldInput != nil && oldInput.source != input.source && currentMapInput(oldInput, &fact, analysis.owner) != nil {
						t.Fatal("old source generation reused")
					}
					if input.domain != sourceMapInputOpen {
						t.Fatal("replacement invented closed iterator authority")
					}
					oldInput = input
				}
			}
		}
		if !found {
			t.Fatal("current map contribution absent")
		}
	}
}
