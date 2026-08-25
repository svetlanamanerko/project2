# Мастерская уроков — Interactive Lesson Engine

## Главный принцип

Учебник определяет **ЧТО** изучаем. Lesson package определяет **КАК** нормально изучаем язык: vocabulary + chunks/collocations, grammar + recycling, reading/listening, постепенное снятие опор, speaking transfer, Reverse Translation где уместно, CORE ~60 минут, большой RESERVE, HOMEWORK и Vocabulary Bank.

Interactive/design layer определяет **КАК материал работает и выглядит на уроке**. Красота не заменяет методику.

## Один урок — несколько представлений

- Student Worksheet DOCX.
- Teacher Pack DOCX.
- Interactive HTML lesson.
- Print/PDF view.
- Clean version.
- Saved completed lesson.
- Offline export позже развивается поверх того же Lesson JSON.

Design version запускается только отдельным действием пользователя.

## Lesson JSON V1

KIE возвращает текстовый lesson package и одновременно структурированный `interactiveLesson`. Renderer не угадывает механику по заголовкам.

Поддерживаемые типы V1:

- `gap_fill`
- `dropdown`
- `true_false_ns`
- `multiple_choice`
- `matching`
- `sort`
- `open_answer`
- `speaking`
- `reading`
- `listening` — только когда есть реальный audio resource

Validator не позволяет показывать полусобранный интерактив ученику.

## Обязательное правило ресурса

Если инструкция требует объект, объект обязателен:

- Look at the picture → image/PDF resource.
- Listen → audio resource.
- Read the text → text/PDF resource.
- Sort → реальные draggable items + groups.
- Match → реальные left/right items.
- Choose → реальные options.

## Source Panel

Один resource может использоваться несколькими упражнениями.

Режимы:

- открыть в плавающем окне;
- закрепить справа;
- открыть крупно;
- масштаб `− 100% +`.

Resource может быть reading text, страницы учебника, picture/timetable/map/menu, grammar reference, word bank, audio.

## Sticky bank

Word/phrase/option bank может закрепляться внизу экрана, чтобы оставаться видимым при прокрутке. Особенно нужен для gap-fill, sort, matching headings и speaking support.

## Проверка

Объективные задания используют:

- Проверить;
- Попробовать ещё раз;
- Показать ответ.

Правильный/неправильный ответ получает визуальный feedback. Speaking/open answer не получают фальшивую автопроверку — только отметку «Выполнено».

## Fullscreen Lesson Player

Отдельный режим проведения Zoom-урока:

- Выйти;
- Task X из N;
- точки прогресса;
- Назад / Вперёд;
- стрелки клавиатуры;
- в центре только одно текущее упражнение;
- Source Panel и Sticky Bank продолжают работать.

## Сохранение

Ответы автоматически сохраняются локально. Кнопка «Сохранить работу» сохраняет состояние также в PostgreSQL. В дальнейшем история ученика должна позволять открыть выполненный экземпляр урока.

## Визуальная система

Стандартные темы:

- Bright Kids Workbook;
- Teen Study Sheet;
- Reading Magazine;
- Grammar Visual Board;
- позже OGE Exam Lab.

Стиль должен менять не только цвет, но и композицию, typography, cards, grammar/reference layout, reading presentation и visuals.

Visual Density:

- минимум;
- нормально;
- WOW.

WOW-визуал добавляется после того, как интерактивная механика задания функционально корректна.

## Media engine — следующий слой

Изображения: reusable asset library → source/course visual → AI generation только при необходимости.

Listening: script → TTS → MP3 → audio resource. Нельзя показывать `Listen...` без реального плеера.

## Архитектурная цепочка

Google Drive / учебник / Course Map → KIE lesson content → Lesson JSON → Validator → Interactive components → Fullscreen/Check/Save → Print/PDF/Offline.
