/**
 * Resposta com duração mínima (mais uma variação aleatória): o caminho "e-mail já tem
 * conta" faz menos trabalho que o de uma conta nova, e o tempo de resposta não pode
 * denunciar qual dos dois aconteceu.
 */
export async function atLeast<T>(ms: number, run: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + ms + Math.floor(Math.random() * 250)
  const pad = () => new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())))
  try {
    const result = await run()
    await pad()
    return result
  } catch (error) {
    await pad()
    throw error
  }
}
