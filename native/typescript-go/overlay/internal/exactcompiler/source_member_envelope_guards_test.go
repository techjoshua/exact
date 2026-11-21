package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These owner-unit endpoints test the bounded fact, not execution identity.
// The ordinary analysis response independently protects valid source/effects.
func envelopeGuardQuery(t *testing.T, session *Session, id, key string) (sourceValueQuery, *ast.Node, map[string]*ast.Node) {
	t.Helper()
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var factory, call, origin *ast.Node
		members := make(map[string]*ast.Node)
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "make" {
				factory = n
			}
			if ast.IsVariableDeclaration(n) && ast.IsIdentifier(n.Name()) && n.Name().Text() == "update" && enclosingCallableNode(n).Name().Text() == "run" {
				call = unwrapSourceCallableReference(n.Initializer())
			}
			if factory != nil && ast.IsObjectLiteralExpression(n) && enclosingCallableNode(n) == factory && origin == nil {
				origin = n
			}
			if ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n) {
				root, name := accessorReceiver(n)
				owner := enclosingCallableNode(n)
				if ast.IsIdentifier(root) && owner != nil && owner.Name() != nil {
					members[root.Text()+"."+name+"@"+owner.Name().Text()] = n
				}
			}
			return true
		})
		member := members["update."+key+"@run"]
		if factory == nil || call == nil || origin == nil || member == nil {
			t.Fatal("missing guard endpoint")
		}
		owner := project.callableCache.owner.values
		q := sourceValueQuery{owner: owner, remaining: 4096, active: make(map[*ast.Node]bool), protectedMember: member, freshReturnCall: call, creators: map[*ast.Node]sourceValueCreation{factory: {invocation: call, returning: owner.summary(factory).returns[0]}}}
		return q, origin, members
	}
	t.Fatal("missing source program")
	return sourceValueQuery{}, nil, nil
}

func checkEnvelopeGuard(t *testing.T, query *sourceValueQuery, origin *ast.Node, key string, want bool) int {
	t.Helper()
	before := query.estimatedCost
	result := accessorCandidates{opaque: true}
	got := query.confinedEnvelope(origin, nil, key, accessorRead, &result)
	if got != want || !result.opaque {
		t.Fatalf("confinement=%v want=%v opaque=%v estimate=%d->%d", got, want, result.opaque, before, query.estimatedCost)
	}
	return query.estimatedCost - before
}

// A local accessor's effect stays on the original task. Only its unexposed receiver
// can skip unrelated member writer recovery.
func TestComponentLocalGetterConfinement(t *testing.T) {
	const getter = `get value(){return document.title}`
	for _, row := range []struct {
		name, shape, extra string
		confined           bool
	}{
		{"local read", getter, "", true},
		{"captured read", getter, "const read=()=>box.value;void read();", true},
		{"bare alias", getter, "const alias=box;void alias;", false},
		{"delete", getter, "delete (box as {value?:string}).value;", false},
		{"descriptor replacement", getter, "Object.defineProperty(box,'value',{value:'changed'});", false},
		{"getter receiver", "get value(){void this;return document.title}", "", false},
		{"inherited getter", "get value(){return super.toString()+document.title}", "", false},
		{"member invocation", "get value(){return ()=>document.title}", "void box.value();", false},
		{"dynamic lexical source", getter, "void eval('box');", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			body := `const box={` + row.shape + `};` + row.extra + `const value=box.value;this.state.label=String(value);`
			fixture := newPublicAwaitRequiredFixture(t, publicAwaitRequiredPage("", body, TargetClient))
			request := fixture.request("analyze", "entry.tsx")
			session := NewSession()
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || len(response.Analysis.Tasks) != 1 {
				t.Fatalf("invalid component control: %s %#v", response.Error, response.Diagnostics)
			}
			if row.confined {
				found := false
				for _, effect := range response.Analysis.Tasks[0].EffectSources {
					found = found || effect.Environment == "browser" && strings.Contains(effect.Description, "document")
				}
				if !found {
					t.Fatal("confinement lost the getter's browser effect")
				}
			}
			for _, project := range session.projects {
				file := project.program.GetSourceFile(request.ID)
				if file == nil {
					continue
				}
				var origin *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "box" {
						origin = node.Initializer()
					}
					return origin == nil
				})
				if origin == nil {
					t.Fatal("missing local receiver")
				}
				query := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096}
				result := accessorCandidates{}
				if got := query.confinedLocalGetter(origin, []string{"value"}, "", accessorAcquire, &result); got != row.confined {
					t.Fatalf("confinement=%v want=%v", got, row.confined)
				}
				if query.confinedLocalGetter(origin, nil, "unrelated", accessorRead, &result) {
					t.Fatal("confinement supplied a different member")
				}
				return
			}
			t.Fatal("missing source program")
		})
	}
}

