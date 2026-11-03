# Counter reference, thresholds and status semantics

This is the reference page for the counters used throughout the track. Use it after the mental model and before acting on a finding.

> All values are simulated in this lab. Thresholds are triage guardrails, not vSphere alarms; confirm them against your ESXi build, workload and array vendor.

## CPU counters

### Scheduling equation

```text
100% = %RUN + %RDY + %CSTP + %WAIT
%USED ≈ %RUN + %SYS - %OVRLP
```

- `%RUN` is scheduled time.
- `%RDY` is ready but not scheduled.
- `%CSTP` is ready but waiting for co-scheduling.
- `%WAIT` is blocked or idle; it includes `%IDLE` and `%SWPWT`.

### Per-world counters

| Counter | Meaning | How to read it |
|---|---|---|
| `%USED` | CPU spent on behalf of the world, adjusted for core frequency | Workload; a multi-vCPU group can exceed 100% |
| `%RUN` | Scheduled time | On HT hosts can be roughly double `%USED` |
| `%SYS` | VMkernel time for interrupts/I/O/system work | High values often follow I/O or network processing |
| `%RDY` | Ready but waiting for a pCPU | <5% normal; sustained 10% per world is a contention warning |
| `%MLMTD` | Ready but held back by a CPU limit | Part of `%RDY`; any sustained value means a limit is active |
| `%CSTP` | SMP co-stop | Part of `%RDY`; >3% is a warning, >5% critical here |
| `%SWPWT` | Waiting for VMkernel swap-in | Memory pressure, not CPU pressure; >5% is severe |
| `%WAIT` | Blocked/busy wait | Includes idle; high alone is not CPU starvation |
| `%IDLE` | Guest idle loop | Only meaningful for vCPU worlds |
| `%OVRLP` | System work for another world | Context for `%USED`; charged to the other world's `%SYS` |
| `%LAT_C` / `%LAT_M` | CPU/memory resource contention latency | Useful when a resource pool is bottlenecked |
| `%DMD` | Active CPU demand over the previous minute | Compare with entitlement |

### Host CPU

| Counter | Meaning | Guardrail here |
|---|---|---|
| `% Processor Time` on `Physical Cpu(n)` | Physical CPU utilisation | Warning 80%, critical 90% P95 |
| `Cpu Load (1/5/15 Minute Avg)` | Run-queue load average from 6-second samples | Warn 1.0, critical 2.0 |
| `% Util Time` / `% Core Util Time` | Alternative vSphere utilisation views | Same guardrails; equivalent findings grouped |

A host can average 40% while one core is pinned at 100%. Use per-core values and `%RDY`, not only the host average.

## Memory counters

### Host memory

| Counter | Meaning | How to use it |
|---|---|---|
| `Memory Overcommit (1/5/15 Minute Avg)` | Requested memory / managed memory − 1 | Planning signal; not proof of reclaim |
| `Machine MBytes` | Physical memory managed by the host | Denominator for free-memory percentage |
| `Free MBytes` | Free machine memory | Low can be healthy if no reclaim |
| `Kernel MBytes` / `NonKernel MBytes` | VMkernel/non-kernel memory | Capacity context |
| `Kernel MinFree MBytes` | Free-memory floor | Reclaim rises as free approaches it |
| `Memctl Current/Target/Max MBytes` | Host ballooning | Non-zero means reclaim |
| `Swap Used/Target MBytes` | Host VMkernel swap | Persistent swap is serious |
| `Swap MBytes Read/sec` / `Write/sec` | Host swap I/O | Swap-in is synchronous and urgent |
| `Total Compressed MBytes` | Compression cache | Compression is cheaper than swap but still pressure |

### Per-VM memory

