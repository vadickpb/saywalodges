-- SD-419 (1/2): new ledger source for rows imported from the Airbnb earnings CSV.
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
-- Rollback: enum values cannot be dropped; leaving it unused is harmless.
alter type public.finance_source add value if not exists 'airbnb_csv';
