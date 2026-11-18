package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Syntax discovery cannot execute a body, resolve imports or install source authority.
func TestExecutableSyntaxSlots(t *testing.T) {
	source := `import type {T} from './types.js';import {value} from './value.js';export {value} from './value.js';export type {T} from './types.js';const later=()=>import('./lazy.js');const required=require('./required.cjs');function recur(){document.title='not executed';return recur()}recur();`
	session := NewSession()
	response := session.Execute(Request{Kind: "executable-slots", ID: "/virtual/slots.ts", Source: source})
	want := []ExecutableSlotFact{{0, "./types.js", "import", true}, {1, "./value.js", "import", false}, {2, "./value.js", "import", false}, {3, "./types.js", "import", true}, {4, "./lazy.js", "import", false}, {5, "./required.cjs", "require", false}}
	if response.Error != "" || len(response.Diagnostics) != 0 || !reflect.DeepEqual(response.ExecutableSlots, want) {
		t.Fatalf("syntax result: %s %#v %#v", response.Error, response.Diagnostics, response.ExecutableSlots)
	}
	if response.ExecutableSlotsVersion != ExecutableSlotsVersion || response.Code != "" || response.ExecutableSelection != nil || len(session.projects) != 0 || session.validationProgram != nil || !reflect.DeepEqual(response.Analysis, newSessionResponse(response.ID).Analysis) || response.Counters != (WorkCounters{}) {
		t.Fatal("syntax discovery acquired semantic/session authority")
	}
	for _, test := range []struct {
		id, source string
		invalid    bool
	}{
		{"/virtual/generic.ts", `const identity=<T>(value:T)=>value;export {identity};`, false},
		{"/virtual/element.tsx", `import {value} from './value.js';export const x=<p>{value}</p>;`, false},
		{"/virtual/bad.ts", `import { from './bad.js';`, true},
		{"/virtual/empty.js", "", false},
	} {
		t.Run(test.id, func(t *testing.T) {
			r := session.Execute(Request{Kind: "executable-slots", ID: test.id, Source: test.source})
			if r.Error != "" || (len(r.Diagnostics) != 0) != test.invalid || r.ExecutableSlots == nil {
				t.Fatalf("parser result: %s %#v", r.Error, r.Diagnostics)
			}
			if len(session.projects) != 0 {
				t.Fatal("syntax parser created a Program")
			}
		})
	}
	for _, request := range []Request{
		{Kind: "executable-slots", Source: source},
		{Kind: "executable-slots", ID: "/virtual/slots.ts", Target: TargetClient},
		{Kind: "executable-slots", ID: "/virtual/slots.ts", Diagnostics: "semantic"},
		{Kind: "executable-slots", ID: "/virtual/slots.ts", ExecutableSelection: &ExecutableSelection{}},
		{Kind: "executable-slots", ID: "/virtual/slots.ts", Sources: []ProjectSource{{ID: "/virtual/other.ts"}}},
	} {
		if r := session.Execute(request); r.Error == "" {
			t.Fatalf("invalid syntax request accepted: %#v", request)
		}
	}
}

func TestExecutableSyntaxSlotsPreserveSemanticPeer(t *testing.T) {
	session := NewSession()
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	request := Request{Kind: "analyze", ID: filepath.Join(root, "syntax-slot-peer.ts"), Source: `import type {Component} from '@exactjs/core';export function read(){return document.title}export function Page(this:Component<{label:string}>){this.state.label=read();return()=>this.state.label}`}
	before := session.Execute(request)
	if before.Error != "" || executableSummary(t, before, "read").Effect != "browser" {
		t.Fatal("semantic peer did not execute normal analysis")
	}
	var project *projectState
	for _, p := range session.projects {
		project = p
	}
	cache, validation, counters := project.callableCache, session.validationProgram, project.counters
	r := session.Execute(Request{Kind: "executable-slots", ID: request.ID, Source: `import './replacement.js';export function read(){return process.cwd()}`})
	if r.Error != "" || len(r.ExecutableSlots) != 1 || len(session.projects) != 1 || project.callableCache != cache || session.validationProgram != validation || project.counters != counters {
		t.Fatal("syntax query mutated retained semantic state")
	}
	after := session.Execute(request)
	if after.Error != "" || !reflect.DeepEqual(before.Analysis, after.Analysis) {
		t.Fatal("syntax query changed analyze outputs")
	}
}
