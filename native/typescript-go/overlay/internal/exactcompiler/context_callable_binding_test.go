package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A shared token permits reading the value. Invoking a method still depends on
// its implementation, including when a local binding shadows the selected value.
func TestNullableContextCallableBinding(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, initializer := range []string{"this.getContext(Token)", "this.hasContext(Token)?this.getContext(Token):undefined", "this.hasContext(Token)?this.getContext(Token):null", "this.hasContext(Token)?undefined:this.getContext(Token)", "this.hasContext(Token)?null:this.getContext(Token)"} {
		for _, row := range []struct{ body, placement string }{
			{"void parent;", "isomorphic"},
			{"parent?.run();", "unknown"},
			{"{const parent={run(){return document.title}};parent.run();}", "client"},
		} {
			source := `import{createContext,type Component}from'@exactjs/core';const Token=createContext<{run():void}>('portable',{keep:'shared'});export function Page(this:Component<{}>){const parent=` + initializer + `;` + row.body + `return()=> <p/>;}`
			r := formsCompileSource(t, root, config, source, TargetServer)
			if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, formsDiagnosticDetails(r.Diagnostics))
			}
			component := findComponent(t, r.Analysis.Components, "Page")
			if component.Placement != row.placement || !containsContextEffect(component.Contexts, "Token", "read") {
				t.Fatalf("%s / %s: placement=%s contexts=%v", initializer, row.body, component.Placement, component.Contexts)
			}
		}
	}
}

// A portable selected library declaration does not close structural props Gets
// or callback element inputs. Mutable and readonly views retain that same limit.
func TestReadonlyArrayAliasCallablePlacement(t *testing.T) {
	source := `export {};declare global{interface ReadonlyArray<T>{custom():void;}}type Pattern=readonly {value:number}[];function project(pattern:Pattern){return pattern.map(node=>node.value);}export function Page(props:{pattern:Pattern}){const values=project(props.pattern);return()=> <p>{values.join(',')}</p>;}`
	for _, readonly := range []bool{true, false} {
		current := source
		if !readonly {
			current = strings.Replace(current, "type Pattern=readonly ", "type Pattern=", 1)
		}
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: "readonly-pattern.tsx", Target: TargetServer, Source: current})
		if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("structural input acquired authority readonly=%v: %#v %#v", readonly, r.Analysis.Components, r.Diagnostics)
		}
		assertSelectedCollectionMethod(t, session, "readonly-pattern.tsx", "map", true)
	}
}

// assertSelectedCollectionMethod checks the existing selected-declaration contract
// independently of the unowned structural receiver's Get and callback effects.
func assertSelectedCollectionMethod(t *testing.T, session *Session, id, method string, native bool) {
	t.Helper()
	found := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		source := project.program.GetSourceFile(id)
		if source == nil {
			continue
		}
		walkNode(source.AsNode(), func(n *ast.Node) bool {
			if !ast.IsCallExpression(n) {
				return true
			}
			expression := n.AsCallExpression().Expression
			if !ast.IsPropertyAccessExpression(expression) || expression.AsPropertyAccessExpression().Name().Text() != method {
				return true
			}
			found = true
			environment := receiverTypeEnvironment(expression, project.callableCache.owner.checker)
			if (environment == "neutral") != native {
				t.Errorf("selected %s native=%v environment=%s", method, native, environment)
			}
			return true
		})
	}
	if !found {
		t.Fatalf("missing actual selected %s", method)
	}
}

// An unproven alternative or reassigned alias cannot inherit context authority.
func TestContextCallableBindingUnprovenSelection(t *testing.T) {
	for _, selection := range []string{
		"const parent=this.hasContext(Token)?this.getContext(Token):outside;",
		"let parent=this.getContext(Token);parent=outside;",
		"const undefined=outside;const parent=this.hasContext(Token)?this.getContext(Token):undefined;",
	} {
		source := `import{createContext,type Component}from'@exactjs/core';const Token=createContext<{run():void}>('portable',{keep:'shared'});declare const outside:{run():void};export function Page(this:Component<{}>){` + selection + `parent.run();return()=> <p/>;}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "unproven-context.tsx", Target: TargetServer, Source: source})
		if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("unproven selection acquired context authority: %s %#v %#v", selection, r.Analysis.Components, r.Diagnostics)
		}
	}
}

// A method added by an application to a native collection remains opaque.
func TestAugmentedCollectionMethodKeepsOwnAuthority(t *testing.T) {
	source := `export {};declare global{interface ReadonlyArray<T>{custom():void;}}type Pattern=readonly number[];export function Page(props:{pattern:Pattern}){props.pattern.custom();return()=> <p/>;}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "augmented-pattern.tsx", Target: TargetServer, Source: source})
	if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
		t.Fatalf("added method acquired native authority: %#v %#v", r.Analysis.Components, r.Diagnostics)
	}
}

