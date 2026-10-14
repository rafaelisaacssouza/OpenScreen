"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type Peer from "peerjs";
import { createPeer, fromSlug, peerIdFor, type HostMessage } from "@/lib/peer";

type Status = "naming" | "connecting" | "waiting" | "live" | "notfound" | "rejected" | "full" | "ended" | "error";

const messages: Record<Exclude<Status, "live" | "naming">, { title: string; text: string }> = {
  connecting: { title: "Conectando…", text: "Procurando a tela compartilhada." },
  waiting: { title: "Aguardando aprovação", text: "Quem está compartilhando precisa aceitar o seu pedido." },
  notfound: {
    title: "IP não encontrado",
    text: "Confira o IP com quem está compartilhando. Ele só funciona enquanto a pessoa estiver compartilhando.",
  },
  rejected: { title: "Acesso não autorizado", text: "Quem está compartilhando recusou ou encerrou o seu acesso." },
  full: { title: "Sessão cheia", text: "Esta sessão já atingiu o limite de espectadores." },
  ended: { title: "Compartilhamento encerrado", text: "A outra pessoa parou de compartilhar a tela." },
  error: {
    title: "Não foi possível conectar",
    text: "A rede pode estar bloqueando a conexão direta. Tente outra rede ou recarregue a página.",
  },
};

export default function ViewPage() {
  const params = useParams<{ code: string }>();
  const code = fromSlug(params.code ?? "");
  const [status, setStatus] = useState<Status>("naming");
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false); // uma vez conectado, a conexão vive até sair da página
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!started) return;
    let peer: Peer | null = null;
    let cancelled = false;
    let answered = false; // host respondeu (pendente, recusado, cheio ou stream)

    const finish = (s: Status) => setStatus((cur) => (cur === "live" || cur === "waiting" || cur === "connecting" ? s : cur));

    const timeout = setTimeout(() => {
      if (!answered && !cancelled) setStatus("notfound");
    }, 15000);

    (async () => {
      peer = await createPeer();
      if (cancelled) return peer.destroy();

      peer.on("open", () => {
        const conn = peer!.connect(peerIdFor(code), { reliable: true, metadata: { name: name.trim() } });
        conn.on("data", (raw) => {
          const msg = raw as HostMessage;
          answered = true;
          if (msg.type === "pending") setStatus("waiting");
          if (msg.type === "rejected") finish("rejected");
          if (msg.type === "full") finish("full");
        });
        conn.on("close", () => answered && finish("ended"));
      });

      peer.on("call", (call) => {
        call.answer(); // só recebe, não envia nada
        call.on("stream", (stream) => {
          answered = true;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setStatus("live");
        });
        call.on("close", () => finish("ended"));
      });

      peer.on("error", (err) => {
        setStatus(err.type === "peer-unavailable" ? "notfound" : "error");
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      peer?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, code]);

  function toggleSound() {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen();
  }

  return (
    <div className="viewer" ref={wrapRef}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ visibility: status === "live" ? "visible" : "hidden" }}
      />

      {status === "naming" && (
        <div className="center-msg">
          <h2>Como você quer aparecer?</h2>
          <p>Seu nome vai aparecer para quem está compartilhando, junto com o pedido de acesso.</p>
          <form
            className="name-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setStatus("connecting");
              setStarted(true);
            }}
          >
            <label htmlFor="name" className="sr-only">Seu nome</label>
            <input
              id="name"
              className="name-input"
              maxLength={40}
              autoFocus
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!name.trim()}>Pedir para assistir</button>
          </form>
        </div>
      )}

      {status !== "live" && status !== "naming" && (
        <div className="center-msg">
          <h2>{messages[status].title}</h2>
          <p>{messages[status].text}</p>
          {status !== "connecting" && status !== "waiting" && (
            <div><Link href="/" className="btn ghost">Digitar outro IP</Link></div>
          )}
        </div>
      )}

      <div className="viewer-bar">
        <span className="status">
          <span className={`dot ${status === "live" ? "ok" : ""}`} />
          {code}
        </span>
        <div className="row" style={{ marginTop: 0 }}>
          {status === "live" && (
            <>
              <button className="btn ghost" onClick={toggleSound}>{muted ? "Ativar som" : "Silenciar"}</button>
              <button className="btn ghost" onClick={fullscreen}>Tela cheia</button>
            </>
          )}
          <Link href="/" className="btn ghost">Sair</Link>
        </div>
      </div>
    </div>
  );
}
