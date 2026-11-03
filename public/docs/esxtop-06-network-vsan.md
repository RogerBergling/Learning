# Network drops, vSAN and the rest of the host

Storage and CPU get most of the attention, but network drops and vSAN congestion can look like application or storage problems.

## Network counters

| Counter | Meaning | How to read it |
|---|---|---|
| `%DRPTX` | Outbound packet drop percentage | Any sustained value causes retransmits and latency |
| `%DRPRX` | Inbound packet drop percentage | Often outside the guest's control |
| `PKTTX/s`, `PKTRX/s` | Packet rates | Small packets at high rate are expensive |
| `MbTX/s`, `MbRX/s` | Throughput | Compare with link speed and expected load |
| `PSZTX`, `PSZRX` | Average packet size | Explains packet rate versus throughput |
| `SPEED` | Link speed | The ceiling for the uplink |
| `ACTN/s` | Actions posted per second | Internal vSphere counter; useful context |

A drop percentage is a ratio, not a rate. A 1% drop at a very high packet rate can be more damaging than a 5% drop at a low rate.

## Network decision tree

```text
drops reported
 ├─ VM port drops → guest/virtual NIC, traffic shaping
 ├─ uplink drops → teaming, physical switch, buffer/queue
 ├─ physical switch drops → switch port, congestion, cabling
 └─ no drops but slow → throughput, latency, guest stack
```

Check whether the port is a VM port or an uplink. `Uplink?` and `Link Up?` are categorical fields and should not be charted as numbers.

## vSAN (`x`)

Some ESXi releases expose a vSAN panel. It is separate from the generic storage panels and is not a general Datastore panel.

- vSAN latency and congestion are cluster-level behaviours.
- A vSAN datastore can be backed by many devices across hosts.
- Check `vsantop` and vSAN health for cluster-level analysis.
- Do not treat a vSAN panel as a replacement for DAVG/KAVG on a physical LUN.

## CPU power (`p`) and interrupts (`i`)

- The power panel shows C/P states and frequency behaviour. It can explain performance changes after BIOS or power-policy changes.
- The interrupt panel shows interrupt vector distribution. A single CPU taking most interrupts can cause latency even when average CPU looks fine.
- Neither panel replaces the scheduler view; use them as context.

## Host versus VM visibility

A host network counter describes the virtual switch or physical uplink. A VM network counter describes the guest's virtual NIC. They can disagree:

- The guest may drop packets before they reach the vSwitch.
- The vSwitch may drop because the uplink is saturated.
- The physical switch may drop before the host sees the packet.

Record both sides when troubleshooting.

## Support checklist

1. Confirm the exact port, uplink and direction.
2. Compare drop percentage with packet rate and throughput.
3. Check link speed and teaming.
4. Check host CPU readiness; packet processing can be CPU-bound.
5. Check the physical switch counters, not only esxtop.
6. For vSAN, use vSAN-specific tooling and cluster health.

## Simulate it

- [Network drops and uplinks](#/sim/esxtop-network-drops)
- [Triage and reporting](#/sim/esxtop-triage-report)

Next: [Focused captures and large-sample sizing](#/learn/esxtop-07-focused-capture).
