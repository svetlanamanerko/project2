export type ExerciseKind = 'vocabulary' | 'gap-fill' | 'speaking' | 'grammar' | 'reading' | 'matching' | 'choice' | 'translation' | 'practice';

export type DesignExercise = {
  id: string;
  title: string;
  body: string[];
  kind: ExerciseKind;
};

export type VocabularyRow = {
  word: string;
  russian: string;
  example: string;
};

function classify(title: string, body: string[]): ExerciseKind {
  const text = `${title} ${body.join(' ')}`.toLocaleLowerCase();
  if (/\b(say|speak|speaking|answer|tell|describe|talk|dialogue|dialog|ask|respond|role.?play)\b/.test(text)) return 'speaking';
  if (/\b(grammar|rule|rules|tense|present simple|present continuous|past simple|future|article|preposition|comparative|superlative|word formation)\b/.test(text)) return 'grammar';
  if (/\b(read|reading|text|article|story|paragraph)\b/.test(text) && body.join(' ').length > 180) return 'reading';
  if (/\b(match|matching|connect|pair)\b/.test(text)) return 'matching';
  if (/\b(choose|circle|multiple choice|option|select)\b/.test(text)) return 'choice';
  if (/\b(translate|translation|reverse translation)\b/.test(text)) return 'translation';
  if (body.some((line) => /_{1,}/.test(line)) || /\b(gap|complete|missing|fill)\b/.test(text)) return 'gap-fill';
  if (/\b(word|words|vocabulary|lexis|spell|alphabet|letter|letters|look and say|look, say)\b/.test(text)) return 'vocabulary';
  return 'practice';
}

export function parseExercises(text: string, prefix = 'ex'): DesignExercise[] {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd());
  const result: DesignExercise[] = [];
  let current: Omit<DesignExercise, 'kind'> | null = null;
  let intro: string[] = [];

  const finish = (item: Omit<DesignExercise, 'kind'>) => ({ ...item, kind: classify(item.title, item.body) });

  const flushIntro = () => {
    const body = intro.map((x) => x.trim()).filter(Boolean);
    if (body.length) {
      const item = { id: `${prefix}-intro`, title: 'Start here', body };
      result.push(finish(item));
    }
    intro = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current && current.body.length && current.body[current.body.length - 1] !== '') current.body.push('');
      else if (!current && intro.length && intro[intro.length - 1] !== '') intro.push('');
      continue;
    }

    const heading = line.match(/^(\d{1,2})\.\s+(.+)$/);
    if (heading) {
      if (!current) flushIntro();
      if (current) result.push(finish(current));
      current = {
        id: `${prefix}-${heading[1]}-${result.length + 1}`,
        title: `${heading[1]}. ${heading[2].trim()}`,
        body: [],
      };
      continue;
    }

    if (current) current.body.push(line);
    else intro.push(line);
  }

  if (current) result.push(finish(current));
  else flushIntro();

  return result.filter((item) => item.title || item.body.length);
}

export function parseVocabulary(text: string): VocabularyRow[] {
  const rows: VocabularyRow[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim().replace(/^[-•]\s*/, '');
    if (!line) continue;
    const parts = line.split(/\s+[—–-]\s+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      rows.push({
        word: parts[0],
        russian: parts[1],
        example: parts.slice(2).join(' — '),
      });
    }
  }
  return rows;
}

export function isSpeakingExercise(exercise: DesignExercise) {
  return exercise.kind === 'speaking';
}

export function extractVocabularyTiles(exercise: DesignExercise) {
  const tiles: Array<{ label: string; value: string }> = [];
  for (const line of exercise.body) {
    const clean = line.trim();
    const letterPair = clean.match(/^([A-Za-z]{1,3})\s*[-–—]\s*(.+)$/);
    if (letterPair) {
      tiles.push({ label: letterPair[1], value: letterPair[2] });
      continue;
    }
    const numbered = clean.match(/^\d+[.)]\s*(.+)$/);
    if (numbered && numbered[1].length < 45) tiles.push({ label: String(tiles.length + 1), value: numbered[1] });
  }
  return tiles;
}