// Standard collection members and augmentation members keep distinct authority
// through type aliases across mutable and read-only native receiver families.
func TestAugmentedCollectionMemberFamilies(t *testing.T) {
	for _, collection := range []struct{ declaration, view, call string }{
		{"Array<T>", "number[]", "map(value=>value)"},
		{"ReadonlyArray<T>", "readonly number[]", "map(value=>value)"},
		{"Map<K,V>", "Map<string,number>", "has('x')"},
		{"ReadonlyMap<K,V>", "ReadonlyMap<string,number>", "has('x')"},
		{"Set<T>", "Set<string>", "has('x')"},
		{"ReadonlySet<T>", "ReadonlySet<string>", "has('x')"},
	} {
		for _, custom := range []bool{false, true} {
			call := collection.call
			if custom {
				call = "custom()"
			}
			source := `export {};declare global{interface ` + collection.declaration + `{custom():void;}}type View=` + collection.view + `;export function Page(props:{value:View}){const selected=props.value.` + call + `;return()=> <p>{String(selected)}</p>;}`
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "collection-augmentation.tsx", Target: TargetServer, Source: source})
			if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
				t.Fatalf("%s custom=%v changed structural input authority: %#v %#v", collection.view, custom, r.Analysis.Components, r.Diagnostics)
			}
			assertSelectedCollectionMethod(t, session, "collection-augmentation.tsx", strings.Split(call, "(")[0], !custom)
		}
	}
}

// Declaration provenance, rather than a familiar collection name, owns portable
// execution authority. Global extensions and namespaced lookalikes remain opaque.
func TestCollectionDeclarationAuthorityControls(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	declarations := filepath.Join(root, "lib.es.fixture.d.ts")
	entry := filepath.Join(root, "view.tsx")
	for file, source := range map[string]string{
		config:       `{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","jsx":"preserve","skipLibCheck":true},"include":["*.tsx","*.d.ts"]}`,
		declarations: `interface Array<T>{custom():number;}interface ReadonlyArray<T>{custom():number;}interface Map<K,V>{custom():number;}interface Set<T>{custom():number;}interface Date{custom():number;}interface String{custom():number;}interface Headers{custom():number;}interface EventTarget{custom():number;}interface Math{custom():number;}interface JSON{custom():number;}interface ArrayConstructor{custom():number;}interface DateConstructor{custom():number;}interface PromiseConstructor{custom():number;}interface Console{custom():number;}declare namespace Shadow{interface Array<T>{map():number;}}`,
	} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct{ view, call, placement string }{
		{"readonly number[]", "custom()", "unknown"},
		{"readonly number[]", "map(value=>value)", "isomorphic"},
		{"Shadow.Array<number>", "map()", "unknown"},
		{"number[]", "custom()", "unknown"},
		{"Map<string,number>", "custom()", "unknown"},
		{"Map<string,number>", "has('x')", "isomorphic"},
		{"Set<string>", "custom()", "unknown"},
		{"Set<string>", "has('x')", "isomorphic"},
		{"Date", "custom()", "unknown"},
		{"Date", "getTime()", "isomorphic"},
		{"string", "custom()", "unknown"},
		{"string", "slice(1)", "isomorphic"},
		{"Headers", "custom()", "unknown"},
		{"Headers", "get('x')", "isomorphic"},
		{"EventTarget", "custom()", "unknown"},
		{"EventTarget", "addEventListener('x',()=>{})", "isomorphic"},
	} {
		source := `export function Page(props:{value:` + test.view + `}){const selected=props.value.` + test.call + `;return()=> <p>{String(selected)}</p>;}`
		if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetServer})
		if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("%s.%s acquired incorrect structural input authority: %#v %#v", test.view, test.call, r.Analysis.Components, r.Diagnostics)
		}
		assertSelectedCollectionMethod(t, session, entry, strings.Split(test.call, "(")[0], test.placement == "isomorphic")
	}
	for _, name := range []string{"Math", "JSON", "Array", "Date", "Promise", "console"} {
		source := `export function Page(){` + name + `.custom();return()=> <p/>;}`
		if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		session := NewSession()
		r := session.Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Source: source, Target: TargetServer})
		if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("%s static extension acquired portable authority: %#v", name, r.Analysis.Components)
		}
	}

}

// Shadowing a portable global cannot confer its execution contract on an
// opaque application service that happens to use the same authored name.
func TestShadowedUniversalCallRootAuthority(t *testing.T) {
	for _, test := range []struct{ name, valid string }{
		{"Math", "Math.abs(1)"}, {"JSON", "JSON.stringify({})"}, {"Array", "Array.isArray([])"},
		{"Date", "Date.now()"}, {"Promise", "Promise.resolve(1)"}, {"console", "console.log('value')"},
	} {
		for _, variant := range []struct{ source, placement string }{
			{`declare const ` + test.name + `:{read():number};export function Page(){` + test.name + `.read();return()=> <p/>;}`, "unknown"},
			{`export function Page(` + test.name + `:{read():number}){` + test.name + `.read();return()=> <p/>;}`, "unknown"},
			{`export function Page(){` + test.valid + `;return()=> <p/>;}`, "isomorphic"},

			{`const ` + test.name + `={read(){return 1}};export function Page(){` + test.name + `.read();return()=> <p/>;}`, "isomorphic"},
		} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "shadowed-root.tsx", Target: TargetServer, Source: variant.source})
			if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Placement != variant.placement {
				t.Fatalf("%s root placement should be %s: %#v", test.name, variant.placement, r.Analysis.Components)
			}
		}
	}
}
