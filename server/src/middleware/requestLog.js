export function requestLog(req, res, next) {
  const started = process.hrtime.bigint();
  const path = req.originalUrl.split('?')[0];
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
