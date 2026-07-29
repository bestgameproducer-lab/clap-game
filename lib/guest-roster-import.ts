export type GuestRosterImportRow = {
  name: string;
  loginName: string;
  tableLabel: string;
};

export type GuestRosterImportIssue = {
  line: number;
  message: string;
};

export function normalizeGuestLoginName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseGuestRosterText(text: string, existingLoginNames: string[] = []) {
  const rows: GuestRosterImportRow[] = [];
  const issues: GuestRosterImportIssue[] = [];
  const seen = new Set<string>();
  const existing = new Set(existingLoginNames.map(normalizeGuestLoginName));
  const nonEmptyLines = text.split(/\r?\n/).map((value, index) => ({ value: value.trim(), line: index + 1 })).filter(({ value }) => value);

  if (nonEmptyLines.length > 100) issues.push({ line: 0, message: '一次最多导入 100 位宾客' });

  for (const { value, line } of nonEmptyLines.slice(0, 100)) {
    const fields = (value.includes('\t') ? value.split('\t') : value.split(/[|｜]/)).map((field) => field.trim().replace(/\s+/g, ' '));
    if (fields.length < 2 || fields.length > 3) {
      issues.push({ line, message: '请使用“显示姓名 | 登录名 | 桌号（可空）”格式' });
      continue;
    }
    const [name, loginName, tableLabel = ''] = fields;
    if (!name || name.length > 120) {
      issues.push({ line, message: '显示姓名不能为空且不能超过 120 字' });
      continue;
    }
    if (!loginName || loginName.length > 80) {
      issues.push({ line, message: '登录名不能为空且不能超过 80 字' });
      continue;
    }
    if (tableLabel.length > 40) {
      issues.push({ line, message: '桌号或座位不能超过 40 字' });
      continue;
    }
    const normalizedLogin = normalizeGuestLoginName(loginName);
    if (seen.has(normalizedLogin)) {
      issues.push({ line, message: `登录名“${loginName}”在本次名单中重复` });
      continue;
    }
    if (existing.has(normalizedLogin)) {
      issues.push({ line, message: `登录名“${loginName}”已存在；批量导入不会覆盖原宾客` });
      continue;
    }
    seen.add(normalizedLogin);
    rows.push({ name, loginName, tableLabel });
  }

  return { rows, issues };
}
