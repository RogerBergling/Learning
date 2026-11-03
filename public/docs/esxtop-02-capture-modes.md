# Capture modes: interactive, batch, replay and focused `-c`

The capture command is part of the evidence. A perfect analysis of the wrong interval, field set or host is still wrong.

## The command line

```text
esxtop [-h] [-v] [-b] [-l] [-s] [-a] [-c config] [-R dir] [-d delay] [-n iterations] [-u] [-export-entity file] [-import-entity file]
```

| Option | Meaning | Trap |
|---|---|---|
| `-b` | Batch mode: CSV to stdout | The entity list is locked at the first sample |
| `-a` | All statistics | **Overrides the rc file**; widest and largest capture |
| `-c file` | Load an rc configuration | The file must exist and match the ESXi release |
| `-d seconds` | Delay between samples | Minimum is 2 seconds; actual timestamps are authoritative |
| `-n count` | Number of iterations | `-n infinity` needs an external stop plan |
| `-l` | Lock entities to the first snapshot | Useful for busy hosts; misses later VMs |
| `-u` | Suppress server-wide physical CPU statistics | Smaller CSV if host CPU detail is not needed |
| `-s` | Secure mode | Disables the interactive delay command |
| `-R dir` | Replay mode | Requires a complete vm-support directory |
| `-export-entity` / `-import-entity` | Save/limit the entity list | Helpful for large hosts |

## Interactive workflow

1. SSH to the ESXi host as a privileged user.
2. Run `esxtop` with no `-b`.
3. Use `c`, `m`, `d`, `u`, `v`, `n`, `i`, `p` or `x` to switch panels.
4. Press `f` to select fields and `o` to reorder.
5. Press uppercase `W` to write the configuration.
6. Use that rc file with `-c` in batch mode.

`W` is uppercase and case-sensitive. A lowercase `w` does something else.

## Recommended captures

Broad first look:

```text
esxtop -b -a -d 2 -n 300 \
  | gzip -9c > /vmfs/volumes/datastore1/esxtop-$(hostname)-$(date +%FT%H%M).csv.gz
```

One-hour baseline:

```text
esxtop -b -a -d 5 -n 720 \
  | gzip -9c > /vmfs/volumes/datastore1/esxtop-$(hostname)-1h.csv.gz
```

Focused storage capture:

```text
esxtop -b -c /vmfs/volumes/datastore1/esxtop-storage.rc \
  -d 5 -n 60 > /vmfs/volumes/datastore1/esxtop-storage.csv
```

Do **not** add `-a` to the focused command. Broadcom documents that `-a` overrides configuration-file setup and collects all statistics.

## Choosing interval and duration

- `-d 2` is good for CPU ready, queueing and storage latency investigations.
- `-d 5` is easier to read and cheaper for long baselines.
- Duration is roughly `n × d`, but timestamps include tool overhead.
- Capture at least several minutes. A single 2-second sample cannot establish a sustained problem.
- Compare the same interval and sample count before and after a change.

## Replay

Replay mode uses a support bundle (`vm-support` output) instead of a live host:

```text
esxtop -R /vmfs/volumes/datastore1/vm-support-2026-11-03-09.00.00
```

It is valuable when the incident is over and you need to re-examine the same evidence without touching production.

## Gzip and transfer

- The `.csv` suffix does not prove the file is plain text. A gzip stream can be named `.csv`.
- Check magic bytes (`1f 8b`) or use `gzip -t` before assuming corruption.
- Copy the file off the host; do not leave the only copy in `/tmp` or on the datastore under investigation.
- Do not store captures in a repository with real hostnames or customer data.

## Capture quality checklist

- Host and ESXi build recorded.
- Exact command, interval, sample count and field source recorded.
- Time window aligned with the incident.
- Header inspected with `-n 2` before a long run.
- `-a` not used with `-c`.
- File compressed, copied and checksummed.

## Simulate it

- [Interactive to batch capture](#/sim/esxtop-batch-capture)
- [Focused rc and large captures](#/sim/esxtop-focused-rc)

Next: [CPU scheduling and ready time](#/learn/esxtop-03-cpu-scheduling).
