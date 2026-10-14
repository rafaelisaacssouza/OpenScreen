import type Peer from "peerjs";
import type { DataConnection, MediaConnection } from "peerjs";
import { createPeer, generateCode, peerIdFor, LIMITS } from "./peer";

// Uma sala tem um anfitrião (quem gerou o IP) e convidados aprovados por ele.
// O anfitrião é o ponto central de controle: aprova, remove e mantém a lista de
// participantes. As telas, porém, vão direto de quem compartilha para cada
// participante (malha P2P) — nada passa pelo anfitrião.

export type Member = { id: string; name: string; sharing: boolean; host: boolean };
export type Request = { id: string; name: string };

// "tab": só o áudio de uma aba do navegador. "system": tudo que toca no
// computador — inclusive a voz de quem está no Discord/WhatsApp, que então
// se ouve de volta. Por isso o padrão é "tab".
export type AudioMode = "none" | "tab" | "system";

export type RoomStatus =
  | "connecting"
  | "waiting"
  | "live"
  | "notfound"
  | "rejected"
  | "full"
  | "ended"
  | "error";

// Mensagens trocadas pelo canal de dados entre anfitrião e convidado
export type HostMessage =
  | { type: "pending" }
  | { type: "rejected" }
  | { type: "full" }
  | { type: "roster"; members: Member[]; remainingMs: number }
  | { type: "ended"; reason: string };

export type GuestMessage = { type: "sharing"; on: boolean };

export type RoomState = {
  status: RoomStatus;
  code: string;
  selfId: string;
  members: Member[];
  requests: Request[]; // só o anfitrião vê
  streams: Record<string, MediaStream>; // telas recebidas, por participante
  local: MediaStream | null; // a minha tela, se estou compartilhando
  deadline: number;
  error: string;
  endReason: string;
};

type Guest = { conn: DataConnection; name: string; approved: boolean; sharing: boolean };

const cleanName = (raw: unknown) => (typeof raw === "string" ? raw.trim().slice(0, 40) : "") || "Sem nome";

export async function captureScreen(audio: AudioMode): Promise<MediaStream> {
  // Navegadores ignoram as opções que não conhecem.
  const options = {
    video: { frameRate: { ideal: 30 } },
    audio:
      audio === "none"
        ? false
        : {
            // Não captura o som que esta página toca (as telas dos outros
            // participantes); senão ele volta para a sala em eco.
            restrictOwnAudio: true,
            suppressLocalAudioPlayback: false,
          },
    // "exclude" tira do seletor do Chrome a opção de áudio do sistema inteiro.
    systemAudio: audio === "system" ? "include" : "exclude",
    // Não oferece a própria aba do OpenScreen (efeito espelho infinito)
    selfBrowserSurface: "exclude",
    // Permite trocar de aba pela barra do navegador sem parar o compartilhamento
    surfaceSwitching: "include",
  };
  return navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions);
}

export class Room {
  private state: RoomState = {
    status: "connecting",
    code: "",
    selfId: "",
    members: [],
    requests: [],
    streams: {},
    local: null,
    deadline: 0,
    error: "",
    endReason: "",
  };
  private listeners = new Set<() => void>();
  private peer: Peer | null = null;
  private closed = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private notFoundTimer: ReturnType<typeof setTimeout> | undefined;

  private guests = new Map<string, Guest>(); // anfitrião
  private hostConn: DataConnection | null = null; // convidado

  private outCalls = new Map<string, MediaConnection>(); // minha tela → cada participante
  private inCalls = new Map<string, MediaConnection>(); // tela de cada participante → mim
  private heldCalls = new Map<string, MediaConnection>(); // chegaram antes da lista atualizar

