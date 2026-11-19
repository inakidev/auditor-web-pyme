import { ana01, ana02, ana03, ana04, ana05 } from './analytics.js';
import type { Check } from './check.js';
import { per01, per02, per03 } from './performance.js';
import { sec05, sec07, sec08, sec09 } from './security/headers.js';
import { sec13, sec14, sec15, sec16 } from './security/page.js';
import { sec06, sec10, sec11, sec12 } from './security/policies.js';
import { sec01, sec02, sec03, sec04 } from './security/transport.js';
import {
  seo01,
  seo02,
  seo03,
  seo04,
  seo05,
  seo06,
  seo07,
  seo08,
  seo11,
  seo13,
  seo14,
} from './seo/content.js';
import { seo09, seo10, seo12, seo15 } from './seo/crawl.js';
import { tru01, tru02, tru03, tru04, tru05 } from './trust.js';

/** Checks de seguridad SEC-01 a SEC-16 (H3 y H10). */
export const SECURITY_CHECKS: readonly Check[] = [
  sec01,
  sec02,
  sec03,
  sec04,
  sec05,
  sec06,
  sec07,
  sec08,
  sec09,
  sec10,
  sec11,
  sec12,
  sec13,
  sec14,
  sec15,
  sec16,
];

export const SEO_CHECKS: readonly Check[] = [
  seo01,
  seo02,
  seo03,
  seo04,
  seo05,
  seo06,
  seo07,
  seo08,
  seo09,
  seo10,
  seo11,
  seo12,
  seo13,
  seo14,
  seo15,
];

export const PERFORMANCE_CHECKS: readonly Check[] = [per01, per02, per03];

export const ANALYTICS_CHECKS: readonly Check[] = [ana01, ana02, ana03, ana04, ana05];

export const TRUST_CHECKS: readonly Check[] = [tru01, tru02, tru03, tru04, tru05];

export const ALL_CHECKS: readonly Check[] = [
  ...SECURITY_CHECKS,
  ...SEO_CHECKS,
  ...PERFORMANCE_CHECKS,
  ...ANALYTICS_CHECKS,
  ...TRUST_CHECKS,
];
