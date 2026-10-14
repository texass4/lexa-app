"use client"

/**
 * Conversa por voz: grava o prompt, converte para WAV 16 kHz mono (formato aceito pelo
 * modelo) e pede a transcrição ao servidor. O texto volta por `onTranscript` — nunca é
 * enviado ao chat daqui.
 *
 * - O microfone só é pedido no clique (nunca ao abrir a conversa).
 * - O microfone é liberado assim que a gravação para (o indicador do navegador apaga).
 * - Nada roda em segundo plano: fechar a conversa ou sair da tela cancela tudo.
 * - O áudio fica só na memória e é descartado depois da transcrição.
 */

import * as React from "react"
import { AUDIO_FORMAT, AUDIO_LIMITS, encodeWav, hasSound } from "@/lib/ai/audio"
import { publicMessage } from "@/lib/core/public-error"

export type VoiceErrorReason = "unsupported" | "denied" | "no-mic" | "busy" | "too-short" | "no-speech" | "network" | "slow" | "failed"

export type VoiceState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "recording"; seconds: number }
  | { status: "processing"; seconds: number }
  | { status: "done" }
  | { status: "error"; reason: VoiceErrorReason; message: string }

const MESSAGES: Record<VoiceErrorReason, string> = {
  unsupported: "Este navegador não permite gravar áudio aqui. Digite a pergunta ou use Chrome, Edge, Firefox ou Safari atualizados.",
  denied: "O acesso ao microfone foi negado. Libere o microfone nas permissões do site (ícone ao lado do endereço) e tente de novo.",
  "no-mic": "Nenhum microfone foi encontrado. Conecte um microfone e tente de novo.",
  busy: "O microfone está em uso por outro programa. Feche-o e tente de novo.",
  "too-short": "A gravação ficou curta demais. Segure um pouco mais e fale a pergunta.",
  "no-speech": "Não identificamos fala na gravação. Fale mais perto do microfone e tente de novo.",
  network: "Sem conexão para transcrever o áudio. Verifique a internet e tente de novo.",
  slow: "A transcrição demorou demais e foi interrompida. Tente de novo — o texto digitado continua no campo.",
  failed: "Não foi possível transcrever o áudio agora. Tente de novo.",
}

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
}

/** O navegador tem o que é preciso (contexto seguro, microfone, gravador, Web Audio)? */
export function isVoiceSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window.MediaRecorder === "function" &&
    !!audioContextCtor() &&
    typeof window.OfflineAudioContext === "function"
  )
}

/** Gravação (WebM/Opus, MP4/AAC… o que o navegador gravar) → amostras mono a 16 kHz. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const Ctor = audioContextCtor()!
  const context = new Ctor()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const length = Math.max(1, Math.ceil(decoded.duration * AUDIO_FORMAT.sampleRate))
    // Um canal: o Web Audio faz a mistura dos canais e a reamostragem.
    const offline = new OfflineAudioContext(1, length, AUDIO_FORMAT.sampleRate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  } finally {
    context.close().catch(() => {})
  }
}

function micError(error: unknown): VoiceErrorReason {
  const name = (error as { name?: string })?.name
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied"
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-mic"
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy"
  return "failed"
}

/** Erros do servidor cuja mensagem ajuda aqui (limites, áudio recusado); o resto vira a mensagem da transcrição. */
const SERVER_MESSAGE = new Set(["INVALID_AUDIO", "RATE_LIMITED", "PLAN_LIMIT", "PROVIDER_RATE_LIMITED", "DISABLED", "NOT_CONFIGURED", "FORBIDDEN"])

/** O servidor desiste em 30 s; aqui há folga para a resposta chegar. Nunca fica "transcrevendo" para sempre. */
const CLIENT_TIMEOUT_MS = 40_000

const failure = (reason: VoiceErrorReason, message = MESSAGES[reason]): VoiceState => ({ status: "error", reason, message })

