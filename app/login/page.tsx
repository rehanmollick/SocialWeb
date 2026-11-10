"use client";
import { useState } from "react";

export default function Login() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !code.trim()) return;
          setBusy(true);
          setMessage("");
          try {
            const res = await fetch("/api/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ passcode: code }),
            });
            if (res.ok) return window.location.replace("/");
            setMessage((await res.json()).error || "Could not sign in.");
          } catch {
            setMessage("Could not reach the app.");
          }
          setBusy(false);
        }}
      >
        <span className="brand-symbol">✳</span>
        <h1>socialweb</h1>
        <label>
          Passcode
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy || !code.trim()}>
          {busy ? "Opening…" : "Open"}
        </button>
        {message && <p role="alert">{message}</p>}
      </form>
    </main>
  );
}
