# Memory pressure: ballooning, VMkernel swap and NUMA locality

ESXi memory management is a sequence, not a single “free memory” number. Low free memory can be normal; active reclaim is the signal that matters.

## The reclaim ladder

```text
guest memory demand
   │
   ├─ free memory available
   ├─ transparent page sharing
   ├─ ballooning (MCTLSZ)
   ├─ compression / host cache
   └─ VMkernel swap (SWCUR, SWR/s, SWW/s)
```

Ballooning asks the guest to release pages voluntarily. Swap-in is synchronous and can produce visible guest stalls. Persistent swap is more serious than a transient balloon.

## The counters

| Counter | Meaning | What to check |
|---|---|---|
| `MEMSZ` | Configured VM memory | Compare with guest usage, not just the configured number |
| `GRANT` | Mapped guest memory | Can be below `MEMSZ` when pages are untouched or reclaimed |
| `%ACTV` | Active guest memory | Separates a large idle VM from a VM actually using it |
| `MCTLSZ` | Ballooned memory | Host pressure or a memory limit; Yellow Bricks flags > 1 MB |
| `SWCUR` | VMkernel-swapped memory | Persistent swap means host pressure or a limit |
| `SWR/s` | Swap read rate | Swap-in is synchronous; any sustained rate is significant |
| `SWW/s` | Swap write rate | Leading indicator of host memory pressure |
| `OVERCOMMIT1` | Requested vs managed memory | Planning signal, not proof of reclaim |
| `N%L` | Local NUMA memory | Below 80% is poor; below 50% is a strong warning |
| `NRMEM` / `NLMEM` | Remote/local NUMA MB | Explains the `N%L` split |

## Relationships

```text
MEMSZ ≈ GRANT + MCTLSZ + SWCUR + untouched
```

- `MCTLSZ` is ballooned memory, not guest swap.
- `SWCUR` is VMkernel swap, not guest OS paging.
- `SWR/s` and `SWW/s` are rates; they show whether the swap is active now.
- A stale `SWCUR` value can remain after pressure has passed; check the rates.

## NUMA locality

A VM should ideally run its vCPUs and memory on the same NUMA node. `N%L` measures the local share.

- Low `N%L` with high `NRMEM` means remote memory access.
- Remote memory increases latency and reduces bandwidth.
- A VM larger than a NUMA node may span nodes by design; verify whether that is intentional.
- Reducing vCPU/memory footprint or correcting placement can improve locality.

## Decision tree

```text
memory pressure
 ├─ MCTLSZ high, SWCUR low → ballooning; check host free memory and VM limits
 ├─ SWCUR/SWR/s high → active VMkernel swap; treat as priority
 ├─ N%L low → NUMA placement/sizing problem
 └─ free memory low, no reclaim → may be cache; do not resize from one number
```

## Support checklist

1. Check host free memory and overcommit.
2. Check `MCTLSZ`, `SWCUR`, `SWR/s` and `SWW/s` together.
3. Compare VM `MEMSZ`, `GRANT` and `%ACTV`.
4. Check VM and resource-pool memory limits/reservations.
5. Check `N%L`, `NRMEM` and `NLMEM` for placement issues.
6. Change one thing; re-capture and compare the same percentile.

## Simulate it

- [Memory reclaim and NUMA](#/sim/esxtop-memory-reclaim)
- [Triage and reporting](#/sim/esxtop-triage-report)

Next: [Storage latency](#/learn/esxtop-05-storage-latency).
