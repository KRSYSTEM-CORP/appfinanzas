"use client"

// Hoja inferior de la preview (data-kr="sheet": ancho máx. 560px, radio 24px 24px 0 0,
// padding 18px 18px 22px, pegada abajo, alto máx. 88vh). Comparte la base con dialog.tsx:
// todos los formularios, detalles y confirmaciones de la app se abren como hoja.
export {
  Dialog as Sheet,
  DialogClose as SheetClose,
  DialogContent as SheetContent,
  DialogDescription as SheetDescription,
  DialogFooter as SheetFooter,
  DialogHeader as SheetHeader,
  DialogOverlay as SheetOverlay,
  DialogPortal as SheetPortal,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from "@/components/ui/dialog"
