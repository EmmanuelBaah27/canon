import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('fixed top-(--spacing-dialog-top) left-1/2 z-50 flex w-[min(92vw,var(--spacing-dialog-max))] -translate-x-1/2 flex-col rounded-(--radius-shell) bg-popover text-popover-foreground shadow-window outline-none', className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close aria-label="Close" className="absolute top-3 right-3 grid size-7 place-items-center rounded-control-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription }
