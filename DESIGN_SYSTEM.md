# Мастерская уроков — DESIGN SYSTEM

## 1. Главный принцип

Учебник определяет **ЧТО** изучаем.

Lesson package определяет **КАК** изучаем: глубокая лексика, grammar practice + recycling, reading/listening, постепенное снятие опор, speaking transfer, Reverse Translation там, где уместно, CORE ~60 минут, большой RESERVE, HOMEWORK и VOCABULARY BANK.

Design version определяет **КАК ЭТО ВЫГЛЯДИТ И РАБОТАЕТ**. Она не должна сокращать или подменять методику ради красоты.

## 2. Режимы одного урока

1. **Teacher workspace** — внутренний кабинет Мастерской: AI-план, Teacher Pack, служебные данные, материалы.
2. **Interactive lesson** — чистый student-facing HTML без sidebar, курсов, настроек, credits и Teacher Pack.
3. **Print view** — A4 / печать / Save as PDF.
4. Позже: **Offline HTML** и экспорт выполненной работы.

Design version создаётся только по отдельному действию пользователя. Обычный «Собрать урок» не запускает дизайн автоматически.

## 3. Фирменные стили

### bright-kids — Bright Kids Workbook
Для Spotlight 2–5, phonics, beginner vocabulary и базовой grammar.
- характер: cheerful, clean, large, friendly;
- формы: rounded cards, крупные элементы, мягкие иллюстративные акценты;
- палитра: blue / purple / mint / yellow / coral;
- белый или очень светлый фон, readability first.

### teen-study — Teen Study Sheet
Для Spotlight 6–10, Starlight и подростков.
- характер: modern study guide, premium workbook;
- палитра: navy / electric blue / violet / teal;
- аккуратная сетка, clean icons, меньше декоративности;
- не выглядит детским.

### reading-magazine — Reading Magazine
Для reading-heavy уроков: hobbies, travel, culture, stories, collections.
- характер: editorial / magazine / scrapbook-light;
- крупный тематический заголовок, визуальные reading cards;
- задания чётко отделены от текста;
- визуально богатый, но печатный и читаемый.

### grammar-visual — Grammar Visual Board
Для grammar contrast, rules, clues, revision.
- характер: infographic + workbook;
- сравнения, panels, arrows, mini examples, visual clues;
- высокий контраст между грамматическими блоками;
- ярко, но структурировано.

### oge-exam-lab — OGE Exam Lab (planned)
Отдельная взрослая exam-prep система для ОГЭ: сине-фиолетовый lab / exam aesthetic, реальные FIPI/Navigator tasks, строгая структура.

## 4. Библиотека компонентов

Целевые компоненты HTML-renderer:
- HeroTitle
- TargetCard
- VocabularyGrid
- GrammarContrast
- ReadingMagazine
- PictureReadingCard
- SpeakingChallenge
- ExamTask
- QuickTransfer
- UsefulLanguage
- HomeworkCard
- VocabularyBank

KIE не должен каждый раз генерировать произвольный HTML/CSS. Он должен возвращать структурированные данные, а renderer Мастерской — применять стабильные компоненты и дизайн-токены.

## 5. MASTER prompt для будущего semantic design mapper

Ты — методист и арт-директор образовательных материалов по английскому языку.

Тебе передан УЖЕ СОБРАННЫЙ полноценный урок. Не меняй методическую цель урока и не превращай его в декоративную страницу.

ГЛАВНЫЙ ПРИНЦИП:
- школьный учебник определяет ЧТО изучаем;
- полный lesson package определяет КАК это изучаем;
- design version определяет КАК это красиво, понятно и удобно выглядит.

Урок должен сохранять:
- учебник как основу;
- глубокую отработку тематической лексики;
- grammar practice + recycling;
- reading/listening, если они есть;
- постепенное снятие опор;
- обязательный speaking transfer;
- Reverse Translation, если предусмотрен;
- полноценный CORE примерно на 60 минут;
- большой RESERVE;
- HOMEWORK;
- VOCABULARY BANK.

НЕ сокращай полноценный урок ради красивой верстки.
НЕ заменяй упражнения случайными декоративными заданиями.
НЕ добавляй ответы в student-facing version.
НЕ показывай служебные сведения об уровне ученика.

Для каждого упражнения определи:
1. section: vocabulary / grammar / reading / listening / speaking / exam / revision / reserve / homework;
2. exercise type: info-card / vocabulary-card / gap-fill / choose / matching / text-input / reading / true-false / multiple-choice / speaking / translation / open-answer / grammar-rule / image-supported;
3. title;
4. instruction;
5. student content;
6. answer fields / options;
7. visual emphasis;
8. whether an illustration materially helps;
9. print behaviour.

Визуальный стиль: {{DESIGN_STYLE}}
Возраст / класс: {{STUDENT_CONTEXT}}
Курс: {{COURSE}}
Тема / источник: {{SOURCE}}
Готовый урок: {{LESSON_PACKAGE}}

Верни структурированные данные. Не генерируй произвольный HTML и CSS. HTML и фирменный дизайн создаёт renderer Мастерской.

## 6. Student-facing privacy / UX

На чистом экране урока нельзя показывать:
- sidebar Мастерской;
- список учеников и курсов;
- «Срочную помощь»;
- Настройки;
- AI-план;
- credits;
- Teacher Pack;
- служебные заметки об уровне ученика.

Должны быть доступны только lesson content, ответы, progress, reset и print.
