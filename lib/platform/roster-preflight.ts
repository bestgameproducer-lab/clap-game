export const PLATFORM_ROSTER_MAX_BYTES = 256 * 1024;
export const PLATFORM_ROSTER_MAX_ROWS = 64;

export const PLATFORM_ROSTER_HEADERS = [
  'seat_id',
  'display_name',
  'login_name',
  'seat_type',
  'team',
  'mission_eligible',
  'finale_eligible',
  'notes',
] as const;

export type PlatformRosterExpectedSeat = {
  seatId: string;
  seatType: string;
  team: string;
  missionEligible: boolean;
  finaleEligible: boolean;
};

export type PlatformRosterPreviewRow = PlatformRosterExpectedSeat & {
  displayName: string;
  loginName: string;
  notes: string;
  line: number;
};

export type PlatformRosterIssue = {
  line: number | null;
  message: string;
};

export type PlatformRosterPreflightResult = {
  valid: boolean;
  rows: PlatformRosterPreviewRow[];
  errors: PlatformRosterIssue[];
  warnings: PlatformRosterIssue[];
};

type ParsedCsvRow = { values: string[]; line: number };

function parseCsv(text: string): ParsedCsvRow[] {
  if (text.length > PLATFORM_ROSTER_MAX_BYTES) throw new Error('CSV 超过 256 KB 上限');
  if (text.includes('\0')) throw new Error('CSV 含有不支持的空字符');
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const rows: ParsedCsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteClosed = false;
  let line = 1;
  let rowLine = 1;

  function finishField() {
    row.push(field);
    field = '';
    quoteClosed = false;
  }

  function finishRow() {
    finishField();
    if (row.some((value) => value.trim())) rows.push({ values: row, line: rowLine });
    row = [];
    rowLine = line + 1;
    if (rows.length > PLATFORM_ROSTER_MAX_ROWS + 1) throw new Error(`CSV 最多允许 ${PLATFORM_ROSTER_MAX_ROWS} 行名单`);
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
        if (character === '\n') line += 1;
      }
      continue;
    }

    if (quoteClosed && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error(`第 ${line} 行引号结束后含有多余字符`);
    }
    if (character === '"') {
      if (field.length) throw new Error(`第 ${line} 行引号位置不正确`);
      inQuotes = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      finishRow();
      line += 1;
      rowLine = line;
    } else {
      field += character;
    }
  }
  if (inQuotes) throw new Error(`第 ${rowLine} 行引号没有闭合`);
  if (field.length || row.length) finishRow();
  return rows;
}

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase();
}

function unsafeRosterText(value: string) {
  return /^\s*[=+\-@]/.test(value) || /[<>\u0000-\u001f\u007f]/.test(value);
}

