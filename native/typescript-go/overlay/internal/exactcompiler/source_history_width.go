package exactcompiler

import "unsafe"

// These constants apply only to observation-vector payloads. They do not price
// map keys, slots, receipt factories or Symbol's separate256-byte factory unit.
const observationVectorLayoutBound = uintptr(48)
const observationVectorQuantum = 32

func observationVectorLayoutSupported(bytes uintptr) bool {
	return bytes > 0 && bytes <= observationVectorLayoutBound
}

// historyObservationVectorUnits bounds one whole vector of48-byte observations
// in the existing32-byte component quantum. It computes ceil(3H/2) without an
// overflowing3H intermediate. A smaller compiled record remains conservatively
// bounded by48. Record growth refuses instead of borrowing another allowance.
// Advisory remainder does not constrain this price query. Only population,
// compiled layout and integer addressability can refuse it. It does not
// allocate or grant authority.
// Its callers must retain their pass counts, actual capacity horizon and payment
// owner before any allocation. A formula pass is not route-coverage acceptance.
func historyObservationVectorUnits(horizon, limit int) (int, bool) {
	if horizon < 0 || !observationVectorLayoutSupported(unsafe.Sizeof(storageObjectObservation{})) {
		return 0, false
	}
	whole, ok := budgetProduct(limit, horizon/2, 3)
	if !ok {
		return 0, false
	}
	return budgetSum(limit, whole, 2*(horizon%2))
}
