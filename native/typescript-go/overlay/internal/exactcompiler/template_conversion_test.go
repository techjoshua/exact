package exactcompiler

import (
	"strings"
	"testing"
)

// Interpolation converts each evaluated input on the task target. A tag receives
// the original object and a successful ordinary toString bypasses valueOf.
func TestTaskTemplateStringConversion(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, fields, expression string
		browser                  bool
	}{
		{"method", "toString(){document.title;return 'x'}", "`v${item}`", true},
		{"exotic", "[Symbol.toPrimitive](){document.title;return 'x'}", "`v${item}`", true},
		{"fallback", "toString(){return {}}, valueOf(){document.title;return 0}", "`v${item}`", true},
		{"skipped", "toString(){return 'x'}, valueOf(){document.title;return 0}", "`v${item}`", false},
		{"tagged", "toString(){document.title;return 'x'}", "tag`v${item}`", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import {TaskContext,type Component} from '@exactjs/core';const item={" + row.fields + "};function tag(parts:TemplateStringsArray,item:object){return 1} export function Page(this:Component<{}>){function run(task:TaskContext=TaskContext.server()){return " + row.expression + "}return()=> <button onClick={()=>run()}>run</button>}"
			for _, target := range []Target{TargetClient, TargetServer} {
				r := formsCompileSource(t, root, config, source, target)
				refused := containsDiagnosticCode(r.Diagnostics, "EXACT2001") && strings.Contains(strings.Join(formsDiagnosticDetails(r.Diagnostics), " "), "document")
				if refused != row.browser || (r.Code == "") != row.browser || !row.browser && hasErrorDiagnostic(r.Diagnostics) {
					t.Fatalf("%s: emitted=%v diagnostics=%v", target, r.Code != "", r.Diagnostics)
				}
			}
		})
	}
}
