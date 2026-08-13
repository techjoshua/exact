# eXact native-full-stack participant

This Signal Desk implementation uses compiler-generated eXact server tasks, progressive SSR, generated
hydration contracts, and a participant-owned live-event endpoint. It consumes the canonical deterministic
fixture and shared domain semantics but does not call the controlled HTTP service. This keeps native transport
measurements separate from the controlled-service track.
