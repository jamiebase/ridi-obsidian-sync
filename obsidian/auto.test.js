const assert=require('node:assert/strict');const {getBookId}=require('./book');
assert.equal(getBookId('<!-- ridi:123:annotation_1 -->\n<!-- ridi:123:annotation_2 -->'),'123');
assert.throws(()=>getBookId('없음'),/찾지 못/);
assert.throws(()=>getBookId('<!-- ridi:123:annotation_1 -->\n<!-- ridi:456:annotation_2 -->'),/여러/);
console.log('책 ID 식별 검사 통과');
