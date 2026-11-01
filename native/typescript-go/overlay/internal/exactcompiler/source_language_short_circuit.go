package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// acquiredNullish deliberately shares Boolean's certified payload domain. It
// discards truth and tests kind separately. Every acquired Number, including
// signed/special values, is non-nullish. Missing is unknown, never undefined.
func acquiredNullish(b languageBranch, operand languageValue) (bool, bool) {
	if _, known := acquiredBoolean(b, operand); !known {
		return false, false
	}
	return operand.undefined || operand.node != nil && operand.node.Kind == ast.KindNullKeyword, true
}

// shortCircuitTakesRight observes one paid value and allocates nothing. Logical
// operators forward operand values, not Boolean artifacts or Reference authority.
func shortCircuitTakesRight(b languageBranch, operand languageValue, operator ast.Kind) (bool, bool) {
	switch operator {
	case ast.KindAmpersandAmpersandToken:
		return acquiredBoolean(b, operand)
	case ast.KindBarBarToken:
		truth, known := acquiredBoolean(b, operand)
		return !truth, known
	case ast.KindQuestionQuestionToken:
		return acquiredNullish(b, operand)
	}
	return false, false
}

func shortCircuitOperator(kind string) ast.Kind {
	switch kind {
	case "SelectAnd":
		return ast.KindAmpersandAmpersandToken
	case "SelectOr":
		return ast.KindBarBarToken
	case "SelectNullish":
		return ast.KindQuestionQuestionToken
	}
	return ast.KindUnknown
}

// shortCircuitAllocation meters bytes in byte units with checked machine-int
// arithmetic, then compares normalized work units with fuel. Comparing raw bytes
// to the 4096 work budget would be dimensionally wrong (slack alone is 8192).
func shortCircuitAllocation(n, limit int) (int, bool) {
	if n < 0 {
		return 0, false
	}
	if n == 0 {
		return 0, true
	}
	maxInt := int(^uint(0) >> 1)
	bytes, ok := budgetProduct(maxInt, n, int(unsafe.Sizeof(storageChoice{})))
	if !ok {
		return 0, false
	}
	bytes, ok = budgetProduct(maxInt, bytes, 2)
	if !ok {
		return 0, false
	}
	bytes, ok = budgetSum(maxInt, bytes, 8192, 255)
	if !ok {
		return 0, false
	}
	return budgetSum(limit, n, bytes/256, 1)
}

// shortCircuitChoiceCharge reserves one live allocation and exactly three
// terminal detached-copy contingencies. Inherited continuations are paid by the
// shared event owner. Zero selectors keep the old setup unchanged.
func shortCircuitChoiceCharge(n, limit int) (int, bool) {
	alloc, ok := shortCircuitAllocation(n, limit)
	if !ok {
		return 0, false
	}
	if n == 0 {
		return 0, true
	}
	copyCost, ok := budgetSum(limit, alloc, n)
	if !ok {
		return 0, false
	}
	copies, ok := budgetProduct(limit, 3, copyCost)
	if !ok {
		return 0, false
	}
	return budgetSum(limit, alloc, copies)
}

// shortCircuitSetup validates selector capacity before root/buffer allocation.
// The candidate checks but does not settle this amount. Entry settles it once.
func shortCircuitSetup(r *storageRecipe, limit int) (int, bool) {
	if r == nil {
		return 0, false
	}
	if r.choiceSlots == 0 {
		n := storageScheduleSetup(r)
		return n, n >= 0
	}
	if r.choiceSlots < 0 || r.choiceSlots > r.registers || r.choiceSlots > len(r.events) {
		return 0, false
	}
	locals, ok := budgetProduct(limit, r.locals, 3)
	if !ok {
		return 0, false
	}
	regs, ok := budgetProduct(limit, r.registers, 5)
	if !ok {
		return 0, false
	}
	choices, ok := shortCircuitChoiceCharge(r.choiceSlots, limit)
	if ok && r.callBody {
		one, paid := shortCircuitAllocation(r.choiceSlots, limit)
		if !paid {
			return 0, false
		}
		choices, ok = budgetSum(limit, choices, one, r.choiceSlots)
	}
	if !ok {
		return 0, false
	}
	return budgetSum(limit, locals, regs, 16, choices)
}
