(async () => {
        const deadline=Date.now()+15000;
        let section;
        while(Date.now()<deadline){section=document.querySelector("#page_reading_note_detail");if(section && section.querySelector("h3") && section.querySelector('li[id^="annotation_"]'))break;await new Promise(r=>setTimeout(r,200));}
        if (!section || !section.querySelector('li[id^="annotation_"]')) throw Error("독서노트 화면을 찾지 못했습니다. 리디 로그인을 확인하세요.");
        for (let n=0;n<1000;n++) {
          const more=[...section.querySelectorAll('button')].find(b=>/\d+\s*개\s*더보기/.test(b.innerText));
          if (!more) break;
          const before=section.querySelectorAll('li[id^="annotation_"]').length;
          more.click();
          const limit=Date.now()+15000;
          while(Date.now()<limit && section.querySelectorAll('li[id^="annotation_"]').length===before) await new Promise(r=>setTimeout(r,200));
          if(section.querySelectorAll('li[id^="annotation_"]').length===before) throw Error('더보기 응답을 받지 못했습니다.');
        }
        if ([...section.querySelectorAll('button')].some(b=>/\d+\s*개\s*더보기/.test(b.innerText))) throw Error('가져올 항목이 너무 많습니다.');
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
})()
