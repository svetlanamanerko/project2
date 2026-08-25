import assert from 'node:assert/strict';
import { excludeUsedQids, rankByIntent } from '../src/lib/learning-context-utils.ts';
const tasks=[{qid:'same'},{qid:'new'}];
assert.deepEqual(excludeUsedQids(tasks,['same']),[{qid:'new'}]);
assert.deepEqual(excludeUsedQids(tasks,[]),tasks);
const ranked=rankByIntent([{id:'used',name:'old',path:'Block 3 / travelling.pdf'},{id:'best',name:'worksheet',path:'Block 3 / travelling speaking worksheet.docx'},{id:'other',name:'grammar',path:'Block 1 / articles.pdf'}],{topic:'Travelling',skill:'Speaking'},['used'],5);
assert.equal(ranked[0].id,'best'); assert.equal(ranked.some((x)=>x.id==='used'),false);
console.log('Learning context checks passed.');
