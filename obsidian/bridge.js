const http=require('node:http');
const crypto=require('node:crypto');
function startBridge(onData,options={}){return new Promise((resolve,reject)=>{
 const token=options.token??crypto.randomBytes(24).toString('hex');if(!/^[0-9a-f]{48}$/.test(token)){reject(new Error('연결 코드가 올바르지 않습니다.'));return;}let closed=false;let timer;
 const server=http.createServer((req,res)=>{
  res.setHeader('Connection','close');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type, x-ridi-token');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.headers['x-ridi-token']!==token||closed){res.writeHead(403);res.end();return;}
  if(req.method==='GET'&&req.url==='/status'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({bookId:options.bookId??null,...(options.vaultName?{vaultName:options.vaultName}:{})}));return;}
  if(req.method!=='POST'||req.url!=='/import'){res.writeHead(404);res.end();return;}
  let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>10485760){res.writeHead(413);res.end();req.destroy();}else chunks.push(c);});
  req.on('end',()=>{if(res.writableEnded)return;try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(options.bookId&&String(data.bookId)!==options.bookId)throw Error('wrong book');if(onData(data)!==true)throw Error('invalid');res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');close();}catch(e){res.writeHead(400);res.end('invalid data');}});
 });
 function close(){if(!closed){closed=true;clearTimeout(timer);server.close();}}
 server.once('error',reject);server.listen(options.port??0,'127.0.0.1',()=>{timer=setTimeout(close,options.timeoutMs??120000);resolve({token,port:server.address().port,close,isClosed:()=>closed});});
});}
module.exports={startBridge};
