export function BaliInvitationScene() {
  return <figure className="bali-invitation-scene">
    <picture>
      <source srcSet="/art/bali-cat-cupid-estate-v1-1080.webp" type="image/webp"/>
      <img
        src="/art/bali-cat-cupid-estate-v1.jpg"
        alt="两只白猫在巴厘岛庄园与稻田间追逐丘比特的星光"
        width={1622}
        height={970}
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    </picture>
  </figure>;
}
