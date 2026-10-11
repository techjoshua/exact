package exactcompiler

import (
	"strings"
	"testing"
)

// Finite member selection retains resource ownership without changing key evaluation or results.
func TestComponentOwnedComputedMembers(t *testing.T) {
	for _, form := range []struct{ name, selection string }{
		{"dot", "this.own"},
		{"literal", "this['own']"},
		{"template", "this[`own`]"},
		{"constant", "this[key]"},
		{"wrapped-constant", "this[(key as 'own')]"},
		{"prop", "this[props.operation]"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(form.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "component-owned-member.tsx", Target: target, Diagnostics: "semantic",
					Source: `import {type Component} from '@exactjs/core';
					const key='own' as const;
					class Session {dispose(){}}
					export function Owner(this:Component<{}>,props:{operation:'own'}) {
					 const resource=` + form.selection + `(new Session());
					 return()=> <p>Ready</p>;
					}`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("valid component ownership rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Tasks) != 0 {
					t.Fatalf("component-owned resource became task-owned: %#v", response.Analysis.Tasks)
				}
				if !strings.Contains(response.Code, "ownComponentResource") && !strings.Contains(response.Code, "ownDirectSsrResource") {
					t.Fatalf("component ownership helper missing: %s", response.Code)
				}
				if form.name == "constant" && !strings.Contains(response.Code, "(void key,") {
					t.Fatalf("computed key evaluation was removed: %s", response.Code)
				}
			})
		}
	}
}

// Client lifecycle callbacks remain outside server execution regardless of member spelling.
func TestComponentComputedClientLifecyclePlacement(t *testing.T) {
	for _, phase := range []string{"onMount", "onActivate", "onDeactivate"} {
		for _, member := range []string{"this." + phase, "this['" + phase + "']", "this[key]", "this[props.operation]"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(phase+"/"+member+"/"+string(target), func(t *testing.T) {
					response := NewSession().Execute(Request{
						Kind: "compile", ID: "computed-client-lifecycle.tsx", Target: target, Diagnostics: "semantic",
						Source: `import {type Component} from '@exactjs/core';
						const key='` + phase + `' as const;
						export function Page(this:Component<{}>,props:{operation:'` + phase + `'}) {
						 ` + member + `(()=>window.alert('mounted'));
						 return()=> <p>Ready</p>;
						}`,
					})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("lifecycle compile failed: %s %#v", response.Error, response.Diagnostics)
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
						t.Fatalf("member syntax changed placement: %#v", response.Analysis.Components)
					}
					if strings.Contains(response.Code, "window.alert") != (target == TargetClient) {
						t.Fatalf("client callback crossed its target boundary: %s", response.Code)
					}
					if target == TargetClient && !strings.Contains(response.Code, "registerComponentLifecycle") {
						t.Fatalf("lifecycle registration was not lowered: %s", response.Code)
					}
				})
			}
		}
	}
}

func TestOrdinaryComputedOwnDoesNotTransferComponentOwnership(t *testing.T) {
	for _, member := range []string{"foreign.own", "foreign['own']", "foreign[key]"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(member+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "ordinary-computed-own.tsx", Target: target, Diagnostics: "semantic",
					Source: `import {type Component} from '@exactjs/core';
					const key='own' as const;
					class Session {dispose(){}}
					const foreign={own(value:Session){return value}};
					export function Owner(this:Component<{}>) {
					 const resource=` + member + `(new Session());
					 return()=> <p>Ready</p>;
					}`,
				})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				found := false
				for _, diagnostic := range response.Diagnostics {
					found = found || diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "cannot be owned")
					if strings.HasPrefix(diagnostic.Code, "TS") {
						t.Fatalf("ordinary receiver control is invalid TypeScript: %#v", diagnostic)
					}
				}
				if !found {
					t.Fatalf("ordinary own method granted framework ownership: %#v", response.Diagnostics)
				}
			})
		}
	}
}

