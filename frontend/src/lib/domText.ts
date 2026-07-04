// 원문 컨테이너의 문자 오프셋 → 화면 위치 스크롤 (FR-26 섹션 점프).
// usePaperBodyNodes가 하이라이트/힌트로 텍스트를 쪼개 렌더하므로,
// 텍스트 노드를 순회해 누적 길이로 목표 노드를 찾는다. 실패해도 조용히 무시(비침습).
export function scrollToTextOffset(container: HTMLElement, offset: number): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (consumed + length >= offset) {
      const range = document.createRange();
      const local = Math.max(0, Math.min(offset - consumed, length));
      try {
        range.setStart(node, local);
        // collapsed Range는 줄바꿈/노드 경계에서 rect가 0으로 나올 수 있어 한 글자를 감싼다.
        range.setEnd(node, Math.min(local + 1, length));
        let rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          rect = node.parentElement?.getBoundingClientRect() ?? rect;
        }
        const containerRect = container.getBoundingClientRect();
        container.scrollTo({
          top: container.scrollTop + rect.top - containerRect.top - 16,
          behavior: 'smooth',
        });
        return true;
      } catch {
        return false;
      }
    }
    consumed += length;
    node = walker.nextNode();
  }
  return false;
}
