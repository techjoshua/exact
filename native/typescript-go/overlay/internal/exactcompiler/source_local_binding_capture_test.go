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

// Initial binding Gets retain their source values when a saved alias or later
// source-input replacement outlives the original pattern acquisition.
func TestLocalBindingInitialCaptures(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"retained object mutation", `function make(input:{inner:{value:string}}){const {inner:alias}=input;alias.value=document.title;return ()=>alias.value}export const value=make({inner:{value:"old"}})();`, "client"},

		{"write before binding", `function make(input:{inner:{value:string}}){input.inner={get value(){return document.title}};const {inner:alias}=input;input.inner={value:"safe"};return ()=>alias.value}export const value=make({inner:{value:"old"}})();`, "client"},
		{"explicit undefined default alternatives", `declare const choose:boolean;function make(input:{inner:{value:string}|undefined}){const {inner:alias={value:"safe"}}=input;return ()=>alias.value}export const value=make({inner:choose?undefined:{value:"safe"}})();`, "isomorphic"},

		{"getter snapshot", `function make(){let current={get value(){return document.title}};const source={get inner(){return current}};const {inner:alias}=source;current={value:"safe"};return ()=>alias.value}export const value=make()();`, "client"},
		{"source member replacement", `function make(input:{inner:{value:string}}){const {inner:alias}=input;input.inner={value:"safe"};return ()=>alias.value}export const value=make({inner:{get value(){return document.title}}})();`, "client"},

		{"old alias", `function make(input:{inner:{value:string}}){let {inner:alias}=input;const old=alias;alias={value:"safe"};return ()=>old.value}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"source replacement", `function make(input:{inner:{value:string}}){const {inner:alias}=input;input={inner:{value:"safe"}};return ()=>alias.value}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}

// A branch between represented source alternatives contributes their known
// effects. A foreign value still contributes its separate unknown Get.
func TestLocalBindingInitialCaptureAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"known conditional", `declare const choose:boolean;function make(input:{inner:{value:string}}){let {inner:alias}=input;if(choose)alias={get value(){return document.title}};return ()=>alias.value}export const value=make({inner:{value:"safe"}})();`, true, false},
		{"foreign initial", `declare function foreign():{inner:{value:string}};function make(input:{inner:{value:string}}){const {inner:alias}=input;return ()=>alias.value}export const value=make(foreign())();`, false, true},
		{"mixed initial", `declare const choose:boolean;declare function foreign():{value:string};function make(input:{inner:{value:string}}){const {inner:alias}=input;return ()=>alias.value}export const value=make({inner:choose?{get value(){return document.title}}:foreign()})();`, true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/initial-binding-alternatives.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, response, row.source, true)
			if browser != row.browser || unknown != row.unknown {
				t.Fatal("initial capture lost known or unknown alternative", browser, unknown)
			}
		})
	}
}

// Earlier factory Gets remain at that original initializer when a later
// observation follows the captured value relationship.
func TestLocalBindingInitialCapturePhases(t *testing.T) {
	const source = `function make(input:{inner:{value:string}}){const {inner:alias}=input;return ()=>alias.value}const read=make({get inner(){document.title;return {value:"safe"}}});export const value=read();`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/initial-binding-phases.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, response, source, true)
	if browser || unknown {
		t.Fatal("captured projection replayed earlier Get or lost value", browser, unknown)
	}
}

// Emitted execution retains the original Getter's returned object even after
// its captured source changes. Repeated reads never execute that binding Get.
func TestLocalBindingInitialCaptureEmitted(t *testing.T) {
	const source = `export function run(){const trace:string[]=[];function make(){let current={get value(){trace.push("old");return "old"}};const source={get inner(){trace.push("bind");return current}};const {inner:alias}=source;const saved=alias;current={value:"new"};return ()=>saved.value}const read=make();trace.push("created");trace.push(read());trace.push(read());return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/initial-binding-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run()),['bind','created','old','old','old','old']);`)
		})
	}
}

// Initial capture projection requires its source creator, restores the original
// cut, and cannot enroll normal outputs, Get certificates or caller bindings.
func TestLocalBindingInitialCaptureAuthority(t *testing.T) {
	const source = `function make(input:{inner:{value:string}}){const {inner:alias}=input;return ()=>alias.value}export const value=make({inner:{value:"safe"}})();`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/initial-binding-authority.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/initial-binding-authority.ts")
		if file == nil {
			continue
		}
		var factory, call, slot *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsFunctionDeclaration(node) {
				factory = node
			}
			if ast.IsBindingElement(node) {
				slot = node
			}
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "make" {
				call = node
			}
			return true
		})
		if factory == nil || call == nil || slot == nil {
			t.Fatal("missing source capture witness")
		}
		found = true
		checker := project.callableCache.owner.values.checker
		symbol := checker.GetSymbolAtLocation(slot.Name())
		parameter := checker.GetSymbolAtLocation(factory.Parameters()[0].Name())
		actual := call.AsCallExpression().Arguments.Nodes[0]
		bindings := sourceValueBindings{ast.GetSymbolId(parameter): {{node: actual}}}
		query := newSourceDependencyQuery(call, checker, project.callableCache.owner, nil)
		part := accessorCandidates{}
		if _, acquired := query.sourceLocalBindingValues(symbol, bindings, &part); acquired {
			t.Fatal("uninstantiated summary acquired local capture")
		}
		query.creators = map[*ast.Node]sourceValueCreation{factory: {invocation: call}}
		values, acquired := query.sourceLocalBindingValues(symbol, bindings, &part)
		if !acquired || len(values) != 1 || values[0].node == nil || values[0].normal != nil || values[0].acquired != nil || values[0].entrySlot != nil {
			t.Fatal("initial source capture lost value or granted normal authority")
		}
		if len(bindings) != 1 || bindings[ast.GetSymbolId(parameter)][0].node != actual || query.reading != call || query.initializing != nil || query.returning != nil || query.inputs != nil || query.pendingWriterInput != nil || len(query.active) != 0 {
			t.Fatal("initial source capture changed caller or leaked ownership")
		}
		if len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 || len(part.ownSlots) != 0 {
			t.Fatal("source capture published normal receipt")
		}
		query.dependenciesOnly = false
		if _, acquired := query.sourceLocalBindingValues(symbol, bindings, &part); acquired {
			t.Fatal("normal query borrowed source capture acquisition")
		}
	}
	if !found {
		t.Fatal("missing authority source")
	}
}
