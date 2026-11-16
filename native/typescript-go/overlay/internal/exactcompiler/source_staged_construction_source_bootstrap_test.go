package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A demanded receiver may ask the original New owner for its conditional source
// before collection reaches New. The source does not enroll a reached use.
func TestStagedConstructionSourceBootstrap(t *testing.T) {
	for _, module := range []bool{false, true} {
		source := `function factory(){return 0}export function invoke(){const map=new WeakMap<object,object>();factory();return map.get({})}`
		if module {
			source = `const map=new WeakMap<object,object>();function factory(){return 0}export function invoke(){factory();return map.get({})}`
		}
		withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
			file := ast.GetSourceFileOfNode(call)
			var site *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsNewExpression(node) {
					site = node
				}
				return true
			})
			facts := stagedReturnSourceFacts(file)
			work := registerCallableEffectWork(facts)
			if len(owner.standardConstructions) != 0 {
				t.Fatal("source was collected before demanded bootstrap")
			}
			if work.prepareStagedConstructionSource(facts, site, owner) {
				t.Fatal("missing original fact loan issued a construction source")
			}
			restore := registerPendingMemberFacts(owner, facts)
			defer restore()
			copied := append([]callableFacts(nil), facts...)
			if work.prepareStagedConstructionSource(copied, site, owner) {
				t.Fatal("copied facts borrowed original publication")
			}
			work.operationGeneration = &projectGeneration{}
			if work.prepareStagedConstructionSource(facts, site, owner) {
				t.Fatal("another graph generation borrowed source")
			}
			work.operationGeneration = nil
			if !work.prepareStagedConstructionSource(facts, site, owner) {
				t.Fatal("original passive New did not publish demanded construction source")
			}
			contribution := owner.standardConstructions[site]
			if contribution.site != site || !contribution.selectionComplete {
				t.Fatal("bootstrap replaced original selected source with syntax")
			}
			if len(work.operationIDs) != 0 {
				t.Fatal("source publication adopted New work")
			}
			for _, fact := range facts {
				if len(fact.staged.operationUses)+len(fact.staged.constructedOccurrences)+len(fact.summary.Calls) != 0 {
					t.Fatal("passive source activated an ordinary operation or body")
				}
			}
			region := sourceStagedEvaluationOwner(site)
			if region == nil {
				region = sourceStagedModuleOwner(site)
			}
			consumer := work.memberNodes[region]
			// Later ordinary collection still enrolls its own New Effects use.
			work.stageConstructionEffects(facts, consumer, site, owner)
			found := false
			for _, use := range facts[consumer].staged.operationUses {
				found = found || use.request.producer.operation == site && use.request.producer.selector == (sourceStagedOperationSelector{})
			}
			if !found {
				t.Fatal("passive source displaced later ordinary New enrollment")
			}
		})
	}
}

func TestStagedConstructionSourceBootstrapUnavailable(t *testing.T) {
	for _, source := range []string{
		`function factory(){return 0}export function invoke(WeakMap:new()=>object){const map=new WeakMap();factory();return map}`,
		`class Derived extends WeakMap<object,object>{}function factory(){return 0}export function invoke(){const map=new Derived();factory();return map}`,
		`function factory(){return 0}export function invoke(){const map=new WeakMap<object,object>([]);factory();return map}`,
	} {
		withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
			file := ast.GetSourceFileOfNode(call)
			var site *ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				if ast.IsNewExpression(node) {
					site = node
				}
				return true
			})
			facts := stagedReturnSourceFacts(file)
			restore := registerPendingMemberFacts(owner, facts)
			defer restore()
			work := registerCallableEffectWork(facts)
			if work.prepareStagedConstructionSource(facts, site, owner) || len(owner.standardConstructions) != 0 || len(work.operationIDs) != 0 {
				t.Fatal("unavailable constructor/input acquired source publication or activation")
			}
		})
	}
}