// Static slot names follow the scanner, while every envelope transfer, write
// and member invocation stays outside the non-invoking data-read subset.
func TestFreshEnvelopeSafetyFrontiers(t *testing.T) {
	const data = `function make(){return {audit:'',error:''}}`
	cases := []struct {
		group, name, factory, body, key string
		want, browser                   bool
	}{
		{"brackets", "string", data, `const update=make();return update['error']`, "error", true, false},
		{"brackets", "numeric", `function make(){return {10:''}}`, `const update=make();return update[10]`, "10", true, false},
		{"brackets", "canonical-exponent", `function make(){return {1e1:''}}`, `const update=make();return update[1e1]`, "10", true, false},
		{"brackets", "canonical-string", `function make(){return {1e1:''}}`, `const update=make();return update['10']`, "10", true, false},
		{"brackets", "different-text", `function make():{[key:string]:string}{return {1e1:''}}`, `const update=make();return update['1e1']`, "1e1", false, false},
		{"literal-shape", "computed-effect", `function fieldName(){window.location.hash='key';return 'error'}function make(){return {[fieldName()]:''}}`, `const update=make();return update['error']`, "error", false, true},
		{"literal-shape", "empty-key", `function make(){return {'':''}}`, `const update=make();return update['']`, "", false, false},
		{"literal-shape", "prototype-key", `function make(){return {__proto__:null,error:''}}`, `const update=make();return update.error`, "error", false, false},
		{"reference-use", "shorthand", `let published:unknown;` + data, `const update=make();published={update};return update.error`, "error", false, false},
		{"reference-use", "member-write", data, `const update=make();update.error='changed';return update.error`, "error", false, false},
		{"member-invocation", "construct", `function make(){return {error:'',ctor:class {value=0}}}`, `const update=make();new update.ctor();return update.error`, "error", false, false},
		{"member-invocation", "tag", `function make(){return {error:'',tag:function(strings:TemplateStringsArray){return strings[0]??''}}}`, "const update=make();update.tag`text`;return update.error", "error", false, false},
		{"context", "binder-and-key", data, `const update=make();const peer=make();return (update.error,update.audit,peer.error)`, "error", true, false},
		{"context", "receiving-owner", data, `const update=make();function read(){return update.error}return update.error`, "error", false, false},
		{"estimate", "low-estimate", data, `const update=make();update.audit;update.audit;return update.error`, "error", true, false},
	}
	for _, c := range cases {
		t.Run(c.group+"/"+c.name, func(t *testing.T) {
			id := "/virtual/envelope-safety-" + c.group + "-" + c.name + ".ts"
			source := c.factory + `export function run(){` + c.body + `}`
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid source: %s %#v", response.Error, response.Diagnostics)
			}
			if c.browser {
				found := false
				for _, callable := range response.Analysis.Callables {
					if callable.Name == "run" {
						for _, effect := range callable.EffectSources {
							found = found || effect.Environment == "browser" && strings.Contains(effect.Description, "window")
						}
					}
				}
				if !found {
					t.Fatal("lost computed-name browser source")
				}
			}
			base, origin, members := envelopeGuardQuery(t, session, id, c.key)
			q := base
			used := checkEnvelopeGuard(t, &q, origin, c.key, c.want)
			if strings.HasPrefix(c.name, "canonical-") || c.name == "different-text" {
				if origin.AsObjectLiteralExpression().Properties.Nodes[0].Name().Text() != "10" {
					t.Fatal("scanner did not canonicalize numeric key")
				}
			}
			if c.name == "binder-and-key" {
				q = base
				q.protectedMember = members["peer.error@run"]
				if q.protectedMember == nil {
					t.Fatal("missing nonnil wrong binder")
				}
				checkEnvelopeGuard(t, &q, origin, "error", false)
				q = base
				q.protectedMember = members["update.audit@run"]
				if q.protectedMember == nil {
					t.Fatal("missing nonnil wrong key")
				}
				checkEnvelopeGuard(t, &q, origin, "error", false)
			}
			if c.name == "receiving-owner" {
				q = base
				q.protectedMember = members["update.error@read"]
				if q.protectedMember == nil {
					t.Fatal("missing nonnil wrong receiving owner")
				}
				checkEnvelopeGuard(t, &q, origin, "error", false)
			}
			if c.name == "low-estimate" {
				q = base
				q.remaining = 0
				spent := checkEnvelopeGuard(t, &q, origin, "error", true)
				if spent <= 0 || spent != used {
					t.Fatal("advisory allowance changed estimated work")
				}
			}
		})
	}
}
