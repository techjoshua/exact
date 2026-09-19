package exactcompiler

import (
	"strings"
	"testing"
)

func TestExportedComponentReceiverForwardingRetainsContextSurface(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "forwarded-context.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			declare class Component { getContext(token: unknown): unknown }
			export function Message(this: Component, props: { value: string }) {
				const context = this.getContext(Symbol.for("locale"));
				return () => <span>{props.value}{context}</span>;
			}
			export function Unit(this: Component, props: { value: string }) {
				return Message.call(this, props);
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	unit := findCallable(t, response.Analysis.Callables, "Unit")
	if len(unit.Calls) != 1 || !unit.Calls[0].Resolved || !edgeForwardsComponentReceiver(unit.Calls[0]) {
		t.Fatalf("exported receiver forwarding was not resolved: %#v", unit)
	}
	for _, component := range response.Analysis.Components {
		if component.Name == "Unit" {
			if !component.TargetPlan.ServerSurface.Contexts {
				t.Fatalf("forwarded context capability was omitted: %#v", component.TargetPlan)
			}
			return
		}
	}
	t.Fatal("missing Unit component")
}

func TestOpaquePackageChildDoesNotInheritOwnerClientPlacement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "opaque-package-child.tsx", Kind: "compile", Target: TargetServer,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptComponent",
			ExactComponents: []JSXInteropExactComponent{{ModuleSpecifier: "@example/messages", ExportName: "Message"}},
		},
		Source: `
			import { Message } from "@example/messages";
			declare class Component { onMount(callback: () => void): void }
			export function Page(this: Component) {
				this.onMount(() => {});
				return () => <Message />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if strings.Contains(response.Code, "createServerBoundaryReceipt") || !strings.Contains(response.Code, "Message") {
		t.Fatalf("opaque dependency was converted into its owner's client boundary:\n%s", response.Code)
	}
}
