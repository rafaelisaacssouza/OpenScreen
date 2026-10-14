"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LIMITS } from "@/lib/peer";
import { Room } from "@/lib/room";
import { NameForm } from "@/components/NameForm";
import { RoomScreen } from "@/components/RoomScreen";

export default function CreateRoomPage() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);

  // Encerra a sala ao sair da página
  useEffect(() => () => room?.close(), [room]);

  if (room) {
    return <RoomScreen room={room} onRestart={() => setRoom(new Room("host", name))} />;
  }

  return (
    <div className="shell">
      <Link href="/" className="brand">Open<span>Screen</span></Link>
      <main className="main">
        <NameForm
          text={`Você vai criar a sala e receber um IP de acesso. ${
            LIMITS.requireApproval ? "Ninguém entra sem você aprovar. " : ""
          }Compartilhar a sua tela é opcional.`}
          action="Criar sala"
          onSubmit={(n) => {
            setName(n);
            setRoom(new Room("host", n));
          }}
        />
      </main>
    </div>
  );
}
