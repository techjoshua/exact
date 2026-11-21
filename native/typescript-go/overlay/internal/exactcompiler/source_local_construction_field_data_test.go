package exactcompiler

import (
	"strings"
	"testing"
)

const storedDescriptorComponent = `import {TaskContext,type Component} from '@exactjs/core';
function descriptorOf(input:object){return Object.getOwnPropertyDescriptor(input,'value')}
function value(){return document.title}
export function Page(this:Component<{label:string}>){
	this.state.label='';
	const run=(task:TaskContext=TaskContext.server())=>{this.state.label=BODY};
	return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`

func TestLocalConstructionCapturedFieldSource(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, expr string
		browser    bool
	}{
		{"returned-capture", "descriptorOf({value:()=>value()})?.value()", true},
		{"stored", "String(descriptorOf({value}))", false},
		{"shorthand", "descriptorOf({value})?.value()", true},
		{"method", "descriptorOf({value(){return document.title}})?.value()", true},
		{"get", "Object.getOwnPropertyDescriptor({get value(){return document.title}},'value')?.get?.()", true},
		{"stored-getter", "String(Object.getOwnPropertyDescriptor({get value(){return document.title}},'value')?.get)", false},
		{"setter", "String(Object.getOwnPropertyDescriptor({set value(v:string){document.title=v}},'value')?.set?.('changed'))", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := formsCompileSource(t, root, config, strings.Replace(storedDescriptorComponent, "BODY", row.expr, 1), target)
				assertComponentCallbackPolicy(t, response, row.browser)
			}
		})
	}
}
