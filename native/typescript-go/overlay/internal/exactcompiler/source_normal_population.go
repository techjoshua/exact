package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
)

// sourceNormalOccurrence is generation-owned syntax identity. Parent edges are
// classified during the existing index walk, before any execution admission.
// An occurrence is not evidence that its represented evaluation completed.
type sourceNormalOccurrence struct {
	node, statement, region *ast.Node
	ordinal                 int
	once                    bool
	structural, partOfType  bool
	defaultRoot             *ast.Node
	parent                  *sourceNormalOccurrence
	callOwner               *sourceNormalOccurrence
}

type sourceNormalPopulation struct {
	root    *ast.Node
	entries map[*ast.Node]*sourceNormalOccurrence
}

// indexNormalOccurrence consumes the existing pre-order source index traversal.
// Deferred children open a distinct domain. Control-dependent descendants retain
// their region but cannot acquire a once-only selected population.
func (owner *sourceValueOwner) indexNormalOccurrence(index *sourceValueIndex, source *ast.SourceFile, node *ast.Node, erased, partOfType bool) {
	owner.indexWork++
	if node.Kind == ast.KindWithStatement {
		index.normalDynamicScope = true
	}
	if ast.IsCallExpression(node) || ast.IsNewExpression(node) {
		expression := unwrapSourceCallableReferenceWithBudget(node.Expression(), func(*ast.Node) bool { owner.indexWork++; return true })
		if expression == nil || expression.Kind == ast.KindImportKeyword || ast.IsIdentifier(expression) && (expression.Text() == "eval" || expression.Text() == "Function") {
			index.normalDynamicScope = true
		}
	}
	parent := index.normalOccurrences[node.Parent]
	occurrence := &sourceNormalOccurrence{node: node, once: true, parent: parent, structural: erased || normalStructuralSyntax(node), partOfType: partOfType}
	if parent != nil {
		occurrence.defaultRoot = parent.defaultRoot
		if ast.IsParameterDeclaration(node.Parent) && node.Parent.Initializer() == node {
			occurrence.defaultRoot = node
		}
		occurrence.callOwner = parent.callOwner
		if ast.IsCallExpression(parent.node) {
			occurrence.callOwner = parent
		}
		occurrence.statement, occurrence.ordinal, occurrence.region, occurrence.once = parent.statement, parent.ordinal, parent.region, parent.once
		if node.Parent == source.AsNode() {
			index.normalOrdinal++
			occurrence.statement = node
			occurrence.ordinal = index.normalOrdinal
		}
		if sourceMemberOperationOwnsChild(node.Parent, node) {
			occurrence.region = node.Parent
			occurrence.once = true
			occurrence.defaultRoot = nil
		}
		if !sourceNormalStraightParent(node.Parent) {
			occurrence.once = false
		}
	}
	index.normalOccurrences[node] = occurrence
}

func sourceNormalStraightParent(node *ast.Node) bool {
	if ast.HasDecorators(node) {
		return false
	}
	switch node.Kind {
	case ast.KindIfStatement, ast.KindConditionalExpression, ast.KindForStatement, ast.KindForInStatement, ast.KindForOfStatement, ast.KindWhileStatement, ast.KindDoStatement, ast.KindSwitchStatement, ast.KindCaseBlock, ast.KindCaseClause, ast.KindDefaultClause, ast.KindTryStatement, ast.KindCatchClause, ast.KindDecorator:
		return false
	}
	if ast.IsBinaryExpression(node) {
		switch node.AsBinaryExpression().OperatorToken.Kind {
		case ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			return false
		}
	}
	return true
}

// normalPopulation projects already indexed occurrences into one explicit root.
// Module admission only accepts the direct statement or source-file root. It
// never infers execution authority from enclosingCallableNode or source offsets.
func (owner *sourceValueOwner) normalPopulation(root *ast.Node) *sourceNormalPopulation {
	if root == nil {
		return nil
	}
	source := ast.GetSourceFileOfNode(root)
	if source == nil || source.IsDeclarationFile {
		return nil
	}
	index := owner.index(source)
	if index.incomplete || index.normalOccurrences[root] == nil {
		return nil
	}
	return &sourceNormalPopulation{root: root, entries: index.normalOccurrences}
}

func (population *sourceNormalPopulation) moduleEntry(node, effectOwner *ast.Node) *sourceNormalOccurrence {
	if population == nil || node == nil {
		return nil
	}
	entry := population.entries[node]
	if entry == nil || entry.node != node || !entry.once {
		return nil
	}
	if isCallableNode(population.root) {
		if effectOwner == population.root && entry.region == population.root {
			return entry
		}
		return nil
	}
	if entry.region != nil || entry.statement != effectOwner {
		return nil
	}
	if population.root != effectOwner && population.root != ast.GetSourceFileOfNode(node).AsNode() {
		return nil
	}
	return entry
}

// sourceNormalAuthority snapshots the generation at actual admission. Borrowed
// prefix inspection validates it independently of its temporary input projection.
type sourceNormalAuthority struct {
	owner      *sourceValueOwner
	program    *compiler.Program
	checker    *checker.Checker
	generation *projectGeneration
	executable *executableBodyOwner
}

func (query *sourceValueQuery) normalAuthority() sourceNormalAuthority {
	return sourceNormalAuthority{owner: query.owner, program: query.owner.program, checker: query.owner.checker, generation: query.owner.generation, executable: query.executable}
}
func (authority sourceNormalAuthority) valid(query *sourceValueQuery) bool {
	return query.owner != nil && authority.owner == query.owner && authority.program == query.owner.program && authority.checker == query.owner.checker && authority.generation == query.owner.generation && authority.executable == query.executable
}
