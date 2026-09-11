package exactcompiler

import (
	"strings"
	"testing"
)

func TestScheduledDocumentOutputRegion(t *testing.T) {
	for _, test := range []struct {
		name, head, body string
		streaming        bool
	}{
		{"static-head", `<title>Ready</title>`, `<main>{this.state.value}</main>`, true},
		{"dynamic-head", `<title>{this.state.value}</title>`, `<main>{this.state.value}</main>`, false},
		{"body-call", `<title>Ready</title>`, `<main>{String(this.state.value)}</main>`, false},
		{"body-component", `<title>Ready</title>`, `<Nested />`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "task-document.tsx", Kind: "compile", Target: TargetServer, Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<S> {state:S}
			function Nested(){return () => <main>Nested</main>}
			export function Document(this: Component<{value:string}>){
			 this.state.value="pending";
			 const load=async (_task:TaskContext=TaskContext.server().blocking())=>{this.state.value=await Promise.resolve("ready")};
			 load();
			 return () => <html><head>` + test.head + `</head><body>` + test.body + `</body></html>;
			}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "streamingDocument: true") != test.streaming {
				t.Fatalf("incorrect region proof: %s", response.Code)
			}
			if strings.Contains(response.Code, "host: this") != test.streaming {
				t.Fatalf("incorrect deferred region owner: %s", response.Code)
			}
		})
	}
}
