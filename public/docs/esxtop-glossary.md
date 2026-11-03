# ESXtop & ESXi performance glossary

## A–C

**ACL** — Not used in this track. See the HAProxy track for access-control lists.

**Adapter (Disk Adapter)** — The HBA/storage adapter view (`d`). Shows path-level commands, queue depth and latency.

**Batch mode** — `esxtop -b` writes PDH-CSV to stdout instead of drawing interactive panels. The entity list is locked at the first sample.

**Ballooning (`MCTLSZ`)** — Guest memory reclaimed by the VMware Tools balloon driver. Cheaper than VMkernel swap but still a sign of host pressure or a memory limit.

**Co-stop (`%CSTP`)** — Ready time caused by SMP co-scheduling constraints. A vCPU waits for siblings to become co-schedulable.

**Counter** — One metric in a capture, identified by host, group/instance and counter name.

**CPU ready (`%RDY`)** — Percentage of time a vCPU was ready to run but had no physical CPU. Includes time attributed to `%MLMTD` and `%CSTP`.

## D–H

**DAVG** — Device-driver latency per command, including the array round trip. Elevated DAVG points below ESXi.

**Datastore** — A VMFS/NFS/vSAN filesystem or object layer. It is not a native esxtop panel; map it to devices (`u`) and VM disks (`v`).

**DQLEN / AQLEN** — Device and adapter queue depth. Compare with `QUED`, `ACTV` and `%USD`.

**esxtop** — ESXi Shell performance utility that reads VMkernel counters in interactive, batch or replay mode.

**GAVG** — Guest-perceived storage latency. `GAVG = DAVG + KAVG`.

**Group** — A set of worlds, such as a VM or resource pool. Group totals can hide a single starved vCPU.

## I–P

**KAVG** — Time a storage command spends inside the ESXi VMkernel/vSCSI stack, including queue wait (`QAVG`). Elevated KAVG points inside ESXi.

**LUN** — A logical storage device presented to the host. A datastore can span LUNs/extents.

**%MLMTD** — Ready time caused by a VM or resource-pool CPU limit. Part of `%RDY`.

**MEMSZ** — Configured VM memory. Compare with `GRANT`, `MCTLSZ`, `SWCUR` and `%ACTV`.

**N%L** — Percentage of VM memory local to the NUMA node(s) running its vCPUs.

**NRMEM / NLMEM** — Remote/local NUMA memory in MB.

**NUMA** — Non-uniform memory access. Remote memory has higher latency and lower bandwidth.

**PDH-CSV** — The wide CSV format written by batch esxtop. Each counter is a column; each row is a sample.

**pCPU** — Physical CPU core. Host CPU counters describe pCPU utilisation.

## Q–Z

**QAVG** — Average queue latency; part of `KAVG`. Rising QAVG with rising command rate points at saturation.

**QUED** — Queued storage commands. Sustained values above 1 mean commands are waiting.

**rc file** — A positional esxtop configuration written by `W`. Contains panel field letters and an options line; version-specific.

**Replay mode** — `esxtop -R <vm-support-dir>` re-runs a previously collected support bundle.

**%RDY** — See CPU ready.

**SWCUR** — VMkernel-swapped VM memory. Not guest OS paging.

**SWR/s / SWW/s** — Swap read/write rates. Swap-in is synchronous and can stall the guest.

**System world** — An internal ESXi world such as `system1`, `hostd.20994601` or `python.20979311`. Not a guest VM.

**vCPU** — Virtual CPU world belonging to a VM.

**vSCSI / NMP** — The VMkernel virtual SCSI and Native Multipathing layers that queue and route storage commands.

**World** — A schedulable VMkernel entity, roughly a thread. A VM is a group of worlds.

## See also

- [Mental model](#/learn/esxtop-01-mental-model)
- [CPU scheduling](#/learn/esxtop-03-cpu-scheduling)
- [Storage latency](#/learn/esxtop-05-storage-latency)
- [Triage and reporting](#/learn/esxtop-08-triage-reporting)
