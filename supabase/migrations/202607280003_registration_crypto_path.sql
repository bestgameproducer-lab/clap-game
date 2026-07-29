-- Supabase installs pgcrypto in the extensions schema. Keep the registration
-- functions' explicit search paths while allowing them to resolve crypt().
alter function registration_guest_list(text)
set search_path = public, extensions;

alter function claim_guest_identity(text, uuid, text, text, timestamptz)
set search_path = public, extensions;
