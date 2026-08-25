import 'server-only';

import { Document, Packer, Paragraph, TextRun } from 'docx';

type Section = {
  title: string;
  content: string;
};

type LineKind = 'exercise' | 'subheading' | 'body';

type ParsedLine = {
  text: string;
  kind: LineKind;
};

function cleanInline(value: string) {
  return value
    .replace(/^#{1,4}\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trimEnd();
}

function lineKind(raw: string): LineKind {
  const line = cleanInline(raw).trim();
  if (!line) return 'body';

  if (/^(?:Exercise|Ex\.?|Task)\s*\d+\s*[.):-]?\s+\S/i.test(line)) return 'exercise';
  if (/^\d{1,2}\.\s+\S/.test(line)) return 'exercise';

  if (/^(?:Warm[- ]?up|Vocabulary|Grammar|Reading|Listening|Speaking|Writing|Pronunciation|Reverse Translation|Useful Phrases|Speaking Help|Teacher Notes?|Answers?|Answer Key|Key|Script|Timing)\b[:—-]?/i.test(line)) {
    return 'subheading';
  }
  if (/^[A-ZА-ЯЁ][A-ZА-ЯЁ0-9 /&'’—–-]{3,}$/.test(line)) return 'subheading';
  return 'body';
}

function makeParagraph(line: ParsedLine, keepNext = false) {
  const isExercise = line.kind === 'exercise';
  const isSubheading = line.kind === 'subheading';
  const text = cleanInline(line.text).trim();

  return new Paragraph({
    children: [new TextRun({
      text,
      font: 'Arial',
      size: isExercise ? 24 : isSubheading ? 23 : 22,
      bold: isExercise || isSubheading,
      color: isExercise ? '1E2A44' : isSubheading ? '334766' : '111827',
    })],
    spacing: {
      before: isExercise ? 150 : isSubheading ? 110 : 0,
      after: isExercise ? 75 : isSubheading ? 65 : 70,
      line: 276,
    },
    keepNext,
    keepLines: true,
    widowControl: true,
  });
}

function bodyParagraphs(text: string) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  const lines = rawLines.map((raw) => ({ text: raw, kind: lineKind(raw) } satisfies ParsedLine));
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const clean = cleanInline(line.text).trim();
    if (!clean) {
      paragraphs.push(new Paragraph({ spacing: { after: 70 } }));
      continue;
    }

    let keepNext = false;
    if (line.kind === 'exercise' || line.kind === 'subheading') {
      keepNext = true;
    } else {
      // Если строка находится внутри упражнения, стараемся держать весь блок вместе.
      let previousHeading = -1;
      for (let j = i - 1; j >= 0; j -= 1) {
        if (lines[j].kind === 'exercise') {
          previousHeading = j;
          break;
        }
        if (lines[j].kind === 'subheading') break;
      }
      if (previousHeading >= 0) {
        let nextExercise = -1;
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[j].kind === 'exercise' || lines[j].kind === 'subheading') {
            nextExercise = j;
            break;
          }
        }
        keepNext = nextExercise < 0 || i < nextExercise - 1;
      }
    }

    paragraphs.push(makeParagraph(line, keepNext));
  }

  return paragraphs;
}

export async function buildLessonDocx(params: {
  title: string;
  subtitle: string;
  sections: Section[];
}) {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({
        text: cleanInline(params.title),
        font: 'Arial',
        size: 34,
        bold: true,
        color: '17243D',
      })],
      spacing: { after: 100 },
      keepNext: true,
    }),
    new Paragraph({
      children: [new TextRun({
        text: cleanInline(params.subtitle),
        font: 'Arial',
        italics: true,
        size: 20,
        color: '64748B',
      })],
      spacing: { after: 240 },
      keepNext: true,
    }),
  ];

  for (const section of params.sections) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: cleanInline(section.title),
        font: 'Arial',
        size: 28,
        bold: true,
        color: '244B7A',
      })],
      spacing: { before: 220, after: 115 },
      keepNext: true,
      keepLines: true,
    }));
    children.push(...bodyParagraphs(section.content));
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22, color: '111827' },
          paragraph: { spacing: { line: 276, after: 70 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(document);
}
