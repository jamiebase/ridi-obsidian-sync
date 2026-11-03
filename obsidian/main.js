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
  res.setHeader('Connection','close');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type, x-ridi-token');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.headers['x-ridi-token']!==token||closed){res.writeHead(403);res.end();return;}
  if(req.method==='GET'&&req.url==='/status'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({bookId:options.bookId??null}));return;}
  if(req.method!=='POST'||req.url!=='/import'){res.writeHead(404);res.end();return;}
  let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>10485760){res.writeHead(413);res.end();req.destroy();}else chunks.push(c);});
  req.on('end',()=>{if(res.writableEnded)return;try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(options.bookId&&String(data.bookId)!==options.bookId)throw Error('wrong book');if(onData(data)!==true)throw Error('invalid');res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');close();}catch(e){res.writeHead(400);res.end('invalid data');}});
 });
 function close(){if(!closed){closed=true;clearTimeout(timer);server.close();}}
 server.once('error',reject);server.listen(options.port??0,'127.0.0.1',()=>{timer=setTimeout(close,options.timeoutMs??120000);resolve({token,port:server.address().port,close,isClosed:()=>closed});});
});}

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

async function applyImport(app, file, snapshot, result, incoming, readFrontmatter) {
 let needsProperty = false;
 await app.vault.process(file, current => {
  if (current !== snapshot) throw Error('미리보기 이후 노트가 변경되었습니다. 다시 확인하세요.');
  const frontmatter = readFrontmatter(current);
  verifyBookId(current, frontmatter, incoming);
  needsProperty = !Object.prototype.hasOwnProperty.call(frontmatter, 'ridi_book_id');
  return result.text;
 });
 if (needsProperty) {
  try {
   await app.fileManager.processFrontMatter(file, frontmatter => {
    verifyBookId(snapshot, frontmatter, incoming);
    if (!Object.prototype.hasOwnProperty.call(frontmatter, 'ridi_book_id')) frontmatter.ridi_book_id = String(incoming);
   });
  } catch (error) {
   const prefix = result.added ? '밑줄은 저장했지만 책 ID 속성을 저장하지 못했습니다.' : '책 ID 속성을 저장하지 못했습니다.';
   throw Error(prefix + ' 다시 확인해 주세요. ' + error.message);
  }
 }
 return {propertyAdded: needsProperty};
}

function selectBatch(rows){
 const eligible=[],errors=[];
 for(const row of rows){try{if(row.error)throw Error(row.error);if(!Object.prototype.hasOwnProperty.call(row.frontmatter,'ridi_book_id'))continue;const bookId=getBookId('',row.frontmatter);eligible.push({...row,bookId});}catch(e){errors.push({file:row.file,error:e.message});}}
 const counts=new Map();for(const row of eligible)counts.set(row.bookId,(counts.get(row.bookId)||0)+1);
 const selected=[];for(const row of eligible){if(counts.get(row.bookId)>1)errors.push({file:row.file,error:'같은 책 ID가 여러 노트에 있습니다.'});else {try{getBookId(row.text,row.frontmatter);selected.push(row);}catch(e){errors.push({file:row.file,error:e.message});}}}
 return {selected,errors};
}
async function collectBatch(rows,collector,cancelled,onProgress=()=>{}){const results=[];for(const row of rows){if(cancelled())break;onProgress(row,results.length,rows.length);try{results.push({...row,data:await collector(row)});}catch(e){if(cancelled())break;results.push({...row,error:e.message});}}return results;}
async function applyBatch(app,rows,readFrontmatter,onProgress=()=>{},cancelled=()=>false){const results=[];for(const row of rows){if(cancelled())break;onProgress(row,results.length,rows.length);try{await applyImport(app,row.file,row.snapshot,row.result,row.bookId,readFrontmatter);results.push({...row,ok:true});}catch(e){results.push({...row,ok:false,error:e.message});}}return results;}

