// Gera o valor de DESK_PASSWORD_HASH: npm run auth:hash -- "minha senha"
import { hashPassword } from "../lib/auth/session.ts"

const password = process.argv[2]
if (!password) {
  console.error('Uso: npm run auth:hash -- "sua senha"')
  process.exit(1)
}
console.log(await hashPassword(password))
