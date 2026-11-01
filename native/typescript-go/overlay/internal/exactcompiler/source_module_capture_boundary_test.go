package exactcompiler

import "testing"

// An eager caller owns its source-write boundary even when the member read is in
// a captured body. Separate callers must not reuse an earlier value or acquire a
// later, unrelated write as a dependency.
func TestModuleCaptureReadBoundary(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"changed-after-first-read", `const box={value:'safe'};function read(){return box.value}export const safeValue=read();box.value=document.title;export const value=read();`, "client"},
		{"later-write", `const box={value:'safe'};function read(){return box.value}export const value=read();box.value=document.title;`, "isomorphic"},
		{"unrelated-receiver", `const box={value:'safe'};const other={value:'safe'};function read(){return box.value}other.value=document.title;export const value=read();`, "isomorphic"},
		{"unrelated-member", `const box={value:'safe',other:'safe'};function read(){return box.value}box.other=document.title;export const value=read();`, "isomorphic"},
		{"retained-alias", `const box={value:'safe'};const alias=box;function read(){return box.value}alias.value=document.title;export const value=read();`, "client"},
		{"getter-rhs", `const box={value:'safe'};const incoming={get value(){return document.title}};function read(){return box.value}box.value=incoming.value;export const value=read();`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}
