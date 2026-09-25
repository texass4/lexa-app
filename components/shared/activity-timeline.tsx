"use client"

import { GroupedTimeline, type TimelineEntry } from "./grouped-timeline"
import { ActivityIconGlyph } from "./activity-icon"
import type { Activity } from "@/types"

export function activityToEntry(a: Activity): TimelineEntry {
  return {
    id: a.id,
    at: a.at,
    title: (
      <>
        {a.actor && <span className="font-semibold">{a.actor} </span>}
        {a.message}
      </>
    ),
    detail: a.detail,
    icon: <ActivityIconGlyph type={a.type} />,
    href: a.href,
    emphasis: a.type === "contract" || a.type === "client" || a.type === "payment",
  }
}

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  return <GroupedTimeline entries={activities.map(activityToEntry)} />
}
