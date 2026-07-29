import { requireAdmin } from '@/lib/auth';
import { getAdminCsvExport, type AdminExportKind } from '@/lib/data/export';
import { ApiError, apiErrorResponse } from '@/lib/errors';

const EXPORT_KINDS = new Set<AdminExportKind>(['guests', 'assignments', 'points', 'team-points', 'audit']);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const kind = new URL(request.url).searchParams.get('type') as AdminExportKind | null;
    if (!kind || !EXPORT_KINDS.has(kind)) throw new ApiError(400, '导出类型无效');
    const result = await getAdminCsvExport(kind);
    return new Response(result.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) { return apiErrorResponse(error); }
}
