package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionActivationEventOwnership(t *testing.T) {
	cases := []struct{ name, event, body, mode string }{
		{"event type", "onInput", `this.state.value=event.type;`, "interaction"},
		{"input value", "onInput", `this.state.value=event.currentTarget.value;`, "interaction"},
		{"input target", "onInput", `this.state.value=event.target.value;`, "interaction"},
		{"unowned event field", "onInput", `this.state.value=event.relatedTarget.type;`, "eager"},
		{"direct custom field", "onInput", `this.state.value=event.value;`, "eager"},
		{"unowned target field", "onInput", `this.state.value=event.target.custom.value;`, "eager"},
		{"dormant nested await", "onInput", `const later=async()=>{await Promise.resolve();};this.state.value=event.type;`, "interaction"},
		{"dormant function await", "onInput", `async function later(){await Promise.resolve();}this.state.value=event.type;`, "interaction"},
		{"dormant method await", "onInput", `const later={async run(){await Promise.resolve();}};this.state.value=event.type;`, "interaction"},
		{"method event capture", "onInput", `const later={run(){return event.type;}};this.state.value=later.run();`, "eager"},
		{"getter event capture", "onInput", `const later={get value(){return event.type;}};this.state.value=later.value;`, "eager"},
		{"shadowed event", "onInput", `const later=(event:any)=>event.custom;this.state.value=event.type;`, "interaction"},
		{"immediately invoked event capture", "onInput", `this.state.value=(()=>event.type)();`, "eager"},
		{"computed unowned target field", "onInput", `this.state.value=event.target['custom'].value;`, "eager"},
		{"asserted unowned target field", "onInput", `this.state.value=(event.target as any).custom.value;`, "eager"},
		{"repeated event member", "onInput", `this.state.value=event.target.currentTarget.value;`, "eager"},
		{"computed supported field", "onInput", `this.state.value=event.currentTarget['value'];`, "interaction"},
		{"asserted supported field", "onInput", `this.state.value=(event.currentTarget as any).value;`, "interaction"},
		{"dynamic control field", "onInput", `const key='custom';this.state.value=event.currentTarget[key];`, "eager"},

		{"type nested field", "onInput", `this.state.value=event.type.value;`, "eager"},
		{"target custom field", "onClick", `this.state.value=event.currentTarget.custom;`, "eager"},
		{"nested event capture", "onInput", `const later=()=>event.type;this.state.value=later();`, "eager"},
		{"outer await", "onInput", `await Promise.resolve();this.state.value=event.type;`, "eager"},
		{"before outer await", "onInput", `this.state.value=event.type;await Promise.resolve();`, "interaction"},
		{"unsupported event", "onMouseMove", `this.state.value=event.type;`, "eager"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			source := `import {type Component} from '@exactjs/core';export function Probe(this:Component<{value:string}>){this.state.value='';return()=> <input ` + c.event + `={async(event:any)=>{` + c.body + `}} value={this.state.value}/>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/event.tsx", Target: TargetServer, ServerComponents: true, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid event fixture rejected: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, b := range response.Analysis.Boundaries {
				if b.Kind == "client-island" {
					found = true
					if b.Activation.Mode != c.mode {
						t.Fatalf("event ownership requires %s activation, got %#v", c.mode, b.Activation)
					}
					if c.mode == "eager" && len(b.Activation.Reasons) == 0 {
						t.Fatal("eager activation must explain unsupported ownership")
					}
				}
			}
			if !found {
				t.Fatal("interactive element has no island boundary")
			}
		})
	}
}

func TestPartitionActivationSupportedEventFields(t *testing.T) {
	for _, event := range []string{"onClick", "onSubmit", "onInput", "onChange", "onFocus", "onBlur", "onFocusIn", "onFocusOut"} {
		fields := []string{"type", "target", "currentTarget"}
		if event == "onInput" || event == "onChange" {
			for _, member := range []string{"value", "checked", "name", "id", "form", "selectedIndex", "selectedOptions"} {
				fields = append(fields, "currentTarget."+member)
			}
		}
		if event == "onSubmit" {
			fields = append(fields, "submitter")
		}
		for _, field := range fields {
			source := `import {type Component} from '@exactjs/core';export function Probe(this:Component<{}>){return()=> <input ` + event + `={(event:any)=>{void event.` + field + `;}}/>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/fields.tsx", Target: TargetServer, ServerComponents: true, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("%s/%s: %s %#v", event, field, response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Boundaries) != 1 || response.Analysis.Boundaries[0].Activation.Mode != "interaction" {
				t.Fatalf("supported replay field %s/%s lost interaction activation: %#v", event, field, response.Analysis.Boundaries)
			}
			if !strings.Contains(response.Code, "export") {
				t.Fatal("server fixture was not emitted")
			}
		}
	}
}
