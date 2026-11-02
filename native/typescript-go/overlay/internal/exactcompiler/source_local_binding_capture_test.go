package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Local binding elements apply current writes at their body or captured-return
// cut. Binding-time getters still execute before a later replacement.
func TestLocalBindingCaptureCurrentValues(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"replaced", `function make(input:{inner:{value:string}}){let {inner:alias}=input;const read=()=>alias.value;alias={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"current owner", `function make(input:{inner:{value:string}}){let {inner:alias}=input;alias={value:"safe"};return alias.value}export const value=make({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"binding getter", `function make(input:{inner:{value:string}}){let {inner:alias}=input;alias={value:"safe"};return ()=>alias.value}export const value=make({get inner(){document.title;return {value:"old"}}})();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}

// A foreign replacement retains its independent residual.
// Current-value substitution cannot certify an unacquired or foreign Get.
func TestLocalBindingCaptureResiduals(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"foreign", `declare function foreign():{value:string};function make(input:{inner:{value:string}}){let {inner:alias}=input;alias=foreign();return ()=>alias.value}export const value=make({inner:{value:"safe"}})();`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/local-binding-residual.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser || !unknown {
				t.Fatal("local binding lost donor or residual", browser, unknown)
			}
		})
	}
}

// Binding-time getters, intervening setters and the returned closure's current
// Get remain ordered and once-only in both emitted targets.
func TestLocalBindingCaptureEmitted(t *testing.T) {
	const source = `export function run(){const trace:string[]=[];function make(input:{inner:{value:string}}){let {inner:alias}=input;alias={get value(){trace.push("get");return "safe"},set value(value:string){trace.push("set:"+value)}};const read=()=>alias.value;alias.value="changed";return read}const read=make({get inner(){trace.push("bind");return {value:"old"}}});trace.push("created");trace.push(read());return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/local-binding-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run()),['bind','set:changed','created','get','safe']);`)
		})
	}
}

// Naming the binding's original Get is source-only. The same authored operation
// must not enroll a normal descriptor demand or borrow an own-slot certificate.
func TestLocalBindingGetDemandModes(t *testing.T) {
	const source = `function make(input:{inner:{value:string}}){let {inner:alias}=input;alias={value:"safe"};return ()=>alias.value}export const value=make({inner:{value:"old"}})();`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/local-binding-demand.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/local-binding-demand.ts")
		if file == nil {
			continue
		}
		walkNode(file.AsNode(), func(operation *ast.Node) bool {
			if !ast.IsBindingElement(operation) {
				return true
			}
			found = true
			query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(operation))
			demand := query.operationFieldDemand(operation, "inner")
			if demand.declaration == nil || demand.operation != operation || demand.slot == nil || !ast.IsParameterDeclaration(demand.slot) {
				t.Fatal("binding Get lost original operation or input slot")
			}
			query.dependenciesOnly = false
			if normal := query.operationFieldDemand(operation, "inner"); normal.declaration != nil {
				t.Fatal("source binding Get granted normal descriptor demand")
			}
			return false
		})
	}
	if !found {
		t.Fatal("missing binding Get witness")
	}
}
