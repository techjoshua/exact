package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Input mapping leaves reference acquisition, RHS Get/Throw, Set receiver,
// lexical replacement and finalization in their original JavaScript order.
func TestSourceSetterEmittedOrder(t *testing.T) {
	const source = `export function run(fail=false){const events:string[]=[];const captured={count:0};function original(this:{tag:string}){events.push('original:'+this.tag);return 1}let selected=original;const box={tag:'box',field:0,get work(){events.push('get');return selected},set work(next:typeof original){events.push('set:'+this.tag);this.field=++captured.count;selected=next}};function receiver(){events.push('receiver');return box}const input={get value(){events.push('rhs');if(fail)throw 9;return function replacement(this:{tag:string}){events.push('call:'+this.tag);return 7}}};try{const before=box.work();receiver().work=input.value;const value=box.work();return {before,value,events,field:box.field,count:captured.count}}catch(error){return {error,events,field:box.field,count:captured.count}}finally{events.push('finally')}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/setter-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "order.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const{run}=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(run(),{before:1,value:7,events:['get','original:box','receiver','rhs','set:box','get','call:box','finally'],field:1,count:1});assert.deepEqual(run(true),{error:9,events:['get','original:box','receiver','rhs','finally'],field:0,count:0});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("emitted setter order: %v %s", err, output)
			}
		})
	}
}
