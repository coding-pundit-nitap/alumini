"use client";

import { useId, useState } from "react";

import {
  ESCALATION_MESSAGES,
  type AccessOptions,
} from "../../domain/escalation";
import { ConfirmButton, type AccessAction } from "./confirm-button";
import { SELECT_CLASS } from "./labels";

/** Assign one role; options the actor may not assign are disabled with the reason (spec B12-3). */
export function AssignRoleDialog(props: {
  userId: string;
  current: string[];
  options: AccessOptions;
  disabledReason: string | undefined;
  action: AccessAction;
}) {
  const roleId = useId();
  const [role, setRole] = useState("");
  const choices = props.options.roles.filter(
    (r) => !props.current.includes(r.name)
  );
  const before = props.current.join(", ") || "none";

  return (
    <ConfirmButton
      label="Assign role"
      title="Assign a role"
      description={
        role
          ? `Roles: ${before} → ${[...props.current, role].join(", ")}`
          : `Roles: ${before}`
      }
      confirmLabel="Assign"
      fields={{ userId: props.userId, role }}
      ready={role !== ""}
      disabledReason={props.disabledReason}
      action={props.action}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={roleId} className="text-sm font-medium">
          Role
        </label>
        <select
          id={roleId}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            Choose a role
          </option>
          {choices.map((r) => (
            <option
              key={r.name}
              value={r.name}
              disabled={r.reason !== undefined}
            >
              {r.reason
                ? `${r.name} — ${ESCALATION_MESSAGES[r.reason]}`
                : r.name}
            </option>
          ))}
        </select>
      </div>
    </ConfirmButton>
  );
}
