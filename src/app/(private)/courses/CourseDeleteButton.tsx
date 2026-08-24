'use client';

import { Trash2 } from 'lucide-react';
import { deleteCourse } from '../actions';

export function CourseDeleteButton({ courseId, title }: { courseId: string; title: string }) {
  return <form
    action={deleteCourse}
    onSubmit={(event) => {
      if (!window.confirm(`Удалить курс «${title}»? Это можно сделать только если курс ещё не связан с учениками.`)) {
        event.preventDefault();
      }
    }}
  >
    <input type="hidden" name="courseId" value={courseId}/>
    <button className="course-action danger" type="submit"><Trash2 size={15}/>Удалить</button>
  </form>;
}
