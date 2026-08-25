export type DesignExercise = {
  id: string;
  title: string;
  body: string[];
};

export type VocabularyRow = {
  word: string;
  russian: string;
  example: string;
};

export function parseExercises(text: string, prefix = 'ex'): DesignExercise[] {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trimEnd());
  const result: DesignExercise[] = [];
  let current: DesignExercise | null = null;
  let intro: string[] = [];

  const flushIntro = () => {
    const body = intro.map((x) => x.trim()).filter(Boolean);
    if (body.length) {
      result.push({ id: `${prefix}-intro`, title: 'Start here', body });
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
      if (current) result.push(current);
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

  if (current) result.push(current);
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
  const text = `${exercise.title} ${exercise.body.join(' ')}`.toLocaleLowerCase();
  return /\b(say|speak|speaking|answer|tell|describe|talk|dialogue|dialog|ask|respond)\b/.test(text);
}
