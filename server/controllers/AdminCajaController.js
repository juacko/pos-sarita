const adminCajaRepo = require('../repositories/AdminCajaRepository');
const adminPedidoRepo = require('../repositories/AdminPedidoRepository');
const pagos = require('../metodos-pago');
const printers = require('../printers');

class AdminCajaController {
  constructor(io) {
    this.io = io;
  }

  obtenerCorteCaja(req, res) {
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const sesion = adminCajaRepo.obtenerSesionConUsuarios('ABIERTA');
      const now = adminCajaRepo.getNow();

      let desglose, totalGeneral, totalPropina, movs, totales, metricas;
      if (sesion) {
        const inicio = sesion.absorbe_desde || sesion.opened_at;
        const dp = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
        desglose = dp.desglose; totalGeneral = dp.totalGeneral; totalPropina = dp.totalPropina;
        const mt = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
        movs = mt.movs; totales = mt.totales;
        metricas = adminCajaRepo.getMetricasSesion(inicio, now);
      } else {
        const dp = adminCajaRepo.getDesglosePagos('date(pg.created_at) = ?', [hoy]);
        desglose = dp.desglose; totalGeneral = dp.totalGeneral; totalPropina = dp.totalPropina;
        const mt = adminCajaRepo.getMovimientosTotales('date(created_at) = ?', [hoy]);
        movs = mt.movs; totales = mt.totales;
        metricas = adminCajaRepo.getMetricasDia(hoy);
      }

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      res.json({
        fecha: hoy, desglose, total_general: totalGeneral, total_propina: totalPropina,
        propina_por_metodo: propinaPorMetodo, sesion: sesion || null, movimientos: movs,
        movimientos_totales: totales, ...metricas
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerFlujoCaja(req, res) {
    try {
      const sesion = adminCajaRepo.obtenerSesionConUsuarios('ABIERTA');
      
      const baseVacia = {
        efectivo: { cantidad: 0, total: 0, total_propina: 0 },
        tarjeta: { cantidad: 0, total: 0, total_propina: 0 },
        transferencia: { cantidad: 0, total: 0, total_propina: 0 },
        yape: { cantidad: 0, total: 0, total_propina: 0 },
        plin: { cantidad: 0, total: 0, total_propina: 0 },
        otros: { cantidad: 0, total: 0, total_propina: 0 },
        regalo: { cantidad: 0, total: 0, total_propina: 0 },
        vale: { cantidad: 0, total: 0, total_propina: 0 }
      };
      for (const key of pagos.getMetodos()) {
        if (!baseVacia[key]) baseVacia[key] = { cantidad: 0, total: 0, total_propina: 0 };
      }

      if (!sesion) {
        return res.json({
          sesion: null, eventos: [], desglose: baseVacia, total_general: 0, total_propina: 0,
          propina_por_metodo: {}, movimientos_totales: { ingresos: 0, egresos: 0, por_metodo: {} },
          efectivo_esperado: null, pagos_sesion_efectivo: 0, total_pedidos: 0, ticket_promedio: 0,
          cancelados: { total: 0 }, descuentos: { total: 0, monto_estimado: 0 },
          vales_usados: { total: 0, suma: 0 }, regalos: { total: 0, suma: 0 }
        });
      }

      const now = adminCajaRepo.getNow();
      const inicio = sesion.absorbe_desde || sesion.opened_at;

      const pagosList = adminCajaRepo.obtenerPagosSesionRango(inicio, now);
      const { movs, totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const { desglose, totalGeneral, totalPropina } = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const metricas = adminCajaRepo.getMetricasSesion(inicio, now);

      const pe = adminCajaRepo.obtenerSumaPagosMetodo('efectivo', inicio, now);
      const mi = adminCajaRepo.obtenerSumaMovimientos('INGRESO', 'efectivo', inicio, now);
      const me = adminCajaRepo.obtenerSumaMovimientos('EGRESO', 'efectivo', inicio, now);
      const pagosSesionEfectivo = pe.t || 0;
      const efectivoEsperado = (sesion.fondo_inicial || 0) + pagosSesionEfectivo + (mi.t || 0) - (me.t || 0);

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      const eventos = [];
      eventos.push({ tipo: 'APERTURA', hora: sesion.opened_at, monto: sesion.fondo_inicial, persona: sesion.usuario_nombre || 'Sistema', concepto: `Fondo inicial: S/${(sesion.fondo_inicial || 0).toFixed(2)}`, metodo: 'efectivo' });
      for (const pg of pagosList) {
        eventos.push({ tipo: 'PAGO', hora: pg.created_at, monto: pg.monto, persona: pg.cajero_nombre || 'Sistema', concepto: `Pedido #${pg.pedido_id} (Total: S/${(pg.pedido_total || 0).toFixed(2)})`, metodo: pg.metodo, propina: pg.propina || 0, referencia: pg.referencia, notas: pg.notas });
      }
      for (const mv of movs) {
        eventos.push({ tipo: mv.tipo, hora: mv.created_at, monto: mv.monto, persona: mv.persona || 'Sistema', concepto: mv.concepto, metodo: mv.metodo_pago, notas: mv.notas });
      }
      eventos.sort((a, b) => new Date(a.hora) - new Date(b.hora));

      let saldo = sesion.fondo_inicial || 0;
      for (const ev of eventos) {
        if (ev.tipo === 'EGRESO') saldo -= ev.monto;
        else if (ev.tipo === 'PAGO' || ev.tipo === 'INGRESO' || ev.tipo === 'APERTURA') saldo += ev.monto;
        ev.saldo = saldo;
      }

      res.json({
        sesion, eventos, desglose, total_general: totalGeneral, total_propina: totalPropina,
        propina_por_metodo: propinaPorMetodo, movimientos_totales: totales,
        efectivo_esperado: efectivoEsperado, pagos_sesion_efectivo: pagosSesionEfectivo, ...metricas
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerBloqueantes(req, res) {
    try { res.json({ mesas: adminCajaRepo.getMesasBloqueantes() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerSesionActual(req, res) {
    try {
      const sesion = adminCajaRepo.obtenerSesionConUsuarios('ABIERTA');
      if (!sesion) return res.json(null);

      const now = adminCajaRepo.getNow();
      const inicio = sesion.absorbe_desde || sesion.opened_at;
      const { desglose, totalGeneral, totalPropina } = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const { movs, totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const metricas = adminCajaRepo.getMetricasSesion(inicio, now);

      const pagosEfectivo = desglose.efectivo?.total || 0;
      const efectivoEsperado = (sesion.fondo_inicial || 0) + pagosEfectivo
        + (totales.por_metodo.efectivo?.ingresos || 0) - (totales.por_metodo.efectivo?.egresos || 0);

      res.json({
        ...sesion, total_ventas: totalGeneral, propinas: totalPropina,
        total_pedidos: metricas.total_pedidos, desglose, movimientos_totales: totales,
        movimientos: movs, pagos_efectivo: pagosEfectivo, efectivo_esperado: efectivoEsperado
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  abrirCaja(req, res) {
    try {
      const { usuario_id, fondo_inicial, notas } = req.body;
      if (!usuario_id) return res.status(400).json({ error: 'usuario_id requerido' });

      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const nuevaSesion = adminCajaRepo.ejecutarTransaccion(() => {
        const abierta = adminCajaRepo.sesionCajaAbierta();
        if (abierta) throw new Error('Ya hay una sesión de caja abierta');

        let absorbe_desde = adminCajaRepo.sesionCajaCerradaUltima();
        if (!absorbe_desde) {
          const { pagoMin, movMin } = adminCajaRepo.sesionCajaMinimos();
          absorbe_desde = pagoMin || movMin || null;
        }

        return adminCajaRepo.abrirSesionCaja(usuario_id, fondo_inicial, notas, absorbe_desde);
      });

      if (this.io) this.io.emit('caja:updated', { estado: 'ABIERTA', sesion_id: nuevaSesion.id });
      res.status(201).json(nuevaSesion);
    } catch (e) {
      if (e.message === 'Ya hay una sesión de caja abierta') {
        const abierta = adminCajaRepo.sesionCajaAbierta();
        return res.status(409).json({ error: e.message, sesion: abierta });
      }
      res.status(500).json({ error: e.message });
    }
  }

  cerrarCaja(req, res) {
    try {
      const { efectivo_contado, notas, usuario_id } = req.body;
      if (!usuario_id) return res.status(400).json({ error: 'usuario_id requerido' });
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const result = adminCajaRepo.ejecutarTransaccion(() => {
        const sesion = adminCajaRepo.sesionCajaAbierta();
        if (!sesion) throw new Error('No hay sesión de caja abierta');

        const bloqueantes = adminCajaRepo.getMesasBloqueantes();
        if (bloqueantes.length > 0) {
          const err = new Error('No se puede cerrar la caja: hay mesas sin liberar o con cobro pendiente');
          err.mesas = bloqueantes;
          err.status = 409;
          throw err;
        }

        const now = adminCajaRepo.getNow();
        const inicio = sesion.absorbe_desde || sesion.opened_at;
        const { desglose, totalGeneral, totalPropina } = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
        const { totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
        const metricas = adminCajaRepo.getMetricasSesion(inicio, now);

        const fondo = sesion.fondo_inicial || 0;
        const efectivo = parseFloat(efectivo_contado) || 0;
        const pagosEfectivo = desglose.efectivo?.total || 0;
        const ingresosEfectivo = totales.por_metodo.efectivo?.ingresos || 0;
        const egresosEfectivo = totales.por_metodo.efectivo?.egresos || 0;
        const efectivoEsperado = fondo + pagosEfectivo + ingresosEfectivo - egresosEfectivo;
        const sobranteFaltante = efectivo - efectivoEsperado;

        adminCajaRepo.cerrarSesionCaja(sesion.id, efectivo, notas, now, totalGeneral, totalPropina, efectivoEsperado, sobranteFaltante, metricas.total_pedidos, desglose, usuario_id);

        const propinaPorMetodo = {};
        for (const [k, v] of Object.entries(desglose)) {
          if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
        }

        return {
          sesion_id: sesion.id, fondo, totalGeneral, pedidosC: metricas.total_pedidos, 
          totalPropina, propinaPorMetodo, desglose, pagosEfectivo, 
          ingresosEfectivo, egresosEfectivo, efectivoEsperado, 
          efectivo, sobranteFaltante
        };
      });

      if (this.io) this.io.emit('caja:updated', { estado: 'CERRADA', sesion_id: result.sesion_id });

      res.json({
        ok: true, sesion_id: result.sesion_id, fondo_inicial: result.fondo,
        total_ventas: result.totalGeneral, total_pedidos: result.pedidosC,
        propinas: result.totalPropina, propina_por_metodo: result.propinaPorMetodo,
        desglose: result.desglose, pagos_efectivo: result.pagosEfectivo,
        ingresos_efectivo: result.ingresosEfectivo, egresos_efectivo: result.egresosEfectivo,
        efectivo_esperado: result.efectivoEsperado, efectivo_contado: result.efectivo,
        sobrante_faltante: result.sobranteFaltante
      });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message, mesas: e.mesas });
      if (e.message === 'No hay sesión de caja abierta') return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  }

  imprimirCorteX(req, res) {
    try {
      const sesion = adminCajaRepo.obtenerSesionConUsuarios('ABIERTA');
      if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta para emitir Corte X' });

      const now = adminCajaRepo.getNow();
      const inicio = sesion.absorbe_desde || sesion.opened_at;
      const { desglose, totalGeneral, totalPropina } = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const { movs, totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const metricas = adminCajaRepo.getMetricasSesion(inicio, now);

      const pagosEfectivo = desglose.efectivo?.total || 0;
      const ingEf = totales.por_metodo.efectivo?.ingresos || 0;
      const egrEf = totales.por_metodo.efectivo?.egresos || 0;
      const efectivoEsperado = (sesion.fondo_inicial || 0) + pagosEfectivo + ingEf - egrEf;

      const corteData = {
        sesion_id: sesion.id, opened_at: sesion.opened_at, cajero_nombre: sesion.usuario_nombre,
        fondo_inicial: sesion.fondo_inicial || 0, total_ventas: totalGeneral,
        total_pedidos: metricas.total_pedidos, propinas: totalPropina, desglose,
        pagos_efectivo: pagosEfectivo, ingresos_efectivo: ingEf, egresos_efectivo: egrEf,
        efectivo_esperado: efectivoEsperado, ticket_promedio: metricas.ticket_promedio,
        cancelados: metricas.cancelados, descuentos: metricas.descuentos, movimientos: movs
      };

      printers.printCorteCaja('X', corteData);
      res.json({ ok: true, data: corteData });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  imprimirCorteZ(req, res) {
    try {
      const { sesion_id, arqueo_desglose } = req.body || {};
      let sesion;
      if (sesion_id) sesion = adminCajaRepo.obtenerSesionPorId(sesion_id);
      else sesion = adminCajaRepo.obtenerSesionCerradaReciente();

      if (!sesion) return res.status(404).json({ error: 'No se encontró la sesión de caja' });

      const inicio = sesion.absorbe_desde || sesion.opened_at;
      const fin = sesion.closed_at || adminCajaRepo.getNow();

      let desglose = null;
      if (sesion.desglose_json) {
        try { desglose = JSON.parse(sesion.desglose_json); } catch { desglose = null; }
      }
      if (!desglose) {
        const dp = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, fin]);
        desglose = dp.desglose;
      }

      const { movs, totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, fin]);
      const metricas = adminCajaRepo.getMetricasSesion(inicio, fin);

      const pagosEfectivo = desglose.efectivo?.total || 0;
      const ingEf = totales.por_metodo.efectivo?.ingresos || 0;
      const egrEf = totales.por_metodo.efectivo?.egresos || 0;
      const efectivoEsperado = sesion.efectivo_esperado != null
        ? sesion.efectivo_esperado
        : ((sesion.fondo_inicial || 0) + pagosEfectivo + ingEf - egrEf);

      const corteData = {
        sesion_id: sesion.id, opened_at: sesion.opened_at, closed_at: sesion.closed_at,
        cajero_nombre: sesion.usuario_nombre, cerrada_por_nombre: sesion.cerrado_por_nombre,
        fondo_inicial: sesion.fondo_inicial || 0, total_ventas: sesion.total_ventas ?? metricas.suma_pedidos ?? 0,
        total_pedidos: sesion.total_pedidos ?? metricas.total_pedidos ?? 0, propinas: sesion.propinas ?? 0,
        desglose, pagos_efectivo: pagosEfectivo, ingresos_efectivo: ingEf, egresos_efectivo: egrEf,
        efectivo_esperado: efectivoEsperado, efectivo_contado: sesion.efectivo_contado,
        sobrante_faltante: sesion.sobrante_faltante, notas_cierre: sesion.notas_cierre,
        ticket_promedio: metricas.ticket_promedio, cancelados: metricas.cancelados,
        descuentos: metricas.descuentos, movimientos: movs, arqueo_desglose: arqueo_desglose || null
      };

      printers.printCorteCaja('Z', corteData);
      res.json({ ok: true, data: corteData });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerMovimientos(req, res) {
    try {
      const sesion = adminCajaRepo.sesionCajaAbierta();
      if (!sesion) return res.json([]);
      const now = adminCajaRepo.getNow();
      const inicio = sesion.absorbe_desde || sesion.opened_at;
      res.json(adminCajaRepo.obtenerMovimientosSesionRango(inicio, now));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearMovimiento(req, res) {
    try {
      const { tipo, concepto, monto, metodo_pago, persona, usuario_id, notas } = req.body;
      if (!['INGRESO', 'EGRESO'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser INGRESO o EGRESO' });
      if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'concepto requerido' });
      const montoF = parseFloat(monto);
      if (!montoF || montoF <= 0) return res.status(400).json({ error: 'monto inválido' });
      const metodosCaja = ['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', ...pagos.getMetodos()];
      if (!metodo_pago || !metodosCaja.includes(metodo_pago)) {
        return res.status(400).json({ error: 'metodo_pago inválido' });
      }
      const nuevoMov = adminCajaRepo.registrarMovimiento(tipo, concepto.trim(), montoF, metodo_pago, persona, usuario_id, notas);
      if (this.io) this.io.emit('caja:updated', { movimiento: nuevoMov });
      res.status(201).json(nuevoMov);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  eliminarMovimiento(req, res) {
    try {
      const success = adminCajaRepo.eliminarMovimiento(req.params.id);
      if (!success) return res.status(404).json({ error: 'Movimiento no encontrado' });
      if (this.io) this.io.emit('caja:updated', { deleted_id: req.params.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  imprimirMovimientos(req, res) {
    try {
      const sesion = adminCajaRepo.sesionCajaAbierta();
      if (!sesion) return res.json({ ok: true });
      const now = adminCajaRepo.getNow();
      const inicio = sesion.absorbe_desde || sesion.opened_at;
      const { movs, totales } = adminCajaRepo.getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      printers.printResumenMovimientos(now, movs, totales);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerSesionesCerradas(req, res) {
    try {
      const sesiones = adminCajaRepo.obtenerTodasSesionesCerradas();
      for (const s of sesiones) {
        try { s.desglose = s.desglose_json ? JSON.parse(s.desglose_json) : null; } catch { s.desglose = null; }
      }
      res.json(sesiones);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerSesionCerradaId(req, res) {
    try {
      const sesion = adminCajaRepo.obtenerSesionPorId(req.params.id);
      if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });

      const inicio = sesion.absorbe_desde || sesion.opened_at;
      const fin = sesion.closed_at || adminCajaRepo.getNow();

      const pagosList = adminCajaRepo.obtenerPagosSesionRango(inicio, fin);
      const movimientos = adminCajaRepo.obtenerMovimientosSesionRango(inicio, fin);

      let desglose = null;
      if (sesion.desglose_json) {
        try { desglose = JSON.parse(sesion.desglose_json); } catch { desglose = null; }
      }
      if (!desglose) {
        const dp = adminCajaRepo.getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, fin]);
        desglose = dp.desglose;
      }

      res.json({ sesion, pagos: pagosList, movimientos, desglose });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
}

module.exports = AdminCajaController;
