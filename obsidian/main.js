function merge(original,data){
 if(!data || data.version!==1 || !/^\d+$/.test(String(data.bookId)) || typeof data.title!=='string' || !Array.isArray(data.items) || !data.items.length) throw Error('올바른 리디 JSON이 아닙니다.');
 const seen=new Set();
 for(const x of data.items){if(!x || !/^annotation_\d+$/.test(x.id) || typeof x.text!=='string' || !x.text.trim() || typeof x.date!=='string' || !/^\d{4}\.\d{2}\.\d{2}\.?$/.test(x.date) || typeof x.memo!=='string' || seen.has(x.id)) throw Error('노트 데이터가 올바르지 않거나 ID가 중복됩니다.'); seen.add(x.id);}
 const re=/<!-- ridi:(\d+):(annotation_\d+) -->/g; const known=new Set(); let match;
 while((match=re.exec(original))){const key=match[1]+':'+match[2]; if(known.has(key)) throw Error('기존 노트에 중복된 리디 ID가 있습니다.'); known.add(key);}
 const headings=[...original.matchAll(/^(#{1,6})\s+독서노트\s*#*\s*$/gm)];
 if(headings.length>1) throw Error('독서노트 제목이 여러 개입니다. 하나로 정리한 뒤 다시 시도하세요.');
 const added=data.items.filter(x=>!known.has(data.bookId+':'+x.id));
 const quote=s=>s.split(/\r?\n/).map(line=>'> '+line).join('\n');
 const blocks=added.map(x=>`<!-- ridi:${data.bookId}:${x.id} -->\n${quote(x.text)}\n>\n> ${x.date}${x.memo?'\n>\n> 메모: '+x.memo.replace(/\r?\n/g,'\n> '):''}\n`).join('\n');
 if(!added.length) return {text:original,added:0,skipped:data.items.length};
 let output;
 if(!headings.length) output=original.replace(/\s*$/,'')+'\n\n## 독서노트\n\n'+blocks;
 else {const h=headings[0], start=h.index+h[0].length; const nextRe=new RegExp('^#{1,'+h[1].length+'}\\s+','m'); const rest=original.slice(start); const n=nextRe.exec(rest); const at=n?start+n.index:original.length; const before=original.slice(0,at).replace(/\s*$/,''); const after=original.slice(at); output=before+'\n\n'+blocks+(after?'\n'+after:'');}
 return {text:output,added:added.length,skipped:data.items.length-added.length};
}


const http=require('node:http');
const crypto=require('node:crypto');
function startBridge(onData,options={}){return new Promise((resolve,reject)=>{
 const token=options.token??crypto.randomBytes(24).toString('hex');if(!/^[0-9a-f]{48}$/.test(token)){reject(new Error('연결 코드가 올바르지 않습니다.'));return;}let closed=false;let timer;
 const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type, x-ridi-token');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST'||req.url!=='/import'){res.writeHead(404);res.end();return;}
  if(req.headers['x-ridi-token']!==token||closed){res.writeHead(403);res.end();return;}
  let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>10485760){res.writeHead(413);res.end();req.destroy();}else chunks.push(c);});
  req.on('end',()=>{if(res.writableEnded)return;try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(onData(data)!==true)throw Error('invalid');res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');close();}catch(e){res.writeHead(400);res.end('invalid data');}});
 });
 function close(){if(!closed){closed=true;clearTimeout(timer);server.close();}}
 server.once('error',reject);server.listen(options.port??0,'127.0.0.1',()=>{timer=setTimeout(close,options.timeoutMs??120000);resolve({token,port:server.address().port,close,isClosed:()=>closed});});
});}


