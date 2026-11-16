package exactcompiler

import (
	"reflect"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedTransportConsumerSource = `import{TaskContext,type Component}from'@exactjs/core';
export function Probe(this:Component<{value:number}>,props:{offset:number}){
 this.state.value=1;
 const localValue=7;
 const read=()=>localValue;
 function save(input:number,task:TaskContext=TaskContext.server().latest().blocking()){
  this.state.value=this.state.value+input+props.offset+read();
  return this.state.value;
 }
 return()=> <button onClick={()=>save(2)}>{this.state.value}</button>;
}`

// Stabilized state/callable summaries feed the existing invoked-task capture
// and continuation owners. A numeric capture is data, never a helper identity
// or permission to transport a separately server-kept value.
func TestStagedTransportConsumers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		if !t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			request := Request{Kind: "compile", ID: "staged-transport-consumer.tsx", Source: stagedTransportConsumerSource, Target: target, Diagnostics: "semantic", SourceMap: true, stagedReplacement: true}
			response := session.Execute(request)
			assertDefinitionConsumerCompile(t, response)
			// Definition MAY retains its uninstantiated input-Get obligation. Capture
			// association below supplies transport identity, never Get completion.
			save := executableSummary(t, response, "save")
			field := assertTransportConsumerMAY(t, save.EffectSources)
			for _, effect := range executableSummary(t, response, "read").EffectSources {
				if effect.provenanceIncomplete {
					t.Fatal("pure helper acquired an unfinished source obligation", effect.Description)
				}
			}
			if len(response.Analysis.Tasks) != 1 || len(response.Analysis.Continuations) != 1 {
				t.Fatal("missing original task/continuation", len(response.Analysis.Tasks), len(response.Analysis.Continuations))
			}
			task := response.Analysis.Tasks[0]
			// Task construction reads the published callable projection, which
			// deliberately strips private origin pointers. All published MAY
			// metadata, including Opaque/incomplete, must survive unchanged.
			if !reflect.DeepEqual(task.EffectSources, displayEnvironmentSources(save.EffectSources)) {
				t.Fatal("task changed the original published MAY effects", task.EffectSources)
			}
			if task.Placement != "server" || task.RequestedPlacement != "server" || task.Concurrency != "latest" || task.Readiness != "blocking" || !task.Invoked {
				t.Fatal("task policy did not reach transport", task.Placement, task.RequestedPlacement, task.Invoked)
			}
			component := findComponent(t, response.Analysis.Components, "Probe")
			continuation := response.Analysis.Continuations[0]
			if continuation.ComponentID != component.ID || continuation.TaskID != task.ID || continuation.Placement != "server" || continuation.Concurrency != "latest" || continuation.Readiness != "blocking" || continuation.Ownership.ComponentID != component.ID || continuation.Ownership.Lifetime != "invocation" || continuation.Cancellation != "abort-signal" {
				t.Fatal("transport lost durable component/invocation ownership", continuation)
			}
			if continuation.Invocation == nil || len(continuation.Invocation.Arguments) != 1 || continuation.Invocation.Arguments[0].Source != "argument" || continuation.Invocation.Arguments[0].Index != 0 || continuation.Invocation.Concurrency != "latest" {
				t.Fatal("authored invocation input lost its own slot", continuation.Invocation)
			}
			prop, local := false, false
			indexes := map[int]bool{}
			for _, dependency := range continuation.Activation.Dependencies {
				if indexes[dependency.Index] {
					t.Fatal("capture and invocation slots overlap", continuation.Activation.Dependencies)
				}
				indexes[dependency.Index] = true
				path := strings.TrimSpace(dependency.Path)
				prop = prop || dependency.Source == "props" && path == "props.offset" && dependency.Index == 1
				local = local || dependency.Source == "derived" && path == "localValue" && dependency.Index == 2
				if path == "read" {
					t.Fatal("reconstructed helper identity became a wire capture")
				}
			}
			if !prop || !local || len(continuation.Activation.Dependencies) != 3 {
				t.Fatal("ordinary numeric captures lost their source ownership", continuation.Activation.Dependencies)
			}
			originalCapture := false
			for _, capture := range continuation.captures {
				if capture.source == "props" && strings.TrimSpace(capture.path) == "props.offset" {
					if capture.expression != field.operation || capture.snapshot {
						t.Fatal("transport lost the original prop Get association")
					}
					originalCapture = true
				}
			}
			if !originalCapture {
				t.Fatal("missing original prop Get capture")
			}
			assertTransportConsumerState(t, task.Reads, task.Writes)
			assertTransportConsumerState(t, continuation.Activation.StateReads, continuation.Effects.StateWrites)

			// This is an existing transport-policy denial, not a TypeScript
			// diagnostic-artifact convention or a new secret/serialization rule.
			request.Source = strings.Replace(stagedTransportConsumerSource, "const localValue=7;", "/** @exact keep=server */\n const localValue=7;", 1)
			denied := session.Execute(request)
			captureDenied := false
			for _, diagnostic := range denied.Diagnostics {
				captureDenied = captureDenied || diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "captured parameter must not transport")
			}
			if denied.Error != "" || !captureDenied || denied.Code != "" || denied.SourceMap != nil {
				t.Fatal("server-kept helper capture acquired transport authority", denied.Error, frameworkConsumerDiagnostics(denied.Diagnostics))
			}
		}) {
			return
		}
	}
}

func assertTransportConsumerState(t *testing.T, reads, writes []StateEffect) {
	t.Helper()
	read, write := false, false
	for _, effect := range reads {
		read = read || effect.Path == "value" && effect.Kind == "read" && effect.Receiver == nil
	}
	for _, effect := range writes {
		write = write || effect.Path == "value" && effect.Kind == "write" && effect.Receiver == nil
	}
	if !read || !write {
		t.Fatal("continuation changed the component state receiver", reads, writes)
	}
}

// This checks structured definition metadata, not runtime input purity. The
// invoking owner evaluates the original capture after arguments; server lowering
// substitutes its dependency slot. Neither step supplies a field-Get receipt.
func assertTransportConsumerMAY(t *testing.T, effects []EnvironmentEffectSource) *sourceFieldDemand {
	t.Helper()
	var found *sourceFieldDemand
	for _, effect := range effects {
		if !effect.provenanceIncomplete {
			continue
		}
		d := effect.fieldOrigin
		if d == nil || d.declaration == nil || d.operation == nil || d.slot == nil {
			t.Fatal("unrelated incomplete transport source", effect.Description)
		}
		source := ast.GetSourceFileOfNode(d.operation)
		owner := enclosingCallableNode(d.slot)
		if source == nil || source.Text() != stagedTransportConsumerSource ||
			!ast.IsFunctionDeclaration(d.declaration) || d.declaration.Name().Text() != "save" ||
			enclosingCallableNode(d.operation) != d.declaration ||
			!ast.IsParameterDeclaration(d.slot) || d.slot.Name().Text() != "props" ||
			owner == nil || owner.Name() == nil || owner.Name().Text() != "Probe" ||
			!ast.IsPropertyAccessExpression(d.operation) || strings.TrimSpace(sourceText(source, d.operation)) != "props.offset" ||
			d.key != "offset" || d.use != nil || d.consumer != d.declaration ||
			!effect.Opaque || effect.Environment != "unknown" || effect.fieldForwarded ||
			found != nil {
			t.Fatal("definition-relative prop obligation changed", effect.Description, d)
		}
		found = d
	}
	if found == nil {
		t.Fatal("definition-relative prop obligation was discarded")
	}
	return found
}
