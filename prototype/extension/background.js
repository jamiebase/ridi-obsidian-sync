const running=new Set();
chrome.tabs.onUpdated.addListener((id,change,tab)=>{
 if(change.status!=='complete'||!tab.url||!/^https:\/\/ridibooks\.com\/reading-note\/detail\/\d+(?:[?#]|$)/.test(tab.url)||running.has(id))return;
 running.add(id);
 (async()=>{
  const {ridiPairCode}=await chrome.storage.local.get('ridiPairCode');if(!/^43177:[0-9a-f]{48}$/.test(ridiPairCode||''))return;
  const token=ridiPairCode.split(':')[1],headers={'X-Ridi-Token':token};
  let response;try{response=await fetch('http://127.0.0.1:43177/status',{headers});}catch{return;}
  if(!response.ok)return;const status=await response.json();const bookId=new URL(tab.url).pathname.split('/').pop();if(!status.bookId||status.bookId!==bookId)return;
  const [result]=await chrome.scripting.executeScript({target:{tabId:id},files:['collector.js']});const data=result?.result;
  if(!data||String(data.bookId)!==bookId)throw Error('수집한 책이 일치하지 않습니다.');
  response=await fetch('http://127.0.0.1:43177/import',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!response.ok)throw Error('옵시디언이 데이터를 거부했습니다.');
 })().catch(e=>console.error('리디 자동 가져오기 실패:',e)).finally(()=>running.delete(id));
});
