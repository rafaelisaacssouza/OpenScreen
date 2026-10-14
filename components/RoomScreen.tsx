"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LIMITS, toSlug } from "@/lib/peer";
import type { AudioMode, Room, RoomStatus } from "@/lib/room";

const messages: Record<Exclude<RoomStatus, "live">, { title: string; text: string }> = {
  connecting: { title: "Conectando…", text: "Procurando a sala." },
  waiting: { title: "Aguardando aprovação", text: "Quem criou a sala precisa aceitar o seu pedido." },
  notfound: {
    title: "IP não encontrado",
    text: "Confira o IP com quem criou a sala. Ele só funciona enquanto a sala estiver aberta.",
  },
  rejected: { title: "Acesso não autorizado", text: "Quem criou a sala recusou ou encerrou o seu acesso." },
  full: { title: "Sala cheia", text: "Esta sala já atingiu o limite de participantes." },
  ended: { title: "Sala encerrada", text: "Quem criou a sala encerrou a sessão." },
  error: {
    title: "Não foi possível conectar",
    text: "A rede pode estar bloqueando a conexão direta. Tente outra rede ou recarregue a página.",
  },
};

const audioOptions: { value: AudioMode; label: string }[] = [
  { value: "tab", label: "Áudio só da aba" },
  { value: "none", label: "Sem áudio" },
  { value: "system", label: "Áudio do sistema" },
];

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function Video({ stream, muted, className }: { stream: MediaStream; muted: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => {});
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

type Screen = { id: string; name: string; stream: MediaStream; self: boolean };

export function RoomScreen({ room, onRestart }: { room: Room; onRestart?: () => void }) {
  const s = useSyncExternalStore(room.subscribe, room.getState, room.getState);
  const isHost = room.role === "host";

  const [selected, setSelected] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>("tab");
  const [soundOn, setSoundOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stageRef = useRef<HTMLElement>(null);

  const canShare = typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getDisplayMedia;

  // O endereço do anfitrião vira o link de entrada da sala, para que copiar a
  // barra do navegador funcione igual ao botão "Copiar link"
  useEffect(() => {
    if (isHost && s.code) window.history.replaceState(null, "", `/view/${toSlug(s.code)}`);
  }, [isHost, s.code]);

  useEffect(() => {
    if (s.status !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [s.status]);

  // Telas disponíveis: as dos outros que estão compartilhando, e a minha
  const screens: Screen[] = s.members
    .filter((m) => m.id !== s.selfId && m.sharing && s.streams[m.id])
    .map((m) => ({ id: m.id, name: m.name, stream: s.streams[m.id], self: false }));
  if (s.local) screens.push({ id: s.selfId, name: "Sua tela", stream: s.local, self: true });

  // A tela em destaque é a escolhida; se ela sumir, cai na primeira de outra pessoa
  const spotlight =
    screens.find((x) => x.id === selected) ?? screens.find((x) => !x.self) ?? screens[0] ?? null;

  async function share() {
    setShareError("");
    setBusy(true);
    try {
      await room.share(audioMode);
    } catch {
      setShareError("O compartilhamento foi cancelado ou o navegador bloqueou o acesso à tela.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/view/${toSlug(s.code)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen();
  }

  if (s.status !== "live") {
    const msg =
      isHost && s.status === "connecting"
        ? { title: "Criando sala…", text: "Gerando o IP de acesso." }
        : isHost && s.status === "ended"
          ? { title: "Sala encerrada.", text: s.endReason || "Este IP deixou de funcionar." }
          : { ...messages[s.status], text: s.endReason || messages[s.status].text };
    const active = s.status === "connecting" || s.status === "waiting";
    return (
      <div className="shell">
        <Link href="/" className="brand">Open<span>Screen</span></Link>
        <main className="main">
          <h1>{msg.title}</h1>
          <p className="lead">{msg.text}</p>
          {s.error && <p className="error">{s.error}</p>}
          <div className="row">
            {active ? (
              <Link href="/" className="btn ghost">Cancelar</Link>
            ) : isHost && onRestart ? (
              <button className="btn" onClick={onRestart}>Criar outra sala</button>
            ) : (
              <Link href="/" className="btn ghost">Digitar outro IP</Link>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="room">
      <header className="room-top">
        <Link href="/" className="brand">Open<span>Screen</span></Link>
        <div className="room-code">
          <span className="status">
            <span className="dot live" />
            <span aria-label={`IP da sala ${s.code}`}>{s.code}</span>
          </span>
          <button className="btn ghost small" onClick={copy}>{copied ? "Link copiado" : "Copiar link"}</button>
        </div>
        <span className="meta">
          {s.members.length}/{LIMITS.maxGuests + 1} na sala · encerra em {formatRemaining(s.deadline - now)}
        </span>
      </header>

      <div className="room-body">
        <section className="stage" ref={stageRef}>
          {spotlight ? (
            <>
              <Video
                key={spotlight.id}
                stream={spotlight.stream}
                muted={spotlight.self || !soundOn}
                className="stage-video"
              />
              <span className="tag">{spotlight.name}</span>
            </>
          ) : (
            <div className="stage-empty">
              <h2>Ninguém está compartilhando</h2>
              <p>
                {isHost && s.members.length === 1
                  ? "Passe o IP para as pessoas entrarem. Qualquer um na sala pode mostrar a tela."
                  : "Quando alguém compartilhar a tela, ela aparece aqui."}
              </p>
            </div>
          )}
        </section>

        <aside className="side">
          {screens.length > 1 && (
            <div className="requests">
              <h3>Telas</h3>
              <div className="tiles">
                {screens.map((x) => (
                  <button
                    key={x.id}
                    className={`tile ${x.id === spotlight?.id ? "active" : ""}`}
                    onClick={() => setSelected(x.id)}
                    aria-pressed={x.id === spotlight?.id}
                  >
                    <Video stream={x.stream} muted />
                    <span>{x.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isHost && s.requests.length > 0 && (
            <div className="requests" aria-live="polite">
              <h3>Pedindo para entrar</h3>
              {s.requests.map((r) => (
                <div className="request incoming" key={r.id}>
                  <strong>{r.name}</strong>
                  <div className="actions">
                    <button className="btn ghost" onClick={() => room.reject(r.id)}>Recusar</button>
                    <button
                      className="btn"
                      onClick={() => room.accept(r.id)}
                      disabled={s.members.length > LIMITS.maxGuests}
                    >
                      Aceitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="requests">
            <h3>Na sala</h3>
            {s.members.map((m) => {
              const self = m.id === s.selfId;
              const sharing = self ? !!s.local : m.sharing;
              return (
                <div className="request" key={m.id}>
                  <div className="who">
                    <strong>{m.name}{self && " (você)"}</strong>
                    <span className="meta">
                      {[m.host && "criou a sala", sharing && "compartilhando"].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="actions">
                    {sharing && !self && s.streams[m.id] && spotlight?.id !== m.id && (
                      <button className="btn ghost" onClick={() => setSelected(m.id)}>Assistir</button>
                    )}
                    {isHost && !m.host && (
                      <button className="btn ghost" onClick={() => room.reject(m.id)}>Remover</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <footer className="room-bar">
        <div className="bar-group">
          {canShare ? (
            <>
              <label className="sr-only" htmlFor="audio">Áudio da tela</label>
              <select
                id="audio"
                className="select"
                value={audioMode}
                onChange={(e) => setAudioMode(e.target.value as AudioMode)}
              >
                {audioOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button className="btn" onClick={share} disabled={busy}>
                {busy ? "Aguardando…" : s.local ? "Trocar tela" : "Compartilhar tela"}
              </button>
              {s.local && (
                <button className="btn danger" onClick={() => room.stopSharing()}>Parar</button>
              )}
            </>
          ) : (
            <span className="meta">Este navegador só pode assistir.</span>
          )}
        </div>
        <div className="bar-group">
          {spotlight && !spotlight.self && (
            <button className="btn ghost" onClick={() => setSoundOn(!soundOn)}>
              {soundOn ? "Silenciar" : "Ativar som"}
            </button>
          )}
          {spotlight && <button className="btn ghost" onClick={fullscreen}>Tela cheia</button>}
          {isHost ? (
            <button className="btn danger" onClick={() => room.close()}>Encerrar sala</button>
          ) : (
            <Link href="/" className="btn ghost">Sair</Link>
          )}
        </div>
        {canShare && (shareError || audioMode !== "none") && (
          <p className={`bar-hint ${shareError ? "error" : ""}`}>
            {shareError ||
              (audioMode === "tab"
                ? "Para enviar som, escolha uma aba e marque “Compartilhar áudio da aba”. O som de Discord, WhatsApp e outras chamadas não vai junto."
                : "O áudio do sistema inclui suas chamadas (Discord, WhatsApp): quem estiver nelas vai ouvir a própria voz de volta.")}
          </p>
        )}
      </footer>
    </div>
  );
}
