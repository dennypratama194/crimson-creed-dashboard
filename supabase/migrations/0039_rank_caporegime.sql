-- ============================================================================
-- 0039_rank_caporegime
-- The placeholder rank 'B' is now named. Rename the enum value in place so all
-- stored member rows carry over automatically (RENAME VALUE rewrites nothing).
-- Mirror of the rename in src/lib/constants/enums.ts.
-- ============================================================================

alter type member_rank rename value 'B' to 'CAPOREGIME';
