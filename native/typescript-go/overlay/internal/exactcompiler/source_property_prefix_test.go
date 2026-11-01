package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A module-prefix bound uses actual indexed statement ownership. Lexical order
// cannot exclude a deferred body, a cyclic source or work in the current root.
func TestPropertyModulePrefixBoundary(t *testing.T) {
	const id = "/virtual/property-prefix.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `export {};const first=1;function deferred(){return document.title}const last=2;`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		source := project.program.GetSourceFile(id)
		if source == nil || project.callableCache == nil {
			continue
		}
		var first, last, deferred, bodyRead *ast.Node
		walkNode(source.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableStatement(node) {
				if first == nil {
					first = node
				} else {
					last = node
				}
			}
			if ast.IsFunctionDeclaration(node) {
				deferred = node
			}
			if ast.IsPropertyAccessExpression(node) {
				bodyRead = node
			}
			return true
		})
		if first == nil || last == nil || deferred == nil || bodyRead == nil {
			t.Fatal("missing authored boundary")
		}
		identity := &sourceNormalSourceIdentity{source: source, population: project.callableCache.owner.values.normalPopulation(source.AsNode())}
		view := &sourcePropertyReferenceView{root: first, source: source, normalSources: map[*ast.SourceFile]*sourceNormalSourceIdentity{source: identity}}
		if !propertyOperationAfterRoot(view, last) || propertyOperationAfterRoot(view, first) || propertyOperationAfterRoot(view, bodyRead) {
			t.Fatal("module order lost its exact statement/deferred boundary")
		}
		view.root = last
		if propertyOperationAfterRoot(view, first) {
			t.Fatal("earlier work was excluded")
		}
		view.root = deferred
		if propertyOperationAfterRoot(view, last) {
			t.Fatal("a deferred definition lent module execution order")
		}
		view.root = first
		identity.cyclic = true
		if propertyOperationAfterRoot(view, last) {
			t.Fatal("cyclic initialization granted a prefix bound")
		}
		checked = true
	}
	if !checked {
		t.Fatal("missing source-owned population")
	}
}

// An unknown external object may be a Proxy. Module ordering cannot supply the
// receiver identity or neutral DefineOwnProperty trap missing from that input.
func TestPropertyConversionRetainsUnknownTarget(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/property-external.ts", Source: `export {};declare const target:{call:()=>string};Object.defineProperty(target,'call',{value:()=> 'safe'});export const value=target.call();`, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	found := false
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT2101" {
			found = true
		}
	}
	for _, exported := range response.Analysis.Exports {
		if exported.Name == "value" && exported.Placement == "unknown" {
			found = true
		}
	}
	if !found {
		t.Fatal("a prefix bound granted missing external receiver authority")
	}
}

// A retained definition cannot lend a safe replacement to an eager read. A real
// runtime import cycle likewise cannot supply a closed descriptor prefix.
func TestPropertyEntryRefusals(t *testing.T) {
	for _, test := range []struct {
		name  string
		files map[string]string
	}{
		{"deferred-install", map[string]string{"entry.ts": `export {};function read(){return document.title}function unused(){Object.defineProperty(read,'call',{value:()=> 'safe'})}export const value=read.call(undefined);`}},
		{"runtime-import-cycle", map[string]string{"entry.ts": `import {read} from './helper.js';Object.defineProperty(read,'apply',{get(){return ()=> 'installed'},configurable:true});export const value=read.apply(undefined,[]);`, "helper.ts": `import {value} from './entry.js';export function read(){return 1}export const later=()=>value;`}},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := newExecutableFixture(t, test.files)
			response := fixture.session.Execute(fixture.request("analyze", "entry.ts"))
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
					t.Fatal("invalid authored control", response.Diagnostics)
				}
			}
			found := false
			for _, exported := range response.Analysis.Exports {
				if exported.Name == "value" {
					found = true
					if exported.Placement == "isomorphic" {
						t.Fatal("deferred/cyclic work supplied neutral replacement")
					}
				}
			}
			if !found {
				t.Fatal("lost authored value")
			}
		})
	}
}
