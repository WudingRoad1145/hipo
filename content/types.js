/**
 * @typedef {Object} ContentAnalysis
 * @property {string} url - The page URL
 * @property {string} domain - The website domain
 * @property {string} title - Page title
 * @property {string} content - Extracted content
 * @property {Object} metadata - Content metadata
 * @property {number} timestamp - Analysis timestamp
 */

/**
 * @typedef {Object} ExtractorSettings
 * @property {number} minContentLength - Minimum content length to analyze
 * @property {number} maxAnalysisFrequency - Minimum time between analyses
 * @property {boolean} enableDynamicAnalysis - Whether to enable dynamic content monitoring
 */

export { ContentAnalysis, ExtractorSettings };