| Counter | Meaning | How to use it |
|---|---|---|
| `MEMSZ` | Configured guest memory | Compare with grant and touched |
| `GRANT` | Guest memory mapped to machine memory | Overhead excluded |
| `CNSM` | Consumed memory, net of sharing/compression | Capacity view |
| `TCHD` | Touched/working-set estimate | Better than configured size for right-sizing |
| `%ACTV` | Active guest memory estimate | Helps size reservations |
| `MCTLSZ` | Ballooned memory | Yellow Bricks flags >1 MB |
| `SWCUR` | Current VMkernel swap | Persistent swap means pressure or a bad limit |
| `SWR/s` / `SWW/s` | Swap-in/swap-out rates | Any sustained activity is significant |
| `CACHEUSD` | Compression cache use | Non-zero means pages are compressed |
| `ZIP/s` / `UNZIP/s` | Compression/decompression rates | Accessing compressed pages adds latency |
| `N%L` | Local NUMA memory | <80% poor; <50% strong warning |
| `NRMEM` / `NLMEM` | Remote/local NUMA memory | Explains the `N%L` split |

```text
MEMSZ ≈ GRANT + MCTLSZ + SWCUR + untouched
```

## Storage counters

### Three layers

```text
GAVG = DAVG + KAVG
KAVG includes QAVG (queue wait)
```

- `DAVG`: device-driver/array round trip.
- `KAVG`: VMkernel/vSCSI time, including queueing.
- `GAVG`: guest-observed latency.
- `QAVG`: queue-wait portion of `KAVG`.

Broadcom says DAVG, KAVG and GAVG should not remain above 10 ms. Yellow Bricks uses 25 ms as a strong warning. This track warns at 10 ms and marks 25 ms critical for DAVG/GAVG; KAVG warns at 2 ms and marks 5 ms critical. All storage guidance is array-dependent.

### Queue and errors

| Counter | Meaning | Interpretation |
|---|---|---|
| `CMDS/s` | Commands per second, including metadata/SCSI | Usually near IOPS, can be higher |
| `ACTV` | Active commands | Compare with queue depth |
| `QUED` | Queued commands | Sustained >1 means queue pressure |
| `%USD` | Queue-depth used | Near 100% means full |
| `LOAD` | (Active + queued) / queue depth | >1 means outstanding work exceeds depth |
| `AQLEN`, `DQLEN`, `LQLEN`, `WQLEN` | Adapter/device/LUN/world queue depth | Context; do not tune blindly |
| `ABRTS/s` | Aborted commands | Any sustained value is serious |
| `RESETS/s` | Command resets | Path/array/timeout trouble |
| `CONS/s` | SCSI reservation conflicts | Yellow Bricks flags >20/s |
| `ATSF` | Failed Atomic Test and Set | Any failure is a VAAI/VMFS signal |
| `DELETE_F` | Failed UNMAP | Any failure warrants storage/VAAI review |
| `FCMDS/s`, `FREAD/s`, `FWRITE/s` | Failed commands/reads/writes | Direct path/array health signals |
| `SPLTCMD/s`, `SPLTCP/s` | Split commands/copies | Large/misaligned I/O can increase latency |

### Read/write variants

Read and write latency differ because of cache behaviour, RAID, thin provisioning and queueing. Use `LAT/rd`/`LAT/wr` or the read/write-specific DAVG/KAVG/GAVG counters when the combined average hides a one-sided problem.

The storage panels are different views of one stack:

- `v` Disk VM: virtual disk.
- `u` Disk Device: LUN/device.
- `d` Disk Adapter: HBA.
- Path expansion: path-level counters.

Do not add latencies across layers. Compare them.

## Network counters

| Counter | Meaning | Interpretation |
|---|---|---|
| `PKTTX/s` / `PKTRX/s` | Packets per second | Workload |
| `MbTX/s` / `MbRX/s` | Megabits per second | Compare with link speed/teaming |
| `%DRPTX` / `%DRPRX` | Dropped packet percentage | Yellow Bricks flags >1%; >5% critical here |
| `PSZTX` / `PSZRX` | Average packet size | Context for packet rate vs throughput |
| `SPEED` | Negotiated physical link speed | Physical NIC only |
| `UP` / `FDUPLX` | Link state/duplex | Categorical; down/half-duplex needs physical investigation |
| `ACTN/s` | VMkernel actions | Internal counter, limited diagnostic value |

