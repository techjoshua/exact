package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A source return is an input relationship, not an integrity event or output.
func TestSourceFreezeRelationshipAuthority(t *testing.T) {
	const source = `export function read(){const o=Object.freeze({get value(){return document.title}});return o.value}`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/freeze-source-authority.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/freeze-source-authority.ts")
		if file == nil {
			continue
		}
		var call, body, literal *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) && n.Name().Text() == "read" {
				body = n
			}
			if ast.IsCallExpression(n) {
				call = n
			}
			if ast.IsObjectLiteralExpression(n) {
				literal = n
			}
			return true
		})
		if call == nil || body == nil || literal == nil {
			t.Fatal("missing source fixture")
		}
		q := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, body)
		var values []sourceValue
		part := q.projectSourceCallReturns(call, nil, func(value sourceValue, _ sourceValueBindings) { values = append(values, value) }, func() { t.Error("ordinary source return refused") })
		if part.opaque || len(values) != 1 || values[0].node != literal {
			t.Fatalf("source relationship opaque=%v values=%d", part.opaque, len(values))
		}
		if q.inputs != nil || q.operation != nil || len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 || len(part.reflective) != 0 {
			t.Fatal("source relationship acquired normal authority")
		}
		if values[0].normal != nil || values[0].acquired != nil || values[0].native != nil {
			t.Fatal("source relationship published native/normal output")
		}
		if len(part.nativeDescriptorEffects) == 0 {
			t.Fatal("missing independent descriptor verdict")
		}
		for _, effect := range part.nativeDescriptorEffects {
			if effect.verdict != sourceWriteTop {
				t.Fatal("source descriptor Top became NoWrites")
			}
		}
		if _, found := q.acquireNormalCallResult(call, &accessorCandidates{}); found {
			t.Fatal("source acquired a normal output")
		}
	}
}

// Source selection owns shadow/replacement alternatives, independent of the
// native argument relationship. Aliases do not suppress opaque foreign writes.
func TestSourceFreezeSelectionControls(t *testing.T) {
	for _, row := range []struct {
		name, prefix, body, effect string
		browser                    bool
	}{
		{"plain browser RHS", "", `const value=document.title;const o={value};return o.value`, "browser", true},
		{"frozen browser RHS", "", `const value=document.title;const o=Object.freeze({value});return o.value`, "browser", true},
		{"replaced", `Object.freeze=((x:unknown)=>{document.title;return {value:1}}) as typeof Object.freeze;`, `return Object.freeze({value:0}).value`, "browser", true},
		{"foreign overlapping", `declare function external(value:object):void;external(Object);`, `return Object.freeze({get value(){return document.title}}).value`, "unknown", true},
		{"unknown target", `declare const external:object;`, `Object.freeze(external);return 1`, "unknown", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/freeze-selection.ts", Source: row.prefix + `export function read(){` + row.body + `}`, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			fact := findCallable(t, r.Analysis.Callables, "read")
			browser := false
			for _, s := range fact.EffectSources {
				browser = browser || s.Environment == "browser"
			}
			if fact.Effect != row.effect || browser != row.browser {
				t.Fatalf("effect=%s browser=%v want %s/%v", fact.Effect, browser, row.effect, row.browser)
			}
		})
	}
}
