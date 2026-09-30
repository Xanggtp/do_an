export function notFound(request, response) {
  response.status(404).json({ message: `Route not found: ${request.method} ${request.originalUrl}` });
}

export function errorHandler(error, request, response, next) {
  console.error(error);
  if (response.headersSent) return next(error);

  const status = error.name === 'ValidationError' ? 400 : error.statusCode || 500;
  response.status(status).json({
    message: status === 500 ? 'Something went wrong on the server.' : error.message
  });
}
