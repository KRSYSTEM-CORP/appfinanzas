"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileGlobal = {
  render: (
    container: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; size?: "normal" | "compact" | "flexible" }
  ) => string;
};

// Cloudflare's script exposes window.turnstile once loaded. Explicit
// rendering (instead of the implicit ".cf-turnstile" div-scan) so we can get
// the solved token back into React state via onVerify — needed because the
// "Continuar con Google" button (components/auth/GoogleIcon.tsx callers)
// isn't a form submit and has no FormData to read a hidden input from.
export function Turnstile({ onVerify }: { onVerify?: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!siteKey || !scriptLoaded || renderedRef.current || !containerRef.current) return;
    const turnstile = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
    if (!turnstile) return;
    renderedRef.current = true;
    turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onVerify?.(token),
      // "flexible" fills the container's width instead of Cloudflare's
      // fixed 300px default, which overflowed the form on narrow phones
      // (anything under ~330px wide, since the widget doesn't shrink on
      // its own). Keeps the same widget/protection, just responsive.
      size: "flexible",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, scriptLoaded]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onReady={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} className="w-full" />
    </>
  );
}
