"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Colocated under app/app/ui/ (not a route — no page.tsx here) since these
// pieces need client-side state/handlers that the showcase page itself,
// a Server Component reading the theme cookie, can't have directly.

export function DatePickerDemo() {
  const [date, setDate] = useState<Date>();
  return <DatePicker value={date} onChange={setDate} />;
}

export function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete booking
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this booking?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setOpen(false);
          toast.success("Booking deleted");
        }}
      />
    </>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast.success("Booking confirmed")}>
        Success
      </Button>
      <Button variant="outline" onClick={() => toast.warning("Payment pending")}>
        Warning
      </Button>
      <Button variant="outline" onClick={() => toast.error("Payment failed")}>
        Error
      </Button>
      <Button variant="outline" onClick={() => toast.info("New quote request")}>
        Info
      </Button>
    </div>
  );
}
