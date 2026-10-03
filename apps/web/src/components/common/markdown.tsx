import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Renders the Markdown subset issue bodies use: headings, paragraphs, lists,
 * fenced code, inline code, bold and links. Output is React elements, never
 * raw HTML, so issue text cannot inject markup.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string };

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i++;
    } else if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) code.push(lines[i++] ?? '');
      i++;
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (HEADING.test(line)) {
      const [, hashes = '#', text = ''] = HEADING.exec(line) ?? [];
      blocks.push({ kind: 'heading', level: hashes.length, text });
      i++;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i] ?? '')) items.push(pattern.exec(lines[i++] ?? '')?.[1] ?? '');
      blocks.push({ kind: 'list', ordered, items });
    } else {
      const text: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.trim() === '' || next.startsWith('```') || HEADING.test(next) || BULLET.test(next) || NUMBERED.test(next)) break;
        text.push(next.trim());
        i++;
      }
      blocks.push({ kind: 'paragraph', text: text.join(' ') });
    }
  }
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [whole, code, bold, linkText, href] = match;
    if (code) {
      out.push(
        <code key={index} className="data rounded-[4px] border bg-surface-2 px-1 py-px text-[0.88em] text-fg">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      out.push(<strong key={index} className="font-semibold text-fg">{bold.slice(2, -2)}</strong>);
    } else if (linkText && href) {
      out.push(
        <a key={index} href={href} target="_blank" rel="noreferrer" className="text-brand underline-offset-4 hover:underline">
          {linkText}
        </a>,
      );
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  if (blocks.length === 0) return <p className={cn('text-body text-fg-subtle', className)}>No description provided.</p>;

  return (
    <div className={cn('space-y-4 text-body text-fg-muted', className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h3 key={i} className={cn('font-semibold text-fg', block.level <= 2 ? 'pt-2 text-[17px]' : 'text-[15px]')}>
                {renderInline(block.text)}
              </h3>
            );
          case 'paragraph':
            return <p key={i}>{renderInline(block.text)}</p>;
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={i} className={cn('space-y-1.5 pl-5', block.ordered ? 'list-decimal' : 'list-disc', 'marker:text-fg-subtle')}>
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(item)}
                  </li>
                ))}
              </List>
            );
          }
          case 'code':
            return (
              <pre key={i} className="data overflow-x-auto rounded-md border bg-surface-1 p-4 text-[13px] leading-relaxed text-fg">
                <code>{block.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
