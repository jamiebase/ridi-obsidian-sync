const fs=require('node:fs');const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const files=['merge.js','bridge.js','book.js','apply.js','batch.js'];
const bundle=files.map(name=>read(name).split('\n').filter(line=>!line.includes('module.exports')&&!line.includes('module.parent)')).join('\n')).join('\n');
const body=read('plugin-body.js');const at=body.indexOf('class ImportModal');if(at<0)throw Error('플러그인 구성 지점을 찾을 수 없습니다.');
const output=bundle+'\n'+body.slice(0,at)+read('batch-ui.js')+'\n'+body.slice(at);
if(process.argv.includes('--check')){if(read('main.js')!==output){console.error('main.js가 원본과 다릅니다.');process.exitCode=1;}else console.log('플러그인 빌드 일치');}
else fs.writeFileSync(path.join(__dirname,'main.js'),output);
