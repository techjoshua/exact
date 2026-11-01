package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Construction and a later Get have independent effect obligations. Authored
// field initializers cannot account for decorator work or foreign result objects.
func TestConstructionResultResiduals(t *testing.T) {
	for _, fixture := range []struct {
		name, declarations string
		outcomes           []string
		browserReads       int
		knownBrowser       bool
	}{
		{"decorated-field", `function decorate(_:undefined,context:ClassFieldDecoratorContext<unknown,string>){return function(value:string){return document.title}}class Box{@decorate value="safe"}`, []string{"browser"}, 1, false},
		{"decorated-field-with-constructor-donor", `function decorate(_:undefined,context:ClassFieldDecoratorContext<unknown,string>){return function(value:string){return document.title}}class Box{@decorate value="safe";constructor(){void document.title}}`, []string{"browser"}, 2, true},
		{"decorated-method-initializer", `function decorate(_:Function,context:ClassMethodDecoratorContext){context.addInitializer(function(){void document.title})}class Box{@decorate method(){}value="browser"}`, []string{"browser"}, 1, false},
		{"mixed-constructors", `declare const flag:boolean;class Safe{value="safe"}function Foreign(){return{get value(){return document.title}}}const Box=(flag?Safe:Foreign)as unknown as typeof Safe;`, []string{"safe", "browser"}, 1, false},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			source := fixture.declarations + `export function read(){return new Box().value}`
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/construction-result.ts", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s source: %s %#v", target, response.Error, response.Diagnostics)
				}
				unknown, browser := false, false
				for _, effect := range executableSummary(t, response, "read").EffectSources {
					unknown = unknown || effect.Opaque
					browser = browser || effect.Environment == "browser"
				}
				if !unknown || fixture.knownBrowser && !browser {
					t.Fatalf("%s lost independent result obligation or known constructor donor", target)
				}
				for _, outcome := range fixture.outcomes {
					sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');const exports={};let reads=0;const expected=process.argv[2];const document={get title(){reads++;return 'browser'}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,document,flag:expected==='safe'});const value=exports.read();const expectedReads=expected==='browser'?Number(process.argv[3]):0;if(value!==expected||reads!==expectedReads)throw Error(JSON.stringify({value,reads,expected,expectedReads}));`, outcome, fmt.Sprint(fixture.browserReads))
				}
				eagerSource := fixture.declarations + `export const value=new Box().value`
				denied := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/construction-result-eager.ts", Source: eagerSource, Target: target, SourceMap: true, Diagnostics: "semantic"})
				if fixture.knownBrowser && target == TargetClient {
					// Existing target-local authorization retains the opaque fact.
					if denied.Error != "" || hasErrorDiagnostic(denied.Diagnostics) || denied.Code == "" {
						t.Fatalf("known browser target lost authorization: %s %#v", denied.Error, denied.Diagnostics)
					}
					initializer := executableSummary(t, denied, fmt.Sprint("module@", strings.LastIndex(eagerSource, "export const value=")))
					if !containsString(initializer.ArtifactTargets, "client") || containsString(initializer.ArtifactTargets, "server") {
						t.Fatalf("target-local allowance lost its owning target facts: %#v", initializer)
					}
					sourceNodeScript(t, denied.Code, `const fs=require('node:fs'),vm=require('node:vm');const exports={};let reads=0;const document={get title(){reads++;return 'browser'}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,document});if(exports.value!=='browser'||reads!==2)throw Error(JSON.stringify({value:exports.value,reads}));`)
					continue
				}
				placement := false
				for _, diagnostic := range denied.Diagnostics {
					placement = placement || diagnostic.Severity == "error" && diagnostic.Code == "EXACT2101"
				}
				if denied.Error != "" || !placement || denied.Code != "" || denied.SourceMap != nil {
					for _, summary := range denied.Analysis.Callables {
						if summary.Kind == "module-initializer" {
							t.Logf("initializer %s effect=%s targets=%v sources=%#v", summary.Name, summary.Effect, summary.ArtifactTargets, summary.EffectSources)
						}
					}
					t.Fatalf("%s eager unresolved placement emitted an artifact: %s %#v", target, denied.Error, denied.Diagnostics)
				}
			}
		})
	}
}