Network performance is often CPU performance. Packet processing consumes host CPU; a saturated host can drop packets while the physical switch reports no errors.

## vSAN, power and interrupts

- The vSAN panel is emitted only when vSAN is enabled and the panel is included. `VSAN\Enabled? = 0` means no vSAN data; do not invent it.
- `SDLAT` (vSAN standard-deviation latency) measures latency variation; Yellow Bricks flags >5 ms. Use vSAN Observer/Skyline for disk-group, component, resync and network analysis.
- `Power Usage Now Watts` / `Capacity Watts` describe host power. Sustained operation at the cap can mean the host is power-limited; correlate with CPU frequency and BIOS policy.
- The interrupt panel is separate from CPU scheduling. Interrupt Cookie instances can be numerous; a high rate with high processing time is more significant than either alone.

## Threshold matrix

| Area | Metric | Warning | Critical | Basis |
|---|---|---:|---:|---|
| CPU | `%RDY` per vCPU | 5% | 10% | Broadcom normal <5%; Yellow Bricks 10% per world |
| CPU | `%MLMTD` | 0.1% | 5% | Any sustained non-zero means a limit |
| CPU | `%CSTP` | 3% | 5% | Yellow Bricks 3% |
| CPU | `%SWPWT` | 1% | 5% | Yellow Bricks 5% |
| CPU | host core | 80% | 90% | Operational guardrail |
| CPU | load average 1 min | 1.0 | 2.0 | Broadcom |
| Memory | `MCTLSZ` | 1 MB | 1 GB | Yellow Bricks + guardrail |
| Memory | `SWCUR` | 0.1 MB | 1 GB | Any current swap + guardrail |
| Memory | swap I/O | 0.01 MB/s | 1 MB/s | Any sustained activity |
| Memory | `N%L` | <80% | <50% | Yellow Bricks |
| Storage | `DAVG/cmd`, `GAVG/cmd` | 10 ms | 25 ms | Broadcom/Yellow Bricks |
| Storage | `KAVG/cmd` | 2 ms | 5 ms | Yellow Bricks + guardrail |
| Storage | `QUED` | 1 | 10 | Yellow Bricks |
| Storage | `CONS/s` | 20/s | 50/s | Yellow Bricks + guardrail |
| Storage | `ABRTS/s`, `RESETS/s` | any | 1/s | Hard error signal |
| Storage | vSAN `SDLAT` | 5 ms | 10 ms | Yellow Bricks |
| Network | `%DRPTX`, `%DRPRX` | 1% | 5% | Yellow Bricks + guardrail |

The engine uses P95 for sustained conditions, P05 for lower-is-worse metrics such as `N%L`, and the maximum for hard error counters.

## Status semantics

| Status | Meaning | Caveat |
|---|---|---|
| **Healthy** (`ok`) | Rule evaluated; inside guardrail | Not proof the host is healthy |
| **Warning** (`warn`) | Rule evaluated; warning threshold crossed | A triage prompt, not root cause |
| **Critical** (`critical`) | Rule evaluated; critical threshold or hard error | Act after confirmation |
| **Info** (`info`) | Informational rule matched | Context; excluded from score denominator |
| **No rule** (`neutral`) | Captured, but no curated threshold/scope/group | No verdict; not zero, healthy or missing |

The signal score is:

```text
healthy / (healthy + warning + critical)
```

Info and No rule are excluded. If nothing was rule-evaluated, the score is `—`, not 0% or 100%.

## Field coverage and presence-aware views

Every non-empty PDH-CSV column becomes a series. Known fields get a stable ID, name, unit and category; unknown vendor fields are preserved as `RAW:<family>:<counter>` rather than dropped.

- **Present and zero:** show it; zero is a real measurement.
- **Present but empty for an entity:** show the series and available samples; `—` is entity-level absence.
- **Absent from the header:** omit it entirely; do not invent a zero, row or filter checkbox.

