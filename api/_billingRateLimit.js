// @ts-check

export const CUSTOMER_PORTAL_RATE_LIMIT = Object.freeze({
  max: 10,
  windowMs: 60_000,
  strictShared: true,
});

/**
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} ip
 * @returns {string}
 */
export const buildCustomerPortalRateLimitKey = (userId, ip) => (
  `customer-portal:${String(userId || '').trim()}:${String(ip || 'unknown').trim() || 'unknown'}`
);
