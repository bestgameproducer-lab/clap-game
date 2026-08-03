type WeddingSignatureProps = {
  inverse?: boolean;
  compact?: boolean;
};

export function WeddingSignature({ inverse = false, compact = false }: WeddingSignatureProps) {
  return <div className={`wedding-signature${inverse ? ' inverse' : ''}${compact ? ' compact' : ''}`} aria-label="婚礼地点与日期：印度尼西亚巴厘岛，2026年8月22日">
    <span aria-hidden="true">BALI, INDONESIA</span>
    <i aria-hidden="true"/>
    <time dateTime="2026-08-22">22 AUG 2026</time>
  </div>;
}
