/**
 * Middleware centralizado de manejo de errores.
 * Captura errores lanzados de forma sincrónica o asíncrona en los controladores
 * y retorna una estructura JSON uniforme y segura.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || err.error || 'Error interno del servidor';
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

  if (status >= 500) {
    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  const response = {
    error: message,
    code: code
  };

  if (err.mesas) {
    response.mesas = err.mesas;
  }

  res.status(status).json(response);
}

module.exports = errorHandler;