export function useVoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = React.useState<VoiceState>({ status: "idle" })
  const stream = React.useRef<MediaStream | null>(null)
  const recorder = React.useRef<MediaRecorder | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const ticker = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const request = React.useRef<AbortController | null>(null)
  // Cada gravação tem um número: o que chega de uma gravação cancelada é ignorado.
  const session = React.useRef(0)
  const transcriptRef = React.useRef(onTranscript)
  React.useEffect(() => {
    transcriptRef.current = onTranscript
  }, [onTranscript])

  const release = React.useCallback(() => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }, [])

  const send = React.useCallback(async (blob: Blob, id: number) => {
    let samples: Float32Array
    try {
      samples = await toMono16k(blob)
    } catch {
      if (id === session.current) setState(failure("failed", "Não foi possível ler a gravação. Tente de novo."))
      return
    }
    if (id !== session.current) return
    if (samples.length / AUDIO_FORMAT.sampleRate < AUDIO_LIMITS.minSeconds) return setState(failure("too-short"))
    // Silêncio não vai para o servidor (não gasta a cota de IA).
    if (!hasSound(samples)) return setState(failure("no-speech"))

    const controller = new AbortController()
    request.current = controller
    let slow = false
    const limit = setTimeout(() => {
      slow = true
      controller.abort()
    }, CLIENT_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": AUDIO_FORMAT.mimeType },
        body: encodeWav(samples),
        signal: controller.signal,
      })
    } catch {
      if (id === session.current) {
        if (slow) setState(failure("slow"))
        else if (!controller.signal.aborted) setState(failure("network"))
      }
      return
    } finally {
      clearTimeout(limit)
      if (request.current === controller) request.current = null
    }
    if (id !== session.current) return
    const data = (await response.json().catch(() => null)) as { text?: string; error?: { code?: string; message?: string } } | null
    if (!response.ok || !data?.text) {
      const code = data?.error?.code
      if (code === "NO_SPEECH") return setState(failure("no-speech"))
      if (code === "TIMEOUT") return setState(failure("slow"))
      return setState(failure("failed", code && SERVER_MESSAGE.has(code) ? publicMessage(data?.error?.message, MESSAGES.failed) : MESSAGES.failed))
    }
    transcriptRef.current(data.text)
    setState({ status: "done" })
  }, [])

  /** Conversão + envio, com o tempo decorrido à vista (nunca um "transcrevendo" mudo). */
  const transcribe = React.useCallback(
    async (blob: Blob, id: number) => {
      const began = Date.now()
      setState({ status: "processing", seconds: 0 })
      const clock = setInterval(() => {
        const seconds = Math.floor((Date.now() - began) / 1000)
        setState((s) => (s.status === "processing" ? { status: "processing", seconds } : s))
      }, 1000)
      ticker.current = clock
      try {
        await send(blob, id)
      } finally {
        clearInterval(clock)
        if (ticker.current === clock) ticker.current = null
      }
    },
    [send],
  )

  const stop = React.useCallback(() => {
    const active = recorder.current
    if (active && active.state !== "inactive") active.stop()
    // Libera o microfone na hora: o indicador de gravação do navegador apaga.
    release()
  }, [release])

  const start = React.useCallback(async () => {
    if (!isVoiceSupported()) return setState(failure("unsupported"))
    const id = ++session.current
    setState({ status: "requesting" })
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    } catch (error) {
      if (id === session.current) setState(failure(micError(error)))
      return
    }
    // Cancelado enquanto o navegador pedia a permissão.
    if (id !== session.current) return media.getTracks().forEach((track) => track.stop())

    stream.current = media
    chunks.current = []
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(media)
    } catch {
      release()
      return setState(failure("unsupported"))
    }
    recorder.current = rec
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data)
    }
    rec.onstop = () => {
      const parts = chunks.current
      chunks.current = []
      recorder.current = null
      if (id !== session.current) return // cancelada: o áudio é descartado
      transcribe(new Blob(parts, { type: rec.mimeType || parts[0]?.type || "audio/webm" }), id)
    }
    rec.onerror = () => {
      release()
      if (id === session.current) setState(failure("failed", "A gravação foi interrompida. Tente de novo."))
    }

    const started = Date.now()
    rec.start(250)
    setState({ status: "recording", seconds: 0 })
    ticker.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      if (seconds >= AUDIO_LIMITS.maxSeconds) stop()
      else setState((s) => (s.status === "recording" ? { status: "recording", seconds } : s))
    }, 250)
  }, [release, stop, transcribe])

  /** Descarta a gravação (ou a transcrição em andamento) e volta ao início. */
  const cancel = React.useCallback(() => {
    session.current += 1
    request.current?.abort()
    request.current = null
    const active = recorder.current
    if (active && active.state !== "inactive") active.stop()
    recorder.current = null
    chunks.current = []
    release()
    setState({ status: "idle" })
  }, [release])

  /** Volta ao estado pronto sem mexer em nada (ex.: depois de inserir a transcrição). */
  const reset = React.useCallback(() => setState((s) => (s.status === "done" || s.status === "error" ? { status: "idle" } : s)), [])

  // Sair da tela nunca deixa gravação ou microfone ativos.
  React.useEffect(() => cancel, [cancel])

  return { state, start, stop, cancel, reset }
}
