package exactcompiler

// sourceStagedMapEntryContribution is a conditional original algorithm Get.
// Discovery registers its required descriptor fields before reading it. The
// live map owner supplies read and generation independently of source syntax.
// This is not a normal property descriptor, current table or mutation receipt.
type sourceStagedMapEntryContribution struct {
	request    sourceStagedOperationRequest
	source     *sourceStagedNativeGetSource
	entry      sourceStagedMapEntry
	read       *sourceStagedMapEntryRead
	generation *projectGeneration
}

// sourceStagedMapProtocolContribution keeps the original ordered protocol's
// source contributions separate from whole normal OwnKeys/descriptor output.
// Keys, enumerability and target Effects each require their semantic owner.
type sourceStagedMapProtocolContribution struct {
	entriesRegistered                                      bool
	writerSource                                           *sourceStagedMapWriterDisposition
	request                                                sourceStagedOperationRequest
	generation                                             *projectGeneration
	entries                                                []sourceStagedMapEntry
	keysAccounted, enumerabilityAccounted, targetAccounted bool
}
