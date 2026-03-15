export const TRIAL_LENGTH_DAYS = 90;
export const TRIAL_WARNING_WINDOW_DAYS = 7;

export const TRIAL_OFFER_LABEL = `${TRIAL_LENGTH_DAYS}-day free trial`;
export const TRIAL_SHORT_LABEL = `${TRIAL_LENGTH_DAYS}-day`;
export const TRIAL_FULL_ACCESS_LABEL = `Use the full Pro feature set for ${TRIAL_LENGTH_DAYS} days`;

export const getTrialEndDate = (startDate = new Date()) => {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  return new Date(start.getTime() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000);
};
