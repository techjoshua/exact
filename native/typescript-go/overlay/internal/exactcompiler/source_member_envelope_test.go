package exactcompiler

import (
	"os"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Field-value publication is distinct from exposing its new containing record.
// Refused publication/capture routes keep known getter-body summaries. Their
// missing caller-effect edges remain separate baseline defects. Borrowed joins
// and supported caller effects keep their public assertions.
func TestFreshEnvelopeConfinement(t *testing.T) {
	const makeData = `function make(payload:{value:string}){return {audit:payload,error:''}}`
	for _, c := range []struct {
		name, source, effectOwner  string
		confined, browser, unknown bool
	}{
		{"field-transfer-setter", `const state={set audit(v:unknown){window.location.hash='observed'}};` + makeData + `export function run(payload:{value:string}){const update=make(payload);state.audit=update.audit;return update.error}`, "run", true, true, false},
		{"reentrant-setter", `let entered=false;const state={set audit(v:{value:string}){window.location.hash="observed";if(!entered){entered=true;run(v)}}};` + makeData + `export function run(payload:{value:string}){const update=make(payload);state.audit=update.audit;return update.error}`, "run", true, true, false},
		{"unknown-field-value", makeData + `export function run(payload:{value:string}){const update=make(payload);return update.audit.value}`, "run", false, false, true},
		{"producer-publication", `let published:{audit:{value:string},error:string}|undefined;function make(payload:{value:string}){return (published={audit:payload,error:''})}function install(){Object.defineProperty(published!,'error',{get(){return window.location.href}})}export function run(payload:{value:string}){const update=make(payload);install();return update.error}`, "get", false, true, false},
		{"receiving-capture", makeData + `export function run(payload:{value:string}){const update=make(payload);function expose(){return update}Object.defineProperty(expose(),'error',{get(){return window.location.href}});return update.error}`, "get", false, true, false},
		{"borrowed-alternative", `const saved={audit:{value:''},get error(){return window.location.href}};function make(payload:{value:string},fresh:boolean){if(fresh)return {audit:payload,error:''};return saved}export function run(payload:{value:string},fresh:boolean){const update=make(payload,fresh);return update.error}`, "run", true, true, false},
		{"empty-closure", makeData + `export function run(payload:{value:string}){const update=make(payload);function empty(){}return update.error}`, "run", false, false, false},
		{"eval-closure", makeData + `export function run(payload:{value:string}){const update=make(payload);function hidden(){return eval('update')}return update.error}`, "run", false, false, false},
		{"direct-eval", makeData + `export function run(payload:{value:string}){const update=make(payload);eval('update');return update.error}`, "run", false, false, false},
		{"envelope-argument", makeData + `declare function escape(v:unknown):void;export function run(payload:{value:string}){const update=make(payload);escape(update);return update.error}`, "run", false, false, true},
		{"member-this", `function make(payload:{value:string}){return {audit:payload,error:'',invoke:function(){return this.error}}}export function run(payload:{value:string}){const update=make(payload);update.invoke();return update.error}`, "run", false, false, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			inputs := "props.payload"
			if c.name == "borrowed-alternative" {
				inputs += ", props.fresh"
			}
			source := "import { type Component, TaskContext } from '@exactjs/core';\n" + c.source + `
export function Page(this: Component<{ display: string }>, props: { payload: { value: string }; fresh: boolean }) {
	this.state.display = '';
	const refresh = (_task: TaskContext = TaskContext.client()) => {
		this.state.display = run(` + inputs + `);
	};
	return () => <button onClick={() => refresh()}>{this.state.display}</button>;
}`
			fixture := newExecutableFixture(t, map[string]string{"entry.tsx": source})
			request := fixture.request("analyze", "entry.tsx")
			const config = `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"jsx":"preserve","jsxImportSource":"@exactjs/jsx"},"files":["entry.tsx"]}`
			if err := os.WriteFile(request.ConfigFile, []byte(config), 0600); err != nil {
				t.Fatal(err)
			}
			session := fixture.session
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid component task: %s %#v", response.Error, response.Diagnostics)
			}
			findComponent(t, response.Analysis.Components, "Page")
			found := false
			for _, summary := range response.Analysis.Callables {
				if summary.Name != c.effectOwner {
					continue
				}
				found = true
				browser := false
				for _, effect := range summary.EffectSources {
					browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "window")
				}
				if c.effectOwner == "get" && summary.Effect != "browser" {
					t.Fatalf("lost known getter-body effect: %#v", summary)
				}
				if c.browser && !browser {
					t.Fatalf("lost browser source: %#v", summary)
				}
				if c.unknown && c.name != "unknown-field-value" && summary.Effect != "unknown" {
					t.Fatalf("borrowed uncertainty became %s: %#v", summary.Effect, summary)
				}
			}
			if !found {
				t.Fatalf("missing effect consumer %q", c.effectOwner)
			}
			for _, project := range session.projects {
				file := project.program.GetSourceFile(request.ID)
				if file == nil {
					continue
				}
				var factory, call, origin, member, payloadRead *ast.Node
				walkNode(file.AsNode(), func(n *ast.Node) bool {
					if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "make" {
						factory = n
					}
					if ast.IsVariableDeclaration(n) && ast.IsIdentifier(n.Name()) && n.Name().Text() == "update" {
						call = unwrapSourceCallableReference(n.Initializer())
					}
					if factory != nil && ast.IsObjectLiteralExpression(n) && enclosingCallableNode(n) == factory && origin == nil {
						origin = n
					}
					if ast.IsPropertyAccessExpression(n) && n.Name().Text() == "value" {
						payloadRead = n
					}
					if ast.IsPropertyAccessExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "update" && n.Name().Text() == "error" {
						member = n
					}
					return true
				})
				// Placement of a parameter read can be neutral while acquiring its
				// projected symbolic payload must still remain incomplete.
				if c.name == "unknown-field-value" {
					if payloadRead == nil {
						t.Fatal("missing payload acquisition")
					}
					q := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096, active: make(map[*ast.Node]bool)}
					acquired := q.accessors(payloadRead, nil, "", accessorAcquire, nil, nil)
					if !acquired.opaque && !acquired.valueIncomplete {
						t.Fatalf("borrowed acquired value became complete: %#v", acquired)
					}
					return
				}
				if factory == nil || call == nil || origin == nil || member == nil {
					t.Fatal("missing source boundary")
				}
				q := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096, active: make(map[*ast.Node]bool), protectedMember: member, freshReturnCall: call, creators: map[*ast.Node]sourceValueCreation{factory: {invocation: call, returning: project.callableCache.owner.values.summary(factory).returns[0]}}}
				if got := q.confinedEnvelope(origin, nil, "error", accessorRead, &accessorCandidates{}); got != c.confined {
					t.Fatalf("confinement=%v want %v", got, c.confined)
				}
				if c.confined {
					q.protectedMember = nil
					if q.confinedEnvelope(origin, nil, "error", accessorRead, &accessorCandidates{}) {
						t.Fatal("missing protected Get grant")
					}
					q.protectedMember = member
					q.freshReturnCall = nil
					if q.confinedEnvelope(origin, nil, "error", accessorRead, &accessorCandidates{}) {
						t.Fatal("missing selected transfer grant")
					}
					q.freshReturnCall = call
					if q.confinedEnvelope(origin, []string{"audit"}, "value", accessorRead, &accessorCandidates{}) {
						t.Fatal("nested projection grant")
					}
					q.remaining = 0
					if !q.confinedEnvelope(origin, nil, "error", accessorRead, &accessorCandidates{}) {
						t.Fatal("advisory estimate rejected the same confined envelope")
					}
					q.remaining = 4096
					q.active[factory] = true
					if q.confinedEnvelope(origin, nil, "error", accessorRead, &accessorCandidates{}) {
						t.Fatal("recursive grant")
					}
				}
				return
			}
			t.Fatal("missing source project")
		})
	}
}
