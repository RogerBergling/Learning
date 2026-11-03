# CPU scheduling: `%RDY`, `%MLMTD`, `%CSTP` and the monster VM

CPU performance is not “CPU at 100%”. The useful question is: **was a runnable vCPU waiting for a physical CPU it was allowed to use?**

## The vCPU state model

```text
vCPU runnable
   │
   ├─ scheduled on a pCPU          %RUN
   ├─ ready but no pCPU             %RDY
   │    ├─ blocked by a CPU limit   %MLMTD
   │    └─ waiting for siblings     %CSTP
   └─ not runnable                  %WAIT
        ├─ guest idle               %IDLE
        └─ swap wait                %SWPWT
```

## The counters

| Counter | Meaning | How to read it |
|---|---|---|
| `%RDY` | Ready but waiting for a pCPU | Per-vCPU scheduler delay; includes `%MLMTD` and `%CSTP` |
| `%MLMTD` | Ready but blocked by a CPU limit | Any sustained value > 0 means a limit is shaping the workload |
| `%CSTP` | SMP co-stop | Sibling vCPUs cannot be co-scheduled; high values suggest too many vCPUs |
| `%SWPWT` | Swap wait | Part of `%WAIT`; synchronous swap-in can stall the guest |
| `%USED` | CPU consumed | Consumption, not delay; a multi-vCPU group can exceed 100% |
| `%RUN` | Time actually scheduled | Can be about twice `%USED` on hyper-threaded hosts |
| `%SYS` | VMkernel time for the world | High values often follow I/O or system work |
| `%WAIT` | Blocked/busy wait | Includes idle and swap wait; high alone is not starvation |
| `%OVRLP` | System time for another world | Accounting artifact; already in the other world's `%SYS` |

Useful relationships:

```text
%USED ≈ %RUN + %SYS - %OVRLP
%RDY includes %MLMTD and %CSTP
%WAIT includes %IDLE and %SWPWT
```

## The monster VM

A VM with many vCPUs can show high `%RDY` for three different reasons:

1. **Host contention** — the pCPUs are oversubscribed. `%MLMTD` is zero.
2. **CPU limit** — a VM or resource-pool limit prevents scheduling. `%MLMTD` is non-zero.
3. **Co-stop** — the guest workload cannot keep all vCPUs busy together. `%CSTP` is high.

A “monster” VM is not automatically a false positive. If its vCPUs are waiting, the scheduler delay is real. The question is whether the wait is caused by capacity, a policy limit or an oversized vCPU count.

## Decision tree

```text
%RDY high
 ├─ %MLMTD > 0  → remove/raise the CPU limit first
 ├─ %MLMTD = 0 and %CSTP high → reduce vCPUs or rebalance the guest
 └─ %MLMTD = 0 and %CSTP low → host CPU contention; move/reduce/add capacity
```

Check host `PCPU %`, `PCPU_UTIL` or `CORE_UTIL` and the load averages. A host average can look fine while one pCPU is saturated. Compare the worst pCPU, not only the mean.

## What a high vCPU count does

- More vCPUs create more co-scheduling constraints.
- A multi-vCPU VM may wait for siblings even when one pCPU is free.
- A wide VM can be harder to place on a NUMA node.
- Reducing vCPUs is often the least invasive fix when the guest cannot use them evenly.

## Thresholds

Broadcom describes `%RDY` below 5% as normal. Yellow Bricks uses sustained 10% per world as a contention warning. This lab warns at 5% and marks 10% critical for a VM-scoped P95. Thresholds are triage guardrails, not vSphere alarms.

## Support checklist

1. Read `%RDY` per vCPU, not only group totals.
2. Compare `%MLMTD` and `%CSTP` before adding hardware.
3. Check the worst host pCPU and load average.
4. Inspect vCPU count, CPU limit, resource-pool shares and the guest workload.
5. Change one thing; re-capture with the same interval; compare the same P95.

## Simulate it

- [CPU ready, limits and the monster VM](#/sim/esxtop-cpu-ready)
- [Triage and reporting](#/sim/esxtop-triage-report)

Next: [Memory pressure and NUMA](#/learn/esxtop-04-memory-numa).
