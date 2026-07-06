interface BrandLogoProps {
  // 마크 한 변의 픽셀 크기(랜딩 nav 기준 26). 워드마크 크기는 이에 맞춰 조정하세요.
  size?: number;
  // 워드마크(글자) 여부. 아이콘만 필요할 때 false.
  showWordmark?: boolean;
  // 워드마크 폰트 크기 클래스(예: 'text-[21px]', 'text-2xl').
  wordmarkClassName?: string;
  className?: string;
}

// 랜딩페이지의 로고를 단일 소스로 통일한 브랜드 마크(틸 렌즈/페이지) + serif 워드마크.
// 랜딩 nav·푸터와 앱 헤더가 모두 이 컴포넌트를 공유한다.
export function BrandLogo({
  size = 26,
  showWordmark = true,
  wordmarkClassName = 'text-[21px]',
  className = '',
}: BrandLogoProps) {
  // 26px 기준 비율을 그대로 유지해 어떤 크기에서도 동일한 마크가 나오게 한다.
  const u = size / 26;
  const px = (n: number) => `${n * u}px`;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="relative shrink-0 bg-[#1c5d5f]"
        style={{ width: px(26), height: px(26), borderRadius: px(7) }}
        aria-hidden="true"
      >
        <div
          className="absolute rounded-full bg-[#a2cbcd]"
          style={{ left: px(6), right: px(6), top: px(6), height: px(2) }}
        />
        <div
          className="absolute rounded-full bg-[#a2cbcd]"
          style={{ left: px(6), right: px(8), top: px(11), height: px(2) }}
        />
        <div
          className="absolute rounded-full border-[#65b8a2]"
          style={{
            left: px(6),
            top: px(16),
            width: px(8),
            height: px(8),
            borderWidth: `${Math.max(1.5, 2 * u)}px`,
          }}
        />
      </div>
      {showWordmark && (
        <span className={`font-serif font-semibold tracking-[-0.01em] ${wordmarkClassName}`}>
          PaperLens
        </span>
      )}
    </div>
  );
}
