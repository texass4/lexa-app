import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Client } from "@/types"
import type { PersistedState } from "@/lib/store/storage"
import {
  findDuplicateClient,
  formatAddress,
  isValidCNPJ,
  isValidCPF,
  isValidPhone,
  knownTags,
  linkedRecordsSummary,
  maskZipCode,
  normalizeTags,
  validateClientForm,
  validateDocument,
  whatsappLink,
  type ClientFormValues,
} from "./clients"

const client = (id: string, patch: Partial<Client> = {}): Client => ({
  id,
  organizationId: "org",
  createdAt: "2026-01-01T00:00:00",
  name: `Cliente ${id}`,
  kind: "PF",
  document: "",
  email: "",
  phone: "",
  address: "",
  area: "Cível",
  ownerId: "u",
  status: "ativo",
  clientSince: "2026-01-01",
  lastActivityAt: "2026-01-01T00:00:00",
  ...patch,
})

const form = (patch: Partial<ClientFormValues> = {}): ClientFormValues => ({
  kind: "PF",
  name: "Maria da Silva",
  document: "529.982.247-25",
  email: "",
  phone: "",
  whatsapp: "",
  birthDate: "",
  state: "",
  contactEmail: "",
  contactPhone: "",
  ...patch,
})

describe("CPF e CNPJ", () => {
  it("aceita documentos com dígito verificador correto, com ou sem máscara", () => {
    assert.equal(isValidCPF("529.982.247-25"), true)
    assert.equal(isValidCPF("52998224725"), true)
    assert.equal(isValidCNPJ("11.222.333/0001-81"), true)
    assert.equal(isValidCNPJ("11444777000161"), true)
  })

  it("recusa dígito errado, tamanho errado e sequências repetidas", () => {
    assert.equal(isValidCPF("529.982.247-24"), false)
    assert.equal(isValidCPF("111.111.111-11"), false)
    assert.equal(isValidCPF("1234567890"), false)
    assert.equal(isValidCNPJ("11.222.333/0001-80"), false)
    assert.equal(isValidCNPJ("00.000.000/0000-00"), false)
  })

  it("explica o erro conforme o tipo de cliente", () => {
    assert.equal(validateDocument("PF", ""), "Informe o CPF.")
    assert.equal(validateDocument("PJ", "11.222.333"), "CNPJ deve ter 14 dígitos.")
    assert.equal(validateDocument("PF", "123.456.789-00"), "CPF inválido — confira os dígitos.")
    // CNPJ válido informado como pessoa física: o tamanho não bate.
    assert.equal(validateDocument("PF", "11.222.333/0001-81"), "CPF deve ter 11 dígitos.")
    assert.equal(validateDocument("PJ", "11.222.333/0001-81"), undefined)
  })
})

describe("duplicidade", () => {
  const clients = [client("a", { document: "529.982.247-25" }), client("b", { document: "" })]

  it("encontra o mesmo documento ignorando a máscara", () => {
    assert.equal(findDuplicateClient(clients, "52998224725")?.id, "a")
  })

  it("ignora o próprio cliente na edição e documentos vazios", () => {
    assert.equal(findDuplicateClient(clients, "529.982.247-25", "a"), undefined)
    assert.equal(findDuplicateClient(clients, ""), undefined)
  })

  it("o formulário barra CPF já cadastrado, dizendo de quem é", () => {
    const errors = validateClientForm(form(), clients, "2026-09-26")
    assert.equal(errors.document, "Já existe um cliente com este CPF: Cliente a.")
    assert.deepEqual(validateClientForm(form(), clients, "2026-09-26", "a"), {})
  })
})

describe("formulário do cliente", () => {
  it("sem erros, devolve objeto vazio", () => {
    assert.deepEqual(validateClientForm(form({ email: "maria@exemplo.com", phone: "(48) 99999-0000", state: "sc" }), [], "2026-09-26"), {})
  })

  it("valida nome, e-mail, telefone, data futura e UF", () => {
    const errors = validateClientForm(
      form({ name: "Ma", email: "maria@", phone: "(48) 8999-000", whatsapp: "(05) 99999-0000", birthDate: "2027-01-01", state: "XX" }),
      [],
      "2026-09-26",
    )
    assert.deepEqual(Object.keys(errors).sort(), ["birthDate", "email", "name", "phone", "state", "whatsapp"])
    assert.equal(validateClientForm(form({ kind: "PJ", name: "", document: "11.222.333/0001-81" }), [], "2026-09-26").name, "Informe a razão social.")
  })

  it("telefone: fixo com 10 dígitos, celular com 11 começando por 9", () => {
    assert.equal(isValidPhone("(48) 3222-0000"), true)
    assert.equal(isValidPhone("(48) 99999-0000"), true)
    assert.equal(isValidPhone("(48) 89999-0000"), false)
    assert.equal(isValidPhone("99999-0000"), false)
  })
})

describe("endereço, tags e WhatsApp", () => {
  it("monta o endereço só com as partes preenchidas", () => {
    assert.equal(
      formatAddress({
        street: "Rua das Flores",
        number: "120",
        complement: "sala 3",
        district: "Centro",
        city: "Florianópolis",
        state: "SC",
        zipCode: "88010-000",
      }),
      "Rua das Flores, 120, sala 3 — Centro, Florianópolis/SC, 88010-000",
    )
    assert.equal(formatAddress({ city: "Joinville", state: "SC" }), "Joinville/SC")
    assert.equal(formatAddress({}), "")
    assert.equal(maskZipCode("88010000"), "88010-000")
  })

  it("tags sem repetição, sem espaços sobrando e as mais usadas primeiro", () => {
    assert.deepEqual(normalizeTags(["  VIP ", "vip", "Indicação", "indicacao", ""]), ["VIP", "Indicação"])
    const clients = [client("a", { tags: ["VIP", "Urgente"] }), client("b", { tags: ["Urgente"] })]
    assert.deepEqual(knownTags(clients), ["Urgente", "VIP"])
  })

  it("WhatsApp: número próprio, ou o celular do cadastro; fixo não abre conversa", () => {
    assert.equal(whatsappLink({ phone: "(48) 99999-0000" }), "https://wa.me/5548999990000")
    assert.equal(whatsappLink({ phone: "(48) 3222-0000", whatsapp: "(48) 98888-0000" }), "https://wa.me/5548988880000")
    assert.equal(whatsappLink({ phone: "(48) 3222-0000" }), undefined)
    assert.equal(whatsappLink({ phone: "" }), undefined)
  })
})

describe("exclusão", () => {
  it("resume o que continua salvo sem o cliente", () => {
    const s = {
      clients: [client("c1")],
      processes: [{ id: "p1", clientId: "c1" }],
      tasks: [
        { id: "t1", related: { type: "process", id: "p1" } },
        { id: "t2", related: { type: "client", id: "c1" } },
      ],
      documents: [],
      appointments: [],
      invoices: [{ id: "i1", clientId: "c1" }],
      taskColumns: [],
      appointmentCategories: [],
      activities: [],
      notifications: [],
    } as unknown as PersistedState
    assert.equal(linkedRecordsSummary(s, "c1"), "1 processo, 2 tarefas e 1 lançamento financeiro")
    assert.equal(linkedRecordsSummary(s, "c2"), "")
  })
})
