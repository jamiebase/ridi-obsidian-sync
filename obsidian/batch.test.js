const assert=require('node:assert/strict');const {selectBatch,collectBatch,applyBatch}=require('./batch');
const row=(path,id,text='')=>({file:{path},text,frontmatter:id===undefined?{}:{ridi_book_id:id}});
(async()=>{
 const rows=[row('a','1'),row('b','2'),row('duplicate','2'),row('none',undefined),row('bad','x'),row('mismatch','3','<!-- ridi:4:annotation_1 -->')];
 let {selected,errors}=selectBatch(rows);assert.deepEqual(selected.map(x=>x.bookId),['1']);assert.equal(errors.length,4);
 const conflictDuplicate=selectBatch([row('valid','9'),row('conflict','9','<!-- ridi:8:annotation_1 -->')]);assert.equal(conflictDuplicate.selected.length,0);assert.equal(conflictDuplicate.errors.length,2);
 const order=[];const collected=await collectBatch(selected,async item=>{order.push(item.bookId);return {bookId:item.bookId}},()=>false);assert.deepEqual(order,['1']);assert.equal(collected[0].data.bookId,'1');
 let state={'a':'original','b':'original'};let writes=[];const app={vault:{process:async(f,cb)=>{state[f.path]=cb(state[f.path]);writes.push(f.path)}},fileManager:{processFrontMatter:async()=>{throw Error('unexpected')}}};
 const targets=[{file:{path:'a'},snapshot:'original',result:{text:'updated',added:1},bookId:'1'},{file:{path:'b'},snapshot:'before',result:{text:'updated',added:1},bookId:'2'}];
 const out=await applyBatch(app,targets,()=>({ridi_book_id:'1'}));assert.deepEqual(writes,['a']);assert.equal(out[0].ok,true);assert.equal(out[1].ok,false);assert.equal(state.b,'original');
 let applyCalls=0;state={a:'original',b:'before'};writes=[];const interrupted=await applyBatch(app,targets,()=>({ridi_book_id:'1'}),()=>{applyCalls++},()=>applyCalls>0);assert.equal(interrupted.length,1);assert.deepEqual(writes,['a']);
 let calls=0;const stopped=await collectBatch([row('c','3'),row('d','4')].map((r,i)=>({...r,bookId:String(i+3)})),async()=>{calls++;return {}},()=>calls>0);assert.equal(calls,1);assert.equal(stopped.length,1);
 console.log('일괄 대상 선별, 중복, 순차 수집, 취소 및 부분 실패 검사 통과');
})().catch(e=>{console.error(e);process.exitCode=1});
