package exactcompiler

import (
	"strings"
	"testing"
)

func TestTaskPolicyImportLookupCut(t *testing.T) {
	const imports = `import {TaskContext as Policy} from '@exactjs/core';
import * as Core from '@exactjs/core';
import * as Foreign from './foreign';`
	for _, test := range []struct {
		expression string
		matched    bool
		lookups    int
	}{
		{"1", false, 0},
		{"'color'", false, 0},
		{"(Policy = Policy)", false, 0},
		{"Policy['client']()", false, 0},
		{"Core.Other.client()", false, 0},
		{"Policy", true, 1},
		{"((Policy).client()).latest()", true, 1},
		{"Core.TaskContext", true, 1},
		{"Core.TaskContext.client().latest()", true, 1},
		{"Foreign.TaskContext.client()", false, 1},
		{"Unknown.client()", false, 1},
	} {
		t.Run(test.expression, func(t *testing.T) {
			file := parseNormalizationSource("/virtual/lookup-cut.ts", imports+"\nfunction read(input="+test.expression+"){}")
			node := file.Statements.Nodes[len(file.Statements.Nodes)-1]
			initial := node.Parameters()[0].Initializer()
			root, namespace := taskPolicyRootReference(initial)
			lookups := 0
			matched := false
			if root != nil {
				lookups++
				matched = matchesTaskPolicyImport(root, namespace, collectExternalImportBindings(file, nil))
			}
			if matched != test.matched || lookups != test.lookups {
				t.Fatalf("got matched=%t and %d lookups; want %t and %d", matched, lookups, test.matched, test.lookups)
			}
		})
	}

	// The syntax-only hint intentionally keeps its authored text shortcut.
	file := parseNormalizationSource("/virtual/text-hint.ts", `function hint(input='TaskContext') {}`)
	if !looksLikeTaskPolicy(file.Statements.Nodes[0], file) {
		t.Fatal("authored TaskContext text hint changed")
	}
}

func TestTaskPolicyImportTableSharedByCandidateBatch(t *testing.T) {
	const source = `import {TaskContext as Policy} from '@exactjs/core';
function first(task = Policy.client().latest()) {}
function second(task = Policy.server().blocking()) {}`
	file := parseNormalizationSource("/virtual/batch.ts", source)
	candidates := rawComponentCandidates(file)
	if len(candidates) != 2 || candidates[0].name != "first" || candidates[1].name != "second" {
		t.Fatalf("unexpected candidate order: %#v", candidates)
	}

	var shared externalImportBindings
	const witness = "test table identity"
	singleBuilds := 0
	for i, candidate := range candidates {
		var single externalImportBindings
		if !looksLikeTaskPolicyWithImports(candidate.node, file, &single) || single.byName == nil ||
			!looksLikeTaskPolicyWithImports(candidate.node, file, &shared) || shared.byName == nil {
			t.Fatalf("real policy %q lost its lookup", candidate.name)
		}
		singleBuilds++
		if i == 0 {
			shared.byName[witness] = externalImportReference{}
		} else if _, retained := shared.byName[witness]; !retained {
			t.Fatal("the second policy rebuilt the first policy's import table")
		}
	}
	if filtered := filterDurableComponentCandidates(candidates, file, nil); len(filtered) != 0 {
		t.Fatalf("policy definitions became durable candidates: %#v", filtered)
	}
	t.Logf("two real lookups: per-candidate builds=%d, shared builds=1", singleBuilds)

	revised := parseNormalizationSource("/virtual/batch.ts", strings.Replace(source, "@exactjs/core", "foreign", 1))
	var refreshed externalImportBindings
	if looksLikeTaskPolicyWithImports(rawComponentCandidates(revised)[0].node, revised, &refreshed) || refreshed.byName == nil {
		t.Fatal("refreshed parse did not resolve its own authored import")
	}
	if _, retained := refreshed.byName[witness]; retained {
		t.Fatal("a new parse received the old candidate table")
	}
}
