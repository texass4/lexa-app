import { describe, expect, it } from "vitest"
import { addDays, addMonths, diffDays, isLocalDate, localDateOf, monthGrid, startOfWeek, todayIn, weekDays } from "@/lib/domain/dates"

describe("datas locais", () => {
  it("valida o formato e datas impossíveis", () => {
    expect(isLocalDate("2026-02-28")).toBe(true)
    expect(isLocalDate("2026-02-30")).toBe(false)
    expect(isLocalDate("2026-2-3")).toBe(false)
    expect(isLocalDate(null)).toBe(false)
  })

  it("o 'hoje' depende do fuso da pessoa, não do servidor", () => {
    // 02:30 UTC de 24/10 ainda é dia 23 em São Paulo (UTC−3) e já é dia 24 em Lisboa.
    const instant = new Date("2026-10-24T02:30:00Z")
    expect(localDateOf(instant, "America/Sao_Paulo")).toBe("2026-10-23")
    expect(localDateOf(instant, "Europe/Lisbon")).toBe("2026-10-24")
    expect(todayIn("Asia/Tokyo", instant)).toBe("2026-10-24")
  })

  it("soma dias atravessando meses e anos sem deslocamento de fuso", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(diffDays("2026-10-01", "2026-10-24")).toBe(23)
  })

  it("soma meses respeitando o último dia do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15")
  })

  it("semana começa no dia configurado", () => {
    expect(startOfWeek("2026-10-24", 1)).toBe("2026-10-19") // sábado → segunda
    expect(startOfWeek("2026-10-24", 0)).toBe("2026-10-18") // → domingo
    expect(weekDays("2026-10-24", 1)).toHaveLength(7)
  })

  it("grade do mês cobre semanas inteiras", () => {
    const grid = monthGrid("2026-10-10", 1)
    expect(grid[0]![0]).toBe("2026-09-28")
    expect(grid.flat()).toContain("2026-10-31")
    expect(grid.every((w) => w.length === 7)).toBe(true)
  })
})
