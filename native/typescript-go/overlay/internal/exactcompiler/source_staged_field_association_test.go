package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These supplied-prefix controls test transport under the original scoped Get.
// They do not authorize a field baseline. The public map journey separately
// proves original entry associations reach the semantic source publishers.
func TestStagedFieldSourceAssociationSurvivesProjection(t *testing.T) {
	withStagedFieldDiscoverySource(t, func(query *sourceValueQuery, get *sourceGetInputs, effects sourceStagedFieldSourceRequests, source sourceStagedFieldDiscoverySource) {
		for _, kind := range []sourceRelativeDemandKind{relativeDemandEffects, relativeDemandDirectExposure} {
			parent, _ := fieldSourceParent(effects.ownWriters)
			parent.producer.kind = kind
			parent.producer.selector.association = get.receiver.node.Parent
			requests, _ := fieldSourceRequests(parent)
			writers, prototype := false, false
			mapper := func(request sourceStagedOperationRequest, operation, region *ast.Node) (sourceStagedOperationDelta, bool) {
				return sourceStagedOperationDelta{extracted: true}, true
			}
			publish := func(request sourceStagedOperationRequest, delta sourceStagedOperationDelta) bool {
				if request.producer.selector.association != parent.producer.selector.association {
					t.Fatal("entry association erased")
				}
				writers = writers || sameOperationRequest(request, requests.ownWriters)
				prototype = prototype || sameOperationRequest(request, requests.prototype)
				return true
			}
			accepted := false
			if kind == relativeDemandEffects {
				accepted = emitStagedFieldSourceDiscovery(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, mapper, publish)
			} else {
				accepted = emitStagedFieldValueProjection(query, get, requests, []sourceStagedFieldDiscoverySource{source}, true, func(sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
					return sourceStagedOperationDelta{extracted: true}, true
				}, mapper, publish)
			}
			if !accepted || !writers || !prototype {
				t.Fatal("associated source roles not delivered", kind)
			}
		}
	})
}
