import assert from 'node:assert/strict';
import { DIAGNOSTIC_OGE_SECTIONS, excludeUsedQids, isDiagnosticIntent, materialMatchScore, prioritizeMaterialBranches, rankByIntent, resolveCurrentAndNext } from '../src/lib/learning-context-utils.ts';
const tasks=[{qid:'same'},{qid:'new'}];
assert.deepEqual(excludeUsedQids(tasks,['same']),[{qid:'new'}]);
assert.deepEqual(excludeUsedQids(tasks,[]),tasks);
const ranked=rankByIntent([{id:'used',name:'old',path:'Block 3 / travelling.pdf'},{id:'best',name:'worksheet',path:'Block 3 / travelling speaking worksheet.docx'},{id:'other',name:'grammar',path:'Block 1 / articles.pdf'}],{topic:'Travelling',skill:'Speaking'},['used'],5);
assert.equal(ranked[0].id,'best'); assert.equal(ranked.some((x)=>x.id==='used'),false);
const map=[
  {id:'one',position:1,stage:'Start diagnostic',lesson:'Lesson 1',title:'Entry',intent:{}},
  {id:'two',position:2,stage:'Grammar',lesson:'Lesson 2',title:'Grammar',intent:{}},
  {id:'three',position:3,stage:'Reading',lesson:'Lesson 3',title:'Reading',intent:{}},
];
const manual={mapItemId:null,stage:'Start diagnostic',lesson:'Lesson 1'};
assert.deepEqual(resolveCurrentAndNext(map,manual,[],'enrollment'),{current:null,next:null,currentCompleted:false});
assert.equal(resolveCurrentAndNext(map,{...manual,mapItemId:'one'},[],'enrollment').current?.id,'one');
assert.equal(resolveCurrentAndNext(map,{...manual,mapItemId:'one'},[{enrollmentId:'enrollment',stage:'Start diagnostic',lesson:'Lesson 1',status:'partial'}],'enrollment').current?.id,'one');
assert.equal(resolveCurrentAndNext(map,{...manual,mapItemId:'one'},[{enrollmentId:'enrollment',stage:'Start diagnostic',lesson:'Lesson 1',status:'completed'}],'enrollment').current?.id,'two');
assert.equal(resolveCurrentAndNext(map,{...manual,mapItemId:'one'},[{enrollmentId:'enrollment',stage:'Start diagnostic',lesson:'Lesson 1',status:'completed'}],'enrollment').next?.id,'three');
assert.equal(isDiagnosticIntent({stage:'Старт ОГЭ — входная диагностика'}),true);
assert.deepEqual(DIAGNOSTIC_OGE_SECTIONS,['Grammar','Reading','Listening']);
assert.ok(materialMatchScore('OGE START — Student Name — Lesson 01 — Worksheet',{studentName:'Student Name',courseTitle:'ОГЭ 2027',stage:'Старт ОГЭ',lesson:'Урок 1'})>materialMatchScore('Block 5 grammar',{studentName:'Student Name',courseTitle:'ОГЭ 2027',stage:'Старт ОГЭ',lesson:'Урок 1'}));
const prioritized=prioritizeMaterialBranches([{path:'Block 5 grammar'},{path:'OGE START / Student Name / Lesson 01'},{path:'Fallback materials'}],{studentName:'Student Name',courseTitle:'ОГЭ 2027',stage:'Старт ОГЭ',lesson:'Урок 1'});
assert.equal(prioritized[0].path,'OGE START / Student Name / Lesson 01');
assert.equal(prioritized.length,3);
console.log('Learning context checks passed.');
