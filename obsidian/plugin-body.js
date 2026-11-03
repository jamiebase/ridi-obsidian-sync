const {Plugin,Modal,Notice,MarkdownView,TFile,getFrontMatterInfo,parseYaml}=require('obsidian');
function readFrontmatter(text){const info=getFrontMatterInfo(text);if(!info.exists){if(/^(?:\uFEFF)?---[ \t]*\r?\n/.test(text))throw Error('노트의 속성 영역이 올바르지 않습니다.');return {};}const value=parseYaml(info.frontmatter);if(value==null)return {};if(typeof value!=='object'||Array.isArray(value))throw Error('노트의 속성 영역이 올바르지 않습니다.');return value;}
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
