const defaultDb = require('../db');

class AdminProductoRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerProductos(categoria_id, activo) {
    let sql = `SELECT p.*, c.nombre as categoria_nombre, c.color as categoria_color
               FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id`;
    const wheres = [];
    const params = [];
    if (categoria_id) { wheres.push('p.categoria_id = ?'); params.push(categoria_id); }
    if (activo !== undefined) { wheres.push('p.activo = ?'); params.push(activo); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY p.nombre';
    return this.db.prepare(sql).all(...params);
  }

  obtenerProductosCompletos() {
    const productos = this.db.prepare(`
      SELECT p.*, c.nombre as categoria_nombre, c.color as categoria_color
      FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.nombre, p.nombre
    `).all();
    for (const p of productos) {
      p.variantes = this.db.prepare('SELECT * FROM variantes WHERE producto_id = ? AND activo = 1 ORDER BY precio_adicional').all(p.id);
      p.modificadores = this.db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(p.id);
      for (const m of p.modificadores) {
        m.opciones = this.db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
      }
      p.agregados = this.db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(p.id);
    }
    return productos;
  }

  obtenerProductoPorId(id) {
    return this.db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  }

  crearProducto(nombre, descripcion, precio, categoria_id, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo) {
    const r = this.db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria_id, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        nombre,
        descripcion || '',
        precio,
        categoria_id || null,
        para_llevar ? 1 : 0,
        destino_override || null,
        controlar_stock ? 1 : 0,
        Math.max(0, parseInt(stock_actual, 10) || 0),
        Math.max(0, parseInt(stock_minimo, 10) || 3)
      );
    return this.obtenerProductoPorId(r.lastInsertRowid);
  }

  actualizarProducto(id, nombre, descripcion, precio, categoria_id, activo, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo) {
    this.db.prepare('UPDATE productos SET nombre=?, descripcion=?, precio=?, categoria_id=?, activo=?, para_llevar=?, destino_override=?, controlar_stock=?, stock_actual=?, stock_minimo=? WHERE id=?')
      .run(nombre, descripcion || '', precio, categoria_id || null, activo, para_llevar, destino_override || null, controlar_stock, stock_actual, stock_minimo, id);
    return this.obtenerProductoPorId(id);
  }

  obtenerVariantes(producto_id) {
    return this.db.prepare('SELECT * FROM variantes WHERE producto_id = ? ORDER BY precio_adicional').all(producto_id);
  }
  
  obtenerVariantePorId(id) {
    return this.db.prepare('SELECT * FROM variantes WHERE id = ?').get(id);
  }

  crearVariante(producto_id, nombre, precio_adicional) {
    const r = this.db.prepare('INSERT INTO variantes (producto_id, nombre, precio_adicional) VALUES (?,?,?)')
      .run(producto_id, nombre, precio_adicional || 0);
    return this.obtenerVariantePorId(r.lastInsertRowid);
  }

  actualizarVariante(id, nombre, precio_adicional, activo) {
    this.db.prepare('UPDATE variantes SET nombre=?, precio_adicional=?, activo=? WHERE id=?')
      .run(nombre, precio_adicional || 0, activo ?? 1, id);
    return this.obtenerVariantePorId(id);
  }

  eliminarVariante(id) {
    this.db.prepare('DELETE FROM variantes WHERE id = ?').run(id);
  }

  obtenerModificadores(producto_id) {
    const mods = this.db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(producto_id);
    for (const m of mods) {
      m.opciones = this.db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
    }
    return mods;
  }
  
  obtenerModificadorPorId(id) {
    return this.db.prepare('SELECT * FROM modificadores WHERE id = ?').get(id);
  }

  crearModificador(producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id) {
    const r = this.db.prepare('INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id) VALUES (?,?,?,?,?,?)')
      .run(producto_id, nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1, depende_variante_id || null);
    return this.obtenerModificadorPorId(r.lastInsertRowid);
  }

  actualizarModificador(id, nombre, tipo, requerido, max_opciones, activo, depende_variante_id) {
    this.db.prepare('UPDATE modificadores SET nombre=?, tipo=?, requerido=?, max_opciones=?, activo=?, depende_variante_id=? WHERE id=?')
      .run(nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1, activo ?? 1, depende_variante_id || null, id);
    return this.obtenerModificadorPorId(id);
  }

  eliminarModificador(id) {
    this.db.prepare('DELETE FROM opciones_mod WHERE modificador_id = ?').run(id);
    this.db.prepare('DELETE FROM modificadores WHERE id = ?').run(id);
  }

  obtenerOpcionModPorId(id) {
    return this.db.prepare('SELECT * FROM opciones_mod WHERE id = ?').get(id);
  }

  crearOpcionMod(modificador_id, nombre, precio_adicional) {
    const r = this.db.prepare('INSERT INTO opciones_mod (modificador_id, nombre, precio_adicional) VALUES (?,?,?)')
      .run(modificador_id, nombre, precio_adicional || 0);
    return this.obtenerOpcionModPorId(r.lastInsertRowid);
  }

  actualizarOpcionMod(id, nombre, precio_adicional, activo) {
    this.db.prepare('UPDATE opciones_mod SET nombre=?, precio_adicional=?, activo=? WHERE id=?')
      .run(nombre, precio_adicional || 0, activo ?? 1, id);
    return this.obtenerOpcionModPorId(id);
  }

  eliminarOpcionMod(id) {
    this.db.prepare('DELETE FROM opciones_mod WHERE id = ?').run(id);
  }

  obtenerAgregados(producto_id) {
    return this.db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(producto_id);
  }
  
  obtenerAgregadoPorId(id) {
    return this.db.prepare('SELECT * FROM agregados WHERE id = ?').get(id);
  }

  crearAgregado(producto_id, nombre, precio, maximo) {
    const r = this.db.prepare('INSERT INTO agregados (producto_id, nombre, precio, maximo) VALUES (?,?,?,?)')
      .run(producto_id, nombre, precio, maximo || 5);
    return this.obtenerAgregadoPorId(r.lastInsertRowid);
  }

  actualizarAgregado(id, nombre, precio, maximo, activo) {
    this.db.prepare('UPDATE agregados SET nombre=?, precio=?, maximo=?, activo=? WHERE id=?')
      .run(nombre, precio, maximo || 5, activo ?? 1, id);
    return this.obtenerAgregadoPorId(id);
  }

  eliminarAgregado(id) {
    this.db.prepare('DELETE FROM agregados WHERE id = ?').run(id);
  }
}

module.exports = new AdminProductoRepository();
