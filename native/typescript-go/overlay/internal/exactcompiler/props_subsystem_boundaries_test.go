package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Wide input plans must preserve both mask words and leave excess relationships observable.
func TestWideComponentInputRelationships(t *testing.T) {
	var fields, assignments strings.Builder
	for index := 0; index < 70; index++ {
		fmt.Fprintf(&fields, "p%d:number;", index)
		fmt.Fprintf(&assignments, "this.state.p%d=props.p%d;", index, index)
	}
	source := `declare class Component<S>{state:S}export function Page(this:Component<{` + fields.String() + `}>,props:{` + fields.String() + `}){` + assignments.String() + `return()=> <output>{this.state.p69}</output>;}`
	response := NewSession().Execute(Request{ID: "wide-inputs.tsx", Kind: "compile", Target: TargetClient, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("wide inputs rejected: %s %#v", response.Error, response.Diagnostics)
	}
	for _, expected := range []string{"__exactDirtyHigh & 2147483648", "__exactActivateComputation(this", "inputs: __exact_component_inputs_"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("missing wide input/fallback contract %q:\n%s", expected, response.Code)
		}
	}
}

// Optional receiver snapshots and literal/computed fields cannot collapse to root-slot invalidation.
func TestNestedInputRelationshipForms(t *testing.T) {
	for _, expression := range []string{`props.record.value`, `props.record?.value ?? 0`, `props.record["value"]`, `props.record[key]`, `props.record?.[key] ?? 0`, `props.record?.read() ?? 0`} {
		t.Run(expression, func(t *testing.T) {
			source := `declare class Component<S>{state:S}const key="value";export function Page(this:Component<{value:number}>,props:{record:{value:number;read():number}}){this.state.value=` + expression + `;return()=> <output>{this.state.value}</output>;}`
			response := NewSession().Execute(Request{ID: "nested-input.tsx", Kind: "compile", Target: TargetClient, ComponentContractProjection: ComponentContractProjectionHydrate, Source: source})
			if strings.Contains(expression, "read()") {
				if !containsDiagnosticCode(response.Diagnostics, "EXACT2001") || response.Code != "" {
					t.Fatalf("opaque member call lost its placement rejection: %#v", response.Diagnostics)
				}
				return
			}
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("nested input rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "inputs: __exact_component_inputs_") || !strings.Contains(response.Code, "__exactActivateComputation(this") {
				t.Fatalf("nested observation omitted:\n%s", response.Code)
			}
		})
	}
}

// Fixed child composition and document/text hosts retain their distinct lowering contracts.
func TestPropsCompositionAndMetadataForms(t *testing.T) {
	cases := map[string]string{
		"default-function":    `declare class Component<S>{state:S}export default function Page(this:Component<{value:boolean}>){this.state.value=false;return()=> <span>{this.state.value}</span>;}`,
		"default-arrow":       `const Page=()=>()=> <span/>;export default Page;`,
		"state-values":        `declare class Component<S>{state:S}export function Page(this:Component<{a:true;b:false;c:null;d:undefined;e:1}>){this.state.a=true;this.state.b=false;this.state.c=null;this.state.d=undefined;this.state.e=1;return()=> <span>{this.state.a}{this.state.b}{this.state.c}{this.state.d}{this.state.e}</span>;}`,
		"fixed-children":      `function Child(props:{children?:unknown}){return()=> <section>{props.children}</section>;}export function Page(){return()=> <Child><span title="fixed">text{true}{false}{null}{1}</span><input disabled/><svg><path d="M0 0"/></svg></Child>;}`,
		"fixed-special-hosts": `function Child(props:{children?:unknown}){return()=> <section>{props.children}</section>;}export function Page(){return()=> <Child><html/><head/><body/><title>title</title><textarea>text</textarea><script>value</script><style>value</style><template>value</template></Child>;}`,
		"dynamic-children":    `function Child(props:{children?:unknown}){return()=> <section>{props.children}</section>;}export function Page(props:{title:string}){return()=> <Child><span key="stable" title={props.title}/><span {...{title:"spread"}}/><_>text</_></Child>;}`,
	}
	for name, source := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "composition-metadata.tsx", Kind: "compile", Target: target, Source: source})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("valid contract rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if response.Code == "" || len(response.Analysis.Components) == 0 {
					t.Fatal("missing emitted component contract")
				}
			})
		}
	}
}

// Ordinary call/apply invocations preserve the component receiver independently of JavaScript this.
func TestComponentSurfaceInvocationForms(t *testing.T) {
	for _, expression := range []string{`helper(this)`, `helper.call(null,this)`, `helper.apply(null,[this])`, `helper.call(this,this)`, `helper.apply(this,[this])`, `helper.apply(null,[...([this] as const)])`, `helper.apply(null,argumentsTuple)`} {
		t.Run(expression, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "surface-invocation.tsx", Kind: "compile", Target: TargetServer, Source: `declare class Component{getContext(token:unknown):unknown}function helper(owner:Component){return owner.getContext(Symbol.for("locale"));}export function Page(this:Component){const argumentsTuple=[{} as Component];argumentsTuple[0]=this;return()=> <span>{` + expression + `}</span>;}`})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("surface invocation rejected: %s %#v", response.Error, response.Diagnostics)
			}
			for _, component := range response.Analysis.Components {
				if component.Name == "Page" {
					if !component.TargetPlan.ServerSurface.Contexts {
						t.Fatalf("lost forwarded context: %#v", component.TargetPlan)
					}
					return
				}
			}
			t.Fatal("missing Page")
		})
	}
}

// Helper output proofs retain the selected props owner and reject opaque substitutions.
func TestSuppliedTargetProofContracts(t *testing.T) {
	for _, test := range []struct {
		body, invocation string
		transparent      bool
	}{
		{`function project(first:{children?:unknown},second:{children?:unknown}){return first.children;}`, `project(props,{children:"other"})`, true},
		{`function project(first:{children?:unknown},second:{children?:unknown}){return first.children;}`, `project({children:"other"},props)`, false},
		{`function project({children}:{children?:unknown}){return children;}`, `project(props)`, false},
		{`function project(input:{children?:unknown}){void input;}`, `project(props)`, false},
		{`function project(input:{children?:unknown;active?:boolean}){if(input.active)return input.children;return input.children;}`, `project(props)`, true},
		{`function project(input:{children?:unknown}){return "replacement";}`, `project(props)`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.invocation+"/"+test.body+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "supplied-proof.tsx", Kind: "compile", Target: target, Source: test.body + `export function Contribution(props:{children?:unknown}){return()=>` + test.invocation + `;}`})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("helper rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if strings.Contains(response.Code, "transparentTarget: true") != test.transparent {
					t.Fatalf("wrong owner proof:\n%s", response.Code)
				}
			})
		}
	}
}

// A direct tuple containing an unrelated object must not brand it as the component receiver.
func TestComponentSurfaceUnownedApplyTuple(t *testing.T) {
	response := NewSession().Execute(Request{ID: "unowned-apply.tsx", Kind: "compile", Target: TargetServer, Source: `declare class Component{getContext(token:unknown):unknown}declare const other:Component;function helper(owner:Component){return owner.getContext(Symbol.for("locale"));}export function Page(this:Component){return()=> <span>{helper.apply(null,[other])}</span>;}`})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("unowned control rejected: %s %#v", response.Error, response.Diagnostics)
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "Page" && component.TargetPlan.ServerSurface.Contexts {
			t.Fatal("unrelated object acquired component ownership")
		}
	}
}
