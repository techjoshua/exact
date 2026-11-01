package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceOwnedObligations identifies an original selected eager module call whose
// caller work must already belong to a normal fact. It contains no copied effect
// payload and introduces no second propagation graph or activation authority.
type sourceOwnedObligations struct{ owner, operation *ast.Node }

// moduleCallInitializer identifies one indexed eager Call initializer whose
// statement needs its own normal effect fact. It supplies no value, completion
// or purity proof. The ordinary walker still consumes its callee, inputs and body.
func moduleCallInitializer(owner *sourceValueOwner, statement *ast.Node) *ast.Node {
	declaration := moduleInitializerDeclaration(owner, statement)
	if declaration == nil {
		return nil
	}
	call := declaration.Initializer()
	if !ast.IsCallExpression(call) {
		return nil
	}
	index := owner.indexes[ast.GetSourceFileOfNode(statement)]
	entry := index.normalOccurrences[call]
	if entry == nil || entry.node != call || entry.statement != statement || entry.region != nil || !entry.once || entry.callOwner != nil {
		return nil
	}
	return call
}

// moduleInitializerDeclaration shares the original declaration/index envelope.
// It creates neither a frame nor a value or completion disposition.
func moduleInitializerDeclaration(owner *sourceValueOwner, statement *ast.Node) *ast.Node {
	if owner == nil || statement == nil || !ast.IsVariableStatement(statement) || ast.HasSyntacticModifier(statement, ast.ModifierFlagsAmbient) {
		return nil
	}
	source := ast.GetSourceFileOfNode(statement)
	if source == nil || source.IsDeclarationFile || statement.Parent != source.AsNode() {
		return nil
	}
	index, exists := owner.indexes[source]
	if !exists || index.incomplete || index.normalDynamicScope || owner.indexPreparing[source] {
		return nil
	}
	list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
	if list.Flags&ast.NodeFlagsConst == 0 || len(list.Declarations.Nodes) != 1 {
		return nil
	}
	declaration := list.Declarations.Nodes[0]
	if !ast.IsIdentifier(declaration.Name()) || declaration.Initializer() == nil {
		return nil
	}
	return declaration
}

// moduleNestedCallEffects requires an original effect fact for an indexed eager
// Call inside an initializer. Its existing normal statement walker retains the
// callee/argument/body components. The nested Call is not the initializer value,
// so direct-Call publication and original-call obligation matching stay separate.
func moduleNestedCallEffects(owner *sourceValueOwner, statement *ast.Node) bool {
	if moduleInitializerDeclaration(owner, statement) == nil {
		return false
	}
	index := owner.indexes[ast.GetSourceFileOfNode(statement)]
	for _, event := range owner.summary(statement).normal {
		owner.indexWork++
		if event.fold != nil || event.phase != nil || event.operand != nil || !ast.IsCallExpression(event.node) {
			continue
		}
		entry := index.normalOccurrences[event.node]
		if entry != nil && entry.node == event.node && entry.statement == statement && entry.region == nil && entry.once && entry.callOwner == nil {
			return true
		}
	}
	return false
}

func retainSourceOwnedObligations(owner, operation *ast.Node, candidates accessorCandidates, result *accessorCandidates) {
	result.owned = append(result.owned, candidates.owned...)
	// Reference metadata alone has no caller execution obligation to enroll.
	if !candidates.opaque && len(candidates.declarations) == 0 && len(candidates.writes) == 0 && len(candidates.inputs) == 0 {
		return
	}
	if owner == nil {
		result.opaque = true
		return
	}
	result.owned = append(result.owned, sourceOwnedObligations{owner, operation})
}

// applySourceOwnedObligations validates the existing normal-call producer before
// its ordinary effect fixed point. The selected eager relation supplies admission,
// with empty caller bindings. AST identity only deduplicates the same producer.
// Unrepresented work is unknown, never moved onto an unrelated requesting host.
func applySourceOwnedObligations(facts []callableFacts, targets map[*ast.Node]int, owner *sourceValueOwner) {
	for requester := range facts {
		for _, owned := range facts[requester].ownedObligations {
			target, exists := targets[owned.owner]
			present := false
			if exists && target >= 0 && target < len(facts) && owned.owner != nil && owned.operation != nil && ast.IsCallExpression(owned.operation) {
				fact := &facts[target]
				source := ast.GetSourceFileOfNode(owned.operation)
				eligible := fact.node == owned.owner && source != nil && fact.sourceFile == source && owned.owner.Parent == source.AsNode()
				variable := ast.IsVariableStatement(owned.owner)
				eligible = eligible && (ast.IsExpressionStatement(owned.owner) || variable && moduleCallInitializer(owner, owned.owner) == owned.operation)
				for id, expression := range fact.callExpressions {
					present = present || eligible && expression == owned.operation.AsCallExpression().Expression && fact.fieldEdgeOperations[id] == owned.operation
				}
			}
			// The normal walker records this exact edge after consuming the actual
			// invocation's callee, inputs and body effects. Those effects stay in
			// their original fact. Construction receipts are already disposed here,
			// so neither they nor NoWrites substitute for indexed owner/edge identity.
			if !present {
				appendOpaqueAccessorEffect(&facts[requester], accessorCandidates{opaque: true, cause: owned.operation})
			}
		}
	}
}

func sourceOwnedObligationKey(owned sourceOwnedObligations) string {
	return fmt.Sprintf("|original-module:%s:%d:%d", ast.GetSourceFileOfNode(owned.owner).FileName(), owned.owner.Pos(), owned.operation.Pos())
}
