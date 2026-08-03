export type WeddingRosterGuest = {
  name: string;
  team?: string | null;
  participation_mode?: string | null;
  relationship?: string | null;
  special_card_title?: string | null;
  active?: boolean;
};

function weddingRosterRank(guest: WeddingRosterGuest): number {
  const principalLabel = guest.relationship || guest.special_card_title || '';
  if (guest.participation_mode === 'PRINCIPAL' && principalLabel.includes('新郎')) return 0;
  if (guest.participation_mode === 'PRINCIPAL' && principalLabel.includes('新娘')) return 1;
  if (guest.participation_mode === 'PRINCIPAL') return 2;
  if (guest.team === '家人组') return 3;
  if (guest.team === '海岛组') return 4;
  if (guest.team === '沙漠组') return 5;
  return 6;
}

export function compareWeddingGuests(a: WeddingRosterGuest, b: WeddingRosterGuest): number {
  const activeOrder = Number(a.active === false) - Number(b.active === false);
  if (activeOrder !== 0) return activeOrder;
  return weddingRosterRank(a) - weddingRosterRank(b)
    || a.name.localeCompare(b.name, 'zh-CN');
}
