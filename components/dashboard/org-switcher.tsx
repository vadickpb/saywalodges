"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setActiveOrg } from "@/app/app/actions";

export type OrgSwitcherOption = { id: string; name: string };

type Props = { orgs: OrgSwitcherOption[]; activeOrgId: string };

// Only rendered by app/app/layout.tsx when the user has 2+ orgs — with
// exactly one, the layout just prints the org name as plain text instead.
export function OrgSwitcher({ orgs, activeOrgId }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={activeOrgId}
      disabled={isPending}
      onValueChange={(orgId) => startTransition(() => setActiveOrg(orgId))}
    >
      <SelectTrigger size="sm" aria-label="Organización activa" className="w-auto min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {orgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
