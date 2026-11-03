import { add, del, ITEM, cfg } from './helpers.js';

const BASE_NODES = ['admin', 'esxi', 'vm', 'storage', 'report'];
const COMMON_LABELS = {
  admin: { name: 'Support engineer', sub: 'SSH · esxtop CLI' },
  vm: { name: 'Virtual machine', sub: 'WEB-01 · 8 vCPU · 32 GB' },
  storage: { name: 'Datastore / array', sub: 'LUN · NMP · DAVG' },
  network: { name: 'Physical network', sub: 'switch · NIC · link' },
  report: { name: 'Capture analysis', sub: 'findings · action plan · report' },
};

export const esxtopBatchCapture = {
  id: 'esxtop-batch-capture',
  title: 'Batch capture — from SSH to a reproducible PDH-CSV',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-capture',
  level: 'core',
  minutes: 10,
  tags: ['esxtop', 'batch', 'PDH-CSV', 'gzip', 'capture', 'analysis'],
  summary:
    'Run a real-world esxtop batch capture, stream it through gzip, inspect the PDH-CSV header, and turn the wide table into findings. This is the baseline every other ESXtop simulation builds on.',
  nodes: BASE_NODES,
  stores: ['esxtop', 'capture', 'esxi'],
  nodeLabels: COMMON_LABELS,
  steps: [
    {
      from: 'admin', to: 'esxi.esxtop', badge: 'esxtop -b -a -d 2 -n 100', channel: 'cli',
      detail:
        'SSH to the ESXi host and run esxtop in batch mode. `-b` writes CSV to stdout, `-a` selects all statistics, `-d 2` sets a 2-second delay and `-n 100` bounds the run.\n\nRecord the host, ESXi build, exact command, interval and sample count. The capture is evidence; an unrecorded command is not reproducible.',
      http: {
        req: `$ esxtop -b -a -d 2 -n 100 \\\n    | gzip -9c > /vmfs/volumes/datastore1/esxtop-$(hostname)-$(date +%FT%H%M).csv.gz`,
        res: `capture running: 100 samples, 2s interval\nPDH-CSV written to stdout\ngzip stream closed`,
      },
      vault: [
        add('esxtop', ITEM.host({ id: 'host', name: 'esxi01', meta: 'ESXi 8.0 U3 · 24 pCPU · 512 GB' })),
        add('capture', ITEM.capture({ id: 'raw', name: 'esxtop-2026-11-03.csv.gz', meta: 'gzip · 100 samples · 936 columns' })),
      ],
      tags: ['batch', 'gzip', 'interval', 'sample count'],
    },
    {
      from: 'esxi.esxtop', to: 'esxi.metrics', badge: 'read PDH counters', channel: 'internal',
      detail:
        'The VMkernel exposes counters as world/group/device samples. esxtop reads them repeatedly and writes one wide row per interval.\n\nA counter path is `\\\\host\\Group(instance)\\Counter`. The instance can be a VM, world, LUN, adapter, port or queue. The same logical metric can appear at several layers.',
      vault: [
        add('esxi', ITEM.stat({ id: 'cpu', name: '%RDY / %MLMTD / %CSTP', meta: 'CPU scheduler counters' })),
        add('esxi', ITEM.stat({ id: 'storage', name: 'DAVG / KAVG / GAVG', meta: 'vSCSI and device latency' })),
      ],
      tags: ['PDH', 'world', 'group', 'instance'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'parse + analyze', channel: 'report',
      detail:
        'The parser validates the PDH marker, builds one series per column, computes stats (P95, P05, max), and evaluates the rules. The raw values are stored in a temporary session; the browser receives metadata and findings, not every sample up front.\n\nCheck the capture window, sample count and warnings before trusting a finding.',
      vault: [
        add('capture', ITEM.finding({ id: 'finding', name: 'Critical findings', meta: 'P95/P05 · guardrails · entity' })),
        add('capture', ITEM.report({ id: 'report', name: 'Capture report', meta: 'action plan + technical reference' })),
      ],
      tags: ['parser', 'P95', 'P05', 'findings'],
    },
    {
      from: 'report', to: 'admin', badge: 'review action plan', channel: 'report',
      detail:
        'The report prioritizes findings and explains the counter relationships. Start with P1 criticals, confirm the raw series, then change one thing and re-capture.\n\nA finding is not a root cause. It is a guardrail breach that needs an explanation.',
      tags: ['triage', 'action plan', 'change control'],
    },
    {
      from: 'admin', to: 'esxi.esxtop', badge: 'focused re-capture', channel: 'cli',
      detail:
        'Once you know the layer, switch to a focused `-c` capture. Do not keep collecting every counter for a long window; it increases file size, parse time and memory. Use the same interval and sample count so the comparison is valid.',
      vault: [deleteCapture('raw')],
      tags: ['focused capture', 'repeatability', 'scope'],
    },
  ],
  notes: [
    'Batch mode locks the entity list at the first sample; a VM created later may be missing.',
    '`-a` overrides a saved rc configuration. Do not combine `-a` with a focused capture.',
    'The PDH-CSV timestamp is authoritative; `n × d` is only nominal coverage.',
    'Always keep the raw capture and the exact command with the report.',
  ],
  config: [
    cfg('Baseline capture', [
      '`-b`: batch mode, CSV to stdout.',
      '`-a`: all statistics; widest and largest capture.',
      '`-d 2`: two-second delay; minimum supported is two seconds.',
      '`-n 100`: about 100 samples; nominal coverage is 200 seconds.',
      '`gzip -9c`: compress the stream; the `.csv` suffix may still be gzip data.',
    ]),
  ],
  pitfalls: [
    'Analyzing a capture without recording the host, build or command.',
    'Using `-a` with `-c` and expecting the focused field set.',
    'Assuming a short capture proves a sustained problem.',
    'Leaving the only copy in `/tmp` or on the datastore under investigation.',
  ],
  productionChecks: [
    'Capture command, host/build and time window recorded.',
    'Header inspected with `-n 2` before a long run.',
    'File compressed, checksummed and copied off the host.',
    'Report generated from the same capture file.',
  ],
};

function deleteCapture(id) {
  return del('capture', id);
}

export const esxtopCpuReady = {
  id: 'esxtop-cpu-ready',
  title: 'CPU ready — limits, co-stop and the monster VM',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-cpu',
  level: 'core',
  minutes: 11,
  tags: ['%RDY', '%MLMTD', '%CSTP', 'vCPU', 'monster VM', 'CPU limit', 'NUMA'],
  summary:
    'A 16-vCPU VM reports high %RDY. Separate a CPU limit from host contention and SMP co-stop, then decide whether the fix is a limit change, fewer vCPUs, placement or more capacity.',
  nodes: BASE_NODES,
  stores: ['vmguest', 'esxi', 'capture'],
  nodeLabels: { ...COMMON_LABELS, vm: { name: 'Monster VM', sub: 'ERP-SQL01 · 16 vCPU · 256 GB' } },
  steps: [
    {
      from: 'vm', to: 'esxi.vmkernel', badge: '16 vCPUs become runnable', channel: 'guest',
      detail:
        'The guest workload wakes multiple vCPUs. Each vCPU is a world that must be scheduled on a physical CPU. A VM with more vCPUs than the workload can use evenly creates co-scheduling constraints.\n\nHigh CPU consumption is not the same as high ready time: a vCPU can be mostly idle and still wait for a pCPU when it becomes runnable.',
      vault: [add('vmguest', ITEM.vm({ id: 'vm', name: 'ERP-SQL01', meta: '16 vCPU · 256 GB · SQL workload' }))],
      tags: ['vCPU world', 'SMP', 'guest workload'],
    },
    {
      from: 'esxi.vmkernel', to: 'esxi.metrics', badge: 'sample %RDY / %MLMTD / %CSTP', channel: 'host',
      detail:
        'The scheduler records `%RDY` (ready but not scheduled), `%MLMTD` (blocked by a CPU limit) and `%CSTP` (waiting for siblings). `%MLMTD` and `%CSTP` are parts of `%RDY`, not additional delay.\n\nRead `%RDY` per vCPU. A group total can look acceptable while one vCPU is starved.',
      http: {
        req: `\\esxi01\\Vcpu(123:ERP-SQL01:456:vmx-vcpu-0)\\% Ready`,
        res: `P95 13.4% · P05 2.1% · max 19.8%\n%MLMTD P95 0.0%\n%CSTP P95 4.8%`,
      },
      vault: [
        add('esxi', ITEM.stat({ id: 'ready', name: '%RDY P95', meta: '13.4% vs 10% guardrail' })),
        add('esxi', ITEM.stat({ id: 'cstop', name: '%CSTP P95', meta: '4.8% vs 5% critical' })),
      ],
      tags: ['%RDY', '%MLMTD', '%CSTP', 'per-vCPU'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'classify the wait', channel: 'report',
      detail:
        'The rule engine sees `%RDY` above 10% and emits a VM-scoped finding. Because `%MLMTD` is zero and `%CSTP` is near 5%, the evidence points to host scheduling plus co-scheduling pressure, not a CPU limit.\n\nA CPU limit would require a different action: remove or raise the limit first. Adding hardware would not fix a limit-induced wait.',
      vault: [add('capture', ITEM.finding({ id: 'ready-finding', name: 'vCPU ready time is elevated', meta: 'ERP-SQL01 · P95 13.4%' }))],
      tags: ['finding', 'decision tree', 'limit vs contention'],
    },
    {
      from: 'report', to: 'admin', badge: 'reduce vCPU count first', channel: 'report',
      detail:
        'The least invasive change is usually to right-size the VM: fewer vCPUs can reduce co-stop and improve placement. If the guest genuinely needs all 16 vCPUs, check host pCPU saturation and move the VM or add capacity.\n\nDo not “fix” this by adding CPU while `%MLMTD` is non-zero; that is a policy limit, not a capacity problem.',
      tags: ['right-size', 'placement', 'capacity'],
    },
    {
      from: 'admin', to: 'vm', badge: '12 vCPUs + re-capture', channel: 'report',
      detail:
        'After the change, re-capture with the same interval and sample count. Compare the same P95 and the worst vCPU. If `%RDY` falls but the workload suffers, the guest may be CPU-bound; reassess before removing more vCPUs.',
      vault: [add('vmguest', ITEM.stat({ id: 'after', name: 'Post-change %RDY', meta: 'P95 6.2% · 12 vCPU' }))],
      tags: ['verification', 'P95', 'change control'],
    },
  ],
  notes: [
    '`%RDY` includes `%MLMTD` and `%CSTP`; split it before choosing a fix.',
    'A “monster” VM with high ready time is not automatically a false positive.',
    'A sustained `%MLMTD` above zero means a VM or resource-pool limit is shaping the workload.',
    'A group aggregate can hide a single starved vCPU; read per world.',
  ],
  config: [
    cfg('CPU decision tree', [
      '`%RDY` high + `%MLMTD` > 0 → remove or raise the CPU limit first.',
      '`%RDY` high + `%MLMTD` = 0 + `%CSTP` high → reduce vCPUs or rebalance the guest.',
      '`%RDY` high + `%MLMTD` = 0 + `%CSTP` low → host CPU contention; move/reduce/add capacity.',
      'Check worst pCPU utilisation and load average, not only the host mean.',
    ]),
  ],
  pitfalls: [
    'Treating group-level `%RDY` as per-vCPU ready time.',
    'Adding physical CPU when a CPU limit is the cause.',
    'Ignoring co-stop on a wide VM with an uneven workload.',
    'Comparing a post-change capture with a different interval or sample count.',
  ],
  productionChecks: [
    'Per-vCPU P95 and worst world recorded.',
    '`%MLMTD` and `%CSTP` checked before capacity changes.',
    'Host pCPU and load average checked.',
    'Change and re-capture recorded with the same method.',
  ],
};

export const esxtopMemoryReclaim = {
  id: 'esxtop-memory-reclaim',
  title: 'Memory reclaim — ballooning, swap and NUMA',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-memory',
  level: 'core',
  minutes: 10,
  tags: ['memory', 'MCTLSZ', 'SWCUR', 'SWR/s', 'NUMA', 'N%L', 'overcommit'],
  summary:
    'The host is low on free memory. Watch the reclaim ladder: ballooning, compression, VMkernel swap and NUMA locality. Decide whether the fix is a memory limit, reservation, placement or more host memory.',
  nodes: BASE_NODES,
  stores: ['vmguest', 'esxi', 'capture', 'datastore'],
  nodeLabels: { ...COMMON_LABELS, vm: { name: 'Memory-heavy VM', sub: 'WEB-01 · 64 GB · 8 vCPU' } },
  steps: [
    {
      from: 'vm', to: 'esxi.vmkernel', badge: 'guest working set grows', channel: 'guest',
      detail:
        'The guest touches more memory. `MEMSZ` is configured memory; `GRANT` is what is mapped; `%ACTV` estimates active use. A large configured VM is not automatically a memory problem.\n\nThe host reclaims only when free memory and page sharing cannot satisfy demand.',
      vault: [add('vmguest', ITEM.vm({ id: 'vm', name: 'WEB-01', meta: '64 GB configured · 8 vCPU' }))],
      tags: ['MEMSZ', 'GRANT', '%ACTV'],
    },
    {
      from: 'esxi.vmkernel', to: 'esxi.metrics', badge: 'MCTLSZ / SWCUR / N%L', channel: 'host',
      detail:
        'The memory scheduler reports ballooned memory (`MCTLSZ`), VMkernel swap (`SWCUR`), swap rates (`SWR/s`, `SWW/s`) and NUMA locality (`N%L`).\n\nBallooning is cheaper than swap-in, which is synchronous. Persistent swap is more serious than a transient balloon.',
      http: {
        req: `\\esxi01\\Group Memory(123:WEB-01)\\Memctl MBytes\n\\esxi01\\Group Memory(123:WEB-01)\\Swapped MBytes\n\\esxi01\\Group Memory(123:WEB-01)\\Numa % Local`,
        res: `MCTLSZ P95 2048 MB\nSWCUR P95 512 MB\nN%L P05 0%`,
      },
      vault: [
        add('esxi', ITEM.stat({ id: 'balloon', name: 'MCTLSZ P95', meta: '2,048 MB ballooned' })),
        add('esxi', ITEM.stat({ id: 'swap', name: 'SWCUR P95', meta: '512 MB swapped' })),
        add('esxi', ITEM.stat({ id: 'numa', name: 'N%L P05', meta: '0% local · remote memory' })),
      ],
      tags: ['MCTLSZ', 'SWCUR', 'SWR/s', 'N%L'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'pressure + locality findings', channel: 'report',
      detail:
        'The report raises VM memory findings for ballooning/swap and NUMA locality. The action depends on the cause:\n\n- a VM/resource-pool memory limit → remove or raise it;\n- host overcommit → reduce memory, add capacity or move the VM;\n- a VM larger than a NUMA node → right-size or correct placement.',
      vault: [add('capture', ITEM.finding({ id: 'mem-finding', name: 'Memory reclaim + poor NUMA locality', meta: 'WEB-01 · MCTLSZ/SWCUR/N%L' }))],
      tags: ['finding', 'limit', 'overcommit', 'NUMA'],
    },
    {
      from: 'report', to: 'admin', badge: 'check limits before adding RAM', channel: 'report',
      detail:
        'Check the VM and resource-pool memory limit and reservation first. A limit can cause reclaim even when the host has free memory. If the host is genuinely overcommitted, more RAM or a smaller VM is the fix.\n\nDo not tune storage because swap-in is slow; fix the memory pressure that caused it.',
      tags: ['limit', 'reservation', 'host capacity'],
    },
    {
      from: 'admin', to: 'storage', badge: 'swap I/O reaches the datastore', channel: 'storage',
      detail:
        'VMkernel swap writes pages to the swap file on a datastore. Swap-in is synchronous and can appear as guest latency or storage load. Storage latency is a symptom here, not necessarily the root cause.\n\nFix memory pressure before chasing DAVG/KAVG.',
      vault: [add('datastore', ITEM.lun({ id: 'swap-lun', name: 'Swap datastore', meta: 'swap file · storage load' }))],
      tags: ['swap file', 'storage symptom', 'latency'],
    },
  ],
  notes: [
    '`MCTLSZ` is ballooned memory; `SWCUR` is VMkernel swap. They are not the same.',
    '`SWR/s` and `SWW/s` show whether swap is active now; a stale `SWCUR` can remain.',
    '`N%L` below 80% is poor; below 50% is a strong warning.',
    'Low free memory without reclaim can be cache usage, not pressure.',
  ],
  config: [
    cfg('Memory decision tree', [
      '`MCTLSZ` high, `SWCUR` low → ballooning; check host free memory and VM limits.',
      '`SWCUR`/`SWR/s` high → active VMkernel swap; treat as priority.',
      '`N%L` low → NUMA placement/sizing problem.',
      'Free memory low, no reclaim → may be cache; do not resize from one number.',
    ]),
  ],
  pitfalls: [
    'Adding host RAM without checking a VM memory limit.',
    'Treating guest OS paging as VMkernel swap.',
    'Ignoring NUMA locality on a VM larger than a node.',
    'Tuning storage because swap-in is slow, instead of fixing memory pressure.',
  ],
  productionChecks: [
    'Host free memory, overcommit and reclaim checked together.',
    'VM/resource-pool limits and reservations reviewed.',
    'NUMA locality compared with VM size and node size.',
    'Post-change capture confirms the same signal improved.',
  ],
};

export const esxtopStorageLatency = {
  id: 'esxtop-storage-latency',
  title: 'Storage latency — DAVG, KAVG and GAVG',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-storage',
  level: 'advanced',
  minutes: 11,
  tags: ['DAVG', 'KAVG', 'GAVG', 'QAVG', 'vSCSI', 'LUN', 'latency'],
  summary:
    'A guest sees 22 ms of disk latency. Follow the command through the virtual disk, vSCSI/NMP, HBA and array, then split GAVG into DAVG and KAVG before changing anything.',
  nodes: BASE_NODES,
  stores: ['vmguest', 'datastore', 'esxi', 'capture'],
  nodeLabels: { ...COMMON_LABELS, vm: { name: 'Latency-sensitive VM', sub: 'ERP-SQL01 · SQL · 16 vCPU' } },
  steps: [
    {
      from: 'vm', to: 'esxi.vscsi', badge: 'guest read/write → vSCSI', channel: 'guest',
      detail:
        'The guest issues I/O to its virtual disk. `LAT/rd` and `LAT/wr` are guest-observed latencies. `GAVG` is the same symptom at the device/VM level.\n\nThe guest number tells you what the workload feels; it does not tell you which layer is slow.',
      vault: [add('vmguest', ITEM.vm({ id: 'vm', name: 'ERP-SQL01', meta: 'SQL · 16 vCPU · latency-sensitive' }))],
      tags: ['LAT/rd', 'LAT/wr', 'GAVG'],
    },
    {
      from: 'esxi.vscsi', to: 'storage', badge: 'NMP → HBA → LUN', channel: 'storage',
      detail:
        'The vSCSI/NMP layer queues the command, selects a path and sends it to the HBA and LUN. `KAVG` is time inside the VMkernel; `DAVG` is the device/array round trip.\n\n`GAVG = DAVG + KAVG`. If DAVG dominates, look below ESXi; if KAVG dominates, look at the VMkernel queue, path or vSCSI.',
      http: {
        req: `GAVG = DAVG + KAVG\nDAVG 16.6 ms + KAVG 5.2 ms = GAVG 21.8 ms`,
        res: `device: naa.6001405a…\nadapter: vmhba0\nqueue: QUED 3 · ACTV 7 · %USD 42%`,
      },
      vault: [
        add('datastore', ITEM.lun({ id: 'lun', name: 'naa.6001405a…', meta: 'VMFS datastore · DAVG 16.6ms' })),
        add('esxi', ITEM.stat({ id: 'davg', name: 'DAVG/cmd P95', meta: '16.6 ms vs 10 ms' })),
        add('esxi', ITEM.stat({ id: 'kavg', name: 'KAVG/cmd P95', meta: '5.2 ms vs 5 ms' })),
      ],
      tags: ['DAVG', 'KAVG', 'path', 'queue'],
    },
    {
      from: 'storage', to: 'esxi.metrics', badge: 'array latency + queue sample', channel: 'storage',
      detail:
        'The array/fabric returns completions. The capture records DAVG, KAVG, GAVG, QAVG, QUED, ACTV, %USD and path state. High latency with a full queue points at saturation; high latency with an empty queue points at the path, array or VMkernel delay.\n\nRead/write variants are not interchangeable: array cache and media behave differently.',
      vault: [add('esxi', ITEM.stat({ id: 'queue', name: 'QUED / ACTV / %USD', meta: '3 / 7 / 42%' }))],
      tags: ['QUED', 'ACTV', '%USD', 'read/write'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'split the symptom', channel: 'report',
      detail:
        'The report emits device and guest latency findings. DAVG at 16.6 ms is above the 10 ms guardrail; KAVG at 5.2 ms is also at the critical boundary. The action is not “add cache”: check the array/fabric for DAVG and the VMkernel queue/path for KAVG.\n\nCorrelate with the array and switch counters before changing queue depth.',
      vault: [add('capture', ITEM.finding({ id: 'storage-finding', name: 'Device and guest storage latency', meta: 'DAVG 16.6ms · KAVG 5.2ms' }))],
      tags: ['finding', 'DAVG', 'KAVG', 'array'],
    },
    {
      from: 'report', to: 'admin', badge: 'change one layer', channel: 'report',
      detail:
        'Choose the layer with the dominant time. If DAVG dominates, engage the storage/array team; if KAVG dominates, check queue depth, path state and host CPU. Change one thing and re-capture with the same workload and interval.',
      tags: ['action plan', 'change control', 'verification'],
    },
  ],
  notes: [
    'GAVG is the guest symptom; DAVG and KAVG locate the layer.',
    'QAVG is part of KAVG; rising QAVG with command rate points at saturation.',
    'A datastore can span devices/extents; map it before blaming one LUN.',
    'Any sustained aborts/resets are an incident, not a tuning problem.',
  ],
  config: [
    cfg('Storage decision tree', [
      'GAVG high + DAVG dominates → array, fabric, HBA, path or media.',
      'GAVG high + KAVG dominates → VMkernel queue, vSCSI, path throttling.',
      'QUED/%USD high → queue saturation; check DQLEN/AQLEN and backend capability.',
      'ABRTS/s, RESETS/s or CONS/s → hard errors/conflicts; check path and array health.',
    ]),
  ],
  pitfalls: [
    'Blaming the array from GAVG alone without splitting DAVG/KAVG.',
    'Increasing queue depth when the backend cannot absorb it.',
    'Comparing read latency with write latency as if they were the same.',
    'Forgetting that a datastore can span multiple devices.',
  ],
  productionChecks: [
    'GAVG split into DAVG and KAVG.',
    'Queue depth, path state and aborts/resets checked.',
    'Array/SAN switch counters correlated.',
    'Post-change capture uses the same workload and interval.',
  ],
};

export const esxtopStorageQueue = {
  id: 'esxtop-storage-queue',
  title: 'Storage queue — QUED, ACTV and %USD',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-storage',
  level: 'advanced',
  minutes: 9,
  tags: ['QUED', 'ACTV', '%USD', 'DQLEN', 'AQLEN', 'queue depth', 'aborts'],
  summary:
    'Latency rises with load. Decide whether the queue is saturated, the path is slow, or the array is the bottleneck — and why increasing queue depth is not automatically safe.',
  nodes: BASE_NODES,
  stores: ['esxi', 'datastore', 'logs', 'capture'],
  nodeLabels: { ...COMMON_LABELS, storage: { name: 'Saturated LUN', sub: 'queue · paths · array' } },
  steps: [
    {
      from: 'vm', to: 'esxi.vscsi', badge: 'more concurrent I/O', channel: 'guest',
      detail:
        'The workload increases concurrency. More commands enter the vSCSI/NMP queue. The queue can absorb bursts, but a sustained full queue adds latency to every command.\n\n`QUED` is queued commands, `ACTV` is active commands and `%USD` is the percentage of queue depth used.',
      tags: ['concurrency', 'QUED', 'ACTV', '%USD'],
    },
    {
      from: 'esxi.vscsi', to: 'storage', badge: 'queue full → wait', channel: 'storage',
      detail:
        'The device/adapter queue depth (`DQLEN`/`AQLEN`) limits how many commands can be in flight. When the queue is full, new commands wait even if the array could eventually service them.\n\nHigh latency with a full queue is saturation. High latency with an empty queue is a different problem.',
      vault: [add('esxi', ITEM.stat({ id: 'queue', name: 'Queue depth', meta: 'QUED 8 · ACTV 12 · %USD 78%' }))],
      tags: ['DQLEN', 'AQLEN', 'saturation'],
    },
    {
      from: 'storage', to: 'esxi.metrics', badge: 'aborts / resets / conflicts', channel: 'storage',
      detail:
        'A queue that is too deep for the backend can increase latency and timeouts. `ABRTS/s` and `RESETS/s` are hard error signals; `CONS/s` indicates SCSI reservation conflicts.\n\nDo not increase queue depth blindly. Confirm the array can absorb more concurrency and that the path is healthy.',
      vault: [
        add('esxi', ITEM.stat({ id: 'aborts', name: 'ABRTS/s', meta: '0.02/s · timeout risk' })),
        add('logs', ITEM.finding({ id: 'queue-finding', name: 'Queue saturation', meta: 'QUED 8 · %USD 78%' })),
      ],
      tags: ['aborts', 'resets', 'reservation conflicts'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'saturation vs path', channel: 'report',
      detail:
        'The report combines latency and queue evidence. If DAVG/KAVG rise with queue depth, the backend or path is saturated. If queue depth is low but latency is high, investigate the path, array or VMkernel delay.\n\nUse the action plan: change one queue/path/array variable, then re-capture.',
      tags: ['finding', 'decision tree', 'change control'],
    },
  ],
  notes: [
    'Queue depth is a limit, not a performance target.',
    'High latency with a full queue points at saturation; high latency with an empty queue points elsewhere.',
    'Aborts/resets are incidents, not normal noise.',
    'Read and write queue behaviour can differ due to cache policy.',
  ],
  config: [
    cfg('Queue checklist', [
      '`QUED`: sustained > 1 means commands wait.',
      '`ACTV`: work in flight; compare with queue depth.',
      '`%USD`: high sustained value means the queue is near its limit.',
      '`DQLEN`/`AQLEN`: configured depth; increase only with backend validation.',
      '`ABRTS/s`, `RESETS/s`, `CONS/s`: check path/array health.',
    ]),
  ],
  pitfalls: [
    'Increasing queue depth to hide an array bottleneck.',
    'Ignoring aborts/resets because latency “looks okay”.',
    'Comparing queue metrics across different workloads without context.',
    'Not checking path state and array health.',
  ],
  productionChecks: [
    'Queue depth, latency and error counters reviewed together.',
    'Array/path vendor guidance applied before depth changes.',
    'Post-change re-capture confirms latency and errors.',
  ],
};

export const esxtopNetworkDrops = {
  id: 'esxtop-network-drops',
  title: 'Network drops — VM port, uplink and physical switch',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-network',
  level: 'core',
  minutes: 9,
  tags: ['%DRPTX', '%DRPRX', 'packet drops', 'uplink', 'throughput', 'link speed'],
  summary:
    'A VM reports packet loss. Trace the path from the virtual NIC to the vSwitch, uplink and physical switch, and separate a drop from a throughput or CPU problem.',
  nodes: BASE_NODES,
  stores: ['vmguest', 'vswitch', 'physical', 'esxi', 'capture'],
  nodeLabels: { ...COMMON_LABELS, vm: { name: 'Network-heavy VM', sub: 'APP-01 · 4 vCPU · 10 GbE' } },
  steps: [
    {
      from: 'vm', to: 'esxi.vswitch', badge: 'VM NIC → vSwitch port', channel: 'guest',
      detail:
        'The guest transmits and receives through a virtual NIC attached to a vSwitch/DVS port. `%DRPTX` and `%DRPRX` are percentages, not rates. Correlate them with packet rate, throughput and packet size.\n\nA 1% drop at a high packet rate can be worse than a 5% drop at a low rate.',
      vault: [add('vmguest', ITEM.vm({ id: 'vm', name: 'APP-01', meta: '4 vCPU · 10 GbE' }))],
      tags: ['%DRPTX', '%DRPRX', 'virtual NIC'],
    },
    {
      from: 'esxi.vswitch', to: 'network', badge: 'uplink → physical switch', channel: 'network',
      detail:
        'The vSwitch forwards to a physical uplink. Drops can occur on the VM port, the uplink, or the physical switch. `SPEED` gives the link ceiling; `MbTX/s` and `MbRX/s` show utilisation.\n\nCheck whether the port is a VM port or an uplink; `Uplink?` and `Link Up?` are categorical, not numeric.',
      http: {
        req: `\\esxi01\\Network Port(vmnic0)\\%% Outbound Packets Dropped\n\\esxi01\\Network Port(vmnic0)\\Mb Transmitted/sec`,
        res: `%DRPTX P95 2.1% · MbTX/s P95 7,420 Mbps\nlink speed: 10,000 Mbps`,
      },
      vault: [
        add('vswitch', ITEM.stat({ id: 'drops', name: '%DRPTX P95', meta: '2.1% · uplink' })),
        add('physical', ITEM.stat({ id: 'tx', name: 'MbTX/s P95', meta: '7.4 Gbps of 10 Gbps' })),
      ],
      tags: ['uplink', 'SPEED', 'throughput'],
    },
    {
      from: 'network', to: 'esxi.metrics', badge: 'switch counters + host CPU', channel: 'network',
      detail:
        'The physical switch may drop before the host sees the packet. Check its port counters, congestion and errors. On the host, check CPU readiness: packet processing can be CPU-bound even when throughput is below the link speed.\n\nA drop is not automatically a network-team problem; the host may be the cause.',
      tags: ['physical switch', 'host CPU', 'correlation'],
    },
    {
      from: 'esxi.metrics', to: 'report', badge: 'drops + throughput finding', channel: 'report',
      detail:
        'The report emits a network drop finding with the observed percentage and guardrail. The action depends on the location: guest/virtual NIC, uplink/teaming, physical switch, or host CPU.\n\nChange one variable and re-capture. Keep the physical switch counters alongside the esxtop capture.',
      vault: [add('capture', ITEM.finding({ id: 'drop-finding', name: 'Packet drops reported', meta: 'uplink · P95 2.1%' }))],
      tags: ['finding', 'action plan', 'verification'],
    },
  ],
  notes: [
    'Drops are ratios; pair them with packet rate and throughput.',
    'The guest, vSwitch and physical switch can each drop independently.',
    'Check host CPU readiness before blaming the network.',
    'A link at 74% utilisation can still have buffer/queue drops.',
  ],
  config: [
    cfg('Network checklist', [
      '`%DRPTX`/`%DRPRX`: direction and port.',
      '`PKTTX/s`/`PKTRX/s`: packet rate and size.',
      '`MbTX/s`/`MbRX/s`: throughput versus link speed.',
      '`SPEED`: uplink ceiling.',
      'Physical switch: port errors, buffer drops, congestion.',
    ]),
  ],
  pitfalls: [
    'Treating a drop percentage as a packet rate.',
    'Blaming the physical network without checking host CPU.',
    'Ignoring teaming/uplink configuration.',
    'Comparing captures from different traffic profiles.',
  ],
  productionChecks: [
    'VM port, uplink and physical switch counters collected.',
    'Host CPU readiness checked.',
    'Teaming and traffic shaping reviewed.',
    'Post-change capture uses the same traffic profile.',
  ],
};

export const esxtopFocusedRc = {
  id: 'esxtop-focused-rc',
  title: 'Focused capture — rc file, panels and large samples',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-ops',
  level: 'advanced',
  minutes: 11,
  tags: ['-c', 'rc file', 'W', 'panels', 'large capture', 'ESXTOP_MAX_CELLS', 'Datastore'],
  summary:
    'Build a storage-focused rc file with W, combine d/u/v panels, avoid the missing Datastore panel, and size a large capture without blowing the parser or container memory.',
  nodes: BASE_NODES,
  stores: ['esxtop', 'capture'],
  nodeLabels: { ...COMMON_LABELS, admin: { name: 'Support engineer', sub: 'SSH · rc workflow' } },
  steps: [
    {
      from: 'admin', to: 'esxi.esxtop', badge: 'interactive esxtop', channel: 'cli',
      detail:
        'Start esxtop interactively. Configure the panels you need: `d` Disk Adapter, `u` Disk Device, `v` VM Disk, `c` CPU, `m` memory, `n` network. Press `f` to select fields and `o` to reorder.\n\nThe rc file stores every panel layout, so clear the fields you do not want in the other panels before saving.',
      tags: ['interactive', 'panels', 'f', 'o'],
    },
    {
      from: 'esxi.esxtop', to: 'esxi.metrics', badge: 'W → .esxtop60rc', channel: 'internal',
      detail:
        'Press uppercase `W` and save to a durable datastore path. The file is positional: 8+ lines of panel field letters plus an options line. Uppercase means selected; lowercase hidden. Do not hand-edit it.\n\nYou can combine Disk Adapter (`d`), Disk Device (`u`) and VM Disk (`v`) in one rc. There is no separate Datastore panel.',
      http: {
        req: `W\n/vmfs/volumes/datastore1/esxtop-storage.rc`,
        res: `abcdefghij\nabcdefghijklmnopq\nABCDEfGHIJkl\nABcdeFGhIJKLmnop\naBCDEfghIJKl\nabcdefghijklmnopq\nabcdef\nabcdef\nAbcDEFGHijKlmN\nABCdEf\n5p`,
      },
      vault: [add('esxtop', ITEM.rc({ id: 'rc', name: 'esxtop-storage.rc', meta: 'd/u/v · 5s · start p' }))],
      tags: ['W', 'rc', 'positional', 'Datastore'],
    },
    {
      from: 'admin', to: 'esxi.esxtop', badge: 'esxtop -b -c … -n 2', channel: 'cli',
      detail:
        'Validate the rc with a two-sample batch run and inspect the header. Do not add `-a`; it overrides the configuration and collects everything.\n\nIf expected counters are missing, the rc is not selecting the panels you think it is. Re-check `f` and press `W` again.',
      http: {
        req: `$ esxtop -b -c /vmfs/volumes/datastore1/esxtop-storage.rc \\\n    -d 2 -n 2 > /vmfs/volumes/datastore1/esxtop-test.csv\n$ head -1 esxtop-test.csv | tr ',' '\\n' | grep -E 'DAVG|KAVG|GAVG|CMDS|QUED'`,
        res: `DAVG/cmd\nKAVG/cmd\nGAVG/cmd\nCMDS/s\nQUED`,
      },
      tags: ['-b', '-c', '-n 2', 'header'],
    },
    {
      from: 'esxi.esxtop', to: 'report', badge: 'large capture sizing', channel: 'report',
      detail:
        'A 145,697-column × 100-sample capture measured about 1.23 GiB peak RSS. Plan with `peak ≈ 0.6 GB + cells × 48 bytes`. At 146,274 columns, 100M cells is about 5–6 GB and 683 samples.\n\nGiving the container 10 GB does not raise the parser limit. Change `ESXTOP_MAX_CELLS` too, raise `/tmp`, and recreate the container.',
      vault: [
        add('capture', ITEM.capture({ id: 'large', name: 'Large capture', meta: '146,274 columns · 683 samples' })),
        add('capture', ITEM.report({ id: 'sizing', name: 'Sizing plan', meta: 'ESXTOP_MAX_CELLS=100000000' })),
      ],
      tags: ['large samples', 'memory', 'ESXTOP_MAX_CELLS', 'tmpfs'],
    },
  ],
  notes: [
    '`W` is uppercase and case-sensitive.',
    'Do not add `-a` to a focused command.',
    'No separate Datastore panel: use `u` and `v`.',
    'The rc file is version-specific; validate with `-n 2` on the target host.',
    'Changing ESXTOP_MAX_* requires recreating the container/process.',
  ],
  config: [
    cfg('Focused rc checklist', [
      'Configure `d`, `u`, `v` (and any other panels) in one session.',
      'Clear unwanted fields in c/m/n/i/p.',
      'Press `W`, save to `/vmfs/volumes/.../.rc`.',
      'Validate with `-b -c <rc> -d 2 -n 2`.',
      'For large captures, raise `ESXTOP_MAX_CELLS`, upload/decompressed limits and `/tmp`.',
    ]),
  ],
  pitfalls: [
    'Hand-editing a release-specific rc file.',
    'Adding `-a` and expecting the focused field set.',
    'Looking for a native Datastore panel.',
    'Giving the container RAM without raising ESXTOP_MAX_CELLS.',
  ],
  productionChecks: [
    'Header has the expected counters.',
    'Capture and rc stored with the report.',
    'Large-capture memory and /tmp have headroom.',
    'Container recreated after environment changes.',
  ],
};

export const esxtopTriageReport = {
  id: 'esxtop-triage-report',
  title: 'Triage and report — from finding to verified change',
  topic: 'esxtop',
  layout: 'esxtop',
  category: 'esxtop-ops',
  level: 'advanced',
  minutes: 10,
  tags: ['triage', 'P95', 'false positive', 'system worlds', 'action plan', 'report', 'HTML', 'PDF'],
  summary:
    'A report says the host is critical. Separate real VM findings from ESXi system worlds, follow the decision guide, make one change, re-capture and produce a support hand-off.',
  nodes: BASE_NODES,
  stores: ['capture', 'esxi'],
  nodeLabels: COMMON_LABELS,
  steps: [
    {
      from: 'esxi.metrics', to: 'report', badge: 'P95/P05 → findings', channel: 'report',
      detail:
        'The rule engine evaluates P95 for sustained high-is-worse conditions, P05 for low-is-worse metrics such as `N%L`, and max for hard errors. A finding is a guardrail breach, not a root cause.\n\nCheck the capture window, sample count and entity before acting.',
      vault: [add('capture', ITEM.finding({ id: 'finding', name: 'Critical findings', meta: 'VM + host + storage' }))],
      tags: ['P95', 'P05', 'max', 'guardrail'],
    },
    {
      from: 'report', to: 'admin', badge: 'filter system worlds', channel: 'report',
      detail:
        'ESXi system worlds such as `system1`, `hostd.20994601` and `python.20979311` are not VMs. They are excluded from the VM table and VM-scoped findings; their raw series remain searchable.\n\nA real “monster” VM with high `%RDY` is not automatically a false positive. Check `%MLMTD` and `%CSTP` before dismissing it.',
      tags: ['system worlds', 'false positives', 'monster VM'],
    },
    {
      from: 'admin', to: 'esxi.vmkernel', badge: 'confirm the layer', channel: 'host',
      detail:
        'Use the decision guide: CPU (%RDY/%MLMTD/%CSTP), memory (MCTLSZ/SWCUR/N%L), storage (GAVG = DAVG + KAVG) or network drops. Change one thing at a time; do not tune several layers at once.\n\nRecord the current config, the change, the owner and the rollback.',
      tags: ['decision guide', 'change control', 'rollback'],
    },
    {
      from: 'admin', to: 'esxi.esxtop', badge: 're-capture same method', channel: 'cli',
      detail:
        'Re-capture with the same host, interval, sample count and field set. Compare the same percentile and the worst affected series, not only the average.\n\nIf the signal worsens or a new critical appears, roll back.',
      vault: [add('capture', ITEM.capture({ id: 'after', name: 'Post-change capture', meta: 'same interval · same fields' }))],
      tags: ['re-capture', 'comparison', 'rollback'],
    },
    {
      from: 'report', to: 'admin', badge: 'HTML / PDF hand-off', channel: 'report',
      detail:
        'The report includes the executive summary, prioritized action plan, findings, technical reference, real VM table and capture details. Export HTML for a standalone file; Export PDF opens the browser print dialog and you choose Save as PDF.\n\nKeep the raw capture, command and report together.',
      vault: [add('capture', ITEM.report({ id: 'final', name: 'Support report', meta: 'action plan + technical reference' }))],
      tags: ['report', 'HTML', 'PDF', 'hand-off'],
    },
  ],
  notes: [
    'A finding is a prompt, not a root cause.',
    'Check whether the entity is a real VM or an ESXi system world.',
    'A CPU limit and host contention need different actions.',
    'Re-capture with the same method; compare the same percentile.',
    'Keep the raw capture and exact command with the report.',
  ],
  config: [
    cfg('Support hand-off', [
      'Executive summary and signal score.',
      'Prioritized P1/P2/P3 action plan.',
      'Findings with observed percentile, guardrail and recommendation.',
      'Technical reference for KAVG/DAVG/GAVG/%RDY/%MLMTD/%CSTP.',
      'Raw capture, command, host/build and change record.',
    ]),
  ],
  pitfalls: [
    'Treating internal ESXi worlds as VMs.',
    'Changing several layers at once and losing attribution.',
    'Comparing a post-change capture with a different interval.',
    'Reporting a finding without the raw series and capture command.',
  ],
  productionChecks: [
    'Real VM scope confirmed.',
    'One change made and recorded.',
    'Post-change capture matches the original method.',
    'Report and raw capture retained for audit.',
  ],
};
