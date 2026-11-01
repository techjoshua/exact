package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"path/filepath"
	"strings"
	"testing"
)

// Each row protects one operation/owner handoff. Named effect requirements and
// explicit uncertainty are separate. No row grants successful payload authority.
func TestSettlementOperationHandoffs(t *testing.T) {
	for _, row := range []struct {
		name, source                                  string
		browser, moduleBrowser, unknown, childBrowser bool
	}{
		{"nested-entered", "function install(){Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(){window.name;return undefined}})}function start(){install()} start();async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", true, false, false, false},
		{"deferred-unentered", "function install(){Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(){window.name;return undefined}})}function start(){install()} async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", false, false, false, false},
		{"own-dynamic-this", "async function make(){return {kind:\"audit\",marker:undefined,get then(){this.kind;window.name;return this.marker}}}export async function read(){return (await make()).kind}", true, false, false, false},
		{"inherited-receiver-mutation", "Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(this:object){window.name;Object.defineProperty(this,\"kind\",{value:\"changed\"});return undefined}});async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", true, false, false, false},
		{"getter-zero-argument-default", "Object.defineProperty(Object.prototype,\"then\",{configurable:true,get:function(this:object,value=window.name){return undefined}});async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", true, false, false, false},
		{"installed-getter-capture", "function install(read:()=>string){Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(){read();return undefined}})}install(()=>window.name);async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", true, false, false, false},
		{"caller-default-stays-module", "function install(value=window.name){Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(){return undefined}})}install();async function make(){return {kind:\"audit\"}}export async function read(){return (await make()).kind}", false, true, false, false},
		{"own-mask", "function install(){Object.defineProperty(Object.prototype,\"then\",{configurable:true,get(){window.name;return undefined}})}function start(){install()} start();async function make(){return {kind:\"audit\",then:undefined}}export async function read(){return (await make()).kind}", false, false, false, false},
		{"callable-then-refuses", "async function make(){return {kind:\"audit\",get then(){window.name;return (onfulfilled:(value:{kind:string})=>unknown)=>onfulfilled({kind:\"other\"})}}}export async function read(){return (await make()).kind}", true, false, true, false},
		{"caller-default-child-host", "import {TaskContext} from '@exactjs/core';const actual={get value(){window.name;return 0}};async function child(v=actual.value,task:TaskContext=TaskContext.server()){return {kind:'audit',then:undefined}}export function read(){return child()}", true, false, false, false},
		{"child-settlement-host", "import {TaskContext} from '@exactjs/core';async function child(task:TaskContext=TaskContext.server()){return {kind:'audit',get then(){window.name;return undefined}}}export function read(){return child()}", true, false, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: "/virtual/settlement-handoff-" + row.name + ".ts", Source: row.source, Diagnostics: "semantic"}
			if row.name == "caller-default-child-host" || row.name == "child-settlement-host" {
				fixture := newExecutableFixture(t, map[string]string{"entry.ts": row.source})
				request = fixture.request("analyze", "entry.ts")
			}
			response := NewSession().Execute(request)

			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Errorf("invalid source: %#v", response.Diagnostics)
				return
			}
			var read *CallableSummary
			moduleBrowser, childBrowser := false, false
			for i := range response.Analysis.Callables {
				c := &response.Analysis.Callables[i]
				if c.Name == "read" {
					read = c
				}
				if c.Kind == "module-initializer" {
					moduleBrowser = moduleBrowser || settlementBrowser(*c)
				}
				if c.Name == "child" {
					childBrowser = settlementBrowser(*c)
				}
			}
			if read == nil {
				t.Error("missing read")
				return
			}
			if got := settlementBrowser(*read); got != row.browser {
				t.Errorf("read named browser=%v want=%v; effect=%s", got, row.browser, read.Effect)
			}
			if moduleBrowser != row.moduleBrowser {
				t.Errorf("module named browser=%v want=%v", moduleBrowser, row.moduleBrowser)
			}
			if row.childBrowser && !childBrowser {
				t.Error("child settlement lost named browser")
			}
			if row.unknown && read.Effect != "unknown" {
				t.Errorf("callable then granted result authority: %s", read.Effect)
			}
		})
	}
}

