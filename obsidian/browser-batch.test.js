const assert=require('node:assert/strict');const {validateSelection,safeTitle,planTargets}=require('./browser-batch');
assert.deepEqual(validateSelection('12,34'),['12','34']);assert.throws(()=>validateSelection('12,12'),/중복/);assert.throws(()=>validateSelection('../12'),/올바르지/);assert.throws(()=>validateSelection(''),/선택/);
assert.equal(safeTitle('개정판 | 제목 / 책'),'개정판 - 제목 - 책.md');assert.equal(safeTitle('책 [개정]'),'책 - 개정 -.md');assert.throws(()=>safeTitle('..'),/제목/);
let rows=[{file:{path:'기존.md'},text:'',frontmatter:{ridi_book_id:'12'}}];let x=planTargets(['12','34'],rows);assert.equal(x.targets[0].file.path,'기존.md');assert.equal(x.targets[1].file,null);
x=planTargets(['12'],[...rows,{file:{path:'중복.md'},text:'',frontmatter:{ridi_book_id:'12'}}]);assert.equal(x.targets.length,0);assert.equal(x.errors.length,2);
x=planTargets(['12'],[{file:{path:'충돌.md'},text:'<!-- ridi:15:annotation_1 -->',frontmatter:{ridi_book_id:'12'}}]);assert.equal(x.targets.length,0);assert.equal(x.errors.length,1);
console.log('선택 검증, 노트 연결, 중복 및 파일명 검사 통과');
