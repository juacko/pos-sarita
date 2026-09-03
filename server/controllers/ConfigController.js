const configRepo = require('../repositories/ConfigRepository');

class ConfigController {
  obtenerConfiguracion(req, res) {
    try {
      const filas = configRepo.obtenerTodas();
      const out = {};
      for (const f of filas) {
        try { out[f.clave] = JSON.parse(f.valor); } catch { out[f.clave] = f.valor; }
      }
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarConfiguracion(req, res) {
    try {
      const { clave } = req.params;
      const { valor } = req.body;
      if (valor === undefined) return res.status(400).json({ error: 'valor requerido' });
      let valorStr = valor;
      if (typeof valor === 'object') valorStr = JSON.stringify(valor);
      else {
        try { JSON.parse(valor); valorStr = JSON.stringify(JSON.parse(valor)); } catch { /* texto plano */ }
      }
      configRepo.actualizar(clave, valorStr);
      res.json({ ok: true, clave });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
}

module.exports = new ConfigController();
