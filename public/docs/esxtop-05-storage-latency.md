# Storage stack: DAVG, KAVG, GAVG and the queue

Storage latency is the most frequently misread part of esxtop. The guest reports one number, but that number is a sum of layers.

## Follow one command

```text
guest application
   │  read/write
   ▼
virtual disk (v)            LAT/rd, LAT/wr, GAVG
   │
VMkernel vSCSI/NMP          KAVG, QAVG, QUED, ACTV, %USD
   │
HBA / adapter (d)           DAVG, queue depth, path
   │
LUN / device (u)            DAVG, KAVG, GAVG, aborts, resets
   │
array / fabric              array latency, port, cache, media
```

## The core formulas

```text
GAVG = DAVG + KAVG
KAVG includes QAVG (queue wait)
```

- **DAVG** is the device-driver/array round trip. Elevated DAVG points below ESXi.
- **KAVG** is time inside the VMkernel/vSCSI path, including queueing.
- **GAVG** is what the guest feels. It tells you the symptom, not the layer.
- **QAVG** is queue wait; rising QAVG with rising command rate points at saturation.

## Queue counters

| Counter | Meaning | Interpretation |
|---|---|---|
| `QUED` | Queued commands | Sustained > 1 means commands are waiting |
| `ACTV` | Active commands | Work in flight; compare with queue depth |
| `%USD` | Queue depth used | High sustained value means the queue is near its limit |
| `LOAD` | (Active + queued) / queue depth | >1 means outstanding work exceeds depth |
| `DQLEN` / `AQLEN` / `LQLEN` / `WQLEN` | Device/adapter/LUN/world queue depth | The configured limit; do not increase blindly |
| `CMDS/s` | Commands per second | IOPS plus metadata/reservation commands |
| `DAVG/rd`, `KAVG/rd`, `GAVG/rd` | Read-path latency | Cache/media behaviour differs from writes |
| `DAVG/wr`, `KAVG/wr`, `GAVG/wr` | Write-path latency | Compare with array write policy |
| `ABRTS/s` | Aborted commands | Hard error/timeout signal |
| `RESETS/s` | Resets | Recovery after timeouts or path failure |
| `CONS/s` | SCSI reservation conflicts | Shared-VMFS contention |
| `ATSF` | Failed Atomic Test and Set | VAAI/VMFS health signal |
| `DELETE_F` | Failed UNMAP | Storage/VAAI review |
| `FCMDS/s`, `FREAD/s`, `FWRITE/s` | Failed commands/reads/writes | Direct path/array health signals |
| `SPLTCMD/s`, `SPLTCP/s` | Split commands/copies | Large/misaligned I/O can add latency |

The complete queue and error reference is in [Counter reference](#/learn/esxtop-09-counter-reference).

## Read the symptom by layer

```text
GAVG high
 ├─ DAVG dominates → array, fabric, HBA, path or media
 ├─ KAVG dominates → VMkernel queue, vSCSI, path throttling
 └─ both low, guest slow → guest I/O pattern or application
```

High latency with a **full** queue points at saturation. High latency with an **empty** queue can point at a slow path, array or VMkernel delay.

## Datastore vs device vs VM disk

There is **no native Datastore panel** in esxtop. A datastore is a filesystem/object layer; the host sees devices and virtual disks.

- `u` (Disk Device) is the closest view to the backing LUN.
- `v` (VM Disk) shows per-VM virtual disk I/O.
- `d` (Disk Adapter) shows HBA/path-level aggregates.
- A datastore can span devices or extents; map it before blaming one LUN.

## Thresholds

Broadcom says DAVG, KAVG and GAVG should not remain above 10 ms. Yellow Bricks uses 25 ms as a strong warning. This lab warns at 10 ms and marks 25 ms critical for GAVG/DAVG. KAVG warns at 2 ms and marks 5 ms critical. Queue and array thresholds are vendor-specific.

## Support checklist

1. Split GAVG into DAVG and KAVG.
2. Check QUED, ACTV, %USD, DQLEN/AQLEN and path state.
3. Check aborts, resets and reservation conflicts.
4. Compare read and write latency; they are not interchangeable.
5. Correlate with the array, SAN switch and HBA counters.
6. Change one thing; re-capture and compare the same percentile.

## Simulate it

- [Storage latency path](#/sim/esxtop-storage-latency)
- [Storage queue saturation](#/sim/esxtop-storage-queue)

Next: [Network drops and vSAN](#/learn/esxtop-06-network-vsan).
