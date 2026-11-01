package exactcompiler

import (
	"strings"
	"testing"
)

func TestNestedPropForwardingKeepsCompleteReader(t *testing.T) {
	for _, access := range []string{
		"props.record.value", `props.record["value"]`, "(props.record).value",
		"(props.record as {value:number}).value", "props.record!.value",
		`(props.record)["value"]`, "(props.record satisfies {value:number}).value",
	} {
		t.Run(access, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "nested-prop-forwarding.tsx", Source: `
    declare function Leaf(props:{value:number;label:string}):unknown;
    export function Middle(props:{record:{value:number};label:string}) {
     return () => <Leaf value={` + access + `} label={props.label}/>;
    }`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			// A replaceable indexed receiver needs its complete reader. A root slot mask cannot
			// finalize away that nested dependency, even alongside an otherwise complete scalar input.
			if strings.Contains(response.Code, `__exactPropertyOperand`) || strings.Contains(response.Code, `__exactComponentReceiptUpdate(`) {
				t.Fatalf("nested input selected an incomplete finalized supplier: %s", response.Code)
			}
			if !strings.Contains(response.Code, `ComponentPropExpression`) {
				t.Fatalf("nested reader lost its existing expression owner: %s", response.Code)
			}
		})
	}
}

func TestScalarPropForwardingKeepsAtomicSupplier(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "scalar-prop-forwarding.tsx", Source: `
  declare function Leaf(props:{value:number}):unknown;
  export function Middle(props:{value:number}) {return () => <Leaf value={props.value}/>;}`})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `__exactComponentReceiptUpdate(`) {
		t.Fatalf("complete scalar receipt lost its atomic supplier: %s", response.Code)
	}
}

// A complete nested reader owns its selection even when the authored result is itself reactive.
func TestNestedReactivePayloadKeepsCompilerLayer(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "nested-reactive-payload.tsx", Source: `
 interface ReactiveValue {get():number}
 declare function Leaf(props:{value:ReactiveValue}):unknown;
 export function Middle(props:{record:{value:ReactiveValue}}){return()=> <Leaf value={props.record.value}/>;}`})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if !strings.Contains(response.Code, `value: __exactComponentPropExpression(`) || strings.Contains(response.Code, `value: __exactForwardedComponentPropExpression(`) {
		t.Fatalf("nested selection lost its compiler layer: %s", response.Code)
	}
}

func TestHelperMemberComponentInputsKeepTrackedReader(t *testing.T) {
	for _, access := range []string{"record.value", `record["value"]`, "1"} {
		t.Run(access, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", Target: TargetClient, ID: "helper-member-input.tsx", Source: `
function Leaf(props:{value:number}){return()=> <i>{props.value}</i>}
export function renderChild(record:{value:number}){return <div><Leaf value={` + access + `}/></div>}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			closed := strings.Contains(response.Code, "[2, 0, [], 0]")
			if closed != (access == "1") {
				t.Fatalf("helper member input lost its complete tracked reader:\n%s", response.Code)
			}
		})
	}
}
