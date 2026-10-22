"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  // A server action taking FormData and returning {ok} | {ok:false,error}.
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  fields?: Record<string, string>;
  label: string;
  ariaLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  // When set, asks for confirmation first (destructive actions).
  confirm?: { title: string; description: string; confirmLabel?: string };
  successMessage?: string;
};

// Small button that runs a server action, shows its error as a toast, and
// optionally asks for confirmation. Replaces the legacy admin's window.confirm.
export function RowAction({ action, fields = {}, label, ariaLabel, variant = "outline", size = "sm", disabled, confirm, successMessage }: Props) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) toast.error(result.error);
      else if (successMessage) toast.success(successMessage);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        aria-label={ariaLabel ?? label}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {label}
      </Button>
      {confirm && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel ?? "Eliminar"}
          cancelLabel="Cancelar"
          destructive
          onConfirm={run}
        />
      )}
    </>
  );
}
