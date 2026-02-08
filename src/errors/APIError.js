export class APIError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [status=0] - HTTP status code (0 for network errors)
   * @param {Object|null} [detail=null] - Error detail from API response
   */
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}
