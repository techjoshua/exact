package exactcompiler

import (
	"reflect"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The real collector must connect overloaded implementation BODY and actual
// argument READs; a selected signature cannot substitute for either obligation.
func TestLexicalOverloadOriginalCallClosure(t *testing.T) {
	const source = `declare const left:number;declare const right:number;
function factory(typed:number,other:number):{value:number;other:number};
function factory(typed:string,other:string):{value:string;other:string};
function factory(actual:unknown,other:unknown){return {value:actual,other}}
export function invoke(){return factory(left,right).value}`
	assertAmbientArgumentOriginalCall(t, source, 2)
}

// Both conditional return inventory and creating-input roles belong to the
// actual implementation, even when overload formal names and types differ.
func TestLexicalOverloadReturnAndCreatingConsumers(t *testing.T) {
	for _, generic := range []bool{false, true} {
		source := `function factory(typed:number):number;function factory(typed:string):string;
function factory(actual:unknown){return actual}export function invoke(value:number){return factory(value)}`
		if generic {
			source = `function factory<T>(typed:T):T;function factory<T>(actual:T){return actual}export function invoke(value:number){return factory(value)}`
		}
		withStagedReturnProgram(t, source, func(owner *executableBodyOwner, operation *ast.Node) {
			input, ok := describeStagedInputSubstitution(operation, enclosingCallableNode(operation), owner)
			if !ok {
				t.Fatal("UNREACHED: original overloaded source-input producer")
			}
			implementation := input.invocation.declaration
			symbol := owner.checker.GetSymbolAtLocation(operation.Expression())
			if implementation == symbol.ValueDeclaration || implementation.Body() == nil || implementation.Parameters()[0].Name().Text() != "actual" {
				t.Fatal("signature used as implementation BODY")
			}
			call := sourceStagedDeclarationCall{kind: relativeDemandEffects, invocation: input.invocation, sourceInputs: input}
			plan, ok := describeStagedCallReturnSources(call, owner)
			if !ok || plan.declaration != implementation || len(plan.branches) != 1 || plan.branches[0].endpoint.kind != relativeEndpointRole || plan.branches[0].endpoint.role.declaration != implementation {
				t.Fatal("original return source lost implementation identity")
			}
			bound := describeStagedCreatingInputs(input.invocation, owner)
			if bound.unsupported != relativeInputsSupported || bound.declaration != implementation {
				t.Fatal("original creating-input association refused", bound.unsupported)
			}
			formal := false
			for _, binding := range bound.bindings {
				if binding.target.kind == relativeRoleFormal {
					formal = true
					if binding.target.declaration != implementation || binding.target.slot != 0 {
						t.Fatal("creating inputs bound signature formal")
					}
				}
			}
			if !formal {
				t.Fatal("UNREACHED: creating-input formal consumer")
			}
			wrong := input.invocation
			wrong.declaration = symbol.ValueDeclaration
			if describeStagedCreatingInputs(wrong, owner).unsupported == relativeInputsSupported {
				t.Fatal("bodyless signature became creating implementation")
			}
			facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(operation))
			caller := -1
			for i := range facts {
				if facts[i].node == enclosingCallableNode(operation) {
					caller = i
				}
			}
			if caller < 0 {
				t.Fatal("UNREACHED: legacy original caller")
			}
			invocation, gap := describeStagedDeclarationInvocation(&facts[caller], operation, owner.checker, owner)
			if gap != stagedCallSupported || invocation.declaration != implementation {
				t.Fatal("legacy and source planners disagree", gap)
			}
		})
	}
}

