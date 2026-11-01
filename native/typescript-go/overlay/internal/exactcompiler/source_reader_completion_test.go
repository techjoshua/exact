package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A reached normal continuation has completed its single try assignment.
// Conditional writers and non-abrupt catches retain their original alternatives.
func TestReaderCompletedTryAssignment(t *testing.T) {
	const consumer = `function consume(value:{kind:string}){return value.kind}`
	const browser = `{get kind(){return window.location.href}}`
	for _, c := range []struct {
		name, body string
		neutral    bool
	}{
		{"uninitialized-normal", `let outcome:{kind:string};try{outcome={kind:'audit'}}catch{return 'caught'}return consume(outcome)`, true},
		{"overwritten-getter", `let outcome:{kind:string}=` + browser + `;try{outcome={kind:'audit'}}catch{return 'caught'}return consume(outcome)`, true},
		{"catch-both-abrupt", `let outcome:{kind:string};try{outcome={kind:'audit'}}catch{if(flag)return 'caught';else throw new Error('caught')}return consume(outcome)`, true},
		{"catch-fallthrough", `let outcome:{kind:string}=` + browser + `;try{outcome=load()}catch{}return consume(outcome)`, false},
		{"conditional", `let outcome:{kind:string}=` + browser + `;try{if(flag)outcome={kind:'audit'}}catch{return 'caught'}return consume(outcome)`, false},
		{"loop", `let outcome:{kind:string}=` + browser + `;try{while(flag){outcome={kind:'audit'};break}}catch{return 'caught'}return consume(outcome)`, false},
		{"earlier-read", `let outcome:{kind:string}=` + browser + `;const before=consume(outcome);try{outcome={kind:'audit'}}catch{return 'caught'}return before`, false},
		{"finally-replacement", `let outcome:{kind:string}=` + browser + `;try{outcome={kind:'audit'}}catch{return 'caught'}finally{outcome=` + browser + `}return consume(outcome)`, false},
		{"later-possible-writer", `let outcome:{kind:string};try{outcome={kind:'audit'}}catch{return 'caught'}if(flag)outcome=` + browser + `;return consume(outcome)`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reader-completed-try.ts", Diagnostics: "semantic", Source: consumer + `export function run(flag:boolean,load:()=>{kind:string}){` + c.body + `}`})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid source control: %s %#v", r.Error, r.Diagnostics)
			}
			for _, summary := range r.Analysis.Callables {
				if summary.Name != "run" {
					continue
				}
				browserSource := false
				for _, effect := range summary.EffectSources {
					browserSource = browserSource || effect.Environment == "browser" && strings.Contains(effect.Description, "window")
				}
				if c.neutral && (summary.Effect != "neutral" || browserSource) || !c.neutral && (summary.Effect == "neutral" || !browserSource) {
					t.Fatalf("effect=%s browser=%v wantNeutral=%v sources=%#v", summary.Effect, browserSource, c.neutral, summary.EffectSources)
				}
				return
			}
			t.Fatal("missing run consumer")
		})
	}
}

// An eligible lexical reader is not authority to admit a different indexed call.
func TestReaderCompletionOperationBoundary(t *testing.T) {
	const id = "/virtual/reader-operation-boundary.ts"
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: id, Diagnostics: "semantic", Source: `function consume(v:{kind:string}){return v.kind}function other(){}export function run(){let outcome:{kind:string};try{outcome={kind:'audit'}}catch{return 'caught'}const first=consume(outcome);return consume(outcome)}`})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatalf("invalid source: %#v", r.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var work, owner, other *ast.Node
		var readers []*ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) && n.Name() != nil {
				if n.Name().Text() == "run" {
					owner = n
				}
				if n.Name().Text() == "other" {
					other = n
				}
			}
			if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && ast.IsIdentifier(n.AsBinaryExpression().Left) && n.AsBinaryExpression().Left.Text() == "outcome" {
				work = n
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.AsCallExpression().Expression) && n.AsCallExpression().Expression.Text() == "consume" {
				readers = append(readers, n)
			}
			return true
		})
		if work == nil || owner == nil || other == nil || len(readers) != 2 {
			t.Fatal("source operations absent")
		}
		for _, c := range []struct {
			name                     string
			effect, selected, reader *ast.Node
			fuel                     int
			want                     bool
		}{
			{"normal", owner, readers[0], readers[0], 4096, true},
			{"other-indexed-reader", owner, readers[0], readers[1], 4096, false},
			{"other-owner", other, readers[0], readers[0], 4096, false},
			{"value-only-query", nil, readers[0], readers[0], 4096, false},
			{"zero-estimate", owner, readers[0], readers[0], 0, true},
		} {
			t.Run(c.name, func(t *testing.T) {
				q := sourceValueQuery{owner: project.callableCache.owner.values, effectOwner: c.effect, reading: c.selected, remaining: c.fuel}
				if got := q.readerAssignmentCompleted(work, c.reader, nil); got != c.want {
					t.Fatalf("got %v want %v", got, c.want)
				}
			})
		}
		checked = true
	}
	if !checked {
		t.Fatal("source owner unavailable")
	}
}
