package exactcompiler

import "testing"

// The native protocol supplies presence, not concrete values or nested DATA.
// Every row observes the exact later Get caller, independently of New effects.
func TestPossibleProxySourceTrapInputs(t *testing.T) {
	for _, c := range []struct {
		name, setup string
		browser     bool
	}{
		{"supplied-defaults", `const input=new Proxy({value:'safe'},{get(_target={value:document.title},_key:string|symbol=document.title){return 'safe'}});`, false},
		{"direct-receiver-default", `const input=new Proxy({value:'safe'},{get(_target,_key,receiver=document.title){return receiver}});`, false},
		{"extra-default", `const handler:ProxyHandler<{value:string}>={get(_target,_key,_receiver,extra=document.title){return extra}};const input=new Proxy({value:'safe'},handler);`, true},
		{"nested-default", `const target:{value:string,missing?:string}={value:'safe'};const input=new Proxy(target,{get({missing=document.title}){return missing}});`, true},
		{"rest-inputs", `const input=new Proxy({get value(){return document.title}},{get(...args:[{value:string},string|symbol,unknown]){return args[0].value}});`, true},
		{"explicit-this", `const handler={get note(){return document.title},get(this:{note:string}){return this.note}};const input=new Proxy({value:'safe'},handler);`, true},
		{"generator-extra-default", `const handler:ProxyHandler<{value:string}>={*get(_target,_key,_receiver,extra=document.title){yield extra}};const input=new Proxy({value:'safe'},handler);`, true},
		{"handler-this", `const handler={get title(){return document.title},get(){return this.title}};const input=new Proxy({value:'safe'},handler);`, true},
		{"target-formal", `const input=new Proxy({get value(){return document.title}},{get(target){return target.value}});`, true},
		{"generator-body", `const input=new Proxy({value:'safe'},{*get(){document.title;yield 'proxy'}});`, false},
		{"generator-default", `const input=new Proxy({value:'safe'},{*get(_target={value:document.title}){yield 'proxy'}});`, false},
		{"acquired-handler", `let handler={get(){return 'safe'}};const input=new Proxy({value:'safe'},handler);handler={get(){return document.title}};`, false},
		{"acquired-target", `let target={get value(){return 'safe'}};const input=new Proxy(target,{});target={get value(){return document.title}};`, false},
		{"unreached-trap-suffix", `const input=new Proxy({value:'safe'},{get(){return 'safe';document.title}});`, false},
		{"unknown-trap", `declare function foreign():void;const input=new Proxy({value:'safe'},{get(){foreign();return 'safe'}});`, false},
		{"dynamic-key", `const input=new Proxy({value:'safe'},{get(_target,key){if(key==='value')document.title;return 'safe'}});`, true},
		{"joined-handler-contexts", `declare const choice:boolean;function make(source:{value:string}){return {get(){return source.value}}}const a=make({value:'safe'}),b=make({get value(){return document.title}});const input=new Proxy({value:'safe'},choice?a:b);`, true},
		{"reversed-handler-contexts", `declare const choice:boolean;function make(source:{value:string}){return {get(){return source.value}}}const a=make({value:'safe'}),b=make({get value(){return document.title}});const input=new Proxy({value:'safe'},choice?b:a);`, true},
		{"finite-recursion", `const input:{value:string}=new Proxy({value:'safe'},{get(){document.title;return input.value}});`, true},
		{"factory-context-safe", `function build(handler:ProxyHandler<{value:string}>){return new Proxy({value:'safe'},handler)}const input=build({get(){return 'safe'}});const other=build({get(){return document.title}});`, false},
		{"factory-context-browser", `function build(handler:ProxyHandler<{value:string}>){return new Proxy({value:'safe'},handler)}const input=build({get(){return document.title}});const other=build({get(){return 'safe'}});`, true},
		{"argument-get-phase", `const args={get handler(){document.title;return {get(){return 'safe'}}}};const input=new Proxy({value:'safe'},args.handler);`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export{};function read(input:{value:string}){return input.value}` + c.setup + `read(input);`
			_, _, caller := currentProxyCaller(t, source, "read(input);")
			browser, unknown := false, false
			for _, e := range caller.EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != c.browser || !unknown {
				t.Fatal("trap input/default/creation phase mismatch", caller.EffectSources)
			}
		})
	}
}

// A read-modify-write performs Get before Put. Its unresolved Put cannot erase
// the known Get-trap donor, while a plain assignment does not call that trap.
func TestPossibleProxyReadModifyWriteEffects(t *testing.T) {
	for _, c := range []struct {
		name, operation string
		browser         bool
	}{
		{"post-increment", "input.value++", true},
		{"pre-increment", "++input.value", true},
		{"post-decrement", "input.value--", true},
		{"compound-add", "input.value += 1", true},
		{"logical-assignment", "input.value ||= 1", true},
		{"plain-assignment", "input.value = 1", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export{};function change(input:{value:number}){` + c.operation + `}const input=new Proxy({value:0},{get(){document.title;return 0}});change(input);`
			_, _, caller := currentProxyCaller(t, source, "change(input);")
			browser, unknown := false, false
			for _, effect := range caller.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != c.browser || !unknown {
				t.Fatal("read/Put phase effects", caller.EffectSources)
			}
		})
	}
}
