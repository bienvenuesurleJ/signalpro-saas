const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (!L.isJsonPost(req)) return L.json(res, 405, { error: 'Requête refusée.' });
    const s = await L.session(req);
    if (!s) return L.json(res, 401, { error: 'Connecte-toi d’abord.' });
    const { plan, interval } = await L.jsonBody(req);
    const rows = await L.sb(`sp_plans?code=eq.${encodeURIComponent(String(plan))}&is_active=eq.true&select=code,stripe_price_monthly_id,stripe_price_yearly_id`);
    const price = rows[0] && (interval === 'year' ? rows[0].stripe_price_yearly_id : rows[0].stripe_price_monthly_id);
    if (!price) return L.json(res, 400, { error: 'Offre indisponible.' });
    let cust = s.stripe_customer_id;
    if (!cust) {
      const c = await L.stripe('customers', { email: s.email, metadata: { app: 'signalpro', user_id: s.user_id } });
      cust = c.id;
      await L.sb(`sp_users?id=eq.${s.user_id}`, { method: 'PATCH', prefer: 'return=minimal', body: { stripe_customer_id: cust } });
    }
    const site = process.env.SITE_URL, meta = { app: 'signalpro', user_id: s.user_id, plan_code: rows[0].code };
    const cs = await L.stripe('checkout/sessions', {
      mode: 'subscription', customer: cust, line_items: [{ price, quantity: 1 }],
      success_url: site + '/app?paid=1', cancel_url: site + '/?canceled=1',
      client_reference_id: s.user_id, metadata: meta, subscription_data: { metadata: meta }, allow_promotion_codes: true
    });
    return L.json(res, 200, { url: cs.url });
  } catch (e) { console.error(e); return L.json(res, 500, { error: 'Paiement indisponible. Réessaie.' }); }
};
