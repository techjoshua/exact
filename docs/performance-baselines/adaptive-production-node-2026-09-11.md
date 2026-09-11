# Node adaptive scheduling, September 11, 2026

Historical experiment: this capture exercises the superseded opt-in, lag-only Node controller.
The accepted [automatic Node admission](adaptive-default-node-2026-09-11.md) replaces that API
and requires measured capacity improvement as well as lower lag. This capture is separate from
the final full benchmark baseline. React is unchanged. Bun does not
enable this policy. Each request renders the full authored application and document shell;
responses are not shared. Two independent load generators validate every complete response hash.

Small documents use 3 rows and total concurrency 32. Large documents use 96 rows and concurrency 128. Two populations reverse participant and scheduling order. Adaptive windows last 16 seconds;
forced and immediate windows last 8 seconds. Immediate controls surround each eXact experiment.
These are local measurements with variable PC usage, not isolated cloud capacity estimates.

| Rows | API    | Population | Policy   | Valid RPS | Driver p95 ms   | Driver p99 ms   |
| ---: | ------ | ---------: | -------- | --------: | --------------- | --------------- |
|    3 | string |          1 | normal   |      8876 | 5.37 / 5.29     | 8.72 / 10.00    |
|    3 | string |          1 | adaptive |     15149 | 3.93 / 3.94     | 5.75 / 5.73     |
|    3 | string |          1 | forced   |     15948 | 3.49 / 3.42     | 9.48 / 5.01     |
|    3 | string |          1 | normal   |      8594 | 5.50 / 5.58     | 8.69 / 9.48     |
|    3 | string |          1 | React    |     10644 | 4.27 / 4.27     | 9.75 / 9.30     |
|    3 | string |          2 | React    |     11314 | 4.01 / 4.01     | 9.28 / 9.23     |
|    3 | string |          2 | normal   |      9153 | 4.92 / 5.08     | 6.30 / 9.21     |
|    3 | string |          2 | forced   |     15600 | 3.46 / 3.44     | 9.11 / 9.08     |
|    3 | string |          2 | adaptive |     14904 | 3.87 / 3.85     | 9.38 / 9.50     |
|    3 | string |          2 | normal   |      9226 | 4.90 / 5.10     | 6.17 / 9.42     |
|    3 | stream |          1 | normal   |      6559 | 7.08 / 6.99     | 9.61 / 9.72     |
|    3 | stream |          1 | adaptive |     10386 | 6.05 / 5.83     | 9.99 / 7.58     |
|    3 | stream |          1 | forced   |     11397 | 4.98 / 4.91     | 9.54 / 7.00     |
|    3 | stream |          1 | normal   |      6719 | 6.54 / 6.63     | 8.04 / 9.27     |
|    3 | stream |          1 | React    |      4465 | 9.26 / 9.26     | 10.87 / 11.03   |
|    3 | stream |          2 | React    |      4118 | 10.54 / 10.40   | 11.93 / 11.73   |
|    3 | stream |          2 | normal   |      6948 | 6.12 / 6.18     | 7.00 / 8.52     |
|    3 | stream |          2 | forced   |     12211 | 4.71 / 4.68     | 9.16 / 9.30     |
|    3 | stream |          2 | adaptive |     11128 | 5.30 / 5.31     | 9.83 / 9.86     |
|    3 | stream |          2 | normal   |      6941 | 6.40 / 6.39     | 9.40 / 9.28     |
|   96 | string |          1 | normal   |      3542 | 42.88 / 42.85   | 50.91 / 51.81   |
|   96 | string |          1 | adaptive |      3510 | 46.94 / 47.17   | 55.90 / 56.00   |
|   96 | string |          1 | forced   |      3203 | 51.36 / 51.87   | 57.73 / 59.26   |
|   96 | string |          1 | normal   |      3671 | 41.57 / 41.66   | 44.19 / 44.54   |
|   96 | string |          1 | React    |      3537 | 51.55 / 51.81   | 68.86 / 68.86   |
|   96 | string |          2 | React    |      4006 | 35.04 / 35.07   | 36.70 / 36.67   |
|   96 | string |          2 | normal   |      3595 | 42.66 / 42.66   | 49.15 / 49.28   |
|   96 | string |          2 | forced   |      3192 | 54.11 / 53.85   | 64.42 / 64.67   |
|   96 | string |          2 | adaptive |      3664 | 42.30 / 42.05   | 47.68 / 47.04   |
|   96 | string |          2 | normal   |      3632 | 40.83 / 40.73   | 42.72 / 42.81   |
|   96 | stream |          1 | normal   |      1957 | 78.59 / 78.78   | 83.90 / 83.78   |
|   96 | stream |          1 | adaptive |      2180 | 78.91 / 78.91   | 88.19 / 88.51   |
|   96 | stream |          1 | forced   |      2537 | 67.01 / 67.39   | 77.50 / 74.81   |
|   96 | stream |          1 | normal   |      2093 | 71.49 / 71.55   | 78.27 / 78.27   |
|   96 | stream |          1 | React    |      1541 | 95.55 / 95.23   | 110.72 / 111.36 |
|   96 | stream |          2 | React    |      1396 | 106.75 / 106.69 | 109.38 / 109.44 |
|   96 | stream |          2 | normal   |      2159 | 72.58 / 72.58   | 78.40 / 78.46   |
|   96 | stream |          2 | forced   |      2700 | 61.25 / 60.41   | 73.41 / 73.15   |
|   96 | stream |          2 | adaptive |      2446 | 68.48 / 68.22   | 77.95 / 79.10   |
|   96 | stream |          2 | normal   |      2199 | 70.59 / 70.53   | 76.09 / 76.16   |

The adaptive controller starts its monitor only after a short request burst. It trials yielding
after sustained lag, backs off unsuccessful trials, and periodically reassesses successful ones.
It observes event-loop delay, not response tails. The option therefore remains an explicit Node
host policy, with representative response p95/p99 measurements required to assess suitability.
The batch limit bounds starts per callback, not all work in an event-loop turn.

Sparse checks use twelve requests 500 ms apart for immediate, adaptive, and immediate phases.
Every sparse adaptive request bypassed the scheduling queue. Unit tests additionally verify
that sparse requests create no lag histogram or timer. Timings remain in the raw evidence.

The evidence archive retains the runner, diagnostic worker, production source, raw samples,
artifact hashes, and the earlier prototype capture. The prototype is not the production result.
See [SSR scheduling](../ssr-hydration.md) for the public contract.
