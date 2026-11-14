const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (!L.isJsonPost(req)) return L.json(res, 405, { error: 'Requête refusée.' });
    const s = await L.session(req);
    if (!s || !s.stripe_customer_id) return L.json(res, 400, { error: 'Aucun abonnement à gérer.' });
    const p = { customer: s.stripe_customer_id, return_url: process.env.SITE_URL + '/' };
    if (process.env.STRIPE_PORTAL_CONFIG) p.configuration = process.env.STRIPE_PORTAL_CONFIG;
    const ps = await L.stripe('billing_portal/sessions', p);
    return L.json(res, 200, { url: ps.url });
  } catch (e) { console.error(e); return L.json(res, 500, { error: 'Portail indisponible.' }); }
};
