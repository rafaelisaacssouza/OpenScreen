"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fromSlug } from "@/lib/peer";
import { Room } from "@/lib/room";
import { NameForm } from "@/components/NameForm";
import { RoomScreen } from "@/components/RoomScreen";

export default function JoinRoomPage() {
  const params = useParams<{ code: string }>();
  const code = fromSlug(params.code ?? "");
  const [room, setRoom] = useState<Room | null>(null);

  // Sai da sala ao sair da página
  useEffect(() => () => room?.close(), [room]);

  if (room) return <RoomScreen room={room} />;

  return (
    <div className="shell">
      <Link href="/" className="brand">Open<span>Screen</span></Link>
      <main className="main">
        <span className="status">
          <span className="dot" /> Sala {code}
        </span>
        <NameForm
          text="Seu nome aparece para quem criou a sala, junto com o pedido para entrar, e para quem estiver nela."
          action="Pedir para entrar"
          onSubmit={(name) => setRoom(new Room("guest", name, code))}
        />
      </main>
    </div>
  );
}
