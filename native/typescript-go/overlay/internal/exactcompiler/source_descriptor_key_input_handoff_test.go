package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"strings"
	"testing"
)

// The full original Get, C, body/currentness and APPLIED/whole-zero assertions
// run before copied metadata refusers. No test issues a query, selects a native
// method, installs a binder or mutates an operation observation/current flag.
func TestDescriptorOriginalAppliedPrimitiveKey(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"original-module-key", `export{};const tag=Symbol.for('descriptor-source-use');export function probe(value:object){return Object.getOwnPropertyDescriptor(value,tag)?.value===true}`},
		{"immutable-key-alias", `export{};const tag=Symbol.for('descriptor-source-use');const alias=tag;export function probe(value:object){return Object.getOwnPropertyDescriptor(value,alias)?.value===true}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			var retained *callableEffectWork
			var original sourceStagedOperationRecipe
			descriptorContractCollection(t, row.source, func(collection *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, false)
				assertOriginalDescriptorGetUseCurrent(t, collection, descriptorStrictComparisonEffects)
				work := &collection.work
				reached := false
				for _, recipe := range work.operationRecipes {
					if recipe.nativeGet == nil || !validDescriptorRetrieval(recipe.nativeGet) || recipe.key != nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
						continue
					}
					input, applied := work.descriptorPrimitiveKeyInput(recipe, recipe.nativeGet)
					if !applied {
						t.Fatal("actual original key DATA/source/current/APPLIED handoff UNREACHED")
					}
					id := work.operationIDs[recipe.key]
					enumeration := work.operations[id.index].descriptorEnumeration
					if enumeration == nil || !enumeration.represented || !recipe.delta.extracted {
						t.Fatal("actual once-only descriptor algorithm completion UNREACHED")
					}
					if input.construction || input.request.producer.operation == nil || !operationContainsRequest(recipe.delta.required, input.request) {
						t.Fatal("key input lost independent original DATA requirement")
					}
					// Copying detached alternatives cannot create missing SOURCE membership.
					copied := cloneDescriptorInputData(input)
					copied.alternatives = append(copied.alternatives, sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointUnknown}})
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("known primitive prefix erased unknown key sibling")
					}
					copied = cloneDescriptorInputData(input)
					copied.alternatives[0].creating = &sourceRelativeInputEdge{}
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("creating association became a context-free key")
					}
					copied = cloneDescriptorInputData(input)
					copied.alternatives[0].endpoint.nativePrimitive.method = nil
					if descriptorPrimitiveKeyAlternatives(copied) {
						t.Fatal("foreign native method retained primitive source membership")
					}
					copied = cloneDescriptorInputData(input)
					copied.request.edge += ":foreign-reader"
					if work.descriptorInputSnapshotCurrent(recipe.nativeGet.descriptorRead, 1, copied) {
						t.Fatal("copied key reader became APPLIED")
					}
					wrong := recipe
					wrong.delta = cloneOperationDelta(recipe.delta)
					wrong.delta.required = nil
					if _, ok := work.descriptorPrimitiveKeyInput(wrong, recipe.nativeGet); ok {
						t.Fatal("key DATA without original required membership was adopted")
					}
					original, retained = recipe, work
					reached = true
				}
				if !reached {
					t.Fatal("original selected descriptor algorithm UNREACHED")
				}
			})
			if retained == nil {
				t.Fatal("genuine selected key lifecycle UNREACHED")
			}
			if _, ready := retained.descriptorPrimitiveKeyInput(original, original.nativeGet); ready {
				t.Fatal("released generation retained primitive key handoff")
			}
		})
	}
}

// Existing actual dynamic, replaced, mixed and entry-alias Symbol sources keep
// their independent refusal controls. This caller additionally verifies that a
// non-primitive descriptor input cannot gain the new key component disposition.
func TestDescriptorCoercionKeyKeepsOriginalSourceDonor(t *testing.T) {
	const source = `export{};const key:any={toString:()=>document.title};export function probe(value:object){return Object.getOwnPropertyDescriptor(value,key)?.value===true}`
	withReflectiveRelevanceSource(t, "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\n"+source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		result := collection.resolve(file)
		descriptorContractBrowser(t, result, true)
		reached := false
		for _, recipe := range collection.work.operationRecipes {
			if recipe.nativeGet == nil || !validDescriptorRetrieval(recipe.nativeGet) || recipe.key != nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer {
				continue
			}
			if _, ready := collection.work.descriptorPrimitiveKeyInput(recipe, recipe.nativeGet); ready {
				t.Fatal("object coercion source gained primitive key disposition")
			}
			reached = true
		}
		if !reached {
			t.Fatal("original object-key algorithm source UNREACHED")
		}
	})
}

// Required ToPropertyKey work belongs to the actual Page even when no descriptor
// result is inspected. The abrupt row observes analysis donors, not runtime Throw.
func TestComponentDescriptorKeyEffects(t *testing.T) {
	for _, row := range []struct {
		name, before, operand string
		browser, unknown      bool
	}{
		{"primitive-quiet", "", "'label'", false, false},
		{"key-getter", `const key:any={get toString(){void document.title;return ()=> 'label';}};`, "key", true, false},
		{"method-receiver", `const key:any={get label(){return document.title;},toString(){return this.label;}};`, "key", true, false},
		{"abrupt-conversion", `const key:any={toString():string{void document.title;throw new Error('key');}};`, "key", true, false},
		{"mixed", `const key:any={toString(){return document.title;}};`, "props.useKnown?key:props.foreign", true, true},
		{"lexical-replacement", `const Object={getOwnPropertyDescriptor(_target:object,_key:unknown){return undefined;}};const key={toString(){return document.title;}};`, "key", false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			f := componentDescriptorKeyFixture(t, componentDescriptorKeyPage(row.before, row.operand))
			checkComponentDescriptorKey(t, NewSession(), f, row.browser, row.unknown)
		})
	}
}

func componentDescriptorKeyPage(before, operand string) string {
	return `import type {Component} from '@exactjs/core';export function Page(this:Component<{label:string}>,props:{useKnown:boolean;foreign:any}){` + before + `try{Object.getOwnPropertyDescriptor({label:1},` + operand + `);}catch{}this.state.label='done';return()=> <p>{this.state.label}</p>;}`
}

func componentDescriptorKeyFixture(t *testing.T, source string) *executableFixture {
	t.Helper()
	f := newExecutableFixture(t, map[string]string{"entry.tsx": source})
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"allowJs":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
	if err := os.WriteFile(f.request("analyze", "entry.tsx").ConfigFile, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	return f
}

func checkComponentDescriptorKey(t *testing.T, session *Session, f *executableFixture, browser, unknown bool) Response {
	t.Helper()
	r := session.Execute(f.request("analyze", "entry.tsx"))
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != "Page" {
		t.Fatal("real key Page entry", r.Error, r.Diagnostics, r.Analysis.Components)
	}
	page := findCallable(t, r.Analysis.Callables, "Page")
	got, unresolved := false, false
	for _, e := range page.EffectSources {
		got = got || e.Environment == "browser"
		unresolved = unresolved || e.Environment == "unknown"
	}
	if got != browser || unknown && !unresolved {
		t.Fatal("key Page donor/independent uncertainty", got, browser, unknown, page.EffectSources)
	}
	if len(page.StateWrites) == 0 || len(r.Analysis.StateReads) == 0 {
		t.Fatal("key Page state/render consumer absent", page, r.Analysis.StateReads)
	}
	if browser && r.Analysis.Components[0].Placement != "client" {
		t.Fatal("browser key Page placement", r.Analysis.Components[0])
	}
	request := f.request("compile", "entry.tsx")
	request.Target = TargetClient
	c := session.Execute(request)
	if c.Error != "" || hasErrorDiagnostic(c.Diagnostics) || c.Code == "" {
		t.Fatal("key Page client artifact", c.Error, c.Diagnostics)
	}
	return c
}

func TestComponentDescriptorKeyEdit(t *testing.T) {
	browser := componentDescriptorKeyPage(`const key:any={toString(){return document.title;}};`, "key")
	quiet := strings.Replace(browser, "document.title", "'label'", 1)
	f := componentDescriptorKeyFixture(t, browser)
	session := NewSession()
	checkComponentDescriptorKey(t, session, f, true, false)
	f.files["entry.tsx"] = quiet
	if err := os.WriteFile(f.request("analyze", "entry.tsx").ID, []byte(quiet), 0600); err != nil {
		t.Fatal(err)
	}
	retained := checkComponentDescriptorKey(t, session, f, false, false)
	fresh := checkComponentDescriptorKey(t, NewSession(), f, false, false)
	if retained.Code != fresh.Code {
		t.Fatal("key body edit retained/fresh artifact differs")
	}
}

// Preserve original Symbol.for input work independently of primitive key DATA.
// The mixed hook additionally requires an authored source-attributed unknown,
// rather than counting mandatory descriptor conversion uncertainty as that debt.
func TestComponentSelectedNativeRemainingEffects(t *testing.T) {
	for _, row := range []struct {
		name, before, operand string
		browser, mixed        bool
	}{
		{"symbol-input-browser", `const input={get key(){return document.title;}};const key=Symbol.for(input.key);`, "key", true, false},
		{"symbol-input-quiet", `const input={get key(){return 'label';}};const key=Symbol.for(input.key);`, "key", false, false},
		{"mixed-callable", `const key:any={toString:props.useKnown?()=>document.title:props.foreign};`, "key", true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			f := componentDescriptorKeyFixture(t, componentDescriptorKeyPage(row.before, row.operand))
			session := NewSession()
			r := checkComponentDescriptorKey(t, session, f, row.browser, false)
			if !row.mixed {
				return
			}
			page := findCallable(t, r.Analysis.Callables, "Page")
			attributed := false
			for _, effect := range page.EffectSources {
				if effect.Environment != "unknown" || effect.fieldOrigin == nil || effect.fieldOrigin.operation == nil {
					continue
				}
				// This proves unresolved field acquisition, not invocation. Native
				// retrieval's generic MAY cannot supply this authored operation.
				field := sourceText(ast.GetSourceFileOfNode(effect.fieldOrigin.operation), effect.fieldOrigin.operation)
				attributed = attributed || field == "props.foreign"
			}
			if !attributed {
				t.Fatal("authored foreign-field debt UNREACHED; generic native uncertainty is not evidence")
			}
		})
	}
}
