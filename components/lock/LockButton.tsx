"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lockSession } from "@/lib/actions/pin";

export function LockButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function lock() {
    startTransition(async () => {
      const r = await lockSession();
      if (r.success) router.replace("/lock");
      else toast.error(r.error);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={collapsed ? "icon-sm" : "sm"}
      className={collapsed ? "" : "w-full justify-start"}
      disabled={isPending}
      onClick={lock}
      title={collapsed ? "Bloquear pantalla" : undefined}
      aria-label={collapsed ? "Bloquear pantalla" : undefined}
    >
      <LockIcon className="size-4" aria-hidden />
      {collapsed ? null : "Bloquear"}
    </Button>
  );
}
