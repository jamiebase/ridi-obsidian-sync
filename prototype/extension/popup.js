async function collect(send) {
  const status = document.getElementById("status");
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      !tab.url ||
      !/^https:\/\/ridibooks\.com\/reading-note\/detail\/\d+/.test(tab.url)
    )
      throw Error("리디의 책별 독서노트 화면을 먼저 여세요.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const section = document.querySelector("#page_reading_note_detail");
        if (!section) throw Error("독서노트 화면을 찾지 못했습니다.");
        const more = [...section.querySelectorAll("button")].find((b) =>
          /\d+\s*개\s*더보기/.test(b.innerText),
        );
        if (more)
          throw Error(
            "아직 가져오지 않은 노트가 있습니다. 화면 아래의 더보기를 모두 누르세요.",
          );
        const title = section.querySelector("h3")?.innerText.trim();
        const bookId = location.pathname.split("/").pop();
        const items = [
          ...section.querySelectorAll('li[id^="annotation_"]'),
        ].map((el) => {
          const lines = el.innerText
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean)
            .filter((x) => x !== "독서노트 관리");
          const dateIndex = lines.findLastIndex((x) =>
            /^\d{4}\.\d{2}\.\d{2}\.?$/.test(x),
          );
          const noteIndex = lines.indexOf("메모");
          const end =
            noteIndex >= 0
              ? noteIndex
              : dateIndex >= 0
                ? dateIndex
                : lines.length;
          return {
            id: el.id,
            text: lines.slice(0, end).join("\n"),
            memo:
              noteIndex >= 0
                ? lines
                    .slice(
                      noteIndex + 1,
                      dateIndex >= 0 ? dateIndex : undefined,
                    )
                    .join("\n")
                : "",
            date: dateIndex >= 0 ? lines[dateIndex] : "",
          };
        });
        if (!title || !items.length || items.some((x) => !x.text || !x.date))
          throw Error(
            "제목 또는 노트 구조를 확인하지 못했습니다. 리디 화면을 확인하세요.",
          );
        const countButton = [...section.querySelectorAll("button")].find((b) =>
          /^전체\s*\d+/.test(b.innerText.trim()),
        );
        const count = countButton
          ? Number(countButton.innerText.match(/\d+/)[0])
          : null;
        if (count === null || count !== items.length)
          throw Error(
            `표시된 전체 개수(${count ?? "확인 불가"})와 수집 개수(${items.length})가 다릅니다. 전체 필터와 더보기를 확인하세요.`,
          );
        return {
          version: 1,
          title,
          bookId,
          source: location.origin + location.pathname,
          items,
        };
      },
    });
    const data = result.result;
    if (send) {
      const code = document.getElementById("code").value.trim();
      if (!/^[0-9]{1,5}:[0-9a-f]{48}$/.test(code)) throw Error("옵시디언에서 받은 연결 코드를 입력하세요.");
      const [port, token] = code.split(":");
      const response = await fetch(`http://127.0.0.1:${port}/import`, {method:"POST",headers:{"Content-Type":"application/json","X-Ridi-Token":token},body:JSON.stringify(data)});
      if (!response.ok) throw Error("전송이 거부됐습니다. 옵시디언에서 새 연결 코드를 받아 주세요.");
      await chrome.storage.local.set({ridiPairCode:code});
      status.textContent = `${data.title}: ${data.items.length}개를 보냈습니다. 옵시디언 미리보기를 확인하세요.`;
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ridi-${data.bookId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    status.textContent = `${data.title}: ${data.items.length}개를 저장했습니다.`;
  } catch (e) {
    status.textContent = "수집 실패: " + e.message;
  }
}
document.getElementById('go').addEventListener('click',()=>collect(true));
document.getElementById('download').addEventListener('click',()=>collect(false));

chrome.storage.local.get('ridiPairCode').then(({ridiPairCode}) => {
  const field = document.getElementById('code');
  if (ridiPairCode && !field.value) field.value = ridiPairCode;
}).catch(() => {});

