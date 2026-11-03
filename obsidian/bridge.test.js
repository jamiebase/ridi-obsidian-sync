const assert=require('node:assert/strict');
const {startBridge}=require('./bridge');
(async()=>{let received=[];const bridge=await startBridge(payload=>{received.push(payload);return true},{port:0,timeoutMs:3000,vaultName:'내 보관함'});
let status=await fetch(`http://127.0.0.1:${bridge.port}/status`,{headers:{'x-ridi-token':bridge.token}});assert.equal((await status.json()).vaultName,'내 보관함');
let url=`http://127.0.0.1:${bridge.port}/import`;
let response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-ridi-token':'wrong'},body:'{}'});assert.equal(response.status,403);assert.equal(received.length,0);
response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-ridi-token':bridge.token},body:'{"value":1}'});assert.equal(response.status,200);assert.deepEqual(received,[{value:1}]);
assert.equal(bridge.isClosed(),true);console.log('연결 검증 통과: 잘못된 인증 거부, 일회성 전송');
})().catch(e=>{console.error(e);process.exitCode=1;});
