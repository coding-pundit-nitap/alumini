"use client";

import { useId, useState } from "react";

import { Input } from "@nitap/ui/components/input";

import type { RetentionSettingView } from "../../domain/retention";
import { ConfirmButton, type AccessAction } from "./confirm-button";
import { RETENTION_LABEL } from "./labels";

/** Edit one category's period and sign-off; bounds are shown and re-checked on the server. */
export function RetentionDialog(props: {
  setting: RetentionSettingView;
  action: AccessAction;
}) {
  const { setting } = props;
  const daysId = useId();
  const approvedId = useId();
  const hintId = useId();
  const [days, setDays] = useState(String(setting.retentionDays));
  const [approvedBy, setApprovedBy] = useState(setting.approvedBy ?? "");
  const label = RETENTION_LABEL[setting.category] ?? setting.category;
  const reset = () => {
    setDays(String(setting.retentionDays));
    setApprovedBy(setting.approvedBy ?? "");
  };

  return (
    <ConfirmButton
      label="Edit"
      title={`Retention: ${label}`}
      description="The new period applies from the next sweep. Leave the sign-off empty while the value is still a placeholder."
      confirmLabel="Save"
      fields={{ category: setting.category, retentionDays: days, approvedBy }}
      ready={days.trim() !== ""}
      action={props.action}
      onClose={reset}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={daysId} className="text-sm font-medium">
            Days
          </label>
          <Input
            id={daysId}
            type="number"
            inputMode="numeric"
            min={setting.minDays}
            max={setting.maxDays}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-describedby={hintId}
          />
          <p id={hintId} className="text-muted-foreground text-xs">
            Between {setting.minDays} and {setting.maxDays} days.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={approvedId} className="text-sm font-medium">
            Approved by
          </label>
          <Input
            id={approvedId}
            value={approvedBy}
            maxLength={200}
            placeholder="e.g. Registrar, 2026-10-01"
            onChange={(e) => setApprovedBy(e.target.value)}
          />
        </div>
      </div>
    </ConfirmButton>
  );
}
