"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import type { DataConnection, MediaConnection } from "peerjs";
import {
  createPeer,
  generateCode,
  peerIdFor,
  toSlug,
  LIMITS,
  type HostMessage,
  type ViewerMetadata,
} from "@/lib/peer";

type Status = "idle" | "starting" | "live" | "ended";
type Viewer = { id: string; name: string };

function viewerName(conn: DataConnection): string {
  const raw = (conn.metadata as ViewerMetadata | undefined)?.name ?? "";
  return raw.trim().slice(0, 40) || "Sem nome";
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function SharePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [endReason, setEndReason] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Viewer[]>([]);
  const [watching, setWatching] = useState<Viewer[]>([]);
  const [remaining, setRemaining] = useState(LIMITS.maxSessionMinutes * 60_000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const previewRef = useRef<HTMLVideoElement>(null);
  const deadlineRef = useRef(0);

  function send(conn: DataConnection | undefined, msg: HostMessage) {
    try { conn?.send(msg); } catch { /* conexão já fechada */ }
  }

  function syncLists() {
    const p: Viewer[] = [];
    const w: Viewer[] = [];
    connsRef.current.forEach((conn, id) => {
      const v = { id, name: viewerName(conn) };
      (callsRef.current.has(id) ? w : p).push(v);
    });
    setPending(p);
    setWatching(w);
  }

  function stop(reason = "") {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    callsRef.current.forEach((c) => c.close());
    connsRef.current.forEach((c) => c.close());
    callsRef.current.clear();
    connsRef.current.clear();
    peerRef.current?.destroy();
    peerRef.current = null;
    streamRef.current = null;
    setPending([]);
    setWatching([]);
    setEndReason(reason);
    setStatus((s) => (s === "idle" ? s : "ended"));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), []); // limpa ao sair da página

  function accept(id: string) {
    const peer = peerRef.current;
    const stream = streamRef.current;
    const conn = connsRef.current.get(id);
    if (!peer || !stream || !conn) return;
    if (callsRef.current.size >= LIMITS.maxViewers) {
      send(conn, { type: "full" });
      setTimeout(() => conn.close(), 300);
      return;
    }
    callsRef.current.set(id, peer.call(id, stream));
    syncLists();
  }

  function reject(id: string) {
    const conn = connsRef.current.get(id);
    send(conn, { type: "rejected" });
    setTimeout(() => conn?.close(), 300);
  }

  function kick(id: string) {
    callsRef.current.get(id)?.close();
    callsRef.current.delete(id);
    reject(id);
    syncLists();
  }

  async function openPeer(stream: MediaStream, attempt = 0) {
    const newCode = generateCode();
    const peer = await createPeer(peerIdFor(newCode));
    peerRef.current = peer;

    peer.on("open", () => {
      setCode(newCode);
      deadlineRef.current = Date.now() + LIMITS.maxSessionMinutes * 60_000;
      setStatus("live");
    });

    // Cada visualizador abre uma conexão de dados com um nome.
    // Nada de vídeo é enviado até o host aprovar.
    peer.on("connection", (conn) => {
      conn.on("open", () => {
        if (callsRef.current.size >= LIMITS.maxViewers) {
          send(conn, { type: "full" });
          setTimeout(() => conn.close(), 300);
          return;
        }
        connsRef.current.set(conn.peer, conn);
        if (LIMITS.requireApproval) {
          send(conn, { type: "pending" });
          syncLists();
        } else {
          accept(conn.peer);
        }
      });
      const drop = () => {
        callsRef.current.get(conn.peer)?.close();
        callsRef.current.delete(conn.peer);
        connsRef.current.delete(conn.peer);
        syncLists();
      };
      conn.on("close", drop);
      conn.on("error", drop);
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id" && attempt < 3) {
        peer.destroy();
        openPeer(stream, attempt + 1);
        return;
      }
      setError(`Falha na conexão (${err.type}). Tente gerar outro IP.`);
    });
  }

  async function start() {
    setError("");
    setEndReason("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "O navegador só permite compartilhar a tela em HTTPS ou localhost. Acesse o app via https:// (ex.: npm run dev:https)."
      );
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      streamRef.current = stream;
      // Usuário clicou em "Parar de compartilhar" na barra do navegador
      stream.getVideoTracks()[0].addEventListener("ended", () => stop());
      await openPeer(stream);
    } catch {
      setStatus("idle");
      setError("O compartilhamento foi cancelado ou o navegador bloqueou o acesso à tela.");
    }
  }

  // Preview local + contagem regressiva da duração máxima
  useEffect(() => {
    if (status !== "live") return;
    if (previewRef.current && streamRef.current) previewRef.current.srcObject = streamRef.current;
    const timer = setInterval(() => {
      const left = deadlineRef.current - Date.now();
      setRemaining(left);
      if (left <= 0) stop(`A sessão atingiu o limite de ${LIMITS.maxSessionMinutes} minutos.`);
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/view/${toSlug(code)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="shell">
      <Link href="/" className="brand">Open<span>Screen</span></Link>
      <main className="main">
        {status === "idle" || status === "starting" ? (
          <>
            <h1>Escolha o que compartilhar.</h1>
            <p className="lead">
              O navegador vai perguntar qual tela, janela ou aba mostrar. Só depois disso o IP de acesso é gerado.
              {LIMITS.requireApproval && " Ninguém vê nada até você aprovar."}
            </p>
            <div className="row">
              <button className="btn" onClick={start} disabled={status === "starting"}>
                {status === "starting" ? "Aguardando…" : "Escolher tela"}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        ) : status === "live" ? (
          <>
            <span className="status">
              <span className="dot live" /> Compartilhando
              <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                {watching.length}/{LIMITS.maxViewers} assistindo · encerra em {formatRemaining(remaining)}
              </span>
            </span>
            <div className="code-display" aria-label={`IP de acesso ${code}`}>{code}</div>
            <p className="hint">Passe este IP para quem vai assistir, ou envie o link direto.</p>
            <div className="row">
              <button className="btn ghost" onClick={copy}>{copied ? "Link copiado" : "Copiar link"}</button>
              <button className="btn danger" onClick={() => stop()}>Parar de compartilhar</button>
            </div>

            {pending.length > 0 && (
              <div className="requests" aria-live="polite">
                <h3>Pedindo para assistir</h3>
                {pending.map((v) => (
                  <div className="request incoming" key={v.id}>
                    <strong>{v.name}</strong>
                    <div className="actions">
                      <button className="btn ghost" onClick={() => reject(v.id)}>Recusar</button>
                      <button
                        className="btn"
                        onClick={() => accept(v.id)}
                        disabled={watching.length >= LIMITS.maxViewers}
                      >
                        Aceitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {watching.length > 0 && (
              <div className="requests">
                <h3>Assistindo agora</h3>
                {watching.map((v) => (
                  <div className="request" key={v.id}>
                    <strong>{v.name}</strong>
                    <div className="actions">
                      <button className="btn ghost" onClick={() => kick(v.id)}>Remover</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <video ref={previewRef} className="preview" autoPlay muted playsInline />
            {error && <p className="error">{error}</p>}
          </>
        ) : (
          <>
            <h1>Compartilhamento encerrado.</h1>
            <p className="lead">
              {endReason || "Este IP deixou de funcionar."} Gere outro quando quiser compartilhar de novo.
            </p>
            <div className="row">
              <button className="btn" onClick={() => { setStatus("idle"); setCode(""); }}>Gerar novo IP</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
