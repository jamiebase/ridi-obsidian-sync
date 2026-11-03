const assert=require('node:assert/strict');
const {startBridge}=require('./bridge');
(async()=>{const key='a'.repeat(48);const bridge=await startBridge(()=>true,{port:0,token:key,timeoutMs:1000});assert.equal(bridge.token,key,'지정한 연결 토큰이 유지되어야 합니다');const r=await fetch(`http://127.0.0.1:${bridge.port}/import`,{method:'POST',headers:{'content-type':'application/json','x-ridi-token':key},body:'{}'});assert.equal(r.status,200);console.log('저장된 연결 코드 재사용 검사 통과');})().catch(e=>{console.error(e);process.exitCode=1;});
