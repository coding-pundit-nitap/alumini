"use client";

import { Input } from "@nitap/ui/components/input";
import { useId, useState } from "react";

import {
  ESCALATION_MESSAGES,
  type AccessOptions,
} from "../../domain/escalation";
import { ConfirmButton, type AccessAction } from "./confirm-button";
import { SELECT_CLASS } from "./labels";

type Reason = AccessOptions["permissions"][number]["chapter"];
const message = (reason: Reason) =>
  reason === undefined
    ? undefined
    : reason === "NOT_SCOPABLE"
      ? "This permission cannot be scoped to a chapter."
      : ESCALATION_MESSAGES[reason];
/** `datetime-local` wants local wall time without an offset. Only rendered while open, so client-only. */
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const withReason = (label: string, reason: Reason) =>
  reason ? `${label} — ${message(reason)}` : label;

/** Issue one permission grant, globally or in a chapter, optionally expiring (spec B12-3, B12-14). */
export function GrantPermissionDialog(props: {
  userId: string;
  options: AccessOptions;
  chapters: { id: string; slug: string }[];
  disabledReason: string | undefined;
  action: AccessAction;
}) {
  const ids = {
    permission: useId(),
    scope: useId(),
    chapter: useId(),
    expires: useId(),
  };
  const [permission, setPermission] = useState("");
  const [scope, setScope] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [expires, setExpires] = useState("");
  const chosen = props.options.permissions.find(
    (p) => p.permission === permission
  );
  const isChapter = scope === "CHAPTER";

  return (
    <ConfirmButton
      label="Grant permission"
      title="Grant a permission"
      description="The grant takes effect on their next request."
      confirmLabel="Grant"
      fields={{
        userId: props.userId,
        permission,
        scope,
        chapterId: isChapter ? chapterId : undefined,
        // An explicit instant, so the server never guesses the admin's time zone.
        expiresAt: expires ? new Date(expires).toISOString() : undefined,
      }}
      ready={
        permission !== "" && scope !== "" && (!isChapter || chapterId !== "")
      }
      disabledReason={props.disabledReason}
      action={props.action}
      onClose={() => {
        setPermission("");
        setScope("");
        setChapterId("");
        setExpires("");
      }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.permission} className="text-sm font-medium">
            Permission
          </label>
          <select
            id={ids.permission}
            value={permission}
            onChange={(e) => {
              setPermission(e.target.value);
              setScope("");
            }}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              Choose a permission
            </option>
            {props.options.permissions.map((p) => {
              const blocked = p.global !== undefined && p.chapter !== undefined;
              return (
                <option
                  key={p.permission}
                  value={p.permission}
                  disabled={blocked}
                >
                  {blocked ? withReason(p.permission, p.global) : p.permission}
                </option>
              );
            })}
          </select>
        </div>
        {chosen ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.scope} className="text-sm font-medium">
              Scope
            </label>
            <select
              id={ids.scope}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Choose a scope
              </option>
              <option value="GLOBAL" disabled={chosen.global !== undefined}>
                {withReason("Global", chosen.global)}
              </option>
              <option value="CHAPTER" disabled={chosen.chapter !== undefined}>
                {withReason("Chapter", chosen.chapter)}
              </option>
            </select>
          </div>
        ) : null}
        {isChapter ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.chapter} className="text-sm font-medium">
              Chapter
            </label>
            <select
              id={ids.chapter}
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Choose a chapter
              </option>
              {props.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.slug}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.expires} className="text-sm font-medium">
            Expires (optional)
          </label>
          <Input
            id={ids.expires}
            type="datetime-local"
            min={localNow()}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </div>
      </div>
    </ConfirmButton>
  );
}
