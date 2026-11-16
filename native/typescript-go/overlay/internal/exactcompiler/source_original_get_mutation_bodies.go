package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// sourceOriginalMutationBodyPopulation describes operations encountered by the
// original canonical BODY visitor. It supplies no input or execution authority.
// A completed ordinary walk proves population membership, never its effects.
// Refined event schedules remain unsupported until their owner supplies the
// equivalent operation-population contract.
type sourceOriginalMutationBodyPopulation struct {
	declaration *ast.Node
	generation  *projectGeneration
	operations  []sourceOriginalMutationBodyOperation
	complete    bool
}
type sourceOriginalMutationBodyOperation struct {
	node *ast.Node
	kind sourceOriginalMutationBodyOperationKind
}
type sourceOriginalMutationBodyOperationKind uint8

const (
	originalMutationBodyGet sourceOriginalMutationBodyOperationKind = iota + 1
	originalMutationBodyCall
	originalMutationBodyWrite
	originalMutationBodyUnsupported
)

func recordOriginalMutationBodyOperation(fact *callableFacts, node *ast.Node, owner *executableBodyOwner) {
	if fact == nil || node == nil || owner == nil || owner.values == nil || owner.values.generation == nil || !ast.IsFunctionLike(fact.node) || enclosingCallableNode(node) != fact.node || !sourceStagedOccurrenceOwned(node, fact.node) {
		return
	}
	kind, recorded := originalMutationBodyKind(node)
	if !recorded {
		return
	}
	population := &fact.staged.mutationBody
	if population.declaration != fact.node || population.generation != owner.values.generation {
		*population = sourceOriginalMutationBodyPopulation{declaration: fact.node, generation: owner.values.generation}
	}
	for _, prior := range population.operations {
		if prior.node == node {
			return
		}
	}
	population.operations = append(population.operations, sourceOriginalMutationBodyOperation{node: node, kind: kind})
}

func finishOriginalMutationBodyPopulation(fact *callableFacts, owner *executableBodyOwner, refined bool) {
	if fact == nil || owner == nil || owner.values == nil || owner.values.generation == nil || !ast.IsFunctionLike(fact.node) {
		return
	}
	p := &fact.staged.mutationBody
	if p.declaration != fact.node || p.generation != owner.values.generation {
		*p = sourceOriginalMutationBodyPopulation{declaration: fact.node, generation: owner.values.generation}
	}
	p.complete = !refined && !ast.HasSyntacticModifier(fact.node, ast.ModifierFlagsAsync) && !(ast.IsFunctionExpression(fact.node) && fact.node.AsFunctionExpression().AsteriskToken != nil) && !(ast.IsFunctionDeclaration(fact.node) && fact.node.AsFunctionDeclaration().AsteriskToken != nil)
}

func originalMutationBodyFingerprint(p sourceOriginalMutationBodyPopulation, out *strings.Builder) {
	out.WriteString(fmt.Sprintf("|mutation-body:%p:%p:%t", p.declaration, p.generation, p.complete))
	for _, operation := range p.operations {
		out.WriteString(fmt.Sprintf(":%p:%d", operation.node, operation.kind))
	}
}

// originalMutationBodyKind classifies the same original operation for canonical
// BODY recording and SOURCE effect description; classification grants no coverage.
func originalMutationBodyKind(node *ast.Node) (sourceOriginalMutationBodyOperationKind, bool) {
	var kind sourceOriginalMutationBodyOperationKind
	switch {
	case ast.IsCallExpression(node):
		kind = originalMutationBodyCall
	case ast.IsVariableDeclarationList(node) && node.Flags&ast.NodeFlagsUsing != 0:
		kind = originalMutationBodyUnsupported
	case ast.IsPropertyAccessExpression(node), ast.IsElementAccessExpression(node):
		if node.Parent != nil && ast.IsBinaryExpression(node.Parent) && node.Parent.AsBinaryExpression().Left == node && node.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			return 0, false
		}
		kind = originalMutationBodyGet
	case ast.IsBinaryExpression(node):
		switch node.AsBinaryExpression().OperatorToken.Kind {
		case ast.KindEqualsToken:
			kind = originalMutationBodyWrite
		case ast.KindEqualsEqualsEqualsToken, ast.KindExclamationEqualsEqualsToken, ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken, ast.KindCommaToken:
			return 0, false
		default:
			kind = originalMutationBodyUnsupported
		}
	default:
		switch node.Kind {
		case ast.KindNewExpression, ast.KindTaggedTemplateExpression, ast.KindAwaitExpression, ast.KindYieldExpression, ast.KindPrefixUnaryExpression, ast.KindPostfixUnaryExpression, ast.KindDeleteExpression, ast.KindTemplateExpression, ast.KindSpreadElement, ast.KindSpreadAssignment, ast.KindForOfStatement, ast.KindForInStatement, ast.KindObjectBindingPattern, ast.KindArrayBindingPattern, ast.KindComputedPropertyName, ast.KindClassDeclaration, ast.KindClassExpression:
			kind = originalMutationBodyUnsupported
		default:
			return 0, false
		}
	}
	return kind, true
}
