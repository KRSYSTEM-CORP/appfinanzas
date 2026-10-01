"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_KEY = "kr-pos-theme";

function subscribeToThemeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const isDark = useSyncExternalStore(subscribeToThemeClass, getIsDark, () => false);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing / blocked storage — toggle still works for this visit.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={collapsed ? "icon-sm" : "sm"}
      className={collapsed ? "" : "w-full justify-start"}
      onClick={toggle}
      title={collapsed ? (isDark ? "Modo claro" : "Modo oscuro") : undefined}
      aria-label={collapsed ? (isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro") : undefined}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      {!collapsed && <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>}
    </Button>
  );
}
