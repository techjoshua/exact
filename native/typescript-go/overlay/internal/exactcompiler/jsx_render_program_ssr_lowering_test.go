package exactcompiler

import (
	"strings"
	"testing"
)

func markerlessSsrTextCallCount(code string) int {
	count := 0
	for _, line := range strings.Split(code, "\n") {
		if strings.Contains(line, "__exactSsr.text(") && strings.Contains(line, "__exactCharacters, true") {
			count++
		}
	}
	return count
}

func TestSessionFoldsSerializedMarkupAroundServerText(t *testing.T) {
	response := NewSession().Execute(Request{ID: "text-surroundings.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Panel(props: {text: string; title: string}) {
            return () => <section><strong>{props.text}</strong><span title={props.title}>{props.text}</span> Tail {props.text}</section>;
        }`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, "__exactSsr.static(") ||
		!strings.Contains(response.Code, "</strong><span") ||
		!strings.Contains(response.Code, "</section>") {
		t.Fatalf("text writes did not retain their surrounding serialized markup: %s", response.Code)
	}
}

func TestSessionKeepsDynamicPreparationInsideCompilerOwnedRootBags(t *testing.T) {
	response := NewSession().Execute(Request{ID: "attributes.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Panel(props: { title: string }) { return () => <main title={props.title}><span title={props.title}>{props.title}</span></main>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "__exactInvocation.eagerValues[0]") ||
		strings.Contains(response.Code, "prepareAttribute(__exactInvocation, 0)") ||
		!strings.Contains(response.Code, "prepareAttribute(__exactInvocation, 1)") ||
		!strings.Contains(response.Code, "prepareText(__exactInvocation, 2)") {
		t.Fatalf("root bag optimization changed dynamic slot preparation: %s", response.Code)
	}
}

func TestSessionReusesOnlyCompilerProvenServerListPrograms(t *testing.T) {
	for _, intrinsic := range []bool{true, false} {
		child := `(<Leaf label={row.label}/>)`
		if intrinsic {
			child = `(<li onClick={() => console.log(row.id)}>{row.label}</li>)`
		}
		response := NewSession().Execute(Request{ID: "rows.tsx", Kind: "compile", Target: TargetServer,
			Source: `import type { Component } from "@exactjs/core";
            interface Row { /** @exact key */ id: string; label: string; }
            function Leaf(props: {label: string}) { return () => <span>{props.label}</span>; }
            export function Rows(this: Component<{filter: string}>, props: {rows: Row[]}) { this.state.filter = ""; return () => <ul>{props.rows.map(row => ` + child + `)}</ul>; }`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, ", row.id, true)") != intrinsic {
			t.Fatalf("server item boundary proof does not match its output: %s", response.Code)
		}
	}
}
