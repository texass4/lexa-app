"""
datajud.py — consulta de processo por número CNJ na API Pública do DataJud.

É o que a rota `POST /api/processes/search` executa. Também roda sozinho no
terminal para diagnóstico.

Saída:
    padrão     → texto legível no stderr e o resultado em JSON no stdout.
    --events   → uma linha JSON por evento no stdout (NDJSON), na ordem em que
                 acontecem. É o formato que a rota lê e repassa ao navegador.

Tipos de linha no modo --events:
    {"type": "event", "event": "start" | "cache_hit" | "request" | "response"
             | "rate_limited" | "partial" | "server_error" | "network_error", ...}
    {"type": "result", "found": bool, "cnj", "tribunal", "cached", "response"}
    {"type": "error", "code", "message"}

Diferenças em relação à versão anterior do script:
- HTTP 200 sem hits e com shards falhos (ou timed_out) NÃO é "não encontrado":
  o Elasticsearch do DataJud rejeita shards sob carga e responde 200 com o que
  conseguiu. Isso agora é repetido como falha temporária.
- Só resultado encontrado vai para o cache. Um "não encontrado" em cache
  escondia o processo por 24h.
- Aliases dos TJs corrigidos (tjap/tjam invertidos; tjrn, tjrr, tjse, tjto,
  tjdft estavam com nome errado).

Requisitos: pip install requests
Variável de ambiente: DATAJUD_API_KEY

Exemplos:
    python datajud.py 0001814-45.1997.4.01.3700
    python datajud.py 0001814-45.1997.4.01.3700 --no-cache
    python datajud.py 0001814-45.1997.4.01.3700 --refresh
    python datajud.py 0001814-45.1997.4.01.3700 --events
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests


BASE_URL = "https://api-publica.datajud.cnj.jus.br"

DEFAULT_MAX_RETRIES = 6

# (conexão, leitura). O índice do TRF1 leva 30–40 s em horário de pico.
DEFAULT_TIMEOUT = (10, 120)

# Teto de espera entre tentativas, para a tela não ficar parada demais.
MAX_BACKOFF_SECONDS = 30

# Só acertos ficam em cache.
CACHE_TTL_SECONDS = 6 * 60 * 60


# ============================================================
# TRIBUNAIS — chave "J.TR" do número CNJ
# ============================================================

STATE_COURTS = {
    "01": "TJAC", "02": "TJAL", "03": "TJAP", "04": "TJAM", "05": "TJBA",
    "06": "TJCE", "07": "TJDFT", "08": "TJES", "09": "TJGO", "10": "TJMA",
    "11": "TJMT", "12": "TJMS", "13": "TJMG", "14": "TJPA", "15": "TJPB",
    "16": "TJPR", "17": "TJPE", "18": "TJPI", "19": "TJRJ", "20": "TJRN",
    "21": "TJRS", "22": "TJRO", "23": "TJRR", "24": "TJSC", "25": "TJSE",
    "26": "TJSP", "27": "TJTO",
}


def _build_tribunals() -> dict[str, str]:
    """Código "J.TR" → sigla. O alias da API é `api_publica_<sigla minúscula>`."""
    tribunals = {"3.00": "STJ", "5.00": "TST", "6.00": "TSE", "7.00": "STM"}
    for n in range(1, 7):
        tribunals[f"4.{n:02d}"] = f"TRF{n}"
    for n in range(1, 25):
        tribunals[f"5.{n:02d}"] = f"TRT{n}"
    for code, acronym in STATE_COURTS.items():
        tribunals[f"8.{code}"] = acronym
    return tribunals


TRIBUNALS = _build_tribunals()


# ============================================================
# ERROS — o `code` é o mesmo usado pela camada TypeScript
# ============================================================

class DataJudError(Exception):
    code = "UNEXPECTED"


class InvalidCNJError(DataJudError):
    code = "INVALID_CNJ"


class TribunalNotSupportedError(DataJudError):
    code = "UNSUPPORTED_COURT"


class NotConfiguredError(DataJudError):
    code = "PROVIDER_NOT_CONFIGURED"


class AuthenticationError(DataJudError):
    code = "AUTHENTICATION"


class RateLimitError(DataJudError):
    code = "RATE_LIMIT"


class TimeoutFailure(DataJudError):
    code = "TIMEOUT"


class UnavailableError(DataJudError):
    code = "UNAVAILABLE"


# ============================================================
# SAÍDA
# ============================================================

class Reporter:
    """Emite eventos como NDJSON (modo --events) ou texto no stderr."""

    def __init__(self, machine: bool):
        self.machine = machine

    def _line(self, payload: dict[str, Any]):
        # ensure_ascii evita qualquer surpresa de encoding no pipe do Windows.
        sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
        sys.stdout.flush()

    def event(self, name: str, text: str, **fields: Any):
        if self.machine:
            self._line({"type": "event", "event": name, "at": time.time(), **fields})
        else:
            print(f"[{name}] {text}", file=sys.stderr, flush=True)

    def result(self, payload: dict[str, Any]):
        if self.machine:
            self._line({"type": "result", **payload})
        else:
            print(json.dumps(payload, ensure_ascii=False, indent=2))

    def error(self, error: DataJudError):
        if self.machine:
            self._line({"type": "error", "code": error.code, "message": str(error)})
        else:
            print(f"ERRO [{error.code}]: {error}", file=sys.stderr)


# ============================================================
# CACHE SQLITE
# ============================================================

class SQLiteCache:
    def __init__(self, database: Path):
        self.database = database
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS process_cache (
                    cnj TEXT PRIMARY KEY,
                    tribunal TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )

    def _connect(self):
        conn = sqlite3.connect(self.database, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def get(self, cnj: str, ttl_seconds: int) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM process_cache WHERE cnj = ?", (cnj,)).fetchone()
        if not row or time.time() - row["updated_at"] > ttl_seconds:
            return None
        try:
            return json.loads(row["response_json"])
        except json.JSONDecodeError:
            return None

    def set(self, cnj: str, tribunal: str, response: dict[str, Any]):
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO process_cache (cnj, tribunal, response_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(cnj) DO UPDATE SET
                    tribunal = excluded.tribunal,
                    response_json = excluded.response_json,
                    updated_at = excluded.updated_at
                """,
                (cnj, tribunal, json.dumps(response, ensure_ascii=False), int(time.time())),
            )


