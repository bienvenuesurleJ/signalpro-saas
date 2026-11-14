const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const rows = await L.sb('sp_plans?is_active=eq.true&select=code,name,sort_order,limits,currency,price_monthly_cents,price_yearly_cents&order=sort_order');
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return L.json(res, 200, rows);
  } catch (e) { console.error(e); return L.json(res, 500, { error: 'Erreur serveur.' }); }
};
