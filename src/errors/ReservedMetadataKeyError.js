import { APIError } from './APIError.js';

/** The `detail.error_type` the service answers (contract PLAT-API-CODES-1 `reserved_metadata_key`). */
export const RESERVED_METADATA_KEY = 'reserved_metadata_key';

/**
 * HTTP 400 `reserved_metadata_key` (SVC-2.0-METADATA-RESERVED-KEY-REFUSE-1): a save set a reserved ownership key
 * (`scope`, `workspace_id`, `tenant_id`, `team_id`, `owner_key`, `is_global` or `security_scope`) in its metadata or
 * context to a value the server does not stamp. `key` names it (the first in alphabetical order when several differ).
 * Remove or rename the key; resending the same body fails the same way. Still an `APIError`, so `err.status` and
 * `err.detail` keep working.
 */
export class ReservedMetadataKeyError extends APIError {
  constructor(message, status = 400, detail = null) {
    super(message, status, detail);
    this.name = 'ReservedMetadataKeyError';
    this.key = typeof detail?.detail?.key === 'string' ? detail.detail.key : '';
  }
}

/** True when `status` and the parsed body are a `reserved_metadata_key` refusal. */
export function isReservedMetadataKeyBody(status, errorData) {
  return status === 400 && errorData?.detail?.error_type === RESERVED_METADATA_KEY;
}
