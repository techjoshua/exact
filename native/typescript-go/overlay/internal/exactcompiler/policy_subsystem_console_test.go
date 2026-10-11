package exactcompiler

import "testing"

// Logging policy follows native console ownership rather than a receiver's authored spelling.
func TestPolicySubsystemConsoleIdentity(t *testing.T) {
	prefix := `declare const marker:unique symbol;
/** @exact keep=secret */ type Protected=string&{readonly[marker]:true};declare const credential:Protected;`
	for _, example := range []struct {
		body   string
		denied bool
	}{
		{`function work(console:{log(value:Protected):void}){console.log(credential);}`, false},
		{`function work(console:{log(value:string):void}){if(credential)console.log('public');}`, false},
		{`function work(){console.log(credential);}`, true},
		{`function work(){if(credential)console.log('public');}`, true},
		{`const logger=console;function work(){if(credential)logger.log('public');}`, true},
		{`function work(){if(credential)console.log` + "`public`" + `;}`, true},
		{`const logger=console;function work(){if(credential)logger['log']('public');}`, true},
		{`function work(){if(credential)console.log.call(null,'public');}`, true},
		{`const write=console.log;function work(){if(credential)write('public');}`, true},
		{`const {log:write}=console;function work(){if(credential)write('public');}`, true},
		{`import * as logger from 'node:console';function work(){if(credential)logger.log('public');}`, true},
		{`import{log as write}from 'node:console';function work(){if(credential)write('public');}`, true},
		{`import{Console}from 'node:console';declare const output:import('node:stream').Writable;const logger=new Console({stdout:output});function work(){if(credential)logger.log('public');}`, true},
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "console-policy.tsx", Target: TargetServer, Source: prefix + example.body + `export function Page(){return()=> <p>Public</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if hasDiagnosticCode(r.Diagnostics, "EXACT3020") != example.denied {
			t.Errorf("%s incorrect console ownership: %#v", example.body, r.Diagnostics)
		}
	}
}
