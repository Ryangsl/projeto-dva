import type { NextFunction, Request, Response } from 'express';

// Envolve handlers async para encaminhar erros ao error middleware sem try/catch repetido.
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
