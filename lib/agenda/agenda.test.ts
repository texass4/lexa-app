import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Appointment } from "@/types"
import {
  appointmentStatus,
  availabilityText,
  conflictsFor,
  dayItems,
  describeAppointmentChange,
  durationMinutes,
  freeSlots,
  isPlanned,
  MAX_REPEATS,
  moveAppointment,
  moveToDay,
  normalizeVideoUrl,
  personColor,
  repeatDates,
  snapMinutes,
  videoProvider,
} from "@/lib/agenda/agenda"

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

describe("agenda — situação, repetição, conflitos e disponibilidade", () => {
  it("sem situação gravada o compromisso está planejado; realizado e cancelado não contam como restantes", () => {
    assert.equal(appointmentStatus(appt()), "planejado")
    assert.equal(isPlanned(appt({ status: "realizado" })), false)
    assert.equal(isPlanned(appt({ status: "cancelado" })), false)
  })

  it("descreve a mudança de situação para a timeline", () => {
    const change = describeAppointmentChange(appt(), appt({ status: "cancelado" }))
    assert.equal(change.statusText, "marcou o compromisso como cancelado.")
    assert.equal(describeAppointmentChange(appt({ status: "cancelado" }), appt()).statusText, "reabriu o compromisso.")
    assert.equal(describeAppointmentChange(appt(), appt()).statusText, "")
  })

  it("lista participantes, prioridade e link entre os campos alterados", () => {
    const change = describeAppointmentChange(
      appt(),
      appt({ attendeeIds: ["u2"], priority: "alta", videoUrl: "https://meet.google.com/abc-defg-hij" }),
    )
    assert.deepEqual(change.fields, ["participantes", "prioridade", "link da videochamada"])
  })

  it("reconhece o serviço de vídeo e rejeita endereço inválido", () => {
    assert.equal(normalizeVideoUrl("meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij")
    assert.equal(normalizeVideoUrl("não é link"), null)
    assert.equal(normalizeVideoUrl("javascript:alert(1)"), null)
    assert.equal(normalizeVideoUrl("   "), null)
    assert.equal(videoProvider("https://us02web.zoom.us/j/123"), "Zoom")
    assert.equal(videoProvider("https://teams.microsoft.com/l/meetup-join/x"), "Microsoft Teams")
    assert.equal(videoProvider("https://exemplo.com.br/sala"), "Videochamada")
  })

  it("repete por semana, a cada 15 dias e por mês (dia 31 cai no último dia do mês curto)", () => {
    assert.deepEqual(repeatDates("2026-10-05", "semanal", 3), ["2026-10-05", "2026-10-12", "2026-10-19"])
    assert.deepEqual(repeatDates("2026-10-30", "quinzenal", 3), ["2026-10-30", "2026-11-13", "2026-11-27"])
    assert.deepEqual(repeatDates("2026-01-31", "mensal", 3), ["2026-01-31", "2026-02-28", "2026-03-31"])
    assert.equal(repeatDates("2026-01-01", "semanal", 500).length, MAX_REPEATS)
    assert.deepEqual(repeatDates("2026-01-01", "semanal", 0), ["2026-01-01"])
  })

  it("avisa de conflito só para quem está nos dois compromissos e só se estiver planejado", () => {
    const base = appt({ id: "a1", ownerId: "u1", attendeeIds: ["u2"] })
    const overlap = { id: "novo", start: "2026-10-10T15:00:00", end: "2026-10-10T16:00:00" }
    assert.deepEqual(
      conflictsFor({ ...overlap, ownerId: "u2" }, [base]).map((a) => a.id),
      ["a1"],
    )
    assert.deepEqual(conflictsFor({ ...overlap, ownerId: "u3" }, [base]), [])
    assert.deepEqual(conflictsFor({ ...overlap, ownerId: "u1" }, [{ ...base, status: "cancelado" }]), [])
    // Encostar não é conflito; editar o próprio compromisso também não.
    assert.deepEqual(conflictsFor({ start: "2026-10-10T15:30:00", end: "2026-10-10T16:00:00", ownerId: "u1" }, [base]), [])
    assert.deepEqual(conflictsFor({ ...base }, [base]), [])
  })

  it("calcula os horários livres da pessoa dentro do expediente", () => {
    const all = [
      appt({ id: "a", start: "2026-10-12T10:00:00", end: "2026-10-12T11:30:00", ownerId: "u1" }),
      appt({ id: "b", start: "2026-10-12T14:00:00", end: "2026-10-12T15:00:00", ownerId: "u2", attendeeIds: ["u1"] }),
      appt({ id: "c", start: "2026-10-12T16:00:00", end: "2026-10-12T17:00:00", ownerId: "u1", status: "cancelado" }),
      appt({ id: "d", start: "2026-10-12T09:00:00", end: "2026-10-12T10:00:00", ownerId: "u3" }),
    ]
    assert.deepEqual(freeSlots(all, "u1", "2026-10-12"), [
      { from: "09:00", to: "10:00" },
      { from: "11:30", to: "14:00" },
      { from: "15:00", to: "18:00" },
    ])
    assert.deepEqual(freeSlots(all, "u1", "2026-10-13"), [{ from: "09:00", to: "18:00" }])
  })

  it("monta o texto de disponibilidade só com dias úteis que têm horário livre", () => {
    const all = [appt({ start: "2026-10-09T09:00:00", end: "2026-10-09T18:00:00", ownerId: "u1" })]
    const text = availabilityText(all, "u1", "2026-10-09", 2)
    assert.equal(text, "Horários disponíveis:\nSeg 12/10: 09:00–18:00\nTer 13/10: 09:00–18:00")
  })

  it("no dia de hoje a disponibilidade começa no próximo quarto de hora, nunca no passado", () => {
    const all = [appt({ start: "2026-10-09T14:00:00", end: "2026-10-09T15:00:00", ownerId: "u1" })]
    const text = availabilityText(all, "u1", "2026-10-09", 1, new Date(2026, 9, 9, 10, 7))
    assert.equal(text, "Horários disponíveis:\nSex 09/10: 10:15–14:00, 15:00–18:00")
    // Fim de expediente: hoje não sobra nada e a lista pula para o próximo dia útil.
    assert.equal(availabilityText([], "u1", "2026-10-09", 1, new Date(2026, 9, 9, 17, 50)), "Horários disponíveis:\nSeg 12/10: 09:00–18:00")
  })

  it("junta prazos abertos (fatal e interno) e tarefas pendentes por dia", () => {
    const prazo = (patch: object) =>
      ({
        id: "p1",
        processId: "pr1",
        description: "Contestação",
        fatalDate: "2026-10-20",
        internalDate: "2026-10-16",
        status: "aberto",
        ...patch,
      }) as never
    const task = (patch: object) =>
      ({ id: "t1", title: "Revisar", dueAt: "2026-10-16T10:00:00", priority: "alta", status: "pendente", ...patch }) as never
    const items = dayItems(
      [prazo({ responsibleId: "u1" }), prazo({ id: "p2", status: "cumprido" })],
      [task({}), task({ id: "t2", status: "concluida" })],
      "2026-10-12",
      "2026-10-18",
    )
    assert.deepEqual(
      items.map((i) => [i.kind, i.id, i.date]),
      [
        ["prazo", "p1:interno", "2026-10-16"],
        ["tarefa", "t1", "2026-10-16"],
      ],
    )
  })

  it("dá a mesma cor à mesma pessoa", () => {
    assert.equal(personColor("user-1"), personColor("user-1"))
    assert.match(personColor("user-1"), /^#[0-9A-F]{6}$/i)
  })
})
