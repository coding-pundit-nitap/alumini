"use client";

import { useId, useState } from "react";

import { SUSPENSION_REASONS, type TargetState } from "../../domain/lifecycle";
import { ConfirmButton, type AccessAction } from "./confirm-button";
import { REASON_LABEL, SELECT_CLASS, TRANSITION } from "./labels";

/**
 * Suspend / deactivate / reinstate, with a required reason code when leaving
 * VERIFIED.
 */
export function AccountStateDialog(props: {
  userId: string;
  userName: string;
  to: TargetState;
  disabledReason: string | undefined;
  action: AccessAction;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const { verb, effect } = TRANSITION[props.to];
  const needsReason = props.to !== "VERIFIED";

  return (
    <ConfirmButton
      label={verb}
      variant={needsReason ? "destructive" : "default"}
      title={`${verb} ${props.userName}?`}
      description={effect}
      confirmLabel={`${verb} ${props.userName}`}
      fields={{
        userId: props.userId,
        accountState: props.to,
        reason: needsReason ? reason : undefined,
      }}
      ready={!needsReason || reason !== ""}
      disabledReason={props.disabledReason}
      action={props.action}
      onClose={() => setReason("")}
    >
      {needsReason ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason
          </label>
          <select
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {SUSPENSION_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </ConfirmButton>
  );
}
