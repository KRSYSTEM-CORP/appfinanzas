// Icono de WhatsApp de la preview v15 (burbuja con teléfono, trazo).
export function WhatsappIcon({ className = "size-[19px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20Z" />
      <path d="M9.2 8.8c.2 2.5 2.5 4.8 5 5l1.1-1.2-1.8-1-.8.7c-.8-.3-1.6-1.1-1.9-1.9l.7-.8-1-1.8-1.3 1Z" />
    </svg>
  );
}
