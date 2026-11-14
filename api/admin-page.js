const fs = require('fs'), path = require('path'), L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const s = await L.session(req);
    if (!s) { res.statusCode = 302; res.setHeader('Location', '/?login=1'); return res.end(); }
    if (!s.is_admin && s.role !== 'admin') {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<!DOCTYPE html><html><body style="font-family:system-ui;background:#0b0f17;color:#e6ebf5;padding:2rem"><h1>Accès refusé</h1><p>Cette page est réservée aux administrateurs.</p><p><a href="/app" style="color:#4f8cff">Retour à l’application</a></p></body></html>');
    }
    const html = fs.readFileSync(path.join(process.cwd(), 'private', 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(html);
  } catch (e) { console.error(e); res.statusCode = 500; res.end('Erreur serveur.'); }
};