# ============================================================
# CNJ
# ============================================================

def cnj_digits(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) != 20:
        raise InvalidCNJError("O número do processo deve ter 20 dígitos.")
    # ISO 7064 MOD 97-10: base sem o DV + DV no fim → resto 1.
    if int(digits[:7] + digits[9:] + digits[7:9]) % 97 != 1:
        raise InvalidCNJError("O dígito verificador do número informado não confere.")
    return digits


def format_cnj(d: str) -> str:
    return f"{d[0:7]}-{d[7:9]}.{d[9:13]}.{d[13]}.{d[14:16]}.{d[16:20]}"


def tribunal_for(digits: str) -> str:
    code = f"{digits[13]}.{digits[14:16]}"
    acronym = TRIBUNALS.get(code)
    if not acronym:
        raise TribunalNotSupportedError(f"Nenhum tribunal configurado para o código {code}.")
    return acronym


# ============================================================
# RETRY
# ============================================================

def backoff(attempt: int) -> float:
    """1, 2, 4, 8… segundos + jitter, limitado a MAX_BACKOFF_SECONDS."""
    return min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 1)


def retry_after(response: requests.Response) -> Optional[float]:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        date = datetime.strptime(value, "%a, %d %b %Y %H:%M:%S GMT").replace(tzinfo=timezone.utc)
        return max(0.0, (date - datetime.now(timezone.utc)).total_seconds())
    except ValueError:
        return None


def is_incomplete_miss(data: dict[str, Any]) -> bool:
    """Nenhum hit, mas a busca não cobriu o índice inteiro: o vazio não é conclusivo."""
    if data.get("hits", {}).get("hits"):
        return False
    return bool(data.get("timed_out")) or (data.get("_shards", {}).get("failed") or 0) > 0


# ============================================================
# CLIENTE
# ============================================================

