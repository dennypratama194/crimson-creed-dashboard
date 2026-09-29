import { z } from "zod";

/** The entry id in `/api/admin/audit/[id]`. */
export const auditEntryIdSchema = z.uuid();
