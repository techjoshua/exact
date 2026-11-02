package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

const sharedFactoryCacheSource = `let cached:{field:{value:string}}|undefined;function make(){if(!cached)cached={field:{value:'safe'}};return{box:cached}}function install(box:object,value:{value:string}){Object.defineProperty(box,'field',{value})}const a=make();const b=make();const donor={get value(){return document.title}};install(a.box,donor);export const value=b.box.field.value;`

// The cache is shared across Calls. A returned envelope cannot make its nested
// mutable cell private, and a missing source value must not erase the donor.
func TestSharedFactoryCacheSource(t *testing.T) {
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/shared-factory-cache.ts", Source: sharedFactoryCacheSource, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, r, sharedFactoryCacheSource, true)
	if !browser || !unknown {
		t.Fatalf("shared cache lost donor or residual: browser=%v unknown=%v", browser, unknown)
	}
}

// Qualify JavaScript aliasing independently of the analysis expectation.
func TestSharedFactoryCacheRuntime(t *testing.T) {
	sourceNodeScript(t, sharedFactoryCacheSource+`export const shared=a.box===b.box;`, `const fs=require('node:fs'),vm=require('node:vm'),out={};let gets=0;vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,document:{get title(){gets++;return 'donor'}},process:{cwd(){gets++;return 'donor'}}});if(!out.shared||out.value!=='donor'||gets!==1)throw Error(JSON.stringify({shared:out.shared,value:out.value,gets}));`)
}

// An initializer-free module cell retains source RHS alternatives even when no
// reflective writer exists. This protects the producer before member matching.
func TestSharedFactoryCacheProducer(t *testing.T) {
	source := `let cached:{field:{value:string}}|undefined;function make(){if(!cached)cached={field:{get value(){return document.title}}};return{box:cached}}const a=make();const b=make();export const value=b.box.field.value;`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/shared-cache-producer.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, r, source, true)
	if !browser {
		t.Errorf("cache producer lost browser, unknown=%v", unknown)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/shared-cache-producer.ts")
		if file == nil {
			continue
		}
		var read, allocation *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsShorthandPropertyAssignment(n) && n.Name().Text() == "cached" {
				read = n.Name()
			}
			if ast.IsPropertyAssignment(n) && n.Name().Text() == "box" {
				read = n.Initializer()
			}
			if ast.IsBinaryExpression(n) && ast.IsIdentifier(n.AsBinaryExpression().Left) && n.AsBinaryExpression().Left.Text() == "cached" {
				allocation = n.AsBinaryExpression().Right
			}
			return true
		})
		if read == nil || allocation == nil {
			t.Fatal("missing cache read/write")
		}
		q := newSourceDependencyQuery(read, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(read))
		part := accessorCandidates{}
		values := q.originsAt(read, read, nil, &part)
		found := false
		for _, v := range values {
			found = found || v.node == allocation
		}
		if !found {
			t.Errorf("first missing cache RHS origin: %d terms, opaque=%v", len(values), part.opaque)
		}
		if !part.opaque || q.inputs != nil || q.operation != nil {
			t.Error("source writer joined without its residual or retained normal inputs")
		}
		for _, term := range values {
			if term.normal != nil || term.acquired != nil {
				t.Error("source RHS acquired a normal observation")
			}
		}
	}
}

// Cross the shared-cell producer with original writer/read order and separate
// envelopes. Unknown entry state remains a residual beside each known donor.
func TestSharedFactoryCacheControls(t *testing.T) {
	const shared = `let cached:{field:{value:string}}|undefined;function make(){if(!cached)cached={field:{value:'safe'}};return{box:cached}}`
	const fresh = `function make(){return{box:{field:{value:'safe'}}}}`
	const install = `function install(box:object,value:{value:string}){Object.defineProperty(box,'field',{value})}const a=make();const b=make();const donor={get value(){return document.title}};const safe={value:'safe'};`
	for _, row := range []struct {
		name, factory, tail string
		browser, unknown    bool
	}{
		{"shared", shared, `install(a.box,donor);export const value=b.box.field.value;`, true, true},
		{"safe", shared, `install(a.box,safe);export const value=b.box.field.value;`, false, false},
		{"sibling", fresh, `install(a.box,donor);export const value=b.box.field.value;`, false, false},
		{"reversed shared", shared, `install(b.box,donor);export const value=a.box.field.value;`, true, true},
		{"reversed sibling", fresh, `install(b.box,donor);export const value=a.box.field.value;`, false, false},
		{"multiple creates", shared, `const c=make();install(a.box,donor);export const value=c.box.field.value;`, true, true},
		{"read before write", shared, `export const value=b.box.field.value;install(a.box,donor);`, false, false},
		{"read between writes", shared, `install(a.box,donor);export const value=b.box.field.value;install(a.box,safe);`, true, true},
		{"unknown target", shared, `declare const choose:boolean;declare const foreign:{field:{value:string}};install(choose?a.box:foreign,donor);export const value=b.box.field.value;`, true, true},
		{"thrown callee", shared, `const host={get selected():typeof install{throw 'stop'}};host.selected(a.box,donor);export const value=b.box.field.value;`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.factory + install + row.tail
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/shared-cache-control.ts", Source: source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, source, true)
			if browser != row.browser || row.unknown && !unknown {
				t.Fatalf("browser=%v want=%v unknown=%v require=%v", browser, row.browser, unknown, row.unknown)
			}
		})
	}
}

