import type Peer from "peerjs";
import type { PeerOptions } from "peerjs";

// Prefixo evita colisão com outros apps no servidor público do PeerJS
export const ID_PREFIX = "openscreen-v1-";

// "IP de acesso": 4 blocos de 1 a 254 (ex.: 172.38.205.14).
// Não é o IP real da máquina — é um identificador no formato de IP.
export function generateCode(): string {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  return [octet(), octet(), octet(), octet()].join(".");
}

export function formatCode(code: string): string {
  return code;
}

// Mantém só dígitos e pontos enquanto a pessoa digita
export function cleanCode(input: string): string {
  return input.replace(/[^\d.]/g, "").replace(/\.{2,}/g, ".").slice(0, 15);
}

export function isValidCode(code: string): boolean {
  const parts = code.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

// Na URL e no ID do PeerJS usamos hífens no lugar dos pontos
export const toSlug = (code: string) => code.replace(/\./g, "-");
export const fromSlug = (slug: string) => decodeURIComponent(slug).replace(/-/g, ".");
export const peerIdFor = (code: string) => ID_PREFIX + toSlug(code);

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url) {
    servers.push({
      urls: url,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export async function createPeer(id?: string): Promise<Peer> {
  const { default: PeerCtor } = await import("peerjs");
  const opts: PeerOptions = { config: { iceServers: getIceServers() }, debug: 1 };
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (host) {
    opts.host = host;
    opts.port = Number(process.env.NEXT_PUBLIC_PEER_PORT || 443);
    opts.path = process.env.NEXT_PUBLIC_PEER_PATH || "/";
    opts.secure = true;
  }
  return id ? new PeerCtor(id, opts) : new PeerCtor(opts);
}

// Limites de segurança — configuráveis por variável de ambiente, ligados por padrão
export const LIMITS = {
  // Convidados além do anfitrião. Cada tela compartilhada é enviada a cada
  // participante (malha P2P), então salas grandes pesam no upload de quem compartilha.
  maxGuests: Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_GUESTS || process.env.NEXT_PUBLIC_MAX_VIEWERS || 3)),
  maxSessionMinutes: Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_SESSION_MINUTES || 60)),
  requireApproval: process.env.NEXT_PUBLIC_REQUIRE_APPROVAL !== "false",
};