func TestComputedRefAndReactiveMemberLowering(t *testing.T) {
	for _, method := range []struct{ name, argument, view, helper string }{
		{"ref", "token", "<p ref={value}/>", "__exactDirectSsrRef"},
		{"reactive", "()=>this.state.count+1", "<p>{value}</p>", "__exactDirectSsrReactive"},
	} {
		for _, member := range []string{"this." + method.name, "this['" + method.name + "']", "this[key]"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(method.name+"/"+member+"/"+string(target), func(t *testing.T) {
					response := NewSession().Execute(Request{
						Kind: "compile", ID: "computed-component-value.tsx", Target: target, Diagnostics: "semantic",
						Source: `import {createRef,type Component} from '@exactjs/core';
						const token=createRef<HTMLElement>('computed-value');const key='` + method.name + `' as const;
						export function Page(this:Component<{count:number}>) {
						 this.state.count=0;const value=` + member + `(` + method.argument + `);
						 return()=> ` + method.view + `;
						}`,
					})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("computed method compile failed: %s %#v", response.Error, response.Diagnostics)
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
						t.Fatalf("computed operation lost native placement: %#v", response.Analysis.Components)
					}
					if target == TargetServer && !strings.Contains(response.Code, method.helper) {
						t.Fatalf("computed method missed server lowering: %s", response.Code)
					}
					if target == TargetServer && member == "this[key]" && !strings.Contains(response.Code, "void key") {
						t.Fatalf("computed key evaluation lost: %s", response.Code)
					}
					if target == TargetClient && method.name == "reactive" {
						found := false
						for _, binding := range response.Analysis.ReactiveBindings {
							found = found || binding.Name == "value" && binding.Provenance == "cell"
						}
						if !found {
							t.Fatalf("computed reactive value lost its cell identity: %#v", response.Analysis.ReactiveBindings)
						}
					}
				})
			}
		}
	}
}

func TestOrdinaryReceiverMethodsKeepTheirCallContract(t *testing.T) {
	for _, method := range []string{"own", "onRender", "ref", "reactive"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(method+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "ordinary-component-receiver.tsx", Target: target, Diagnostics: "semantic",
					Source: `import {type Component} from '@exactjs/core';
					export function Page(this:Component<{value:number}>){
					 this.state.value=0;
					 const foreign={` + method + `(value:number){return value+1},run(){return this.` + method + `(2)}};
					 this.onMount(()=>this.state.value=foreign.run());
					 return()=> <output>{this.state.value}</output>;
					}`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("ordinary method call was rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if target == TargetClient && !strings.Contains(response.Code, "this."+method+"(2)") {
					t.Fatalf("ordinary receiver was rewritten as a framework operation: %s", response.Code)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("ordinary method lost portable placement: %#v", response.Analysis.Components)
				}
			})
		}
	}
}

// An ordinary receiver cannot hide its callback's browser dependency as a client lifecycle hook.
func TestOrdinaryLifecycleReceiverRetainsBrowserEffects(t *testing.T) {
	for _, selection := range []string{"this.onMount", "this['onMount']", "this[key]"} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-lifecycle-effect.tsx", Target: TargetServer, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';const key='onMount' as const;
export function Page(this:Component<{}>){const foreign={onMount(callback:()=>void){callback()},run(){` + selection + `(()=>window.alert('ordinary'))}};foreign.run();return()=> <p>Ready</p>}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if len(response.Analysis.Components) != 1 {
			t.Fatalf("missing component: %#v", response.Analysis.Components)
		}
		if response.Analysis.Components[0].Placement == "isomorphic" {
			t.Fatalf("ordinary callback received framework lifecycle isolation: %#v", response.Analysis.Components)
		}
	}
}

// Server callback erasure preserves the computed member's evaluation before suppressing registration.
func TestComputedLifecycleKeyEvaluationSurvivesServerErasure(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "lifecycle-key-effects.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';function key(){return 'onMount' as const}export function Page(this:Component<{}>){const callback=()=>window.alert('mounted');this[key()](callback);return()=> <p>Ready</p>}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("valid finite lifecycle rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if response.Analysis.Components[0].Placement != "isomorphic" {
			t.Fatalf("named lifecycle callback changed placement: %#v", response.Analysis.Components)
		}
		if !strings.Contains(response.Code, "void key()") {
			t.Fatalf("key evaluation erased: %s", response.Code)
		}
		if strings.Contains(response.Code, "window.alert") != (target == TargetClient) {
			t.Fatalf("named lifecycle callback crossed target: %s", response.Code)
		}
	}
}

