import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Appointment } from "@/types"
import { describeAppointmentChange, durationMinutes, moveAppointment, moveToDay, snapMinutes } from "./agenda"

const appt = (patch: Partial<Appointment> = {}): Appointment => ({
  id: "a1",
  organizationId: "org",
  createdAt: "2026-10-01T09:00:00",
  title: "Audiência de instrução",
  start: "2026-10-10T14:00:00",
  end: "2026-10-10T15:30:00",
  ownerId: "u1",
  ...patch,
})

describe("agenda — remarcar", () => {
  it("encaixa o horário arrastado em 15 minutos, dentro dos limites", () => {
    assert.equal(snapMinutes(14 * 60 + 7), 14 * 60)
    assert.equal(snapMinutes(14 * 60 + 8), 14 * 60 + 15)
    assert.equal(snapMinutes(-30, { min: 7 * 60 }), 7 * 60)
    assert.equal(snapMinutes(23 * 60, { max: 21 * 60 }), 21 * 60)
  })

  it("mantém a duração ao mover para outro dia e horário", () => {
    const a = appt()
    assert.equal(durationMinutes(a), 90)
    assert.deepEqual(moveAppointment(a, "2026-10-11", 15 * 60), { start: "2026-10-11T15:00:00", end: "2026-10-11T16:30:00" })
  })

  it("não deixa o compromisso atravessar a meia-noite", () => {
    assert.deepEqual(moveAppointment(appt(), "2026-10-11", 23 * 60), { start: "2026-10-11T22:29:00", end: "2026-10-11T23:59:00" })
  })

  it("no mês, troca só o dia", () => {
    assert.deepEqual(moveToDay(appt(), "2026-10-20"), { start: "2026-10-20T14:00:00", end: "2026-10-20T15:30:00" })
  })
})

describe("agenda — o que mudou", () => {
  it("remarcação vira frase com a data antiga e a nova", () => {
    const before = appt()
    const after = { ...before, start: "2026-10-11T15:00:00", end: "2026-10-11T16:30:00" }
    const change = describeAppointmentChange(before, after)
    assert.equal(change.rescheduled, true)
    assert.equal(change.rescheduleText, "remarcou o compromisso de 10/10 14:00 para 11/10 15:00.")
    assert.deepEqual(change.fields, [])
  })

  it("só o término mudou", () => {
    const before = appt()
    const change = describeAppointmentChange(before, { ...before, end: "2026-10-10T16:00:00" })
    assert.equal(change.rescheduleText, "alterou o término do compromisso de 15:30 para 16:00.")
  })

  it("lista os outros campos alterados", () => {
    const before = appt()
    const change = describeAppointmentChange(before, { ...before, title: "Audiência", location: "Sala 2", notes: undefined })
    assert.equal(change.rescheduled, false)
    assert.deepEqual(change.fields, ["título", "local"])
  })
})
