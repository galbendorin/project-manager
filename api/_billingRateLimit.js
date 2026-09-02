export const CUSTOMER_PORTAL_RATE_LIMIT = Object.freeze({
  max: 10,
  windowMs: 60_000,
  strictShared: true,
});

export const buildCustomerPortalRateLimitKey = (userId, ip) => (
  `customer-portal:${String(userId || '').trim()}:${String(ip || 'unknown').trim() || 'unknown'}`
);
