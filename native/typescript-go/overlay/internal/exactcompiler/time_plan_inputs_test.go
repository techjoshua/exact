package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Time-plan capture must materialize component-local aliases in both concrete artifacts.
func timePlanContractWorkspace(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "@exactjs", "time")
	if err := os.MkdirAll(filepath.Join(pkg, "dist"), 0700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	for file, content := range map[string]string{
		config:                                        `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","lib":["esnext","dom"],"jsx":"preserve"},"include":["*.tsx"]}`,
		filepath.Join(pkg, "package.json"):            `{"name":"@exactjs/time","type":"module","exports":{"./enhancements":{"types":"./capability.d.ts","default":"./dist/components.js"}}}`,
		filepath.Join(pkg, "capability.d.ts"):         `export {TimeUpdate as update} from './dist/components.js' with {type:'exact-enhancement'};`,
		filepath.Join(pkg, "dist", "components.d.ts"): `export declare function TimeUpdate(props:{update?:true|'auto'|'millisecond';children?:unknown}):unknown;`,
	} {
		if err := os.WriteFile(file, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root, config
}

func TestTimePlanMaterializesAnchorInputs(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, declaration := range []string{`const anchor=props.anchor;`, `const original=props.anchor;const anchor=original;`, `const {anchor}=props;`} {
		for _, rounding := range []string{"floor", "ceil", "round", "trunc"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(string(target)+"/"+declaration+"/"+rounding, func(t *testing.T) {
					difference := "Date.now()-anchor"
					if rounding == "ceil" {
						difference = "anchor-Date.now()"
					}
					source := `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){` + declaration + `return()=> <time time:update>{Math.` + rounding + `((` + difference + `)/1000)}</time>;}`
					response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Source: source, Target: target})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					for _, d := range response.Diagnostics {
						if d.Severity == "error" {
							t.Fatalf("valid clock plan rejected: %#v", response.Diagnostics)
						}
					}
					if strings.Contains(response.Code, "createDeferredServerChildRange") != (target == TargetServer) {
						t.Fatalf("clock range lost target-specific evaluation ordering:\n%s", response.Code)
					}
					if !strings.Contains(response.Code, "createTimeActivation") || !strings.Contains(response.Code, "readEpochMilliseconds") {
						t.Fatalf("clock owner lost:\n%s", response.Code)
					}
				})
			}
		}
	}
}

// Clock-bearing projections and clock-free controls use the same reachability contract in both artifacts.
func TestTimeDestructuredClockReachability(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, shape := range []struct {
			declarations string
			clock        bool
		}{
			{`const reading={now:Date.now()};const {now}=reading;`, true},
			{`const reading=[Date.now()];const [now]=reading;`, true},
			{`const reading={nested:{now:Date.now()}};const {nested:{now}}=reading;`, true},
			{`const reading={now:42};const {now}=reading;`, false},
			{`const reading=[42];const [now]=reading;`, false},
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(){` + shape.declarations + `return()=> <time time:update>{Math.floor((now-0)/1000)}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_NO_CLOCK") == shape.clock {
				t.Fatalf("incorrect clock reachability: %#v", response.Diagnostics)
			}
			if shape.clock {
				for _, d := range response.Diagnostics {
					if d.Severity == "error" {
						t.Fatalf("valid clock projection rejected: %#v", response.Diagnostics)
					}
				}
				if !strings.Contains(response.Code, "readEpochMilliseconds") {
					t.Fatalf("clock projection lost owner:\n%s", response.Code)
				}
			}
		}
	}
}

// Clock dependence alone cannot establish the units or phase of a helper parameter.
func TestTimeHelperClockArgumentPrecision(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, argument := range []string{"Date.now()", "Date.now()-500", "Date.now()+500", "Date.now()/1000"} {
			for _, policy := range []string{"", `="millisecond"`} {
				source := `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){function elapsed(now:number,anchor:number){return Math.floor((now-anchor)/1000);}return()=> <time time:update` + policy + `>{elapsed(` + argument + `,props.anchor)}</time>;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Source: source, Target: target})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				denied := argument != "Date.now()" && policy == ""
				if hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_AUTO") != denied {
					t.Fatalf("target=%s argument=%s policy=%s diagnostics=%#v", target, argument, policy, response.Diagnostics)
				}
				if !denied {
					for _, d := range response.Diagnostics {
						if d.Severity == "error" {
							t.Fatalf("supported correction rejected: %#v", response.Diagnostics)
						}
					}
				}
			}
		}
	}
}

// Deferred server properties must cover clock classes without classifying absent Boolean initializers.
func TestTimeServerPropertyEvaluationBoundary(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config,
			Target: target,
			Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};
export function Page(props:{anchor:number}){return()=> <time data-clock-range className="clock" className:elapsed={Math.floor((Date.now()-props.anchor)/1000)>1} data-clock={Math.floor((Date.now()-props.anchor)/1000)} time:update>{Math.floor((Date.now()-props.anchor)/1000)}</time>;}`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "error" {
				t.Fatalf("valid clock properties rejected: %#v", response.Diagnostics)
			}
		}
		if strings.Contains(response.Code, "createDeferredServerIntrinsicReceipt") != (target == TargetServer) {
			t.Fatalf("clock property helper crossed the target boundary:\n%s", response.Code)
		}
	}
}

