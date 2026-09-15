# Compiler-owned boundary sink experiment, 2026-09-10

Synchronous component references whose marker boundary is explicitly omitted by compiler ownership now keep the enclosing writer sink. Scheduled components and standalone resumption publication still capture local output. The shared renderer and string sink policy are unchanged.

Hypothesis: avoiding unnecessary component-wide local string capture may improve render time by 1-3%. The results support no consistent string improvement. The change is retained because it removes capture work for an explicitly omitted boundary without weakening publication or retry guarantees.

Production Node 26.8.1, Bun 1.4.2, React 19.2.0. Each cell averages two fresh processes in reversed order, with 5,000 warmups and 12,000 measured renders per process. Both frameworks render complete application-owned documents with four asset tags. Streams are consumed completely. These are in-process timings, not HTTP throughput. Small documents contain three incidents and large documents 96. eXact complete-document hashes match the saved single-join control.

| Runtime | Mode   | Document | Previous (µs) | Direct boundary (µs) | React (µs) |
| ------- | ------ | -------- | ------------: | -------------------: | ---------: |
| node    | string | assets   |         36.21 |                35.93 |      22.32 |
| node    | string | large    |        168.61 |               169.72 |     133.30 |
| node    | stream | assets   |         57.53 |                56.82 |      66.55 |
| node    | stream | large    |        199.59 |               196.75 |     350.02 |
| bun     | string | assets   |         36.91 |                35.64 |      33.20 |
| bun     | string | large    |        226.87 |               227.47 |     186.85 |
| bun     | stream | assets   |         53.15 |                51.39 |      53.62 |
| bun     | stream | large    |        285.18 |               281.08 |     275.76 |

Two reversed samples on a shared workstation are insufficient to establish small gains. Node streaming leads React; string rendering still trails React on both runtimes, and Bun large-document streaming remains behind.

A separate untimed capture audit found that the control entered two marker captures and one component capture for the large document. The narrowed condition instead entered four marker captures. Removing the enclosing component capture exposes descendant marker captures, which still collect strings locally. This explains why the condition alone does not eliminate intermediate construction. The next experiment should examine direct marker publication with backpressure and retry isolation.

Validation: package build and 315 SSR tests passed, including an added synchronous stateful document fixture compared against local collection with markers enabled and disabled. The fixture compares complete HTML, hydration records, host cleanup, and disposal. Repository test typecheck, focused ESLint, and source architecture passed.

Raw samples, measured bundles, capture audit, harnesses, and relevant source are in the accompanying archive. No GC reduction was measured. Native writer ABI migration and progressive public tree-to-transport integration remain unfinished.
