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

module.exports = { merge };
