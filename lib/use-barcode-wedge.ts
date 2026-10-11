"use client";

import { useEffect, useRef } from "react";

// Hardware barcode scanners (USB, Bluetooth or the dongle kind) act as a
// keyboard: they "type" the code in one fast burst and finish with Enter (or
// Tab, depending on how the scanner is configured). A person never types
// that fast, so a burst of characters with tiny gaps ending in Enter is a
// scan. This lets a scan work even when no input has focus — the cursor does
// not have to be in the search box.
//
// canCapture decides, per keystroke target, whether a scan may be taken: pass
// one that refuses other text inputs, so scanning while a discount or payment
// field is focused can't be misread as a scan.
const MAX_GAP_MS = 50; // between characters of one scan
const MAX_END_GAP_MS = 100; // between the last character and Enter/Tab
const MIN_LENGTH = 4;

export function useBarcodeWedge(
  onScan: (code: string) => void,
  canCapture?: (target: EventTarget | null) => boolean
) {
  const onScanRef = useRef(onScan);
  const canCaptureRef = useRef(canCapture);
  useEffect(() => {
    onScanRef.current = onScan;
    canCaptureRef.current = canCapture;
  });

  useEffect(() => {
    let buffer = "";
    let last = 0;

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (canCaptureRef.current && !canCaptureRef.current(e.target)) {
        buffer = "";
        return;
      }

      const now = performance.now();

      if (e.key === "Enter" || e.key === "Tab") {
        const code = buffer;
        buffer = "";
        if (code.length >= MIN_LENGTH && now - last <= MAX_END_GAP_MS) {
          // Swallow the terminator so it doesn't submit a form or move focus.
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        if (now - last > MAX_GAP_MS) buffer = "";
        buffer += e.key;
        last = now;
      }
    }

    // Capture phase, so a recognised scan is handled before any input's own
    // Enter handler can act on the same keystroke.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
