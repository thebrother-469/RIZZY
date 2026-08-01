import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function CodeBlock({
  inline,
  className,
  children,
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? "").replace(/\n$/, "");

  if (inline) {
    return (
      <code className="rounded bg-secondary/60 px-1.5 py-0.5 text-[0.85em] font-mono text-gold">
        {children}
      </code>
    );
  }

  const lang = /language-(\w+)/.exec(className || "")?.[1];

  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-border/60 bg-background/60">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-secondary/30">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* noop */
            }
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={11} /> Copied
            </>
          ) : (
            <>
              <Copy size={11} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed font-mono">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export const MessageContent = memo(function MessageContent({ text }: { text: string }) {
  const isSafeHref = (href: string | undefined): boolean => {
    if (!href) return false;
    const trimmed = href.trim().toLowerCase();
    if (
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("vbscript:") ||
      trimmed.startsWith("file:")
    ) {
      return false;
    }
    return (
      trimmed.startsWith("http:") ||
      trimmed.startsWith("https:") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("/") ||
      trimmed.startsWith("#")
    );
  };
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as never,
          a: ({ children, href }) => {
            const safe = isSafeHref(href);
            if (!safe) {
              return <span className="text-gold underline underline-offset-2">{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold underline underline-offset-2 hover:text-primary transition"
              >
                {children}
              </a>
            );
          },
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-gold/60 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h3 className="mt-2 mb-1 text-base font-bold">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-bold">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-1.5 mb-1 text-sm font-semibold">{children}</h4>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border/60 bg-secondary/40 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-border/40 px-2 py-1">{children}</td>,
          p: ({ children }) => (
            <p className="my-1 first:mt-0 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          hr: () => <hr className="my-3 border-border/60" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
