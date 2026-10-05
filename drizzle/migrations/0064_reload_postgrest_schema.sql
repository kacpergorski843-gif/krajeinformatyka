-- Refresh PostgREST schema cache after creating/updating bilateral agreement RPC.
NOTIFY pgrst, 'reload schema';