export function validatePlatformRosterCsv(
  text: string,
  expectedSeats: readonly PlatformRosterExpectedSeat[],
): PlatformRosterPreflightResult {
  const errors: PlatformRosterIssue[] = [];
  const warnings: PlatformRosterIssue[] = [];
  const previewRows: PlatformRosterPreviewRow[] = [];
  let parsed: ParsedCsvRow[];
  try {
    parsed = parseCsv(text);
  } catch (error) {
    return { valid: false, rows: [], errors: [{ line: null, message: error instanceof Error ? error.message : 'CSV 无法读取' }], warnings: [] };
  }
  if (!parsed.length) return { valid: false, rows: [], errors: [{ line: null, message: 'CSV 是空的' }], warnings: [] };
  if (parsed[0].values.length !== PLATFORM_ROSTER_HEADERS.length
    || parsed[0].values.some((header, index) => header !== PLATFORM_ROSTER_HEADERS[index])) {
    return { valid: false, rows: [], errors: [{ line: 1, message: 'CSV 表头与空白席位模板不一致，请重新下载模板' }], warnings: [] };
  }

  const dataRows = parsed.slice(1);
  if (dataRows.length !== expectedSeats.length) {
    errors.push({ line: null, message: `名单必须保留全部 ${expectedSeats.length} 个席位，当前有 ${dataRows.length} 行` });
  }
  const expectedById = new Map(expectedSeats.map((seat) => [seat.seatId, seat]));
  const seenSeats = new Set<string>();
  const seenDisplayNames = new Map<string, number>();
  const seenLoginNames = new Map<string, number>();

  for (const parsedRow of dataRows) {
    if (parsedRow.values.length !== PLATFORM_ROSTER_HEADERS.length) {
      errors.push({ line: parsedRow.line, message: `应有 ${PLATFORM_ROSTER_HEADERS.length} 列，当前有 ${parsedRow.values.length} 列` });
      continue;
    }
    const [rawSeatId, rawDisplayName, rawLoginName, rawSeatType, rawTeam, rawMissionEligible, rawFinaleEligible, rawNotes] = parsedRow.values;
    const seatId = rawSeatId.trim();
    const expected = expectedById.get(seatId);
    if (!expected) {
      errors.push({ line: parsedRow.line, message: `未知席位编号 ${seatId || '（空）'}` });
      continue;
    }
    if (seenSeats.has(seatId)) errors.push({ line: parsedRow.line, message: `席位 ${seatId} 重复` });
    seenSeats.add(seatId);

    const displayName = rawDisplayName.trim();
    const loginName = rawLoginName.trim();
    const notes = rawNotes.trim();
    if (!displayName || displayName.length > 120 || unsafeRosterText(displayName)) {
      errors.push({ line: parsedRow.line, message: '显示姓名必须为 1–120 个安全字符' });
    }
    if (!loginName || loginName.length > 80 || unsafeRosterText(loginName) || loginName.includes('@')) {
      errors.push({ line: parsedRow.line, message: '登录名必须为 1–80 个安全字符，且不能填写邮箱地址' });
    }
    if (notes.length > 300 || unsafeRosterText(notes)) {
      errors.push({ line: parsedRow.line, message: '备注最多 300 字，且不能包含公式、标签或控制字符' });
    }

    const normalizedDisplayName = normalizedIdentity(displayName);
    const normalizedLoginName = normalizedIdentity(loginName);
    if (normalizedDisplayName) {
      const priorLine = seenDisplayNames.get(normalizedDisplayName);
      if (priorLine) errors.push({ line: parsedRow.line, message: `显示姓名与第 ${priorLine} 行重复，请加上可区分的称呼` });
      else seenDisplayNames.set(normalizedDisplayName, parsedRow.line);
    }
    if (normalizedLoginName) {
      const priorLine = seenLoginNames.get(normalizedLoginName);
      if (priorLine) errors.push({ line: parsedRow.line, message: `登录名与第 ${priorLine} 行重复` });
      else seenLoginNames.set(normalizedLoginName, parsedRow.line);
    }

    const expectedMissionEligible = String(expected.missionEligible);
    const expectedFinaleEligible = String(expected.finaleEligible);
    if (rawSeatType !== expected.seatType || rawTeam !== expected.team
      || rawMissionEligible !== expectedMissionEligible || rawFinaleEligible !== expectedFinaleEligible) {
      errors.push({ line: parsedRow.line, message: `席位 ${seatId} 的类型、队伍或参与权限已被改动，请恢复模板原值` });
    }
    if (!notes) warnings.push({ line: parsedRow.line, message: `席位 ${seatId} 没有筹备备注，可保留为空` });
    previewRows.push({ ...expected, displayName, loginName, notes, line: parsedRow.line });
  }

  for (const expected of expectedSeats) {
    if (!seenSeats.has(expected.seatId)) errors.push({ line: null, message: `缺少席位 ${expected.seatId}` });
  }
  return { valid: errors.length === 0 && previewRows.length === expectedSeats.length, rows: previewRows, errors, warnings };
}
