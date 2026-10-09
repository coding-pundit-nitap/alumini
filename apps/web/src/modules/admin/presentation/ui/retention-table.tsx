import { Badge } from "@nitap/ui/components/badge";

import type { RetentionSettingView } from "../../domain/retention";
import type { AccessAction } from "./confirm-button";
import { RETENTION_LABEL } from "./labels";
import { RetentionDialog } from "./retention-dialog";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** 12G: one row category, with its sign-off state and whether a sweep enforces it. */
export function RetentionTable(props: {
  settings: readonly RetentionSettingView[];
  action: AccessAction;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-left text-xs">
        <tr className="border-b">
          <th scope="col" className="px-4 py-2 font-medium">
            Category
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Days
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Sign-off
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Last changed
          </th>
          <th scope="col" className="px-4 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.settings.map((s) => (
          <tr key={s.category} className="border-b last:border-0">
            <th scope="row" className="px-4 py-3 text-left font-medium">
              {RETENTION_LABEL[s.category] ?? s.category}
              {!s.enforced && (
                <span className="text-muted-foreground block text-xs font-normal">
                  Not enforced yet
                </span>
              )}
            </th>
            <td className="px-4 py-3 text-right tabular-nums">
              {s.retentionDays.toLocaleString("en-IN")}
            </td>
            <td className="px-4 py-3">
              {s.approvedBy ? (
                <span>{s.approvedBy}</span>
              ) : (
                <Badge variant="outline">Placeholder</Badge>
              )}
            </td>
            <td className="text-muted-foreground px-4 py-3">
              {s.updatedBy
                ? `${dateFormat.format(s.updatedAt)} by ${s.updatedBy.name}`
                : "Default"}
            </td>
            <td className="px-4 py-3 text-right">
              <RetentionDialog setting={s} action={props.action} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
