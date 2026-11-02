package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// BenchmarkAccessorResultAnalyze includes checker setup and completed source
// analysis. The joined callbacks exercise repeated selection with distinct captures.
func BenchmarkAccessorResultAnalyze(b *testing.B) {
	for _, row := range []struct{ name, source string }{
		{"small", `function make(input:{value:string}){return {get value(){return input.value}}}export const value=make({get value(){return document.title}}).value;`},
		{"joined-callbacks", reentrantCallbackSource},
	} {
		b.Run(row.name, func(b *testing.B) {
			var work int
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				session := NewSession()
				response := session.Execute(Request{Kind: "analyze", ID: "/virtual/accessor-result.ts", Source: row.source, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					b.Fatal(response.Error, response.Diagnostics)
				}
				for _, project := range session.projects {
					if project.callableCache != nil {
						work += project.callableCache.owner.values.work
					}
				}
			}
			b.ReportMetric(float64(work)/float64(b.N), "work/op")
		})
	}
}

var accessorResultSink accessorCandidates

// BenchmarkAccessorResultTraversal excludes checker setup to expose traversal
// scratch allocation. Each query still performs the ordinary dependency analysis.
func BenchmarkAccessorResultTraversal(b *testing.B) {
	const source = `export const value=({a:{b:{c:"safe"}}}).a.b.c;`
	session := NewSession()
	request := Request{Kind: "analyze", ID: "/virtual/accessor-traversal.ts", Source: source, Diagnostics: "semantic"}
	response := session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		b.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(request.ID)
		if file == nil {
			continue
		}
		var expression *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsVariableDeclaration(node) && node.Name().Text() == "value" {
				expression = node.Initializer()
				return false
			}
			return true
		})
		if expression == nil {
			b.Fatal("missing traversal source")
		}
		owner := project.callableCache.owner
		var work int
		run := func() accessorCandidates {
			q := newSourceDependencyQuery(expression, owner.values.checker, owner, nil)
			result := q.accessors(expression, nil, "", accessorAcquire, nil, nil)
			work += q.owner.work
			return result
		}
		got := run()
		if got.opaque || len(got.values) != 1 {
			b.Fatalf("invalid traversal control: opaque=%v values=%d", got.opaque, len(got.values))
		}
		work = 0
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			accessorResultSink = run()
		}
		b.StopTimer()
		b.ReportMetric(float64(work)/float64(b.N), "work/op")
		return
	}
	b.Fatal("missing traversal project")
}

// A repeated receiver with a shorter projection is finite. Repeating the same
// projection must still stop conservatively without losing an adjacent effect.
func TestAccessorTraversalProjectionControls(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"shorter projection", `type Link={readonly self:Link;value:string};const root:Link={get self(){return root},value:'safe'};export const value=root.self.self.value;`, false},
		{"cycle beside effect", `declare const pick:boolean;const root:{value:string}={get value():string{if(pick)return root.value;return document.title}};export const value=root.value;`, true},
		{"sibling reuse", `const item={get value(){return document.title}};const root={a:item,b:item};export const value=root.a.value+root.b.value;`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/active-trail.ts", Source: row.source, Diagnostics: "semantic"})
			browser, _ := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser {
				t.Fatalf("browser=%v want %v", browser, row.browser)
			}
		})
	}
}

func TestAccessorTraversalProjectionEmitted(t *testing.T) {
	const source = `export function read(){const events:string[]=[];type Link={readonly self:Link;value:string};const root:Link={get self(){events.push('self');return root},get value(){events.push('value');return 'safe'}};return [root.self.self.value,root.value,events]}`
	sourceNodeScript(t, source, `const fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});const actual=JSON.stringify(out.read());if(actual!==JSON.stringify(['safe','safe',['self','self','value','value']]))throw Error(actual);`)
}
