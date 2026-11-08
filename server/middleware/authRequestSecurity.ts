import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const requireSameOriginJsonRequest: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (request.method !== 'POST') return next();

  if (!request.is('application/json')) {
    return response.status(415).json({ error: 'Cette opération nécessite une requête JSON.' });
  }

  const origin = request.get('origin');
  if (origin) {
    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(
        String(process.env.APP_URL || `${request.protocol}://${request.get('host') || ''}`),
      ).origin;
    } catch {
      return response.status(503).json({ error: 'La sécurité de cette connexion est momentanément indisponible.' });
    }

    if (origin === 'null' || origin !== expectedOrigin) {
      return response.status(403).json({ error: 'Origine de connexion refusée.' });
    }
  }

  return next();
};