// Body selection is deliberately narrower than all callable JavaScript. These
// real sources keep their existing independent domains rather than acquiring
// overload implementation authority from a name or a selected signature.
func TestLexicalOverloadDomainRefusers(t *testing.T) {
	for _, row := range []struct {
		name, source string
		sources      map[string]string
	}{
		{name: "ambient", source: `declare function factory(value:number):number;export function invoke(){return factory(1)}`},
		{name: "namespace-merge", source: `function factory(value:number):number;function factory(value:number){return value}namespace factory{export const label='x'}export function invoke(){return factory(1)}`},
		{name: "written", source: `function factory(value:number):number;function factory(value:number){return value}(factory as (value:number)=>number)=(value:number)=>value+1;export function invoke(){return factory(1)}`},
		{name: "default", source: `function factory(value?:number):number;function factory(value=1){return value}export function invoke(){return factory(1)}`},
		{name: "rest", source: `function factory(...values:number[]):number;function factory(...values:number[]){return values[0]??0}export function invoke(){return factory(1)}`},
		{name: "async", source: `function factory(value:number):Promise<number>;async function factory(value:number){return value}export function invoke(){return factory(1)}`},
		{name: "generator", source: `function factory(value:number):Generator<number,void,unknown>;function* factory(value:number){yield value}export function invoke(){return factory(1)}`},
		{name: "import", source: `import{factory}from'./overload-dep.js';export function invoke(){return factory(1)}`, sources: map[string]string{"/virtual/overload-dep.ts": `export function factory(value:number):number;export function factory(value:number){return value}`}},
		{name: "alias", source: `function original(value:number):number;function original(value:number){return value}const factory=original;export function invoke(){return factory(1)}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withAmbientArgumentProgram(t, row.source, row.sources, false, func(owner *executableBodyOwner, operation *ast.Node) {
				if _, ok := describeStagedInputSubstitution(operation, enclosingCallableNode(operation), owner); ok {
					t.Fatal("unsupported overload domain entered source input producer")
				}
			})
		})
	}
}

// A released source tree cannot be admitted by another genuine current Program.
// This uses real checker generations rather than copying an authority receipt.
func TestLexicalOverloadGenerationIdentity(t *testing.T) {
	const source = `function factory(typed:number):number;function factory(actual:number){return actual}export function invoke(){return factory(1)}`
	var old *ast.Node
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		if _, body := stagedLexicalFunctionImplementation(call.Expression(), owner); body == nil {
			t.Fatal("UNREACHED: original implementation")
		}
		old = call
	})
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		if _, body := stagedLexicalFunctionImplementation(call.Expression(), owner); body == nil {
			t.Fatal("fresh implementation refused")
		}
		if _, body := stagedLexicalFunctionImplementation(old.Expression(), owner); body != nil {
			t.Fatal("old Program source pointer admitted")
		}
	})
}

// The original public row needs its selected-signature policy while the real
// implementation body retains ordinary Effects and compiler-owned closure.
func TestLexicalOverloadOriginalPolicyRows(t *testing.T) {
	const prefix = `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
interface Chain<T>{value:T;resolved:Chain<Awaited<T>>;not:Chain<unknown>;}
function select<T>(value:T):Chain<T>{return {value} as Chain<T>;}
interface Service{select<T>(value:T):Chain<T>;field:<T>(value:T)=>Chain<T>;readonly selected:typeof select;}
declare const service:Service;
declare const credential:Protected<string>;
function overloaded(value:number):Chain<number>;
function overloaded(value:Protected<string>):Chain<Protected<string>>;
function overloaded(value:unknown):Chain<unknown>{return {value} as Chain<unknown>;}
`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, row := range []struct {
			expression string
			denied     bool
		}{{"overloaded(1).value", false}, {"overloaded(credential).value", true}} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "selected-recursive.tsx", Target: target, Source: prefix + `function reference(){void select;void service.select;void overloaded;}export function Panel(){return()=> <p>{` + row.expression + `}</p>;}`})
			if response.Error != "" {
				t.Fatal(target, row.expression, response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT3020") != row.denied {
				t.Fatal("selected signature secrecy changed", target, row.expression, response.Diagnostics)
			}
			if !row.denied && response.Code == "" {
				t.Fatal("original numeric row did not emit")
			}
		}
	}
}

// Replacing only the implementation body must invalidate retained Effects while
// overload signatures and consumer source stay stable. Repetition/reset remain
// equal to fresh compilation; unknown effects are not a compiler-debt waiver.
func TestLexicalOverloadRetainedImplementation(t *testing.T) {
	const base = `export function factory(typed:number):number;export function factory(typed:string):string;export function factory(actual:unknown){return actual}export function invoke(){return factory(1)}`
	changed := strings.Replace(base, "{return actual}", "{void document.title;return actual}", 1)
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		for i, source := range []string{base, base, changed, base} {
			request := Request{Kind: "compile", ID: "/virtual/overload-retained.ts", Source: source, Target: target, Diagnostics: "semantic"}
			response := session.Execute(request)
			fresh := NewSession().Execute(request)
			if response.Error != "" || response.Code == "" || hasErrorDiagnostic(response.Diagnostics) || response.Error != fresh.Error || response.Code != fresh.Code || !reflect.DeepEqual(response.Diagnostics, fresh.Diagnostics) || !reflect.DeepEqual(response.Analysis.Callables, fresh.Analysis.Callables) {
				t.Fatal("retained overload differs from fresh", i, response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "invoke")
			if containsEnvironment(summary.EffectSources, "browser") != (i == 2) {
				t.Fatal("stale implementation effect", i, summary)
			}
		}
		if reset := session.Execute(Request{Kind: "reset"}); reset.Error != "" {
			t.Fatal(reset.Error)
		}
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/overload-retained.ts", Source: base, Target: target})
		if response.Error != "" || containsEnvironment(executableSummary(t, response, "invoke").EffectSources, "browser") {
			t.Fatal("reset retained implementation", response.Error)
		}
	}
}

// C0 historically also describes nested and script-local function definitions.
// The shared identity resolver must not import the module-level call planners'
// narrower domains into this existing source association API.
func TestLexicalCreatingInputsKeepsPlainDomains(t *testing.T) {
	for _, source := range []string{
		`function factory(value:number){return value}const result=factory(1);`,
		`export function invoke(){function factory(value:number){return value}return factory(1)}`,
		`function factory(value:number){return value}namespace factory{export const label="x"}export function invoke(){return factory(1)}`,
		`interface factory{label:string}function factory(value:number){return value}export function invoke(){return factory(1)}`,
	} {
		withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
			symbol := owner.checker.GetSymbolAtLocation(call.Expression())
			request := sourceRelativeInvocation{declaration: symbol.ValueDeclaration, operation: call, use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
			bound := describeStagedCreatingInputs(request, owner)
			if bound.unsupported != relativeInputsSupported || bound.declaration != request.declaration {
				t.Fatal("existing plain creating-input domain narrowed", bound.unsupported)
			}
			file := ast.GetSourceFileOfNode(call)
			if ast.IsExternalModule(file) && request.declaration.Parent == file.AsNode() {
				if _, supported := describeStagedInputSubstitution(call, enclosingCallableNode(call), owner); !supported {
					t.Fatal("existing plain source-input domain narrowed")
				}
			}
		})
	}
}
