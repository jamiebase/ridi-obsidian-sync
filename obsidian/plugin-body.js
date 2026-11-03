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
 try{const bridge=await startBridge(data=>{try{merge('',data);}catch{return false;}if(this.closed)return false;setTimeout(()=>this.app.workspace.trigger('ridi-bridge-received',this.file,data),0);return true;});
  if(this.closed){bridge.close();return;}this.bridge=bridge;this.plugin.activeBridges.add(bridge);status.textContent='아래 코드를 복사해 리디 브라우저 확장에 입력하세요. 연결은 2분 동안 유효하며, 전송 후 미리보기가 열립니다.';
  const code=root.createEl('input',{type:'text'});code.value=`${bridge.port}:${bridge.token}`;code.readOnly=true;code.style.width='100%';
  const copy=root.createEl('button',{text:'연결 코드 복사'});copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.value);new Notice('연결 코드를 복사했습니다.');}catch{code.focus();code.select();new Notice('코드를 직접 복사해 주세요.');}};
 }catch(e){status.textContent='연결을 열 수 없습니다: '+e.message;}}
 onClose(){this.closed=true;if(this.bridge){this.bridge.close();this.plugin.activeBridges.delete(this.bridge);}this.contentEl.empty();}
}
module.exports=class RidiImportPlugin extends Plugin {
 onload(){this.activeBridges=new Set();this.registerEvent(this.app.workspace.on('ridi-bridge-received',(file,data)=>{if(this.connectModal)this.connectModal.close();for(const b of this.activeBridges)b.close();this.activeBridges.clear();new ImportModal(this.app,file,data).open();}));
  const active=()=>{const view=this.app.workspace.getActiveViewOfType(MarkdownView);const file=view&&view.file;if(!(file instanceof TFile)){new Notice('대상 책 노트를 먼저 열어 주세요.');return null;}return file;};
  this.addCommand({id:'import-ridi-notes',name:'리디 독서노트 JSON 가져오기',callback:()=>{const file=active();if(file)new ImportModal(this.app,file).open();}});
  this.addCommand({id:'connect-ridi-notes',name:'리디 확장 프로그램에서 가져오기',callback:()=>{const file=active();if(file){if(this.connectModal)this.connectModal.close();this.connectModal=new ConnectModal(this.app,file,this);this.connectModal.open();}}});
 }
 onunload(){for(const b of this.activeBridges)b.close();this.activeBridges.clear();}
};
