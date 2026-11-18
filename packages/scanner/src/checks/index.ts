import type { Check } from './check.js';
import { sec05, sec07, sec08, sec09 } from './security/headers.js';
import { sec01, sec02, sec03, sec04 } from './security/transport.js';

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
