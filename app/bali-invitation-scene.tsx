import Image from 'next/image';

export function BaliInvitationScene() {
  return <figure className="bali-invitation-scene">
    <Image
      src="/art/bali-cat-cupid-estate-v1.jpg"
      alt="两只白猫在巴厘岛庄园与稻田间追逐丘比特的星光"
      width={1622}
      height={970}
      sizes="(max-width: 420px) calc(100vw - 64px), 540px"
      priority
    />
  </figure>;
}
