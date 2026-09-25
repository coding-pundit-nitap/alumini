"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nitap/ui/components/alert-dialog";
import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { Label } from "@nitap/ui/components/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@nitap/ui/components/tabs";
import { Textarea } from "@nitap/ui/components/textarea";

import type { ActionResult } from "@/lib/action-result";

import { MarkdownView } from "./markdown-view";

type Publish = (input: {
  title: string;
  content: string;
}) => Promise<ActionResult<{ postId: string }>>;

/** Phase 12E (spec E-9): title + Markdown body with a preview; publishing asks for confirmation because it emails everyone. */
export function AnnouncementComposer({ onPublish }: { onPublish: Publish }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready =
    title.trim().length > 0 &&
    title.trim().length <= 120 &&
    content.trim().length > 0;

  function publish() {
    startTransition(async () => {
      const result = await onPublish({
        title: title.trim(),
        content: content.trim(),
      });
      if (result.ok) {
        setTitle("");
        setContent("");
        setError(null);
        router.refresh();
      } else {
        setError(result.error.message);
      }
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-title">Title</Label>
        <Input
          id="announcement-title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="flex flex-col gap-1.5">
          <Label htmlFor="announcement-body">Message</Label>
          <Textarea
            id="announcement-body"
            rows={8}
            maxLength={5000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </TabsContent>
        <TabsContent
          value="preview"
          className="min-h-40 rounded-lg border p-4 text-[15px]"
        >
          {content.trim() ? (
            <MarkdownView content={content} />
          ) : (
            <p className="text-muted-foreground">Nothing to preview yet.</p>
          )}
        </TabsContent>
      </Tabs>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          disabled={!ready || pending}
          onClick={() => setConfirming(true)}
        >
          Publish
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              Every member is notified in the app and by email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={publish}>
              Publish and notify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
