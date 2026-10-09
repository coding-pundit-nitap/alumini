import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";

/** First-run cards for a member with nothing on their dashboard yet. */
export function Guidance({ batch }: { batch: number | null }) {
  const cards = [
    {
      title: "Complete your profile",
      body: "Help batchmates recognise you.",
      href: "/profile/details",
    },
    {
      title: "Find people from your batch",
      body: "Search the directory to reconnect.",
      href: batch ? `/directory?graduationYear=${batch}` : "/directory",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Link key={card.title} href={card.href}>
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.body}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
