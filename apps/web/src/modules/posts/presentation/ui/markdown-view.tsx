"use client";

import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * Renders Post.content / Comment.body (raw Markdown source) through an explicit allow-list: bold,
 * italic, links, lists only. No images, headings or raw HTML — this is the ONLY place these strings are
 * ever rendered, so there is no server-side sanitization step; the allow-list here is the whole defense.
 */
const schema = {
  ...defaultSchema,
  tagNames: ["strong", "em", "a", "ul", "ol", "li", "p", "br"],
  attributes: {
    a: ["href"],
  },
};

export function MarkdownView({ content }: { content: string }) {
  return (
    <Markdown
      allowedElements={["strong", "em", "a", "ul", "ol", "li", "p", "br"]}
      unwrapDisallowed
      rehypePlugins={[[rehypeSanitize, schema]]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </Markdown>
  );
}
