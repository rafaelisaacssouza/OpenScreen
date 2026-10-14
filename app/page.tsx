"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cleanCode, isValidCode, toSlug } from "@/lib/peer";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = isValidCode(code);

  function join(e: React.FormEvent) {
    e.preventDefault();
    if (valid) router.push(`/view/${toSlug(code)}`);
  }

  return (
    <div className="shell">
      <Link href="/" className="brand">Open<span>Screen</span></Link>
      <main className="main">
        <h1>Mostre sua tela para quem tiver o seu IP.</h1>
        <p className="lead">
          Direto no navegador, sem instalar nada. A imagem vai de um computador ao outro, sem passar por servidor.
        </p>

        <div className="split">
          <section>
            <h2>Compartilhar minha tela</h2>
            <p>Gere um IP de acesso e passe para quem vai assistir. Você escolhe a tela, janela ou aba.</p>
            <Link href="/share" className="btn">Gerar IP</Link>
          </section>

          <section>
            <h2>Assistir uma tela</h2>
            <p>Digite o IP que a outra pessoa te passou.</p>
            <form onSubmit={join}>
              <label htmlFor="code" className="sr-only">IP de acesso</label>
              <input
                id="code"
                className="code-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="000.000.000.000"
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
              />
              <button className="btn ghost" type="submit" disabled={!valid}>
                Conectar
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