  constructor(readonly role: "host" | "guest", private name: string, code = "") {
    this.state.code = code;
    if (role === "host") this.openHost();
    else this.openGuest();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private send(conn: DataConnection | null | undefined, msg: HostMessage | GuestMessage) {
    try {
      conn?.send(msg);
    } catch {
      /* conexão já fechada */
    }
  }

  // ───────────── Anfitrião ─────────────

  private async openHost(attempt = 0) {
    const code = generateCode();
    const peer = await createPeer(peerIdFor(code));
    if (this.closed) return peer.destroy();
    this.peer = peer;

    peer.on("open", (id) => {
      this.set({
        code,
        selfId: id,
        status: "live",
        deadline: Date.now() + LIMITS.maxSessionMinutes * 60_000,
      });
      this.syncRoster();
      this.timer = setInterval(() => {
        if (Date.now() >= this.state.deadline) {
          this.end(`A sala atingiu o limite de ${LIMITS.maxSessionMinutes} minutos.`);
        }
      }, 1000);
    });

    peer.on("connection", (conn) => this.onGuestConnection(conn));
    peer.on("call", (call) => this.onCall(call));
    this.keepSignaling(peer);

    peer.on("error", (err) => {
      if (err.type === "unavailable-id" && attempt < 3 && !this.state.selfId) {
        peer.destroy();
        this.openHost(attempt + 1);
        return;
      }
      // Ao reconectar, o servidor pode ainda não ter liberado o nosso IP
      if (err.type === "unavailable-id" && this.state.selfId) return this.scheduleReconnect(peer, 5000);
      // Ligar para alguém que acabou de sair não é um erro da sala
      if (err.type === "peer-unavailable") return;
      this.set({ error: `Falha na conexão (${err.type}).` });
    });
  }

  // A conexão com o servidor de sinalização é o que faz o IP "existir" para
  // quem tenta entrar. Com a aba em segundo plano (ex.: a pessoa foi para o
  // Discord), o Chrome atrasa os timers do PeerJS e o servidor derruba a
  // conexão; o PeerJS não reconecta sozinho, e a sala some para novos convidados.
  private keepSignaling(peer: Peer) {
    peer.on("disconnected", () => this.scheduleReconnect(peer, 1000));
    const onVisible = () => {
      if (this.closed || this.peer !== peer) return document.removeEventListener("visibilitychange", onVisible);
      if (document.visibilityState === "visible" && peer.disconnected) this.scheduleReconnect(peer, 0);
    };
    document.addEventListener("visibilitychange", onVisible);
  }

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private scheduleReconnect(peer: Peer, delay: number) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.closed || this.peer !== peer || peer.destroyed || !peer.disconnected) return;
      try {
        peer.reconnect();
      } catch {
        this.scheduleReconnect(peer, 5000);
      }
    }, delay);
  }

  private approvedCount() {
    let n = 0;
    this.guests.forEach((g) => g.approved && n++);
    return n;
  }

  // Cada convidado abre uma conexão de dados com um nome.
  // Ele não vê a sala nem recebe telas até ser aprovado.
  private onGuestConnection(conn: DataConnection) {
    conn.on("open", () => {
      if (this.approvedCount() >= LIMITS.maxGuests) return this.refuse(conn, "full");
      const meta = conn.metadata as { name?: unknown } | undefined;
      this.guests.set(conn.peer, { conn, name: cleanName(meta?.name), approved: false, sharing: false });
      if (LIMITS.requireApproval) {
        this.send(conn, { type: "pending" });
        this.syncRequests();
      } else {
        this.accept(conn.peer);
      }
    });
    conn.on("data", (raw) => {
      const msg = raw as GuestMessage;
      const guest = this.guests.get(conn.peer);
      if (guest?.approved && msg?.type === "sharing") {
        guest.sharing = !!msg.on;
        this.syncRoster();
      }
    });
    const drop = () => {
      if (this.guests.get(conn.peer)?.conn !== conn) return;
      this.guests.delete(conn.peer);
      this.syncRequests();
      this.syncRoster();
    };
    conn.on("close", drop);
    conn.on("error", drop);
  }

  private refuse(conn: DataConnection, type: "rejected" | "full") {
    this.send(conn, { type });
    if (this.guests.get(conn.peer)?.conn === conn) {
      this.guests.delete(conn.peer);
      this.syncRequests();
      this.syncRoster();
    }
    setTimeout(() => conn.close(), 300);
  }

  accept(id: string) {
    const guest = this.guests.get(id);
    if (!guest || guest.approved) return;
    if (this.approvedCount() >= LIMITS.maxGuests) return this.refuse(guest.conn, "full");
    guest.approved = true;
    this.syncRequests();
    this.syncRoster();
  }

  // Serve tanto para recusar um pedido quanto para remover quem já está na sala
  reject(id: string) {
    const guest = this.guests.get(id);
    if (guest) this.refuse(guest.conn, "rejected");
  }

  private syncRequests() {
    const requests: Request[] = [];
    this.guests.forEach((g, id) => !g.approved && requests.push({ id, name: g.name }));
    this.set({ requests });
  }

  private syncRoster() {
    if (this.role !== "host" || this.closed) return;
    const members: Member[] = [
      { id: this.state.selfId, name: this.name, sharing: !!this.state.local, host: true },
    ];
    this.guests.forEach((g, id) => g.approved && members.push({ id, name: g.name, sharing: g.sharing, host: false }));
    this.set({ members });
    const remainingMs = this.state.deadline - Date.now();
    this.guests.forEach((g) => g.approved && this.send(g.conn, { type: "roster", members, remainingMs }));
    this.reconcile();
  }

  // ───────────── Convidado ─────────────

  private async openGuest() {
    const peer = await createPeer();
    if (this.closed) return peer.destroy();
    this.peer = peer;

    // Se o IP não existisse, o servidor responderia logo com "peer-unavailable".
    // Silêncio significa que a sala existe, mas a conexão direta não fechou
    // (NAT/firewall bloqueando o WebRTC — normalmente resolvido com um TURN).
    this.notFoundTimer = setTimeout(() => {
      if (this.state.status === "connecting") this.finish("error");
    }, 15000);

    // Sem o servidor, o convidado não recebe as telas de quem começar a compartilhar depois
    this.keepSignaling(peer);

    peer.on("open", (id) => {
      if (this.hostConn) return; // "open" de novo = só reconectou ao servidor
      this.set({ selfId: id });
      const conn = peer.connect(peerIdFor(this.state.code), { reliable: true, metadata: { name: this.name } });
      this.hostConn = conn;
      conn.on("data", (raw) => this.onHostMessage(raw as HostMessage));
      conn.on("close", () => this.finish("ended"));
    });

    peer.on("call", (call) => this.onCall(call));

    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        // Só é "IP não encontrado" se for o anfitrião; senão alguém acabou de sair
        if (this.state.status === "connecting") this.finish("notfound");
        return;
      }
      // Queda do servidor depois de falar com o anfitrião: a conexão direta
      // continua de pé e o PeerJS reconecta ao servidor
      if (this.hostConn?.open) return;
      if (this.state.status !== "live") this.finish("error");
    });
  }

  private onHostMessage(msg: HostMessage) {
    switch (msg?.type) {
      case "pending":
        return this.set({ status: "waiting" });
      case "rejected":
        return this.finish("rejected");
      case "full":
        return this.finish("full");
      case "ended":
        return this.finish("ended", msg.reason);
      case "roster":
        this.set({ status: "live", members: msg.members, deadline: Date.now() + msg.remainingMs });
        return this.reconcile();
    }
  }

  // ───────────── Telas (malha P2P) ─────────────

  private isMember(id: string) {
    return id !== this.state.selfId && this.state.members.some((m) => m.id === id);
  }

  private onCall(call: MediaConnection) {
    if (this.isMember(call.peer)) return this.answer(call);
    // Quem acabou de entrar pode receber a ligação antes da lista atualizada.
    // Guarda por alguns segundos; se não virar participante, recusa.
    this.heldCalls.get(call.peer)?.close();
    this.heldCalls.set(call.peer, call);
    setTimeout(() => {
      if (this.heldCalls.get(call.peer) !== call) return;
      this.heldCalls.delete(call.peer);
      call.close();
    }, 10_000);
  }

  private answer(call: MediaConnection) {
    const id = call.peer;
    const old = this.inCalls.get(id);
    this.inCalls.set(id, call);
    old?.close(); // a pessoa trocou de tela: a ligação nova substitui a antiga
    call.answer(); // só recebe; quem envia a própria tela é uma ligação separada
    call.on("stream", (stream) => {
      if (this.inCalls.get(id) === call) this.set({ streams: { ...this.state.streams, [id]: stream } });
    });
    call.on("close", () => this.dropIncoming(id, call));
    call.on("error", () => this.dropIncoming(id, call));
  }

  private dropIncoming(id: string, call?: MediaConnection) {
    const current = this.inCalls.get(id);
    if (call && current !== call) return;
    this.inCalls.delete(id);
    if (id in this.state.streams) {
      const { [id]: _, ...rest } = this.state.streams;
      this.set({ streams: rest });
    }
    current?.close();
  }

  // Ajusta as ligações à lista de participantes e ao meu compartilhamento
  private reconcile() {
    if (this.closed || !this.peer) return;
    const others = new Set(this.state.members.filter((m) => m.id !== this.state.selfId).map((m) => m.id));
    const local = this.state.local;

    this.outCalls.forEach((call, id) => {
      if (local && others.has(id)) return;
      this.outCalls.delete(id);
      call.close();
    });
    if (local) {
      others.forEach((id) => {
        if (this.outCalls.has(id)) return;
        const call = this.peer!.call(id, local);
        this.outCalls.set(id, call);
        const drop = () => this.outCalls.get(id) === call && this.outCalls.delete(id);
        call.on("close", drop);
        call.on("error", drop);
      });
    }

    this.inCalls.forEach((_, id) => !others.has(id) && this.dropIncoming(id));
    this.heldCalls.forEach((call, id) => {
      if (!others.has(id)) return;
      this.heldCalls.delete(id);
      this.answer(call);
    });
  }

  // Começa a compartilhar, ou troca a tela que já está sendo compartilhada.
  // Lança erro se a pessoa cancelar o seletor do navegador.
  async share(audio: AudioMode) {
    const stream = await captureScreen(audio);
    if (this.closed) return stream.getTracks().forEach((t) => t.stop());
    const old = this.state.local;
    // Liga de novo para todos com a tela nova (o áudio pode ter aparecido ou sumido)
    this.outCalls.forEach((call) => call.close());
    this.outCalls.clear();
    old?.getTracks().forEach((t) => t.stop());
    // Clicou em "Parar de compartilhar" na barra do navegador
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (this.state.local === stream) this.stopSharing();
    });
    this.set({ local: stream });
    this.announceSharing();
  }

  stopSharing() {
    const local = this.state.local;
    if (!local) return;
    local.getTracks().forEach((t) => t.stop());
    this.set({ local: null });
    this.announceSharing();
  }

  private announceSharing() {
    if (this.role === "host") return this.syncRoster();
    this.send(this.hostConn, { type: "sharing", on: !!this.state.local });
    this.reconcile();
  }

  // ───────────── Saída ─────────────

  // Anfitrião: encerra a sala para todos. Convidado: sai da sala.
  close() {
    if (this.closed) return;
    if (this.role === "host") this.end("");
    else this.finish("ended");
  }

  private end(reason: string) {
    this.guests.forEach((g) => this.send(g.conn, { type: "ended", reason }));
    this.finish("ended", reason);
  }

  private finish(status: RoomStatus, endReason = "") {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.notFoundTimer);
    clearTimeout(this.reconnectTimer);
    this.state.local?.getTracks().forEach((t) => t.stop());
    this.outCalls.clear();
    this.inCalls.clear();
    this.heldCalls.clear();
    this.guests.clear();
    // Pequena espera para a mensagem de encerramento chegar antes de desconectar
    const peer = this.peer;
    this.peer = null;
    setTimeout(() => peer?.destroy(), 300);
    this.set({ status, endReason, local: null, streams: {}, members: [], requests: [] });
  }
}
