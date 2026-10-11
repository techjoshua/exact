package exactcompiler

import "testing"

// Scheduling depends on the selected native operation, never an authored method's spelling.
// Captured helper aliases retain their setup binding identity and local shadows stay independent.
func TestReactiveSnapshotSchedulingOwnership(t *testing.T) {
	cases := []struct {
		work   string
		reject bool
	}{
		{`Promise.resolve().then(()=>label);`, true},
		{`Promise.resolve()["then"](()=>label);`, true},
		{`Promise.resolve()["catch"](()=>label);`, true},
		{`Promise.resolve()["finally"](()=>label);`, true},
		{`setTimeout(()=>label,1);`, true},
		{`const schedule=setTimeout;schedule(()=>label,1);`, true},
		{`const callback=()=>label;setTimeout(callback,1);`, true},
		{`function callback(){return label;}setTimeout(callback,1);`, true},
		{`setTimeout((()=>label) satisfies ()=>string,1);`, true},
		{`new IntersectionObserver(()=>{void label;});`, true},
		{`const Observer=IntersectionObserver;new Observer(()=>{void label;});`, true},
		{`const helper={then(callback:()=>string){return callback();}};helper.then(()=>label);`, false},
		{`const schedule=(callback:()=>string)=>callback();schedule(()=>label);`, false},
		{`const setTimeout=(callback:()=>string)=>callback();setTimeout(()=>label);`, false},
		{`setTimeout(()=>{const label="local";return label;},1);`, false},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "scheduling.tsx", Target: target, Source: `export function Page(props:{label:string}){const label=props.label.trim();` + test.work + `return()=> <p>{label}</p>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT2002" {
					rejected = true
				}
			}
			if rejected != test.reject {
				t.Fatalf("%s %s: rejection=%v diagnostics=%#v", target, test.work, rejected, response.Diagnostics)
			}
		}
	}
}
