"use client"

import * as React from "react"
import { Drawer } from "vaul"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

const MOBILE_QUERY = "(max-width: 767px)"

function subscribeIsMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeIsMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}

/**
 * Renders a row-action menu: a Base UI Popover on desktop, a Vaul bottom
 * drawer on mobile (touch targets in a dropdown are cramped on a phone;
 * a drawer gives the same actions room to breathe and a natural swipe-to-
 * dismiss). `trigger` mirrors the existing PopoverTrigger `render` usage —
 * pass the button with no children, put its icon/label in `triggerChildren`.
 */
function ActionMenu({
  trigger,
  triggerChildren,
  align = "end",
  contentClassName,
  children,
}: {
  trigger: React.ReactElement
  triggerChildren: React.ReactNode
  align?: "start" | "end"
  contentClassName?: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer.Root>
        <Drawer.Trigger asChild>
          {React.cloneElement(trigger, undefined, triggerChildren)}
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl border-t bg-popover text-popover-foreground shadow-lg outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
            <div
              className={cn(
                "flex flex-col gap-1 overflow-y-auto p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]",
                contentClassName
              )}
            >
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger render={trigger}>{triggerChildren}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" sideOffset={4} align={align} className="isolate z-50">
          <PopoverPrimitive.Popup
            data-slot="popover-content"
            className={cn(
              "w-44 origin-(--transform-origin) rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              contentClassName
            )}
          >
            <div className="flex flex-col gap-0.5">{children}</div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { ActionMenu }