const {Plugin,Modal,Notice,MarkdownView,TFile,getFrontMatterInfo,parseYaml}=require('obsidian');
function readFrontmatter(text){const info=getFrontMatterInfo(text);if(!info.exists){if(/^(?:\uFEFF)?---[ \t]*\r?\n/.test(text))throw Error('노트의 속성 영역이 올바르지 않습니다.');return {};}const value=parseYaml(info.frontmatter);if(value==null)return {};if(typeof value!=='object'||Array.isArray(value))throw Error('노트의 속성 영역이 올바르지 않습니다.');return value;}
class BatchModal extends Modal {
 constructor(app,plugin){super(app);this.plugin=plugin;this.cancelled=false;this.cancelCurrent=null;this.pending=[];this.prepared=[];this.errors=[];this.applying=false;}
 onOpen(){
  const root=this.contentEl;root.empty();root.createEl('h2',{text:'리디 독서노트 여러 권 가져오기'});
  this.status=root.createEl('p',{text:'대상 노트를 찾는 중입니다...'});this.report=root.createEl('div');
  this.cancelButton=root.createEl('button',{text:'취소'});this.cancelButton.onclick=()=>this.close();
  this.start().catch(e=>{if(!this.cancelled)this.status.textContent='실패: '+e.message;});
 }
 async start(){
  const rows=[];
  for(const file of this.app.vault.getMarkdownFiles()){
   if(this.cancelled)return;
   try{const text=await this.app.vault.read(file);let frontmatter;try{frontmatter=readFrontmatter(text);}catch(e){if(/(?:^|\n)\s*ridi_book_id\s*:/m.test(text))rows.push({file,error:e.message});continue;}rows.push({file,text,frontmatter});}
   catch(e){rows.push({file,error:'노트를 읽지 못했습니다: '+e.message});}
  }
  const picked=selectBatch(rows);this.errors=picked.errors;
  if(!picked.selected.length){this.status.textContent='가져올 수 있는 책이 없습니다.';this.showErrors();return;}
  const received=await collectBatch(picked.selected,row=>this.collectOne(row),()=>this.cancelled,(row,n,total)=>{this.status.textContent=`수집 중 ${n+1}/${total}: ${row.file.path}`;});
  if(this.cancelled)return;
  for(const row of received){if(row.error){this.errors.push({file:row.file,error:row.error});continue;}try{
    const result=merge(row.text,row.data);verifyBookId(row.text,row.frontmatter,row.data.bookId);
    this.prepared.push({...row,snapshot:row.text,result});
   }catch(e){this.errors.push({file:row.file,error:e.message});}}
  this.showPreview();
 }
 async collectOne(row){
  if(this.cancelled)throw Error('취소됨');
  return await new Promise((resolve,reject)=>{
   let bridge,timer,done=false;
   const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);if(bridge){bridge.close();this.plugin.activeBridges.delete(bridge);}this.cancelCurrent=null;if(error)reject(error);else resolve(data);};
   this.cancelCurrent=()=>finish(Error('취소됨'));
   startBridge(data=>{try{if(String(data.bookId)!==row.bookId)return false;merge('',data);setTimeout(()=>finish(null,data),0);return true;}catch{return false;}},{port:43177,token:this.plugin.pairToken,bookId:row.bookId,timeoutMs:45000}).then(async opened=>{
    bridge=opened;if(done){bridge.close();return;}this.plugin.activeBridges.add(bridge);
    timer=setTimeout(()=>finish(Error('시간 초과: 브라우저 확장, 리디 로그인과 연결 상태를 확인하세요.')),44000);
    try{await require('electron').shell.openExternal(`https://ridibooks.com/reading-note/detail/${row.bookId}`);}catch(e){finish(e);}
   }).catch(finish);
  });
 }
 showErrors(){if(!this.errors.length)return;this.report.createEl('h3',{text:`건너뛴 책 ${this.errors.length}개`});for(const item of this.errors)this.report.createEl('p',{text:`${item.file.path}: ${item.error}`});}
 showPreview(){
  this.report.empty();const changed=this.prepared.filter(x=>x.result.added>0);this.status.textContent=`수집 완료: ${this.prepared.length}권 · 변경할 책 ${changed.length}권 · 오류 ${this.errors.length}건`;
  for(const row of this.prepared){const details=this.report.createEl('details');details.createEl('summary',{text:`${row.file.path}: 새 항목 ${row.result.added}개, 기존 ${row.result.skipped}개`});const pre=details.createEl('pre',{text:row.result.text});pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='240px';pre.style.overflow='auto';}
  this.showErrors();const apply=this.contentEl.createEl('button',{text:`${changed.length}권 반영`});apply.disabled=!changed.length;
  apply.onclick=async()=>{if(this.applying)return;this.applying=true;apply.disabled=true;this.cancelButton.disabled=true;const results=await applyBatch(this.app,changed,readFrontmatter,(row,n,total)=>{this.status.textContent=`반영 중 ${n+1}/${total}: ${row.file.path}`;},()=>this.cancelled);
   this.status.textContent=`반영 완료: 성공 ${results.filter(x=>x.ok).length}권 · 실패 ${results.filter(x=>!x.ok).length}권`;for(const row of results.filter(x=>!x.ok))this.report.createEl('p',{text:`${row.file.path}: ${row.error}`});this.cancelButton.disabled=false;this.cancelButton.textContent='닫기';this.applying=false;
  };
 }
 close(){if(!this.applying)super.close();}
 onClose(){this.cancelled=true;if(this.plugin.batchModal===this)this.plugin.batchModal=null;if(this.cancelCurrent)this.cancelCurrent();this.contentEl.empty();}
}