func settlementBrowser(c CallableSummary) bool {
	for _, e := range c.EffectSources {
		if e.Environment == "browser" && strings.Contains(e.Description, "window") {
			return true
		}
	}
	return false
}

// Only selected eager imports contribute. Sources remain ordinary typed modules.
func TestSettlementSelectedImport(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{
		"entry.ts":     `import {installed} from './installer.js';void installed;async function make(){return {kind:"audit"}}export async function read(){return (await make()).kind}`,
		"installer.ts": `function install(){Object.defineProperty(Object.prototype,"then",{configurable:true,get(){window.name;return undefined}})}function start(){install()}start();export const installed=true;`,
	})
	request := f.request("synchronize", "entry.ts")
	request.ExecutableSelection = &ExecutableSelection{Generation: 1, Revision: "settlement-handoff", Target: TargetDefault, Edges: []ExecutableEdge{{"entry.ts", 0, "./installer.js", "import", "installer.ts"}}}
	for _, name := range []string{"entry.ts", "installer.ts"} {
		source := f.files[name]
		id := filepath.Join(f.root, name)
		request.Sources = append(request.Sources, ProjectSource{ID: id, Source: source})
		request.ExecutableSelection.Modules = append(request.ExecutableSelection.Modules, ExecutableModule{ID: name, SourceID: id, ContentRevision: preparedContentRevision(source)})
	}
	response := f.session.Execute(request)

	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Errorf("invalid selection: %#v", response)
		return
	}
	request = f.request("analyze", "entry.ts")
	response = f.session.Execute(request)

	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Errorf("invalid entry: %#v", response)
		return
	}
	if !settlementBrowser(executableSummary(t, response, "read")) {
		t.Error("selected nested installer Get lost named browser")
	}
}

// Task status retains the same object before resolution. These source cases must
// not turn a static result type/origin into a closed transfer or member grant.
func TestSettlementTaskStatusAlias(t *testing.T) {
	for _, escape := range []bool{false, true} {
		name := "status-reader"
		extra := ""
		if escape {
			name = "facade-escape"
			extra = "export {load};"
		}
		t.Run(name, func(t *testing.T) {
			source := `import {defineTask,taskStatus} from '@exactjs/core';const load=defineTask({placement:'server'},async()=>({kind:"audit"}));const status=taskStatus(load);const state={get audit(){const retained=status.result;if(retained)Object.defineProperty(retained,"kind",{get(){return window.name}});return null}};export async function read(){const value=await load();state.audit;return value.kind}` + extra
			request := Request{Kind: "analyze", ID: "/virtual/settlement-task-" + name + ".ts", Source: source, Diagnostics: "semantic"}
			fixture := newExecutableFixture(t, map[string]string{"entry.ts": source})
			request = fixture.request("analyze", "entry.ts")
			session := NewSession()
			response := session.Execute(request)

			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Errorf("invalid task source: %#v", response.Diagnostics)
				return
			}
			unknown := false
			for _, callable := range response.Analysis.Callables {
				unknown = unknown || callable.Name == "read" && callable.Effect == "unknown"
			}
			if !unknown {
				t.Error("status-mutating source received known effect authority")
			}

		})
	}
}

