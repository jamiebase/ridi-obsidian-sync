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
