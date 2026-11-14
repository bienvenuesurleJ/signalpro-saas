const fs = require('fs'), path = require('path'), L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const s = await L.session(req);
    if (!s) { res.statusCode = 302; res.setHeader('Location', '/?login=1'); return res.end(); }
    const p = await L.plan(s.plan_code);
    const boot = '<script>window.__SP__=' + JSON.stringify({ email: s.email, plan: s.plan_code, limits: p ? p.limits : {} }).replace(/</g, '\\u003c') + ';</script>';
    const html = fs.readFileSync(path.join(process.cwd(), 'private', 'app.html'), 'utf8').replace('<head>', '<head>' + boot);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(html);
  } catch (e) { console.error(e); res.statusCode = 500; res.end('Erreur serveur.'); }
};