func TestSharedFactoryCacheSourceReplacement(t *testing.T) {
	session := NewSession()
	for _, source := range []string{sharedFactoryCacheSource, `const safe={field:{value:'safe'}};export const value=safe.field.value;`, sharedFactoryCacheSource} {
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/shared-cache-replacement.ts", Source: source, Diagnostics: "semantic"})
		browser, _ := reentrantInitializerEffects(t, r, source, true)
		if browser != (source == sharedFactoryCacheSource) {
			t.Fatal("source replacement reused another generation's donor")
		}
	}
}

func TestSharedFactoryCacheEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			source := sharedFactoryCacheSource + `export const shared=a.box===b.box;`
			if target == TargetServer {
				source = `declare const process:{cwd():string};` + strings.ReplaceAll(source, "document.title", "process.cwd()")
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/shared-cache-emitted.ts", Source: source, Diagnostics: "semantic", Target: target, PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("emission: %s %#v", r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),out={};let gets=0;vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,document:{get title(){gets++;return 'donor'}},process:{cwd(){gets++;return 'donor'}}});if(!out.shared||out.value!=='donor'||gets!==1)throw Error(JSON.stringify({shared:out.shared,value:out.value,gets}));`)
		})
	}
}

// A module cell keeps the RHS acquired by the original factory Call. Later
// replacement of the caller's argument variable cannot retarget that input.
func TestSharedFactoryCacheCapturedRHS(t *testing.T) {
	for _, donorFirst := range []bool{false, true} {
		first, later := "safe", "donor"
		if donorFirst {
			first, later = "donor", "safe"
		}
		source := `let cached:{field:{value:string}}|undefined;function make(value:{field:{value:string}}){if(!cached)cached=value;return{box:cached}}const donor={field:{get value(){return document.title}}};const safe={field:{value:'safe'}};let current=` + first + `;const a=make(current);current=` + later + `;const b=make(safe);export const value=b.box.field.value;`
		r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/shared-cache-captured-rhs.ts", Source: source, Diagnostics: "semantic"})
		browser, unknown := reentrantInitializerEffects(t, r, source, true)
		if browser != donorFirst || !unknown {
			t.Fatalf("donorFirst=%v browser=%v unknown=%v", donorFirst, browser, unknown)
		}
	}
}

// Index-only constructor and accessor bodies cannot supply a source writer Call.
func TestSharedFactoryCacheDormantWriters(t *testing.T) {
	for _, writer := range []string{`class Unused{constructor(){cached={field:{get value(){return document.title}}}}}`, `const unused={get install(){cached={field:{get value(){return document.title}}};return 0}};`} {
		source := `let cached:{field:{value:string}}|undefined;` + writer + `function read(){return cached?.field.value}export const value=read();`
		r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/cache-dormant.ts", Source: source, Diagnostics: "semantic"})
		browser, unknown := reentrantInitializerEffects(t, r, source, true)
		if browser {
			t.Errorf("unentered writer browser=%v unknown=%v: %s", browser, unknown, writer)
		}
	}
}

// An existing source body context still admits its own constructor/accessor writes.
func TestSharedFactoryCacheEnteredWriters(t *testing.T) {
	for _, tail := range []string{`const host={get selected(){cached={field:{get value(){return document.title}}};return cached.field.value}};export const value=host.selected;`, `class Selected{constructor(){cached={field:{get value(){return document.title}}};cached.field.value}}export const value=new Selected();`} {
		source := `let cached:{field:{value:string}}|undefined;` + tail
		r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/cache-entered.ts", Source: source, Diagnostics: "semantic"})
		browser, unknown := reentrantInitializerEffects(t, r, source, true)
		if !browser {
			t.Errorf("entered writer lost browser, unknown=%v: %s", unknown, tail)
		}
	}
}

// Earlier RHS Get effects remain at the writer, independently of returned data.
func TestSharedFactoryCacheEarlierRHSGet(t *testing.T) {
	source := `let cached:{field:{value:string}}|undefined;const seed={get selected(){document.title;return {field:{value:'safe'}}}};function make(){if(!cached)cached=seed.selected;return{box:cached}}const a=make();const b=make();export const value=b.box.field.value;`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/cache-earlier-get.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, r, source, true)
	if browser || !unknown {
		t.Fatalf("earlier RHS Get moved to later read or lost residual: browser=%v unknown=%v", browser, unknown)
	}
	make := findCallable(t, r.Analysis.Callables, "make")
	writerBrowser := false
	for _, effect := range make.EffectSources {
		writerBrowser = writerBrowser || effect.Environment == "browser"
	}
	if !writerBrowser {
		t.Fatal("writer lost its own RHS Get effect")
	}
	sourceNodeScript(t, source, `const fs=require('node:fs'),vm=require('node:vm'),out={};let gets=0;vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,document:{get title(){gets++;return 'browser'}}});if(out.value!=='safe'||gets!==1)throw Error(JSON.stringify({value:out.value,gets}));`)
}
