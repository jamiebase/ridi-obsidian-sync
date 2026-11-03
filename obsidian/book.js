function getBookId(text, frontmatter = {}, required = true) {
 const markers = new Set([...text.matchAll(/<!-- ridi:(\d+):annotation_\d+ -->/g)].map(m => m[1]));
 if (markers.size > 1) throw Error('노트에 리디 책 ID가 여러 개 있습니다. 자동 가져오기를 중단합니다.');
 let property;
 if (Object.prototype.hasOwnProperty.call(frontmatter, 'ridi_book_id')) {
  const value = frontmatter.ridi_book_id;
  if (!((typeof value === 'string' && /^\d+$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0))) throw Error('ridi_book_id 속성이 올바르지 않습니다.');
  property = String(value);
 }
 const marker = [...markers][0];
 if (property && marker && property !== marker) throw Error('ridi_book_id 속성과 밑줄의 책 ID가 다릅니다.');
 const id = property || marker;
 if (!id && required) throw Error('노트에서 리디 책 ID를 찾지 못했습니다. 먼저 기존 방식으로 한 번 가져오세요.');
 return id || null;
}
function verifyBookId(text, frontmatter, incoming) {
 const id = getBookId(text, frontmatter, false);
 if (id && id !== String(incoming)) throw Error('가져온 책 ID와 노트의 책 ID가 다릅니다.');
 return id;
}
module.exports={getBookId,verifyBookId};
