/**
 * Link rows of a memory's neighbors and a decision's provenance (BUG-SUPERSEDE-ISOLATES-REPLACEMENT-1).
 *
 * Contract: smart-memory-docs/docs/features/BUG-SUPERSEDE-ISOLATES-REPLACEMENT-1/inherited-links-contract.json.
 * A decision that replaced another keeps the original's links: subject links are copied onto it (its own rows,
 * `inherited` false), every other link of the original is inherited on read (`inherited` true, `inherited_from`
 * names the replaced decision that holds it). Typing only: the SDK returns the service's JSON as is.
 */

/** @typedef {'subject'|'support'|'chain'|'infra'|'other'} LinkClass */

/**
 * One row of `GET /memory/{item_id}/neighbors`.
 * @typedef {Object} NeighborRow
 * @property {string} item_id
 * @property {string|null} content
 * @property {string} memory_type
 * @property {string} node_category
 * @property {string|null} entity_name
 * @property {string} link_type
 * @property {'outgoing'|'incoming'} direction
 * @property {LinkClass} link_class
 * @property {boolean} inherited
 * @property {string|null} inherited_from The replaced decision holding the link (nearest wins).
 * @property {number|null} inherited_depth 1 for the decision replaced directly, 2 for the one before, ...
 * @property {string} [status] Only on a decision's replaces row (`link_class` `chain`).
 */

/**
 * One entry of a decision provenance's `inherited_links`.
 * @typedef {Object} InheritedLink
 * @property {Object} memory The far end's record.
 * @property {string} memory_id
 * @property {string} memory_type
 * @property {string|null} content
 * @property {string} link_type
 * @property {'outgoing'|'incoming'} direction Relative to the replaced decision.
 * @property {LinkClass} link_class
 * @property {string|null} role
 * @property {true} inherited
 * @property {string} inherited_from
 * @property {number} inherited_depth
 */

export {};
