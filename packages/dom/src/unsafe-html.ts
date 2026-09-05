/**
 * Installs unsafe-HTML range rendering for explicit low-level runtime hosts.
 * Compiled modules that call `unsafeHtml()` select this integration automatically.
 */
import { installUnsafeHtmlIntegration } from './unsafe-html-integration.js';

installUnsafeHtmlIntegration();