// Clock-bearing spreads require one deferred property group, including finite conditional keys.
func TestTimeServerSpreadEvaluationBoundary(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, spread := range []string{
			`{"data-clock":Math.floor((Date.now()-props.anchor)/1000)}`,
			`Math.floor((Date.now()-props.anchor)/1000)>1?{"data-late":"active"}:{"data-early":"active"}`,
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){return()=> <time {...(` + spread + `)} time:update="millisecond">{Math.floor((Date.now()-props.anchor)/1000)}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("valid clock spread rejected: %#v", response.Diagnostics)
				}
			}
			if strings.Contains(response.Code, "createDeferredServerIntrinsicSpreadReceipt") != (target == TargetServer) {
				t.Fatalf("clock spread lost target evaluation boundary:\n%s", response.Code)
			}
		}
	}
}

// Enhancement spread syntax must not bypass the named attribute's semantic diagnostics.
func TestTimeSpreadPolicyDiagnostics(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, test := range []struct{ policy, expression, before, after, code string }{
			{"millisecond", "42", "", "", "EXACT_TIME_NO_CLOCK"},
			{"auto", "Date.now()", "", "", "EXACT_TIME_AUTO"},
			{"millisecond", "Date.now()", "", "", ""},
			{"auto", "Math.floor(Date.now()/1000)", "", "", ""},
			{"auto", "Date.now()", "", ` time:update="millisecond"`, ""},
			{"millisecond", "Date.now()", ` time:update="auto"`, "", ""},
			{"millisecond", `Temporal.Now.instant().round({smallestUnit:"nanosecond"}).epochMilliseconds`, "", "", "EXACT_TIME_PRECISION"},
			{"millisecond", "Date.now()+counter++", "", "", "EXACT_TIME_UNSAFE"},
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(){let counter=0;const attributes={"time:update":"` + test.policy + `" as const};return()=> <time` + test.before + ` {...attributes}` + test.after + `>{` + test.expression + `}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if test.code != "" {
				if !hasDiagnosticCode(response.Diagnostics, test.code) {
					t.Fatalf("target=%s lost %s: %#v", target, test.code, response.Diagnostics)
				}
			} else {
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" {
						t.Fatalf("target=%s policy=%s before=%s after=%s valid correction rejected: %#v", target, test.policy, test.before, test.after, response.Diagnostics)
					}
				}
				if !strings.Contains(response.Code, "createTimeActivation") {
					t.Fatalf("spread policy lost activation:\n%s", response.Code)
				}
			}
		}
	}
}

// Repeating a clock view cannot repeat immediate writes, including through a spread alias.
func TestTimeImmediateWriteDiagnostics(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, mutation := range []string{`counter++`, `++counter`, `counter--`, `--counter`, `(counter+=1)`, `(counter=1)`, `(delete record.value?1:0)`} {
			for _, shape := range []string{"child", "spread", "alias"} {
				value := "Date.now()+" + mutation
				setup, attributes, child := "", "", value
				if shape == "spread" {
					attributes = ` {...{"data-clock":` + value + `}}`
					child = "0"
				}
				if shape == "alias" {
					setup = `const attributes={"data-clock":` + value + `};`
					attributes = ` {...attributes}`
					child = "0"
				}
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(){let counter=0;const record:{value?:number}={value:0};` + setup + `return()=> <time` + attributes + ` time:update="millisecond">{` + child + `}</time>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if !hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_UNSAFE") {
					t.Fatalf("target=%s shape=%s mutation=%s lost write validation: %#v", target, shape, mutation, response.Diagnostics)
				}
			}
		}
		response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(){let counter=0;return()=> <time {...{"data-clock":Math.floor((Date.now()-0)/1000),onClick:()=>counter++}} time:update="millisecond">{Math.floor((Date.now()-0)/1000)}</time>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_UNSAFE") {
			t.Fatalf("deferred callback was treated as immediate mutation: %#v", response.Diagnostics)
		}
	}
}

// Epoch quantization uses existing exact plans. Unknown or invalid divisors still require explicit accuracy.
func TestTimeEpochQuantizationControls(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, test := range []struct {
			setup, expression string
			accepted          bool
		}{
			{"", "Math.floor(Date.now()/1000)", true},
			{"", "Math.round(Date.now()/1000)", true},
			{"", "Math.trunc(Date.now()/1000)", true},
			{"const now=Date.now();", "Math.floor(now/1000)", true},
			{"", "Math.ceil(Date.now()/1000)", false},
			{"", "Math.floor(Date.now()/0)", false},
			{"", "Math.floor(Date.now()/-1000)", false},
			{"", "Math.floor(Date.now()/props.quantum)", false},
			{"const now=Date.now();", "now", false},
		} {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{quantum:number}){` + test.setup + `return()=> <time time:update>{` + test.expression + `}</time>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_AUTO") == test.accepted {
				t.Fatalf("target=%s expression=%s accepted=%v: %#v", target, test.expression, test.accepted, response.Diagnostics)
			}
		}
	}
}
