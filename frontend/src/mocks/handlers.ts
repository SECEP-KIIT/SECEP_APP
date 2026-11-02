// Every mock handler. Order matters only for the catch-all `fallback`, which must stay last.
import { fallback } from './http/route'
import { actionRoutes } from './routes/actions'
import { adminRoutes } from './routes/admin'
import { emailRoutes } from './routes/emails'
import { meRoutes } from './routes/me'
import { secretRoutes } from './routes/secrets'
import { socketHandler } from './socketio'

export const handlers = [...meRoutes, ...emailRoutes, ...actionRoutes, ...secretRoutes, ...adminRoutes, socketHandler, fallback]