(async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url || !/^https:\/\/ridibooks\.com\/reading-note\/shelf(?:[?#]|$)/.test(tab.url)) return;
  const section=document.getElementById('shelf'),list=document.getElementById('books'),all=document.getElementById('all'),exportLink=document.getElementById('export');section.hidden=false;
  try {
    const [injection]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['shelf.js']});
    const books=injection.result;if(!Array.isArray(books)||!books.length) throw Error('책 목록이 비었습니다.');
    const vault=document.getElementById('vault');const stored=await chrome.storage.local.get(['ridiVaults','ridiVaultName']).catch(()=>({}));let vaults=Array.isArray(stored.ridiVaults)?stored.ridiVaults.filter(v=>v&&typeof v.name==='string'&&/^43177:[0-9a-f]{48}$/.test(v.code)):[];
    const renderVaults=(selected)=>{vault.innerHTML='';const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='보관함을 선택하세요';vault.append(placeholder);for(const entry of vaults){const option=document.createElement('option');option.value=entry.name;option.textContent=entry.name;vault.append(option);}vault.value=vaults.some(v=>v.name===selected)?selected:'';};renderVaults(stored.ridiVaultName);
    const boxes=[];const update=()=>{const selected=boxes.filter(x=>x.checked).map(x=>x.value),name=vault.value;all.checked=selected.length===boxes.length;all.indeterminate=selected.length>0&&selected.length<boxes.length;exportLink.textContent=`선택한 ${selected.length}권을 옵시디언으로 보내기`;if(name && selected.length && selected.length<=300 && selected.join(',').length<=8000){exportLink.href='obsidian://ridi-selected?vault='+encodeURIComponent(name)+'&books='+encodeURIComponent(selected.join(','));exportLink.setAttribute('aria-disabled','false');document.getElementById('shelf-status').textContent='';}else{exportLink.removeAttribute('href');exportLink.setAttribute('aria-disabled','true');document.getElementById('shelf-status').textContent=selected.length?(selected.length>300||selected.join(',').length>8000?'한 번에 최대 300권까지 선택할 수 있습니다.':'연결된 보관함을 선택하세요.'):'';}};
    exportLink.addEventListener('click',async event=>{event.preventDefault();const url=exportLink.getAttribute('href');if(!url)return;try{await chrome.scripting.executeScript({target:{tabId:tab.id},args:[url],func:uri=>{const link=document.createElement('a');link.href=uri;link.style.display='none';document.body.appendChild(link);link.click();link.remove();}});}catch(e){document.getElementById('shelf-status').textContent='옵시디언을 열지 못했습니다. 리디 책장 화면을 새로고침하고 다시 시도하세요.';}});
    vault.addEventListener('change',async()=>{const entry=vaults.find(v=>v.name===vault.value);exportLink.removeAttribute('href');if(entry){await chrome.storage.local.set({ridiVaultName:entry.name,ridiPairCode:entry.code});document.getElementById('code').value=entry.code;}update();});
    document.getElementById('add-vault').addEventListener('click',async()=>{try{const code=document.getElementById('code').value.trim();if(!/^43177:[0-9a-f]{48}$/.test(code))throw Error('옵시디언에서 받은 연결 코드를 입력하세요.');const response=await fetch('http://127.0.0.1:43177/status',{headers:{'X-Ridi-Token':code.split(':')[1]}});if(!response.ok)throw Error('연결 코드가 맞지 않습니다.');const {vaultName}=await response.json();if(typeof vaultName!=='string'||!vaultName.trim())throw Error('옵시디언 플러그인을 최신 버전으로 갱신하세요.');const name=vaultName.trim();vaults=vaults.filter(v=>v.name!==name);vaults.push({name,code});await chrome.storage.local.set({ridiVaults:vaults,ridiVaultName:name,ridiPairCode:code});renderVaults(name);update();}catch(e){document.getElementById('shelf-status').textContent='보관함 연결 실패: '+e.message+' 옵시디언에서 리디 확장 프로그램 연결을 열어 주세요.';}});
    for(const book of books){const label=document.createElement('label');label.style.display='block';const box=document.createElement('input');box.type='checkbox';box.value=book.id;box.addEventListener('change',update);boxes.push(box);label.append(box,document.createTextNode(' '+book.title));list.append(label);}
    all.addEventListener('change',()=>{for(const box of boxes)box.checked=all.checked;update();});update();
  } catch(e) {document.getElementById('shelf-status').textContent='책 목록 오류: '+e.message;}
})().catch(e=>{document.getElementById('shelf-status').textContent='책 목록 오류: '+e.message;});
