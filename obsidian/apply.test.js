const assert=require('node:assert/strict');const {applyImport}=require('./apply');
(async()=>{
 let content='# 노트',fm={},writes=0;
 const app={vault:{process:async(_f,fn)=>{content=fn(content);writes++;}},fileManager:{processFrontMatter:async(_f,fn)=>{fn(fm);}}};
 const readFm=()=>fm; const merge=()=>({text:'# 노트\n<!-- ridi:123:annotation_1 -->',added:1});
 await applyImport(app,{},'# 노트',{text:merge().text,added:1},'123',readFm,merge);
 assert.equal(fm.ridi_book_id,'123');assert.ok(content.includes('annotation_1'));assert.equal(writes,1);
 content='다른 변경';await assert.rejects(applyImport(app,{},'# 노트',{text:'바뀜',added:1},'123',readFm,merge),/변경/);assert.equal(content,'다른 변경');
 fm={ridi_book_id:'456'};content='# 노트';await assert.rejects(applyImport(app,{},'# 노트',{text:'바뀜',added:1},'123',readFm,merge),/다릅니다/);assert.equal(content,'# 노트');
 fm={};content='# 노트';app.fileManager.processFrontMatter=async()=>{throw Error('metadata failure')};await assert.rejects(applyImport(app,{},'# 노트',{text:'추가됨',added:1},'123',readFm,merge),/밑줄은 저장/);assert.equal(content,'추가됨');
 console.log('속성 저장, 충돌, 동시 변경, 부분 실패 검사 통과');
})().catch(e=>{console.error(e);process.exitCode=1});
