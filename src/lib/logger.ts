import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function withRequestLogging(handler: Function) {
  return async (request: Request, context?: any) => {
    const requestId = generateRequestId()
    const start = Date.now()
    const method = request?.method ?? 'GET'
    const pathname = request?.url ? new URL(request.url).pathname : '/unknown'

    try {
      const response = handler.length === 0 ? await handler() : await handler(request, context)
      const duration = Date.now() - start

      logger.info(
        {
          requestId,
          method,
          path: pathname,
          status: response.status,
          duration,
        },
        `${method} ${pathname} ${response.status} ${duration}ms`
      )

      response.headers.set('X-Request-ID', requestId)
      return response
    } catch (error) {
      const duration = Date.now() - start
      logger.error(
        {
          requestId,
          method,
          path: pathname,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `${method} ${pathname} ERROR ${duration}ms`
      )
      throw error
    }
  }
}