// Ordinary object, class and typed function receivers stay separate from lexical component arrows.
func TestComponentProtocolReceiverBoundaries(t *testing.T) {
	for _, ordinary := range []string{
		`const foreign={own(value:number){return value+1},run(){return this['own'](2)}};`,
		`class Other{own(value:number){return value+1}run(){return this['own'](2)}}const foreign=new Other();`,
		`const foreign={own(value:number){return value+1},run:function(this:{own(value:number):number}){return this['own'](2)}};`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "protocol-receiver-boundaries.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + ordinary + `const register=()=>this['onMount'](()=>this.state.value=foreign.run());register();return()=> <output>{this.state.value}</output>}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("receiver boundary rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("lexical callback lost placement: %#v", response.Analysis.Components)
			}
			if target == TargetClient && !strings.Contains(response.Code, "this['own'](2)") {
				t.Fatalf("ordinary receiver changed: %s", response.Code)
			}
			if target == TargetClient && !strings.Contains(response.Code, "registerComponentLifecycle") {
				t.Fatalf("lexical lifecycle missed lowering: %s", response.Code)
			}
		}
	}
}

// Optional lookup and extracted methods use the same request-local capability as direct calls.
func TestComputedServerMethodAccessForms(t *testing.T) {
	for _, operation := range []struct{ name, argument, view, helper string }{
		{"ref", "token", "<p ref={value}/>", "directSsrRefMethod"},
		{"reactive", "()=>this.state.count+1", "<p>{value}</p>", "directSsrReactiveMethod"},
	} {
		for _, invocation := range []string{"const value=this[key]?.(ARG);", "const method=this[key];const value=method(ARG);"} {
			source := `import{createRef,type Component}from'@exactjs/core';const token=createRef<HTMLElement>('access');const key='` + operation.name + `' as const;export function Page(this:Component<{count:number}>){this.state.count=0;` + strings.ReplaceAll(invocation, "ARG", operation.argument) + `return()=> ` + operation.view + `}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "computed-access-forms.tsx", Target: TargetServer, Diagnostics: "semantic", Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid method access rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("method access lost placement: %#v", response.Analysis.Components)
			}
			if !strings.Contains(response.Code, operation.helper) || !strings.Contains(response.Code, "void key") {
				t.Fatalf("request-local lookup lost: %s", response.Code)
			}
		}
	}
}

// Immutable method aliases retain ownership, while mutable or foreign aliases grant no authority.
func TestComponentMethodAliasOwnershipControls(t *testing.T) {
	for _, scenario := range []struct {
		binding, call string
		valid         bool
	}{
		{"const own=this['own'];", "own", true},
		{"const key='own' as const;const own=this[key];const alias=own;", "alias", true},
		{"let own=this.own;", "own", false},
		{"const foreign={own(value:Session){return value}};const own=foreign.own;", "own", false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "component-method-alias.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';class Session{dispose(){}}export function Page(this:Component<{}>){` + scenario.binding + `const resource=` + scenario.call + `(new Session());return()=> <p>Ready</p>}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, diagnostic := range response.Diagnostics {
				if strings.HasPrefix(diagnostic.Code, "TS") {
					t.Fatalf("invalid source control: %#v", diagnostic)
				}
				rejected = rejected || diagnostic.Code == "EXACT2001"
			}
			if rejected == scenario.valid {
				t.Fatalf("method alias ownership changed: %#v", response.Diagnostics)
			}
			if scenario.valid && response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("valid alias lost placement: %#v", response.Analysis.Components)
			}
			if scenario.valid && target == TargetServer && !strings.Contains(response.Code, "directSsrLifecycleMethod") {
				t.Fatalf("method alias missed server helper: %s", response.Code)
			}
		}
	}
}

// Ambient const declarations are callable values without an initializer, never operation aliases.
func TestAmbientCallableDoesNotEnterComponentAliasResolution(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "ambient-component-call.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';declare const invoke:()=>void;export function Page(this:Component<{}>){this.onMount(()=>invoke());return()=> <p>Ready</p>}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("ambient callable rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if response.Analysis.Components[0].Placement != "isomorphic" {
			t.Fatalf("client callable leaked placement: %#v", response.Analysis.Components)
		}
		if strings.Contains(response.Code, "invoke()") != (target == TargetClient) {
			t.Fatalf("ambient callable crossed lifecycle boundary: %s", response.Code)
		}
	}
}
