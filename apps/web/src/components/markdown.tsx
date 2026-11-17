import React from "react";

type Inline = string | React.ReactNode;

function inline(text: string, keyBase: string): Inline[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;
  const parts = text.split(pattern).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function renderProse(text: string, keyBase: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(<p key={`${keyBase}-p-${out.length}`}>{inline(paragraph.join(" "), `${keyBase}-p${out.length}`)}</p>);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      React.createElement(
        Tag,
        { key: `${keyBase}-l-${out.length}` },
        list.items.map((item, i) => (
          <li key={`${keyBase}-li-${i}`}>{inline(item, `${keyBase}-li-${i}`)}</li>
        )),
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^```/.test(line)) continue;

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const Tag = (`h${level}` as unknown) as "h1";
      out.push(
        React.createElement(Tag, { key: `${keyBase}-h-${out.length}` }, inline(heading[2], `${keyBase}-h${out.length}`)),
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      out.push(<hr key={`${keyBase}-hr-${out.length}`} />);
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      out.push(
        <blockquote key={`${keyBase}-q-${out.length}`}>{inline(quote[1], `${keyBase}-q${out.length}`)}</blockquote>,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return out;
}

/** A deliberately tiny markdown renderer: no dependencies, no HTML injection. */
export function Markdown({ text }: { text: string }) {
  const segments = text.split(/```/);
  const nodes: React.ReactNode[] = [];

  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const lines = segment.split("\n");
      const language = lines[0]?.trim() ?? "";
      const code = (language && !language.includes(" ") ? lines.slice(1) : lines).join("\n");
      nodes.push(
        <pre key={`code-${index}`}>
          <code data-language={language}>{code.replace(/\n$/, "")}</code>
        </pre>,
      );
    } else if (segment.trim()) {
      nodes.push(...renderProse(segment, `seg-${index}`));
    }
  });

  return <div className="prose-mini">{nodes}</div>;
}
