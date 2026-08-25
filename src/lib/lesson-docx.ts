import 'server-only';

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

type Section = {
  title: string;
  content: string;
};

function bodyParagraphs(text: string) {
  const lines = text.replace(/\r/g, '').split('\n');
  return lines.map((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) return new Paragraph({ spacing: { after: 80 } });

    const markdownHeading = line.match(/^#{1,3}\s+(.+)$/);
    if (markdownHeading) {
      return new Paragraph({
        text: markdownHeading[1].trim(),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 90 },
      });
    }

    return new Paragraph({
      children: [new TextRun({ text: line, size: 22 })],
      spacing: { after: 80, line: 300 },
    });
  });
}

export async function buildLessonDocx(params: {
  title: string;
  subtitle: string;
  sections: Section[];
}) {
  const children: Paragraph[] = [
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: params.subtitle, italics: true, size: 20 })],
      spacing: { after: 260 },
    }),
  ];

  for (const section of params.sections) {
    children.push(new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 120 },
    }));
    children.push(...bodyParagraphs(section.content));
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22 },
          paragraph: { spacing: { line: 300, after: 80 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(document);
}
