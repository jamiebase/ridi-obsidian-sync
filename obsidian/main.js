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


const {Plugin,Modal,Notice,MarkdownView,TFile}=require('obsidian');
class ImportModal extends Modal {
 constructor(app,file){super(app);this.file=file;this.data=null;this.snapshot=null;this.result=null;this.busy=false;}
 onOpen(){
  const root=this.contentEl; root.empty(); root.createEl('h2',{text:'리디 독서노트 가져오기'});
  root.createEl('p',{text:`대상 노트: ${this.file.path}`});
  root.createEl('p',{text:'리디에서 내보낸 JSON 파일을 선택하세요. 책 제목과 대상 노트를 확인한 뒤 저장할 수 있습니다.'});
  const input=root.createEl('input',{type:'file',attr:{accept:'.json,application/json'}});
  const message=root.createEl('p'); const pre=root.createEl('pre'); pre.style.whiteSpace='pre-wrap'; pre.style.maxHeight='320px'; pre.style.overflow='auto';
  const apply=root.createEl('button',{text:'노트에 반영'}); apply.disabled=true;
  input.addEventListener('change',async()=>{try{
   apply.disabled=true;this.result=null;pre.textContent=''; message.textContent='';
   const selected=input.files && input.files[0]; if(!selected)return;
   if(selected.size>10*1024*1024)throw Error('JSON 파일이 너무 큽니다.');
   const data=JSON.parse(await selected.text()); const snapshot=await this.app.vault.read(this.file); const result=merge(snapshot,data);
   this.data=data;this.snapshot=snapshot;this.result=result;
   message.textContent=`리디 책: ${data.title} · 새 항목 ${result.added}개 · 기존 항목 ${result.skipped}개. 대상 노트가 맞는지 확인하세요.`;
   pre.textContent=result.text; apply.disabled=result.added===0;
  }catch(e){message.textContent='미리보기 실패: '+e.message;}});
  apply.addEventListener('click',async()=>{if(this.busy||!this.result)return;this.busy=true;apply.disabled=true;try{
   let changed=false;
   await this.app.vault.process(this.file,current=>{if(current!==this.snapshot)throw Error('미리보기 이후 노트가 변경되었습니다. JSON을 다시 선택해 확인하세요.');changed=true;return this.result.text;});
   if(changed){new Notice(`리디 독서노트 ${this.result.added}개를 추가했습니다.`);this.close();}
  }catch(e){message.textContent='저장 실패: '+e.message;}finally{this.busy=false;}});
 }
 onClose(){this.contentEl.empty();}
}
module.exports=class RidiImportPlugin extends Plugin {
 onload(){this.addCommand({id:'import-ridi-notes',name:'리디 독서노트 JSON 가져오기',callback:()=>{
  const view=this.app.workspace.getActiveViewOfType(MarkdownView);const file=view&&view.file;
  if(!(file instanceof TFile)){new Notice('대상 책 노트를 먼저 열어 주세요.');return;}
  new ImportModal(this.app,file).open();
 }});}
};