class ImportModal extends Modal {
 constructor(app,file,initialData){super(app);this.file=file;this.initialData=initialData;this.snapshot=null;this.result=null;this.busy=false;this.sequence=0;}
 onOpen(){
  const root=this.contentEl;root.empty();root.createEl('h2',{text:'리디 독서노트 가져오기'});root.createEl('p',{text:`대상 노트: ${this.file.path}`});
  root.createEl('p',{text:'리디 책 제목과 대상 노트를 확인한 뒤 반영하세요.'});
  const input=root.createEl('input',{type:'file',attr:{accept:'.json,application/json'}});
  const message=root.createEl('p');const pre=root.createEl('pre');pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='320px';pre.style.overflow='auto';
  const apply=root.createEl('button',{text:'노트에 반영'});apply.disabled=true;
  const prepare=async(data)=>{const seq=++this.sequence;apply.disabled=true;this.result=null;pre.textContent='';message.textContent='';try{
   const snapshot=await this.app.vault.read(this.file);const frontmatter=readFrontmatter(snapshot);const result=merge(snapshot,data);verifyBookId(snapshot,frontmatter,data.bookId);const needsProperty=!Object.prototype.hasOwnProperty.call(frontmatter,'ridi_book_id');if(seq!==this.sequence)return;
   this.snapshot=snapshot;this.result=result;this.bookId=String(data.bookId);message.textContent=`리디 책: ${data.title} · 새 항목 ${result.added}개 · 기존 항목 ${result.skipped}개${needsProperty?' · 책 ID 속성 추가':''}. 대상 노트가 맞는지 확인하세요.`;
   pre.textContent=result.text;apply.disabled=result.added===0&&!needsProperty;
  }catch(e){if(seq===this.sequence)message.textContent='미리보기 실패: '+e.message;}};
  input.addEventListener('change',async()=>{const seq=++this.sequence;apply.disabled=true;this.result=null;pre.textContent='';message.textContent='';try{const f=input.files&&input.files[0];if(!f)return;if(f.size>10485760)throw Error('JSON 파일이 너무 큽니다.');const data=JSON.parse(await f.text());if(seq===this.sequence)await prepare(data);}catch(e){if(seq===this.sequence)message.textContent='미리보기 실패: '+e.message;}});
  apply.addEventListener('click',async()=>{if(this.busy||!this.result)return;this.busy=true;apply.disabled=true;try{
   const outcome=await applyImport(this.app,this.file,this.snapshot,this.result,this.bookId,readFrontmatter);
   new Notice(`리디 독서노트 ${this.result.added}개를 추가했습니다.${outcome.propertyAdded?' 책 ID 속성을 저장했습니다.':''}`);this.close();
  }catch(e){message.textContent='저장 실패: '+e.message;}finally{this.busy=false;}});
  if(this.initialData)prepare(this.initialData);
 }
 onClose(){this.sequence++;this.contentEl.empty();}
}
class ConnectModal extends Modal {
 constructor(app,file,plugin,bookId=null){super(app);this.file=file;this.plugin=plugin;this.bookId=bookId;this.bridge=null;this.closed=false;}
 async onOpen(){const root=this.contentEl;root.empty();root.createEl('h2',{text:'리디 확장 프로그램 연결'});root.createEl('p',{text:`대상 노트: ${this.file.path}`});const status=root.createEl('p',{text:'연결을 준비하고 있습니다...'});
 try{const bridge=await startBridge(data=>{try{merge('',data);}catch{return false;}if(this.closed)return false;setTimeout(()=>this.app.workspace.trigger('ridi-bridge-received',this.file,data),0);return true;},{port:43177,token:this.plugin.pairToken,bookId:this.bookId});
  if(this.closed){bridge.close();return;}this.bridge=bridge;this.plugin.activeBridges.add(bridge);status.textContent='처음 연결할 때만 아래 코드를 확장 프로그램에 입력하세요. 이미 연결했다면 확장에서 바로 보내면 됩니다. 연결은 2분 동안 열립니다.';
  const code=root.createEl('input',{type:'text'});code.value=`${bridge.port}:${bridge.token}`;code.readOnly=true;code.style.width='100%';
  const copy=root.createEl('button',{text:'연결 코드 복사'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.value);new Notice('연결 코드를 복사했습니다.');}catch{code.focus();code.select();new Notice('코드를 직접 복사해 주세요.');}};
  if(this.bookId){status.textContent='리디 페이지를 열어 독서노트를 자동으로 가져옵니다. 연결이 처음이면 기존 가져오기 명령으로 확장을 먼저 연결하세요.';await require('electron').shell.openExternal(`https://ridibooks.com/reading-note/detail/${this.bookId}`);}
 }catch(e){status.textContent='연결을 열 수 없습니다: '+e.message;}}
 onClose(){this.closed=true;if(this.bridge){this.bridge.close();this.plugin.activeBridges.delete(this.bridge);}this.contentEl.empty();}
}
module.exports=class RidiImportPlugin extends Plugin {
 async onload(){const settings=await this.loadData()||{};this.pairToken=typeof settings.pairToken==='string'&&/^[0-9a-f]{48}$/.test(settings.pairToken)?settings.pairToken:crypto.randomBytes(24).toString('hex');if(settings.pairToken!==this.pairToken)await this.saveData({...settings,pairToken:this.pairToken});this.activeBridges=new Set();this.registerEvent(this.app.workspace.on('ridi-bridge-received',(file,data)=>{if(this.connectModal)this.connectModal.close();for(const b of this.activeBridges)b.close();this.activeBridges.clear();new ImportModal(this.app,file,data).open();}));
  const active=()=>{const view=this.app.workspace.getActiveViewOfType(MarkdownView);const file=view&&view.file;if(!(file instanceof TFile)){new Notice('대상 책 노트를 먼저 열어 주세요.');return null;}return file;};
  this.addCommand({id:'batch-ridi-notes',name:'연결된 모든 책의 리디 독서노트 가져오기',callback:()=>{if(this.batchModal){new Notice('이미 일괄 가져오기가 진행 중입니다.');return;}if(this.connectModal)this.connectModal.close();this.batchModal=new BatchModal(this.app,this);this.batchModal.open();}});
  this.addCommand({id:'automatic-ridi-notes',name:'현재 책의 리디 독서노트 자동 가져오기',callback:async()=>{const file=active();if(!file)return;try{const text=await this.app.vault.read(file);const id=getBookId(text,readFrontmatter(text));if(this.connectModal)this.connectModal.close();this.connectModal=new ConnectModal(this.app,file,this,id);this.connectModal.open();}catch(e){new Notice(e.message);}}});
  this.addCommand({id:'import-ridi-notes',name:'리디 독서노트 JSON 가져오기',callback:()=>{const file=active();if(file)new ImportModal(this.app,file).open();}});
  this.addCommand({id:'connect-ridi-notes',name:'리디 확장 프로그램에서 가져오기',callback:()=>{const file=active();if(file){if(this.connectModal)this.connectModal.close();this.connectModal=new ConnectModal(this.app,file,this);this.connectModal.open();}}});
 }
 onunload(){if(this.batchModal){this.batchModal.cancelled=true;this.batchModal.close();}for(const b of this.activeBridges)b.close();this.activeBridges.clear();}
};