class DataJudClient:
    def __init__(
        self,
        api_key: str,
        reporter: Reporter,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: tuple[int, int] = DEFAULT_TIMEOUT,
    ):
        self.reporter = reporter
        self.max_retries = max_retries
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"APIKey {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "LEXA-DataJud-Client/1.0",
            }
        )

    def _wait(self, attempt: int, seconds: float) -> bool:
        """Dorme antes da próxima tentativa; `False` quando acabaram as tentativas."""
        if attempt >= self.max_retries:
            return False
        time.sleep(seconds)
        return True

    def search(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        r = self.reporter
        total = self.max_retries + 1
        last: DataJudError = UnavailableError("Não foi possível completar a consulta ao DataJud.")

        for attempt in range(total):
            last_attempt = attempt >= self.max_retries
            r.event("request", f"tentativa {attempt + 1}/{total}", attempt=attempt + 1, max=total)
            started = time.monotonic()

            try:
                response = self.session.post(url, json=payload, timeout=self.timeout)
            except requests.Timeout:
                wait = None if last_attempt else backoff(attempt)
                r.event(
                    "network_error",
                    f"tempo esgotado após {time.monotonic() - started:.1f}s"
                    + (f"; nova tentativa em {wait:.1f}s" if wait else ""),
                    attempt=attempt + 1, reason="timeout", wait=wait,
                )
                last = TimeoutFailure("O DataJud não respondeu no tempo esperado.")
                if wait is None or not self._wait(attempt, wait):
                    break
                continue
            except requests.ConnectionError:
                wait = None if last_attempt else backoff(attempt)
                r.event(
                    "network_error",
                    "falha de conexão" + (f"; nova tentativa em {wait:.1f}s" if wait else ""),
                    attempt=attempt + 1, reason="connection", wait=wait,
                )
                last = UnavailableError("Falha de conexão com o DataJud.")
                if wait is None or not self._wait(attempt, wait):
                    break
                continue

            elapsed_ms = int((time.monotonic() - started) * 1000)
            status = response.status_code
            r.event("response", f"HTTP {status} em {elapsed_ms} ms", attempt=attempt + 1, status=status, ms=elapsed_ms)

            if status == 200:
                try:
                    data = response.json()
                except ValueError:
                    raise UnavailableError("O DataJud respondeu 200, mas o corpo não é JSON válido.")

                if not is_incomplete_miss(data):
                    return data

                shards = data.get("_shards", {})
                wait = None if last_attempt else backoff(attempt)
                r.event(
                    "partial",
                    f"resposta parcial: {shards.get('failed', 0)} de {shards.get('total', '?')} shards falharam"
                    + (f"; nova tentativa em {wait:.1f}s" if wait else ""),
                    attempt=attempt + 1,
                    failed=shards.get("failed", 0),
                    total=shards.get("total"),
                    timed_out=bool(data.get("timed_out")),
                    reported_total=data.get("hits", {}).get("total", {}).get("value"),
                    wait=wait,
                )
                last = UnavailableError("O DataJud só devolveu respostas parciais.")
                if wait is None or not self._wait(attempt, wait):
                    break
                continue

            if status in (401, 403):
                raise AuthenticationError(f"DataJud recusou a chave (HTTP {status}).")

            if status == 429:
                hinted = retry_after(response)
                wait = None if last_attempt else min(hinted if hinted is not None else backoff(attempt), MAX_BACKOFF_SECONDS) + random.uniform(0.2, 1.0)
                r.event(
                    "rate_limited",
                    "HTTP 429 — limite de requisições" + (f"; nova tentativa em {wait:.1f}s" if wait else ""),
                    attempt=attempt + 1, status=429, retry_after=hinted, wait=wait,
                )
                last = RateLimitError("O DataJud continuou respondendo 429 após todas as tentativas.")
                if wait is None or not self._wait(attempt, wait):
                    break
                continue

            if status == 408 or 500 <= status <= 599:
                wait = None if last_attempt else backoff(attempt)
                r.event(
                    "server_error",
                    f"HTTP {status} — erro do servidor" + (f"; nova tentativa em {wait:.1f}s" if wait else ""),
                    attempt=attempt + 1, status=status, wait=wait,
                )
                last = TimeoutFailure(f"HTTP {status}") if status in (408, 504) else UnavailableError(f"HTTP {status}")
                if wait is None or not self._wait(attempt, wait):
                    break
                continue

            raise UnavailableError(f"HTTP {status} não recuperável: {response.text[:300]}")

        raise last


def lookup(
    value: str,
    reporter: Reporter,
    cache: Optional[SQLiteCache],
    max_retries: int,
    refresh: bool = False,
) -> dict[str, Any]:
    digits = cnj_digits(value)
    tribunal = tribunal_for(digits)
    alias = f"api_publica_{tribunal.lower()}"

    reporter.event("start", f"{format_cnj(digits)} → {tribunal} ({alias})", cnj=digits, tribunal=tribunal, alias=alias)

    if cache is not None and not refresh:
        cached = cache.get(digits, CACHE_TTL_SECONDS)
        if cached is not None:
            reporter.event("cache_hit", "resultado do cache local", cnj=digits)
            return {"found": True, "cnj": digits, "tribunal": tribunal, "cached": True, "response": cached}

    api_key = (os.getenv("DATAJUD_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        raise NotConfiguredError("DATAJUD_API_KEY não configurada.")

    client = DataJudClient(api_key, reporter, max_retries=max_retries)
    data = client.search(
        f"{BASE_URL}/{alias}/_search",
        {"size": 10, "query": {"match": {"numeroProcesso": digits}}},
    )

    found = bool(data.get("hits", {}).get("hits"))
    if found and cache is not None:
        cache.set(digits, tribunal, data)

    return {"found": found, "cnj": digits, "tribunal": tribunal, "cached": False, "response": data}


def main():
    parser = argparse.ArgumentParser(description="Consulta processos na API Pública do DataJud.")
    parser.add_argument("cnj", help="Número CNJ do processo.")
    parser.add_argument("--no-cache", action="store_true", help="Ignora o cache e consulta o DataJud.")
    parser.add_argument("--refresh", action="store_true", help="Consulta o DataJud mesmo com cache válido e atualiza o cache.")
    parser.add_argument("--cache", default=str(Path(__file__).resolve().parent.parent / ".data" / "datajud_cache.db"))
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--events", action="store_true", help="Emite eventos NDJSON no stdout (usado pela rota).")
    args = parser.parse_args()

    reporter = Reporter(machine=args.events)
    cache = None if args.no_cache else SQLiteCache(Path(args.cache))

    try:
        reporter.result(lookup(args.cnj, reporter, cache, args.max_retries, refresh=args.refresh))
    except DataJudError as exc:
        reporter.error(exc)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
