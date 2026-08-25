export const DESIGN_STYLES = [
  {
    id: 'bright-kids',
    icon: '🌈',
    title: 'Bright Kids Workbook',
    short: 'Яркий школьный',
    description: 'Spotlight 2–5 · крупно, дружелюбно, цветно',
  },
  {
    id: 'teen-study',
    icon: '⚡',
    title: 'Teen Study Sheet',
    short: 'Современный teen',
    description: 'Spotlight 6–10 / Starlight · clean study guide',
  },
  {
    id: 'reading-magazine',
    icon: '📖',
    title: 'Reading Magazine',
    short: 'Журнальный reading',
    description: 'Тексты, stories, travel, hobbies, culture',
  },
  {
    id: 'grammar-visual',
    icon: '🧠',
    title: 'Grammar Visual Board',
    short: 'Наглядная grammar',
    description: 'Rules, contrast, clues, revision',
  },
] as const;

export type DesignStyleId = typeof DESIGN_STYLES[number]['id'];

export const DEFAULT_DESIGN_STYLE: DesignStyleId = 'teen-study';

export function normalizeDesignStyle(value: string | null | undefined): DesignStyleId {
  return DESIGN_STYLES.some((style) => style.id === value)
    ? value as DesignStyleId
    : DEFAULT_DESIGN_STYLE;
}

export function getDesignStyle(value: string | null | undefined) {
  const id = normalizeDesignStyle(value);
  return DESIGN_STYLES.find((style) => style.id === id) || DESIGN_STYLES[1];
}
