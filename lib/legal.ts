// Kept in its own zero-dependency module so pages that only need the
// copyright line (e.g. the login page) don't pull in jsPDF's bundle just to
// read a constant — lib/delivery-note.ts and lib/quote-pdf.ts re-export it
// for the document builders that print it on generated PDFs.
export const COPYRIGHT_LINE =
  '© 2026 KR SYSTEM. Todos los derechos reservados. Empresa de Sistemas Automatizados "KR SYSTEM" Teléfono: +1 (904) 579-6156.';

export const WHATSAPP_PHONE = "19045796156";

export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
  "Hola, quiero obtener este sistema para mi negocio / más información."
)}`;

export const CONTACT_EMAIL = "contacto@krsystem-corp.com";

export const LEGAL_UPDATED_AT = "25 de agosto de 2026";
