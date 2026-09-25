/** Destinations used by the e2e suite; requests to them are intercepted in the tests. */
export const E2E_AVARIA_URL = 'https://avaria.e2e.test/'
export const E2E_MACHLAVA_URL = 'https://machlava.e2e.test/'

/** Public-only test configuration for notification enrollment (no real project or keys). */
export const E2E_SUPABASE_URL = 'https://supabase.e2e.test'
export const E2E_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_e2e_test_key'
// A throwaway VAPID *public* key; its private half was never stored.
export const E2E_VAPID_PUBLIC_KEY = 'BAOiElkMtknRirO-pZQFipFTks2BgO6dD9IdAyPBI9kZ-UxyUeik3FeKr_RWjCyvxaeNhMLubl9n6oXe5Ao4ySc'