This is why a focused storage capture shows storage fields and hides CPU/memory/network panels. The metric explorer and report appendix still contain every captured series.

Fields that need care:

- `Alloc Min`, `Alloc Max`, `Alloc Shares` and `Members` exist on CPU and memory panels with different meanings; resolve by panel.
- `PShare Common MBytes` and `PShare Shared MBytes` are distinct.
- Virtual Disk `Average MilliSec/Read`/`Write` are `LAT/rd`/`LAT/wr`; `Latency` is a separate vendor aggregate.
- `Link Speed (Mb/s)` is Mbps, not MB.
- Interrupt Cookie fields belong to Interrupts, not CPU scheduler.
- Newer VAAI/UNMAP fields are catalogued, but public documentation is not uniform; treat interpretation as release-specific.

## Report scope

A multi-host capture can be filtered for reports:

- **All capture** — every host and VM.
- **Hosts + VMs** — selected hosts and VMs across them; no VM selected means all VMs on those hosts.
- **Hosts only** — host snapshots and host detail; no VM detail.
- **Selected VMs only** — selected VMs; host snapshots omitted.

Metric-category filters — CPU, Memory, Storage, Network, Power, Interrupts, Other — apply to summary counts, signal score, findings, action plan, technical reference, categories, VM/host detail, appendix and filtered CSV. A field absent from the capture is omitted, not shown as zero.

## Worked playbooks

### A VM is slow, host CPU looks busy

1. Expand the VM group and read `%RDY` per vCPU.
2. Check `%MLMTD`; a non-zero value means a limit.
3. Check `%CSTP` for an SMP workload.
4. Check host per-core utilisation and load average.
5. Check `%SWPWT`, `%VMWAIT`, `%SYS`, storage and network latency.
6. Correlate the guest symptom with the capture timeline.

### The host is out of memory

1. Start with host free memory, overcommit, `MCTLSZ`, `SWAP_USED_MB`, `SWAP_READ`, `SWAP_WRITE`.
2. Find VMs with `MCTLSZ`, `SWCUR`, `SWR/s`, `SWW/s`, `N%L`.
3. Check VM/resource-pool memory limits.
4. Check active/touched memory (`TCHD`, `%ACTV`, `GRANT`).
5. Distinguish ballooning from swapping.
6. Do not add RAM without checking limits and growth.

### Storage latency is high

1. Confirm `GAVG` is high and sustained.
2. Split `DAVG` and `KAVG`.
3. Check `QUED`, `%USD`, `LOAD`, `ACTV`, queue depths.
4. Check aborts, resets, failed ATS/UNMAP.
5. Compare read/write latency.
6. Identify the VM driving IOPS.
7. Escalate with timestamps, LUNs, HBA paths and array metrics.

### Packet drops are reported

1. Check host CPU readiness and load.
2. Compare throughput with link speed.
3. Check physical switchport, errors and teaming.
4. Check `%DRPTX`/`%DRPRX` at port and VM.
5. Validate with `pktcap-uw` if needed.
6. Do not change offloads/ring buffers without rollback.

## Primary sources

- [Using the esxtop Utility — vSphere 8.0](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-monitoring-and-performance/performance-monitoring-utilities-resxtop-and-esxtop/using-the-esxtop-utility.html)
- [Using Batch Mode — vSphere 8.0](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-monitoring-and-performance/performance-monitoring-utilities-resxtop-and-esxtop/using-batch-mode.html)
- [Broadcom 344099 — storage performance](https://knowledge.broadcom.com/external/article/344099)
- [Broadcom 326309 — exporting esxtop data](https://knowledge.broadcom.com/external/article/326309/exporting-esxtop-performance-data-as-a-c.html)
- [Broadcom 382249 — interpreting ESXTop statistics](https://knowledge.broadcom.com/external/article/382249/using-esxtop-and-interpreting-esxtop-sta.html)
- [Yellow Bricks — ESXTOP](https://www.yellow-bricks.com/esxtop/)

Next: [ESXtop glossary](#/learn/esxtop-glossary).
