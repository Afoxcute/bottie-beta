"use client";

import { motion } from "framer-motion";

interface MessageBubbleProps {
  role: string;
  text: string;
}

const COMBINED_RE =
  /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(https?:\/\/[^\s<)]+))/g;

/** Render basic markdown: **bold**, *italic*, `code`, URLs, and line breaks */
function renderMarkdown(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(COMBINED_RE.source, COMBINED_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-xs"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5]) {
      // URL
      parts.push(
        <a
          key={match.index}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sage underline underline-offset-2 decoration-sage/40 hover:decoration-sage"
        >
          {match[5]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Group lines into paragraphs and bullet lists */
function renderLines(lines: string[]) {
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let keyIdx = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${keyIdx++}`} className="space-y-1 pl-4">
        {bulletBuffer.map((item, i) => (
          <li
            key={i}
            className="list-disc font-body text-sm leading-relaxed text-ink marker:text-sage/50"
          >
            {renderMarkdown(item)}
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  for (const line of lines) {
    if (/^[-*]\s/.test(line)) {
      bulletBuffer.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushBullets();
      elements.push(
        <p
          key={`p-${keyIdx++}`}
          className="font-body text-sm leading-relaxed text-ink"
        >
          {renderMarkdown(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return elements;
}

export function MessageBubble({ role, text }: MessageBubbleProps) {
  if (!text.trim()) return null;

  if (role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        <div className="max-w-[80%] rounded-[1.4rem] bg-sage px-4 py-2.5">
          <p className="font-body text-sm leading-relaxed text-cream">
            {text}
          </p>
        </div>
      </motion.div>
    );
  }

  const lines = text.split("\n").filter((l) => l.trim());

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1.5">{renderLines(lines)}</div>
    </div>
  );
}
