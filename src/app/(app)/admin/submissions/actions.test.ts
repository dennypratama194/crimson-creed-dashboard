// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmMemberSubmissionAction,
  rejectMemberSubmissionAction,
} from "@/app/(app)/admin/submissions/actions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireSuperAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const SUBMISSION = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const MATERIAL = "3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: { id: SUBMISSION }, error: null });
});

describe("confirmMemberSubmissionAction", () => {
  it("confirms as submitted when no adjustment is given", async () => {
    await expect(
      confirmMemberSubmissionAction({ submissionId: SUBMISSION }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_member_submission", {
      p_submission_id: SUBMISSION,
      p_lines: null,
      p_note: null,
      p_received_by: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/submissions");
  });

  it("maps adjusted lines to the RPC's snake_case shape", async () => {
    await confirmMemberSubmissionAction({
      submissionId: SUBMISSION,
      lines: [{ materialTypeId: MATERIAL, quantity: 120 }],
      note: " counted twice ",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_member_submission", {
      p_submission_id: SUBMISSION,
      p_lines: [{ material_type_id: MATERIAL, quantity: 120 }],
      p_note: "counted twice",
      p_received_by: null,
    });
  });

  it("rejects negative quantities before the database", async () => {
    const result = await confirmMemberSubmissionAction({
      submissionId: SUBMISSION,
      lines: [{ materialTypeId: MATERIAL, quantity: -5 }],
    });
    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a Super Admin", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(
      confirmMemberSubmissionAction({ submissionId: SUBMISSION }),
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("rejectMemberSubmissionAction", () => {
  it("requires a reason", async () => {
    const result = await rejectMemberSubmissionAction({
      submissionId: SUBMISSION,
      reason: "",
    });
    expect(result).toEqual({ ok: false, error: "A reason is required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects through reject_member_submission", async () => {
    await expect(
      rejectMemberSubmissionAction({
        submissionId: SUBMISSION,
        reason: "wrong month",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("reject_member_submission", {
      p_submission_id: SUBMISSION,
      p_reason: "wrong month",
    });
  });
});
