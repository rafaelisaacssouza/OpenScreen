"use client";

import { useState } from "react";

export function NameForm({ text, action, onSubmit }: { text: string; action: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <>
      <h1>Como você quer aparecer?</h1>
      <p className="lead">{text}</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <label htmlFor="name" className="sr-only">Seu nome</label>
        <input
          id="name"
          className="name-input"
          maxLength={40}
          autoFocus
          autoComplete="nickname"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={!name.trim()}>{action}</button>
      </form>
    </>
  );
}
