import type { Appointment } from "@/types"
import { parse } from "@/lib/dates"

export interface PositionedEvent {
  event: Appointment
  startMin: number
  endMin: number
  lane: number
  lanes: number
}

const minutes = (iso: string) => {
  const d = parse(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Distribui eventos sobrepostos em colunas lado a lado. */
export function layoutDay(events: Appointment[]): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const out: PositionedEvent[] = []
  let cluster: PositionedEvent[] = []
  let clusterEnd = -1

  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((e) => e.lane + 1))
    cluster.forEach((e) => (e.lanes = lanes))
    out.push(...cluster)
    cluster = []
  }

  for (const event of sorted) {
    const startMin = minutes(event.start)
    const endMin = Math.max(minutes(event.end), startMin + 20)
    if (cluster.length && startMin >= clusterEnd) flush()
    const laneEnds: number[] = []
    cluster.forEach((e) => (laneEnds[e.lane] = Math.max(laneEnds[e.lane] ?? 0, e.endMin)))
    let lane = laneEnds.findIndex((end) => end <= startMin)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ event, startMin, endMin, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, endMin)
  }
  if (cluster.length) flush()
  return out
}
