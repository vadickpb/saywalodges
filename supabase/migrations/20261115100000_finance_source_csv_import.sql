-- SD-420 (1/2): new ledger source for income/expense rows imported from the owner's CSV template.
-- Own migration: a new enum value cannot be used in the transaction that adds it.
-- Rollback: enum values cannot be dropped; leaving it unused is harmless.
alter type public.finance_source add value if not exists 'csv_import';
