package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestSourceGetReferenceGuards(t *testing.T) {
	source := `export function read(input:{value:string},other:{value:string}){input.value;other.value;input.value='safe'}`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/source-reference.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	for _, project := range session.projects {
		var operation, other, assignment *ast.Node
		walkNode(project.program.GetSourceFile("/virtual/source-reference.ts").AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) {
				read, _ := accessorEvaluationMode(node)
				if !read {
					assignment = node
				} else if node.Expression().Text() == "input" {
					operation = node
				} else {
					other = node
				}
			}
			return true
		})
		if operation == nil || other == nil || assignment == nil {
			t.Fatal("valid reference fixture missing")
		}
		receiver, key := accessorReceiver(operation)
		reference := sourceGetReferenceFor(operation, receiver, nil, key, accessorRead)
		if reference == nil || !reference.matches(nil, key) || !reference.matches([]string{key}, "") || reference.after(nil, key) != nil || reference.after([]string{key}, "") != nil {
			t.Fatal("original Get presence relation missing or survives its Get")
		}
		if reference.matches([]string{"inner", key}, "") || reference.matches(nil, "other") || reference.after([]string{"inner", key}, "") != reference {
			t.Fatal("receiver projection consumed or borrowed another Get")
		}
		for _, c := range []struct {
			name                string
			operation, receiver *ast.Node
			path                []string
			key                 string
			mode                accessorTraversal
		}{
			{"no-operation", nil, receiver, nil, key, accessorRead},
			{"wrong-operation", receiver, receiver, nil, key, accessorRead},
			{"wrong-receiver", operation, other.Expression(), nil, key, accessorRead},
			{"wrong-key", operation, receiver, nil, "other", accessorRead},
			{"projected", operation, receiver, []string{key}, key, accessorRead},
			{"acquire", operation, receiver, nil, key, accessorAcquire},
			{"serialization", operation, receiver, nil, key, accessorSerialize},
			{"no-Get", operation, receiver, nil, key, accessorNoGet},
			{"wrong-write-mode", operation, receiver, nil, key, accessorSet},
			{"assignment", assignment, assignment.Expression(), nil, key, accessorSet},
		} {
			t.Run(c.name, func(t *testing.T) {
				if sourceGetReferenceFor(c.operation, c.receiver, c.path, c.key, c.mode) != nil {
					t.Fatal("unmatched source operation supplied receiver presence")
				}
			})
		}
	}
}

func TestPossibleProxyUnanchoredReceiverDefault(t *testing.T) {
	source := `export{};function read(input:{value:string}){return input.value}const input=new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return receiver}});read(input);`
	session, _, caller := currentProxyCaller(t, source, "read(input);")
	for _, effect := range caller.EffectSources {
		if effect.Environment == "browser" {
			t.Fatal("direct Member receiver default was activated", caller.EffectSources)
		}
	}
	checked := false
	for _, project := range session.projects {
		owner := project.callableCache.owner
		var site, member *ast.Node
		walkNode(project.program.GetSourceFile("/virtual/possible-proxy.ts").AsNode(), func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			if ast.IsPropertyAccessExpression(node) && node.Expression().Text() == "input" {
				member = node
			}
			return true
		})
		if site == nil || member == nil {
			t.Fatal("source operations missing")
		}
		q := sourceValueQuery{owner: owner.values, executable: owner, dependenciesOnly: true, remaining: 4096, active: make(map[*ast.Node]bool), protectedMember: member}
		result := accessorCandidates{}
		// A matching-looking outer protectedMember supplies no original source
		// reference to this independently requested Get.
		q.sourceProxyGetDependencies(site, []string{"value"}, "", accessorRead, nil, &result, nil)
		browser := false
		for _, effect := range result.environmentEffects {
			browser = browser || effect.Environment == "browser"
		}
		if !browser || !result.opaque || !result.valueIncomplete || len(result.values) != 0 || len(result.normalCalls) != 0 || len(result.fieldOutcomes) != 0 || len(result.ownedGets) != 0 {
			t.Fatal("unanchored receiver default lost or acquired normal/DATA authority", result)
		}
		checked = true
	}
	if !checked {
		t.Fatal("source project missing")
	}
}

func TestPossibleProxyProjectedAndDynamicReferences(t *testing.T) {
	for _, c := range []struct{ name, source, call string }{
		{"projected", `export{};function read(input:{nested:{value:string}}){return input.nested.value}const input={nested:new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return 'safe'}})};read(input);`, "read(input);"},
		{"dynamic", `export{};function read(input:{value:string},key:'value'){return input[key]}const input=new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return 'safe'}});read(input,'value');`, "read(input,'value');"},
		{"dynamic-body", `export{};function read(input:{value:string},key:'value'){return input[key]}const input=new Proxy({value:'safe'},{get(){document.title;return 'safe'}});read(input,'value');`, "read(input,'value');"},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, _, caller := currentProxyCaller(t, c.source, c.call)
			browser, unknown := false, false
			for _, effect := range caller.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != (c.name == "dynamic-body") || !unknown {
				t.Fatal("projected/dynamic source reference lost its Get boundary", caller.EffectSources)
			}
		})
	}
}
