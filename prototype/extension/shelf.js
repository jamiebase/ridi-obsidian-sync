(() => {
 const shelfLink=[...document.querySelectorAll('a[href*="/reading-note/shelf"]')].find(a=>/독서노트\s*책장/.test(a.innerText));
 const total=shelfLink?.innerText.match(/독서노트\s*책장\s*(\d+)/)?.[1];
 const search=document.querySelector('input[placeholder*="제목"]');if(search?.value?.trim())throw Error('책장 검색어를 지운 뒤 다시 열어 주세요.');
 const books=[];const ids=new Set();
 for(const link of document.querySelectorAll('a[href*="/reading-note/detail/"]')){if(!link.closest('h1,h2,h3,h4,h5,h6'))continue;const url=new URL(link.href,location.origin);const match=url.pathname.match(/^\/reading-note\/detail\/(\d+)\/?$/);const title=link.innerText.trim();if(!match||!title||ids.has(match[1]))continue;ids.add(match[1]);books.push({id:match[1],title});}
 if(total==null||Number(total)!==books.length)throw Error(`책 목록 전체를 확인할 수 없습니다. 표시된 목록 ${books.length}권, 전체 ${total??'확인 불가'}권입니다.`);
 if(!books.length)throw Error('독서노트가 있는 책을 찾지 못했습니다.');return books;
})()