const {Plugin,Modal,Notice,MarkdownView,TFile}=require('obsidian');
class ImportModal extends Modal {
 constructor(app,file,initialData){super(app);this.file=file;this.initialData=initialData;this.snapshot=null;this.result=null;this.busy=false;this.sequence=0;}
 onOpen(){
  const root=this.contentEl;root.empty();root.createEl('h2',{text:'리디 독서노트 가져오기'});root.createEl('p',{text:`대상 노트: ${this.file.path}`});
  root.createEl('p',{text:'리디 책 제목과 대상 노트를 확인한 뒤 반영하세요.'});
  const input=root.createEl('input',{type:'file',attr:{accept:'.json,application/json'}});
  const message=root.createEl('p');const pre=root.createEl('pre');pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='320px';pre.style.overflow='auto';
  const apply=root.createEl('button',{text:'노트에 반영'});apply.disabled=true;
  const prepare=async(data)=>{const seq=++this.sequence;apply.disabled=true;this.result=null;pre.textContent='';message.textContent='';try{
   const snapshot=await this.app.vault.read(this.file);const result=merge(snapshot,data);if(seq!==this.sequence)return;
   this.snapshot=snapshot;this.result=result;message.textContent=`리디 책: ${data.title} · 새 항목 ${result.added}개 · 기존 항목 ${result.skipped}개. 대상 노트가 맞는지 확인하세요.`;
   pre.textContent=result.text;apply.disabled=result.added===0;
  }catch(e){if(seq===this.sequence)message.textContent='미리보기 실패: '+e.message;}};
  input.addEventListener('change',async()=>{const seq=++this.sequence;apply.disabled=true;this.result=null;pre.textContent='';message.textContent='';try{const f=input.files&&input.files[0];if(!f)return;if(f.size>10485760)throw Error('JSON 파일이 너무 큽니다.');const data=JSON.parse(await f.text());if(seq===this.sequence)await prepare(data);}catch(e){if(seq===this.sequence)message.textContent='미리보기 실패: '+e.message;}});
  apply.addEventListener('click',async()=>{if(this.busy||!this.result)return;this.busy=true;apply.disabled=true;try{
   await this.app.vault.process(this.file,current=>{if(current!==this.snapshot)throw Error('미리보기 이후 노트가 변경되었습니다. 다시 확인하세요.');return this.result.text;});
   new Notice(`리디 독서노트 ${this.result.added}개를 추가했습니다.`);this.close();
  }catch(e){message.textContent='저장 실패: '+e.message;}finally{this.busy=false;}});
  if(this.initialData)prepare(this.initialData);
 }
 onClose(){this.sequence++;this.contentEl.empty();}
}
class ConnectModal extends Modal {
 constructor(app,file,plugin){super(app);this.file=file;this.plugin=plugin;this.bridge=null;this.closed=false;}
 async onOpen(){const root=this.contentEl;root.empty();root.createEl('h2',{text:'리디 확장 프로그램 연결'});root.createEl('p',{text:`대상 노트: ${this.file.path}`});const status=root.createEl('p',{text:'연결을 준비하고 있습니다...'});
 try{const bridge=await startBridge(data=>{try{merge('',data);}catch{return false;}if(this.closed)return false;setTimeout(()=>this.app.workspace.trigger('ridi-bridge-received',this.file,data),0);return true;},{port:43177,token:this.plugin.pairToken});
  if(this.closed){bridge.close();return;}this.bridge=bridge;this.plugin.activeBridges.add(bridge);status.textContent='처음 연결할 때만 아래 코드를 확장 프로그램에 입력하세요. 이미 연결했다면 확장에서 바로 보내면 됩니다. 연결은 2분 동안 열립니다.';
  const code=root.createEl('input',{type:'text'});code.value=`${bridge.port}:${bridge.token}`;code.readOnly=true;code.style.width='100%';
  const copy=root.createEl('button',{text:'연결 코드 복사'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.value);new Notice('연결 코드를 복사했습니다.');}catch{code.focus();code.select();new Notice('코드를 직접 복사해 주세요.');}};
 }catch(e){status.textContent='연결을 열 수 없습니다: '+e.message;}}
 onClose(){this.closed=true;if(this.bridge){this.bridge.close();this.plugin.activeBridges.delete(this.bridge);}this.contentEl.empty();}
}
module.exports=class RidiImportPlugin extends Plugin {
 async onload(){const settings=await this.loadData()||{};this.pairToken=typeof settings.pairToken==='string'&&/^[0-9a-f]{48}$/.test(settings.pairToken)?settings.pairToken:crypto.randomBytes(24).toString('hex');if(settings.pairToken!==this.pairToken)await this.saveData({...settings,pairToken:this.pairToken});this.activeBridges=new Set();this.registerEvent(this.app.workspace.on('ridi-bridge-received',(file,data)=>{if(this.connectModal)this.connectModal.close();for(const b of this.activeBridges)b.close();this.activeBridges.clear();new ImportModal(this.app,file,data).open();}));
  const active=()=>{const view=this.app.workspace.getActiveViewOfType(MarkdownView);const file=view&&view.file;if(!(file instanceof TFile)){new Notice('대상 책 노트를 먼저 열어 주세요.');return null;}return file;};
  this.addCommand({id:'import-ridi-notes',name:'리디 독서노트 JSON 가져오기',callback:()=>{const file=active();if(file)new ImportModal(this.app,file).open();}});
  this.addCommand({id:'connect-ridi-notes',name:'리디 확장 프로그램에서 가져오기',callback:()=>{const file=active();if(file){if(this.connectModal)this.connectModal.close();this.connectModal=new ConnectModal(this.app,file,this);this.connectModal.open();}}});
 }
 onunload(){for(const b of this.activeBridges)b.close();this.activeBridges.clear();}
};
