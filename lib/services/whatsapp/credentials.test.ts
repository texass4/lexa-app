import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { describe, it } from "node:test"
import { CredentialsKeyError, credentialsKey, decryptSecret, encryptSecret } from "./credentials"

const key = randomBytes(32)
const TOKEN = "EAAG-token-de-teste-0123456789abcdef"
const INSTANCE_A = "a0000000-0000-4000-8000-00000000000a"
const INSTANCE_B = "b0000000-0000-4000-8000-00000000000b"

describe("credenciais do WhatsApp oficial — cifra por escritório", () => {
  it("cifra e decifra; o texto cifrado não contém o token e muda a cada vez", () => {
    const sealed = encryptSecret(TOKEN, INSTANCE_A, key)
    assert.match(sealed, /^v1:/)
    assert.equal(sealed.includes(TOKEN), false)
    assert.notEqual(encryptSecret(TOKEN, INSTANCE_A, key), sealed)
    assert.equal(decryptSecret(sealed, INSTANCE_A, key), TOKEN)
  })

  it("a cifra copiada para a instância de outro escritório não abre", () => {
    const sealed = encryptSecret(TOKEN, INSTANCE_A, key)
    assert.throws(() => decryptSecret(sealed, INSTANCE_B, key))
  })

  it("chave errada ou cifra adulterada não abrem", () => {
    const sealed = encryptSecret(TOKEN, INSTANCE_A, key)
    assert.throws(() => decryptSecret(sealed, INSTANCE_A, randomBytes(32)))
    const [v, iv, tag, data] = sealed.split(":")
    const tampered = Buffer.from(data, "base64")
    tampered[0] ^= 1
    assert.throws(() => decryptSecret([v, iv, tag, tampered.toString("base64")].join(":"), INSTANCE_A, key))
  })

  it("sem chave (ou chave de tamanho errado) no servidor: erro explícito, nada em texto puro", () => {
    assert.equal(credentialsKey({}), null)
    assert.equal(credentialsKey({ WHATSAPP_CREDENTIALS_KEY: Buffer.from("curta").toString("base64") }), null)
    assert.equal(credentialsKey({ WHATSAPP_CREDENTIALS_KEY: key.toString("base64") })?.length, 32)
    assert.throws(() => encryptSecret(TOKEN, INSTANCE_A, null), CredentialsKeyError)
  })
})
