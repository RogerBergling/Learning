# Focused captures with `-c` and large-sample sizing

An all-metric capture is the right first look. A focused rc file is the right repeatable capture when the host is busy or the file is too large.

## Create the rc file with `W`

1. Run `esxtop` interactively.
2. Press `d`, `u` or `v` for the storage panels; `c`, `m`, `n`, `i`, `p` for the others.
3. Press `f` to select fields and `o` to reorder.
4. Repeat for every panel you want to include **or exclude**.
5. Press uppercase `W` and enter an absolute datastore path.

```text
/vmfs/volumes/datastore1/esxtop-storage.rc
```

Then capture:

```text
esxtop -b -c /vmfs/volumes/datastore1/esxtop-storage.rc \
  -d 5 -n 60 > /vmfs/volumes/datastore1/esxtop-storage.csv
```

Do not add `-a`: it overrides the rc file and collects everything.

## The rc file is positional

A real ESXi 8.0 U3 `.esxtop60rc` looks like this:

| Line | Content | Meaning |
|---|---|---|
| 1 | `abcdefghij` | CPU |
| 2 | `abcdefghijklmnopq` | Memory |
| 3 | `ABCDEfGHIJkl` | Disk Adapter — A–E, G–J selected |
| 4 | `ABcdeFGhIJKLmnop` | Disk Device — A, B, F, G, I–L selected |
| 5 | `aBCDEfghIJKl` | VM Disk — B–E, I–K selected |
| 6 | `abcdefghijklmnopq` | Network — all hidden |
| 7 | `abcdef` | Interrupt — all hidden |
| 8 | `abcdef` | CPU Power — all hidden |
| 9–10 | `AbcDEFGHijKlmN` / `ABCdEf` | Additional release-specific panel layouts |
| 11 | `5p` | Options: 5-second delay, starting panel |

The number of panel lines is release-specific; the last line is the options line. Uppercase letters mark selected fields and lowercase letters hidden fields. Do not hand-edit the file — use `W`.

The `.esxtop60rc` filename is historical and is still used on newer releases, including ESXi 8.0 U3.

## One rc can hold several panels

You can configure `d` (Disk Adapter), `u` (Disk Device) and `v` (VM Disk) in one session and save them with a single `W`. There is **no separate Datastore panel**; use `u` for the backing device and `v` for per-VM I/O. If you want a storage-only capture, clear the fields in `c`, `m`, `n`, `i` and `p` first.

## What the other panels contain

| Key | Panel | What it contains | Storage-only action |
|---|---|---|---|
| `c` | CPU | Host PCPU and per-world/group scheduling: `%USED`, `%RUN`, `%SYS`, `%WAIT`, `%RDY`, `%MLMTD`, `%CSTP`, `%SWPWT` | Clear all, or keep `%RDY`, `%MLMTD`, `%CSTP` for mixed CPU incidents |
| `m` | Memory | Host free/overcommit, ballooning, VMkernel swap, compression, NUMA locality | Clear all, or keep `MCTLSZ`, `SWCUR`, `SWR/s`, `SWW/s`, `N%L` |
| `n` | Network | Ports, uplinks, packet/bit rates, packet size, link state, drops | Clear all, or keep drops/throughput for iSCSI/NFS |
| `i` | Interrupts | Per-CPU interrupt activity and vector data | Clear unless investigating a driver/NIC/HBA interrupt storm |
| `p` | CPU Power | Power state, frequency, `%A/MPERF`, power data | Clear for normal storage captures |

The exact field letters and panel availability vary by ESXi release. Use the interactive `f` screen as the source of truth.

## Large captures

The app has independent safety limits:

| Limit | Default | Environment variable |
|---|---:|---|
| Upload | 512 MB | `ESXTOP_MAX_UPLOAD_MB` |
| Decompressed stream | 1.5 GB | `ESXTOP_MAX_DECOMPRESSED_MB` |
| Data cells | 20,000,000 | `ESXTOP_MAX_CELLS` |
| Metric columns | 200,000 | `ESXTOP_MAX_SERIES` |
| Samples | 50,000 | `ESXTOP_MAX_ROWS` |

A 145,697-column × 100-sample capture measured about 1.23 GiB peak RSS. Plan with:

```text
peak memory ≈ 0.6 GB fixed overhead + data cells × 48 bytes
```

At 146,274 columns:

| Samples | Cells | Approx. peak |
|---:|---:|---:|
| 100 | 14.6M | ~1.3 GB |
| 300 | 43.9M | ~2.6 GB |
| 683 | 99.9M | ~5.1 GB |
| 1,000 | 146M | ~7.2 GB |
| 1,200 | 175M | ~8.5 GB |

Giving the container more RAM does **not** raise `ESXTOP_MAX_CELLS`. Change both. A sensible 10 GB setup uses `ESXTOP_MAX_CELLS=100000000` (about 5–6 GB peak, 683 samples at 146k columns). `150000000` is the upper safe range at about 7.8 GB peak. Do not use 200M cells with 10 GB.

Also raise:
- `/tmp` tmpfs (upload and SQLite session live there); 4–6 GB for 100M cells.
- `ESXTOP_MAX_UPLOAD_MB` and `ESXTOP_MAX_DECOMPRESSED_MB` for long raw CSVs.
- Lower `ESXTOP_MAX_SESSIONS` when captures are large.

Recreate the container after changing environment values; a running process keeps its old limits.

## Simulate it

- [Focused rc and large captures](#/sim/esxtop-focused-rc)
- [Batch capture to analysis](#/sim/esxtop-batch-capture)

Next: [Triage and reporting](#/learn/esxtop-08-triage-reporting).
