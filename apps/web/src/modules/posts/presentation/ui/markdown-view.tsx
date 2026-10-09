"use client";

import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * The only place post and comment Markdown is rendered, so this allow-list (bold, italic, links,
 * lists) is the whole defense. No images, headings or raw HTML.
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
