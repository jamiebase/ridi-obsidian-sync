function getBookId(text){const ids=new Set([...text.matchAll(/<!-- ridi:(\d+):annotation_\d+ -->/g)].map(m=>m[1]));if(ids.size===0)throw Error('노트에서 리디 책 ID를 찾지 못했습니다. 먼저 기존 방식으로 한 번 가져오세요.');if(ids.size!==1)throw Error('노트에 리디 책 ID가 여러 개 있습니다. 자동 가져오기를 중단합니다.');return [...ids][0];}
module.exports={getBookId};
