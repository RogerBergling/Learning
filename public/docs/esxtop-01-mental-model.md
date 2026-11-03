# ESXtop mental model: worlds, panels and the counter path

`esxtop` is the ESXi Shell performance utility. It reads VMkernel counters and presents them either as interactive screens or as a wide PDH-CSV stream. It is not a guest monitoring agent and it is not vCenter: it reports what the host VMkernel can see.

> This track is simulation-only. No real ESXi host, capture, credential or production change is involved.

## The three layers

```text
guest workload
   │  vCPU, memory, virtual disk, virtual NIC
   ▼
VMkernel
   │  scheduler · memory manager · vSCSI/NMP · vSwitch
   ▼
physical resources
   │  pCPU · RAM · HBA/LUN/array · NIC/uplink/switch
```

A slow application can be slow in any of those layers. `esxtop` gives you host-side evidence; it does not prove the guest application is innocent.

## Worlds and groups

A **world** is a schedulable VMkernel entity, roughly a thread. A **group** contains one or more worlds. A VM is a group with vCPU worlds, a VMX helper, MKS, and device worlds. Resource pools are also groups.

- Group-level `%USED` is a total. It can hide one starved vCPU.
- `%RDY` must be read per vCPU when a VM has many vCPUs.
- A VM named `WEB-01` is a group; `WEB-01:12345:vmx-vcpu-0` is a world inside it.

## Panels

| Key | Panel | What it answers |
|---|---|---|
| `c` | CPU | Which worlds are running, ready, waiting or limited? |
| `m` | Memory | Is the host reclaiming, ballooning or swapping? |
| `d` | Disk Adapter | Is the HBA/path queue or latency the problem? |
| `u` | Disk Device | Is the LUN/device slow or saturated? |
| `v` | VM Disk | Which VM or virtual disk is generating or seeing latency? |
| `n` | Network | Which port/uplink is dropping or carrying traffic? |
| `i` | Interrupt | Is interrupt load concentrated on a CPU? |
| `p` | CPU Power | Are C/P states or frequency affecting performance? |
| `x` | vSAN | vSAN-specific latency and congestion, where supported. |

There is **no native Datastore panel**. A datastore is a filesystem/object layer; the device (`u`) and VM disk (`v`) panels are the closest host-side views. A datastore can span devices or extents, so map it to its backing LUNs before drawing conclusions.

## PDH-CSV anatomy

A batch capture begins with a PDH marker and then one column per counter:

```text
"(PDH-CSV 4.0) (UTC)(0)","\\esxi01\Group Cpu(123:WEB-01)\% Used","\\esxi01\Vcpu(123:WEB-01:456:vmx-vcpu-0)\% Ready"
"11/03/2026 09:00:00","12.4","3.1"
"11/03/2026 09:00:02","14.8","4.0"
```

The path is:

```text
\\host\Group(instance)\Counter
```

- `host` is the reporting host.
- `Group(instance)` identifies the entity: VM group, world, LUN, adapter or port.
- `Counter` can be short (`%RDY`) or human-readable (`% Ready`), depending on release.
- The first cell is the sample timestamp; the PDH marker carries the timezone.
- The format is **wide**: ten VMs add columns, not rows.

## Interactive, batch and replay

| Mode | Command | Use it for |
|---|---|---|
| Interactive | `esxtop` | Explore fields, prepare an rc file with `W` |
| Batch | `esxtop -b -a -d 2 -n 100` | A reproducible CSV capture |
| Focused | `esxtop -b -c file.rc -d 5 -n 60` | A smaller, repeatable field set |
| Replay | `esxtop -R <vm-support-dir>` | Re-run a previously collected support bundle |

Batch mode locks the entity list at the first sample. A VM created or migrated onto the host after that point may not appear.

## The mental checklist

1. What was captured? Command, interval, sample count, fields and host.
2. Which layer is the symptom in: CPU, memory, storage or network?
3. Which counter proves it, and at what percentile?
4. Is the entity a real VM or an ESXi system world?
5. What is the smallest change that could move the counter, and how will you prove it?

## Simulate it

- [Batch capture to analysis](#/sim/esxtop-batch-capture)
- [CPU ready and limits](#/sim/esxtop-cpu-ready)
- [Storage latency path](#/sim/esxtop-storage-latency)

Next: [Capture modes and command options](#/learn/esxtop-02-capture-modes).
