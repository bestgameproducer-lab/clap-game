import Image from 'next/image';

export function BaliInvitationScene() {
  return <figure className="bali-invitation-scene">
    <Image
      src="/art/bali-cat-cupid-estate-v1.jpg"
      alt="两只白猫在巴厘岛庄园与稻田间追逐丘比特的星光"
      width={1622}
      height={970}
      sizes="(max-width: 420px) calc(100vw - 64px), 540px"
      quality={68}
      fetchPriority="high"
      placeholder="blur"
      blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1622 970'%3E%3Crect width='1622' height='970' fill='%23eadcc3'/%3E%3Cpath d='M0 610 290 385 545 560 820 300 1100 530 1395 260 1622 455V970H0Z' fill='%23c9b58f'/%3E%3C/svg%3E"
      priority
    />
  </figure>;
}
