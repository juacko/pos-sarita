import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PagoService } from '../../server/services/PagoService';

describe('PagoService', () => {
  let testDb;
  let pagoService;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL DEFAULT 0
      );
      CREATE TABLE descuentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL
      );
      CREATE TABLE pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        monto REAL NOT NULL
      );
      CREATE TABLE caja_sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estado TEXT NOT NULL
      );
    `);
    pagoService = new PagoService(testDb);
  });

  it('debe calcular el total sin descuentos', () => {
    testDb.prepare('INSERT INTO pedidos (id, total) VALUES (1, 100)').run();

    const result = pagoService.calcularTotalConDescuentos(1);

    expect(result.totalBruto).toBe(100);
    expect(result.totalDescuento).toBe(0);
    expect(result.totalFinal).toBe(100);
  });

  it('debe calcular descuento por porcentaje', () => {
    testDb.prepare('INSERT INTO pedidos (id, total) VALUES (1, 100)').run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor) VALUES (1, 'porcentaje', 10)").run();

    const result = pagoService.calcularTotalConDescuentos(1);

    expect(result.totalBruto).toBe(100);
    expect(result.descuentoPorcentaje).toBe(10);
    expect(result.totalDescuento).toBe(10);
    expect(result.totalFinal).toBe(90);
  });

  it('debe calcular descuento por monto fijo', () => {
    testDb.prepare('INSERT INTO pedidos (id, total) VALUES (1, 100)').run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor) VALUES (1, 'monto_fijo', 15)").run();

    const result = pagoService.calcularTotalConDescuentos(1);

    expect(result.totalBruto).toBe(100);
    expect(result.descuentoFijo).toBe(15);
    expect(result.totalDescuento).toBe(15);
    expect(result.totalFinal).toBe(85);
  });

  it('debe calcular descuentos combinados (porcentaje + fijo)', () => {
    testDb.prepare('INSERT INTO pedidos (id, total) VALUES (1, 100)').run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor) VALUES (1, 'porcentaje', 10)").run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor) VALUES (1, 'monto_fijo', 5)").run();

    const result = pagoService.calcularTotalConDescuentos(1);

    expect(result.totalBruto).toBe(100);
    expect(result.totalDescuento).toBe(15);
    expect(result.totalFinal).toBe(85);
  });

  it('debe calcular resumen de pago con pagos previos', () => {
    testDb.prepare('INSERT INTO pedidos (id, total) VALUES (1, 100)').run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor) VALUES (1, 'porcentaje', 10)").run();
    testDb.prepare('INSERT INTO pagos (pedido_id, monto) VALUES (1, 40)').run();

    const resumen = pagoService.obtenerResumenPago(1);

    expect(resumen.totalFinal).toBe(90);
    expect(resumen.pagado).toBe(40);
    expect(resumen.pendiente).toBe(50);
    expect(resumen.completado).toBe(false);
  });

  it('debe identificar una sesión de caja abierta', () => {
    testDb.prepare("INSERT INTO caja_sesiones (id, estado) VALUES (1, 'CERRADA')").run();
    testDb.prepare("INSERT INTO caja_sesiones (id, estado) VALUES (2, 'ABIERTA')").run();

    const sesion = pagoService.obtenerSesionCajaAbierta();

    expect(sesion).not.toBeNull();
    expect(sesion.id).toBe(2);
    expect(sesion.estado).toBe('ABIERTA');
  });
});
