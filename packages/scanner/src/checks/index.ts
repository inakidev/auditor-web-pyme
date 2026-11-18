import type { Check } from './check.js';
import { per01, per02, per03 } from './performance.js';
import { sec05, sec07, sec08, sec09 } from './security/headers.js';
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

/** Checks de seguridad de H3 (SEC-06 y SEC-10 a SEC-16 llegan en H10). */
export const SECURITY_CHECKS: readonly Check[] = [
  sec01,
  sec02,
  sec03,
  sec04,
  sec05,
  sec07,
  sec08,
  sec09,
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

export const ALL_CHECKS: readonly Check[] = [
  ...SECURITY_CHECKS,
  ...SEO_CHECKS,
  ...PERFORMANCE_CHECKS,
];
