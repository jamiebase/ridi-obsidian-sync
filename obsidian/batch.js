if (typeof module !== 'undefined' && module.parent) var {getBookId}=require('./book'),{applyImport}=require('./apply');
function selectBatch(rows){
 const eligible=[],errors=[];
 for(const row of rows){try{if(row.error)throw Error(row.error);if(!Object.prototype.hasOwnProperty.call(row.frontmatter,'ridi_book_id'))continue;const bookId=getBookId('',row.frontmatter);eligible.push({...row,bookId});}catch(e){errors.push({file:row.file,error:e.message});}}
 const counts=new Map();for(const row of eligible)counts.set(row.bookId,(counts.get(row.bookId)||0)+1);
 const selected=[];for(const row of eligible){if(counts.get(row.bookId)>1)errors.push({file:row.file,error:'같은 책 ID가 여러 노트에 있습니다.'});else {try{getBookId(row.text,row.frontmatter);selected.push(row);}catch(e){errors.push({file:row.file,error:e.message});}}}
 return {selected,errors};
}
async function collectBatch(rows,collector,cancelled,onProgress=()=>{}){const results=[];for(const row of rows){if(cancelled())break;onProgress(row,results.length,rows.length);try{results.push({...row,data:await collector(row)});}catch(e){if(cancelled())break;results.push({...row,error:e.message});}}return results;}
async function applyBatch(app,rows,readFrontmatter,onProgress=()=>{},cancelled=()=>false){const results=[];for(const row of rows){if(cancelled())break;onProgress(row,results.length,rows.length);try{await applyImport(app,row.file,row.snapshot,row.result,row.bookId,readFrontmatter);results.push({...row,ok:true});}catch(e){results.push({...row,ok:false,error:e.message});}}return results;}
if(typeof module!=='undefined')module.exports={selectBatch,collectBatch,applyBatch};