// Repeated discovery of an identical eager empty-caller operation reuses the
// existing normal fact. This unit guard is not a dynamic activation assertion.
func TestSettlementOriginalOwnerDedup(t *testing.T) {
	session := NewSession()
	request := Request{Kind: "analyze", ID: "/virtual/settlement-dedup.ts", Source: `function install(){}install();`, Diagnostics: "semantic"}
	response := session.Execute(request)

	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal("invalid source")
	}
	for _, project := range session.projects {
		source := project.program.GetSourceFile(request.ID)
		var operation, owner *ast.Node
		for _, stmt := range source.Statements.Nodes {
			if ast.IsExpressionStatement(stmt) {
				owner = stmt
				operation = stmt.AsExpressionStatement().Expression
			}
		}
		if operation == nil {
			t.Fatal("missing real call")
		}
		var declaration *ast.Node
		for _, statement := range source.Statements.Nodes {
			if ast.IsFunctionDeclaration(statement) {
				declaration = statement
			}
		}
		for _, fuel := range []int{4096, 3} {
			query := sourceValueQuery{owner: project.callableCache.owner.values, executable: project.callableCache.owner, remaining: fuel, active: make(map[*ast.Node]bool)}
			work := query.owner.work
			result := accessorCandidates{}
			_, incomplete := query.settlementThenReferences(declaration, &result)
			// A value-only observer cannot replay a module to construct membership.
			// Only an already prepared construction can supply that authority.
			if !incomplete || query.owner.work != work {
				t.Error("unprepared settlement observer executed source work")
			}
		}

		facts := []callableFacts{{node: owner, sourceFile: source, callExpressions: map[string]*ast.Node{"ordinary": operation.AsCallExpression().Expression}, fieldEdgeOperations: map[string]*ast.Node{"ordinary": operation}}, {sourceFile: source, ownedObligations: []sourceOwnedObligations{{owner: owner, operation: operation}}}}
		applySourceOwnedObligations(facts, map[*ast.Node]int{owner: 0}, project.callableCache.owner.values)
		if len(facts[0].summary.DirectEffectSources) != 0 {
			t.Error("original normal operation double-applied")
		}
		facts[0].callExpressions = nil
		applySourceOwnedObligations(facts, map[*ast.Node]int{owner: 0}, project.callableCache.owner.values)
		if len(facts[1].summary.DirectEffectSources) != 1 || facts[1].summary.DirectEffectSources[0].Environment != "unknown" {
			t.Error("unrepresented original owner granted neutral")
		}

	}
}

// The public task fact identifies a real component-owned child. The owner-unit
// query checks its installed caller-default obligations separately from child
// body edges. It supplies no task-result identity or runtime execution proof.
func TestSettlementRecognizedTaskHost(t *testing.T) {
	source := "import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{n:number}>){this.state.n=0;async function child(value=({get value(){document.title;return 0}}).value,task:TaskContext=TaskContext.client()){return {kind:'audit',get then(){window.name;return undefined}}}child();return()=>null}"
	fixture := newExecutableFixture(t, map[string]string{"entry.ts": source})
	request := fixture.request("analyze", "entry.ts")
	session := NewSession()
	response := session.Execute(request)

	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid component source: %#v", response.Diagnostics)
	}
	taskFound := false
	for _, task := range response.Analysis.Tasks {
		if task.FunctionDefined && task.BrowserEffects && task.Placement == "client" {
			taskFound = true
		}
	}
	if !taskFound {
		t.Error("missing component-owned browser child")
	}
	for _, project := range session.projects {
		var page, child, call *ast.Node
		walkNode(project.program.GetSourceFile(request.ID).AsNode(), func(node *ast.Node) bool {
			if ast.IsFunctionDeclaration(node) && node.Name() != nil {
				if node.Name().Text() == "Page" {
					page = node
				}
				if node.Name().Text() == "child" {
					child = node
				}
			}
			if ast.IsCallExpression(node) && ast.IsIdentifier(node.AsCallExpression().Expression) && node.AsCallExpression().Expression.Text() == "child" {
				call = node
			}
			return true
		})
		if page == nil || child == nil || call == nil {
			t.Fatal("missing actual owner/call")
		}
		owner := project.callableCache.owner
		query := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: page, remaining: 4096, active: make(map[*ast.Node]bool), operation: &sourceOperationContext{node: call, owner: page}}
		result := query.invocation(call, nil)
		defaultGet, childThen := false, false
		for _, decl := range result.declarations {
			if ast.IsGetAccessorDeclaration(decl) {
				defaultGet = defaultGet || decl.Name().Text() == "value"
				childThen = childThen || decl.Name().Text() == "then"
			}
		}
		if !defaultGet || childThen {
			t.Errorf("caller default Get=%v child then lifted=%v opaque=%v", defaultGet, childThen, result.opaque)
		}
		t.Logf("HOST_OWNER_UNIT defaultGet=%v childThen=%v opaque=%v", defaultGet, childThen, result.opaque)
	}
}
