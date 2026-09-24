import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="w-full max-w-md lg:border-0 lg:bg-transparent">
      <CardHeader>
        <CardTitle className="font-display text-3xl font-normal">
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {footer ? (
        <CardFooter className="text-muted-foreground text-sm lg:bg-transparent">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
