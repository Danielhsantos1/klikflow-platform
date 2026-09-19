# Services

Thin wrappers around external integrations and cross-feature data access
(e.g. a future `tenants.service.ts`, `orders.service.ts`). Kept separate
from `features/*` so feature UI code doesn't reach into Supabase directly.
