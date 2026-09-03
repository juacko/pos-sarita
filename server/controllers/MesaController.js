const defaultMesaRepo = require('../repositories/MesaRepository');
const { acquireTableLock, releaseTableLock } = require('../table-lock');

class MesaController {
  constructor(mesaRepo = defaultMesaRepo) {
    this.mesaRepo = mesaRepo;
  }

  obtenerMesas(req, res) {
    try {
      const mesas = this.mesaRepo.obtenerMesas();
      res.json(mesas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerAreas(req, res) {
    try {
      const areas = this.mesaRepo.obtenerAreas();
      res.json(areas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  crearArea(req, res) {
    try {
      const { nombre, tipo, orden } = req.body;
      const tiposValidos = ['SALON', 'DELIVERY', 'PARA_LLEVAR'];
      if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre del área es requerido' });
      if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

      const ordenF = orden != null ? orden : this.mesaRepo.getMaxOrdenArea();
      const area = this.mesaRepo.crearArea(nombre.trim(), tipo, ordenF);
      res.status(201).json(area);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarArea(req, res) {
    try {
      const { nombre, tipo, orden, activo } = req.body;
      const area = this.mesaRepo.obtenerAreaPorId(req.params.id);
      if (!area) return res.status(404).json({ error: 'Área no encontrada' });

      const tiposValidos = ['SALON', 'DELIVERY', 'PARA_LLEVAR'];
      if (nombre !== undefined && !nombre.trim()) return res.status(400).json({ error: 'Nombre del área es requerido' });
      if (tipo !== undefined && !tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      if (activo !== undefined && area.tipo === 'SALON' && !activo) {
        const otrosSalones = this.mesaRepo.contarOtrosSalonesActivos(area.id);
        if (otrosSalones === 0) return res.status(409).json({ error: 'Debe existir al menos un área de Salón activa' });
      }

      const areaActualizada = this.mesaRepo.actualizarArea(
        area.id,
        nombre?.trim() || area.nombre,
        tipo || area.tipo,
        orden != null ? orden : area.orden,
        activo !== undefined ? (activo ? 1 : 0) : area.activo
      );
      res.json(areaActualizada);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  eliminarArea(req, res) {
    try {
      const area = this.mesaRepo.obtenerAreaPorId(req.params.id);
      if (!area) return res.status(404).json({ error: 'Área no encontrada' });

      const otrosSalones = this.mesaRepo.contarOtrosSalones(area.id);
      if (area.tipo === 'SALON' && otrosSalones === 0) {
        return res.status(409).json({ error: 'Debe existir al menos un área de Salón' });
      }

      this.mesaRepo.reasignarMesasYEliminarArea(area.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  crearMesa(req, res, io) {
    try {
      const { numero, nombre, capacidad, area_id, estado } = req.body;

      let numeroF = numero != null ? parseInt(numero) : null;
      if (!numeroF || isNaN(numeroF)) {
        numeroF = this.mesaRepo.getMaxNumeroMesaNormal();
      }
      if (numeroF <= 0) return res.status(400).json({ error: 'Número de mesa inválido' });

      const existe = this.mesaRepo.existeMesaNormal(numeroF);
      if (existe) return res.status(409).json({ error: `Ya existe una mesa con el número ${numeroF}` });

      let areaF = area_id != null ? area_id : null;
      if (areaF != null) {
        const area = this.mesaRepo.obtenerAreaSalon(areaF);
        if (!area) return res.status(400).json({ error: 'Área de salón inválida' });
      }

      const estadosValidos = ['LIBRE', 'OCUPADO', 'RESERVADO', 'CERRANDO', 'INACTIVO'];
      const estadoF = estado && estadosValidos.includes(estado) ? estado : 'LIBRE';

      const mesa = this.mesaRepo.crearMesa(numeroF, (nombre || '').trim() || null, capacidad || 4, areaF, estadoF);
      if (io) io.emit('mesa:updated', mesa);
      res.status(201).json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  crearMesaVirtual(req, res) {
    try {
      const { tipo } = req.body;
      if (!['DELIVERY', 'PARA_LLEVAR'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (DELIVERY o PARA_LLEVAR)' });
      }
      const area = this.mesaRepo.obtenerAreaPorTipo(tipo);
      if (!area) return res.status(404).json({ error: `No existe área de tipo ${tipo}` });

      const base = tipo === 'DELIVERY' ? 899 : 949;
      const maxNum = this.mesaRepo.getMaxNumeroMesaVirtual(base);
      const nombre = tipo === 'DELIVERY' ? 'Delivery' : 'Para Llevar';
      
      const mesa = this.mesaRepo.crearMesaVirtual(maxNum.n + 1, nombre, area.id);
      res.status(201).json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  cambiarAreaMesa(req, res, io) {
    try {
      const { area_id } = req.body;
      const mesa = this.mesaRepo.obtenerMesaPorId(req.params.id);
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
      if (mesa.es_virtual) return res.status(409).json({ error: 'Las mesas virtuales no cambian de área' });

      const area = this.mesaRepo.obtenerAreaSalon(area_id);
      if (!area) return res.status(400).json({ error: 'Área de salón inválida' });

      const mesaUpdated = this.mesaRepo.actualizarAreaMesa(mesa.id, area_id);
      if (io) io.emit('mesa:updated', mesaUpdated);
      res.json(mesaUpdated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerMesa(req, res) {
    try {
      const mesa = this.mesaRepo.obtenerMesaPorId(req.params.id);
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
      res.json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  tomarMesa(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    if (!mesero_id) {
      return res.status(400).json({ error: 'mesero_id es requerido' });
    }

    const mesero = this.mesaRepo.obtenerUsuarioActivo(mesero_id);
    if (!mesero) {
      return res.status(400).json({ error: 'Mesero no encontrado o inactivo' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id).catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = this.mesaRepo.transaction(() => {
        const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };
        if (mesa.estado !== 'LIBRE' && mesa.estado !== 'RESERVADO') {
          throw { status: 409, error: `Mesa en estado ${mesa.estado}`, code: 'NOT_AVAILABLE' };
        }

        const changes = this.mesaRepo.updateMesaTomar(mesaId, mesa.version, mesero_id, mesero.nombre);
        if (changes === 0) {
          throw { status: 409, error: 'Conflicto: mesa fue modificada por otro usuario', code: 'VERSION_CONFLICT' };
        }

        this.mesaRepo.insertLog(mesaId, 'TOMADA', mesero_id, `Mesa tomada por ${mesero.nombre}`);
        return this.mesaRepo.obtenerMesaPorId(mesaId);
      });

      if (io) io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  }

  liberarMesa(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const effectiveUserId = req.body?.mesero_id || req.usuario?.id || 1;

    const lockAcquired = acquireTableLock(mesaId, effectiveUserId).catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = this.mesaRepo.transaction(() => {
        const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };

        if (mesa.estado === 'LIBRE') return mesa;

        if (mesa.mesero_id && effectiveUserId && mesa.mesero_id !== effectiveUserId) {
          const usuario = this.mesaRepo.obtenerUsuario(effectiveUserId);
          if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'cajero')) {
            throw { status: 403, error: 'Solo el mesero asignado, un cajero o un admin pueden liberar esta mesa' };
          }
        }

        if (mesa.estado !== 'OCUPADO' && mesa.estado !== 'CERRANDO' && mesa.estado !== 'RESERVADO') {
          throw { status: 409, error: `No se puede liberar una mesa en estado ${mesa.estado}` };
        }

        const pedidoActivo = this.mesaRepo.tienePedidoActivo(mesaId);
        if (pedidoActivo) {
          throw { status: 409, error: 'Hay un pedido activo. Cierre el pedido antes de liberar la mesa' };
        }

        const changes = this.mesaRepo.updateMesaLiberar(mesaId, mesa.version);
        if (changes === 0) {
          throw { status: 409, error: 'Conflicto de versión', code: 'VERSION_CONFLICT' };
        }

        this.mesaRepo.insertLog(mesaId, 'LIBERADA', effectiveUserId, 'Mesa liberada');
        return this.mesaRepo.obtenerMesaPorId(mesaId);
      });

      if (io) io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  }

  reservarMesa(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const { mesero_id, cliente_nombre, hora } = req.body;

    if (!mesero_id || !cliente_nombre) {
      return res.status(400).json({ error: 'mesero_id y cliente_nombre son requeridos' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id).catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = this.mesaRepo.transaction(() => {
        const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };
        if (mesa.estado !== 'LIBRE') {
          throw { status: 409, error: `Mesa en estado ${mesa.estado}`, code: 'NOT_AVAILABLE' };
        }

        const mesero = this.mesaRepo.obtenerUsuario(mesero_id);
        const changes = this.mesaRepo.updateMesaReservar(mesaId, mesa.version, mesero_id, mesero?.nombre || '');
        
        if (changes === 0) {
          throw { status: 409, error: 'Conflicto de versión', code: 'VERSION_CONFLICT' };
        }

        this.mesaRepo.insertLog(mesaId, 'RESERVADA', mesero_id, `Reservada para ${cliente_nombre} a las ${hora || 'N/A'}`);
        return this.mesaRepo.obtenerMesaPorId(mesaId);
      });

      if (io) io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  }

  cancelarReserva(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    if (!mesero_id) return res.status(400).json({ error: 'mesero_id es requerido' });

    const lockAcquired = acquireTableLock(mesaId, mesero_id).catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = this.mesaRepo.transaction(() => {
        const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };

        if (mesa.estado !== 'RESERVADO') {
          throw { status: 409, error: `No se puede cancelar la reserva de una mesa en estado ${mesa.estado}` };
        }

        if (mesa.mesero_id !== mesero_id) {
          const usuario = this.mesaRepo.obtenerUsuario(mesero_id);
          if (!usuario || usuario.rol !== 'admin') {
            throw { status: 403, error: 'Solo el mesero asignado o un admin pueden cancelar la reserva' };
          }
        }

        const changes = this.mesaRepo.updateMesaLiberar(mesaId, mesa.version);
        if (changes === 0) {
          throw { status: 409, error: 'Conflicto de versión', code: 'VERSION_CONFLICT' };
        }

        this.mesaRepo.insertLog(mesaId, 'RESERVA_CANCELADA', mesero_id, 'Reserva cancelada');
        return this.mesaRepo.obtenerMesaPorId(mesaId);
      });

      if (io) io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  }

  transferirMesa(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const { mesero_id, nuevo_mesero_id } = req.body;

    if (!mesero_id || !nuevo_mesero_id) {
      return res.status(400).json({ error: 'mesero_id y nuevo_mesero_id son requeridos' });
    }

    const nuevoMesero = this.mesaRepo.obtenerUsuarioActivo(nuevo_mesero_id);
    if (!nuevoMesero) {
      return res.status(400).json({ error: 'Nuevo mesero no encontrado o inactivo' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id).catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = this.mesaRepo.transaction(() => {
        const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };

        const usuario = this.mesaRepo.obtenerUsuario(mesero_id);
        if (mesa.mesero_id !== mesero_id && (!usuario || usuario.rol !== 'admin')) {
          throw { status: 403, error: 'No autorizado para transferir esta mesa' };
        }

        this.mesaRepo.updateMesaTransferir(mesaId, nuevo_mesero_id, nuevoMesero.nombre);
        this.mesaRepo.insertLog(mesaId, 'TRANSFERIDA', mesero_id, `Transferida a ${nuevoMesero.nombre}`);

        return this.mesaRepo.obtenerMesaPorId(mesaId);
      });

      if (io) io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    } finally {
      releaseTableLock(mesaId);
    }
  }

  inactivarMesa(req, res, io) {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    const usuario = this.mesaRepo.obtenerUsuario(mesero_id);
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden inactivar mesas' });
    }

    try {
      const mesa = this.mesaRepo.inactivarMesa(mesaId);
      if (io) io.emit('mesa:updated', mesa);
      res.json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarMesa(req, res, io) {
    try {
      const mesaId = parseInt(req.params.id);
      const mesa = this.mesaRepo.obtenerMesaPorId(mesaId);
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

      const { numero, nombre, capacidad, area_id, estado, mesero_id } = req.body;

      const estadosValidos = ['LIBRE', 'OCUPADO', 'RESERVADO', 'CERRANDO', 'INACTIVO'];
      if (estado !== undefined && !estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }

      if (estado === 'INACTIVO' || (estado === undefined && mesa.estado === 'INACTIVO')) {
        if (mesa.estado !== 'INACTIVO') {
          const activo = this.mesaRepo.contarPedidosActivos(mesaId);
          if (activo > 0) return res.status(409).json({ error: 'No se puede inactivar una mesa con pedido activo' });
        }
        if (mesero_id != null) {
          const usuario = this.mesaRepo.obtenerUsuario(mesero_id);
          if (!usuario || usuario.rol !== 'admin') {
            return res.status(403).json({ error: 'Solo administradores pueden inactivar mesas' });
          }
        }
      }

      const numeroF = numero != null ? parseInt(numero) : mesa.numero;
      if (isNaN(numeroF) || numeroF <= 0) return res.status(400).json({ error: 'Número de mesa inválido' });
      const existe = this.mesaRepo.existeMesaNormal(numeroF, mesaId);
      if (existe) return res.status(409).json({ error: `Ya existe una mesa con el número ${numeroF}` });

      const areaF = area_id !== undefined ? area_id : mesa.area_id;
      if (areaF != null) {
        const area = this.mesaRepo.obtenerAreaSalon(areaF);
        if (!area) return res.status(400).json({ error: 'Área de salón inválida' });
      }

      const nombreF = nombre !== undefined ? (nombre || '').trim() || null : mesa.nombre;
      const capacidadF = capacidad != null ? parseInt(capacidad) : mesa.capacidad;
      const estadoF = estado !== undefined ? estado : mesa.estado;

      const updated = this.mesaRepo.actualizarMesa(mesaId, numeroF, nombreF, capacidadF, areaF, estadoF);
      if (io) io.emit('mesa:updated', updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerLogs(req, res) {
    try {
      const logs = this.mesaRepo.obtenerLogs(req.params.id);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new MesaController();
module.exports.MesaController = MesaController;
