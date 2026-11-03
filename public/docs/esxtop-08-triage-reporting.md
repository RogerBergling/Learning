# From counters to findings: P95, thresholds and action plans

A capture is raw evidence. A finding is an interpretation. A support action plan is a controlled next step. Keep those three separate.

## The rule engine

The analysis evaluates curated rules against each series:

- **P95** for sustained “higher is worse” conditions such as `%RDY`, `GAVG` and `%DRPTX`.
- **P05** for “lower is worse” conditions such as `N%L`.
- **Max** for hard error counters such as aborts and resets.

A P95 is not a maximum. It means 95% of samples are at or below the value. It reduces single-spike noise but can still hide a short, severe burst.

## Threshold examples

| Metric | Warning | Critical | Why |
|---|---:|---:|---|
| `%RDY` | 5% | 10% | Per-vCPU scheduler delay |
| `%MLMTD` | > 0 | 5% | A limit is throttling the VM |
| `%CSTP` | 3% | 5% | SMP co-scheduling pressure |
| `N%L` | < 80% | < 50% | Remote NUMA memory |
| `DAVG/cmd`, `GAVG/cmd` | 10 ms | 25 ms | Device/guest latency |
| `KAVG/cmd` | 2 ms | 5 ms | VMkernel/vSCSI delay |
| `%DRPTX`, `%DRPRX` | 1% | 5% | Packet drops |

Thresholds are triage guardrails, not vSphere alarms. Confirm them against the workload, array vendor, guest and physical network.

## System worlds are not VMs

ESXi system worlds such as `system1`, `hostd.20994601`, `python.20979311` and `vmkeventd.2097949` can appear in `Group Cpu`, `Group Memory` and `Vcpu` data. They are not guest VMs.

The analysis excludes names matching these system-world patterns from:

- the VM table and VM count,
- VM-scoped `%RDY`, NUMA and memory findings,
- the report's VM section.

Their raw series remain searchable. If you have a real VM whose name matches a system pattern, verify it explicitly.

## The monster-VM question

A large VM with high `%RDY` is not automatically a false positive.

- If `%MLMTD` is non-zero, a CPU limit is shaping the VM.
- If `%MLMTD` is zero and `%CSTP` is high, the vCPU count/co-scheduling is the issue.
- If `%MLMTD` is zero and `%CSTP` is low, the host is genuinely short of scheduling capacity.

The false positives in a badly filtered report are the internal worlds, not a real VM's scheduler delay.

## Support workflow

1. **Confirm the signal** in the raw series and the capture window.
2. **Identify the layer**: CPU, memory, storage or network.
3. **Check the entity**: real VM, host, LUN, adapter, port or system world.
4. **Choose one change**: limit, vCPU count, placement, queue, path or capacity.
5. **Re-capture** with the same interval and sample count.
6. **Compare the same percentile** and the worst affected series.
7. **Roll back** if the signal worsens or a new critical appears.

## Action-plan structure

The report's **What to do next** section prioritizes:

- **P1** critical findings,
- **P2** warning findings,
- **P3** informational review,
- a decision guide for `%RDY`/`%MLMTD`, `%CSTP`, memory reclaim, `N%L`, `KAVG`, `DAVG`, `GAVG`, queue saturation and drops,
- change-control and verification steps.

## Reporting

The Report view (`#/report`) includes:

- executive summary and signal score,
- prioritized action plan,
- all findings with evidence and recommendations,
- a technical reference covering KAVG, DAVG, GAVG, `%RDY`, `%MLMTD`, `%CSTP`, memory, NUMA, queues and network,
- the real VM table and capture details.

**Export HTML** downloads a standalone file. **Export PDF** opens the browser print dialog; choose **Save as PDF**.

## Evidence to keep

- Capture file and exact command.
- ESXi build and esxtop version.
- Interval, sample count and time window.
- Top findings and raw series screenshots/CSVs.
- Change made, owner, time and rollback.
- Post-change capture and comparison.

A report without the capture and command is not reproducible.

## Primary sources

- [Yellow Bricks — ESXTOP](https://www.yellow-bricks.com/esxtop/)
- [Broadcom 344099 — using esxtop to identify storage performance issues](https://knowledge.broadcom.com/external/article/344099)
- [Broadcom 1008205](https://knowledge.broadcom.com/external/article?legacyId=1008205)
- [Broadcom 326309 — exporting esxtop performance data](https://knowledge.broadcom.com/external/article/326309/exporting-esxtop-performance-data-as-a-c.html)
- [vSphere 8.0 monitoring and performance](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/vsphere-monitoring-and-performance.html)

## Simulate it

- [Triage and reporting](#/sim/esxtop-triage-report)
- [CPU ready and limits](#/sim/esxtop-cpu-ready)
- [Storage latency](#/sim/esxtop-storage-latency)
