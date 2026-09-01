import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { StockService } from '../../server/services/StockService';

describe('StockService', () => {
  let testDb;
  let stockService;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL DEFAULT 10,
        controlar_stock INTEGER DEFAULT 0,
        stock_actual INTEGER DEFAULT 0,
        stock_minimo INTEGER DEFAULT 3
      );
    `);
    stockService = new StockService(testDb);
  });

  it('debe descontar el stock de un producto activo', () => {
    testDb.prepare("INSERT INTO productos (id, nombre, controlar_stock, stock_actual) VALUES (1, 'Hamburguesa', 1, 10)").run();

    const affected = stockService.validarYDescontarStock([{ producto_id: 1, cantidad: 2 }]);

    expect(affected).toHaveLength(1);
    expect(affected[0].stock_actual).toBe(8);

    const row = testDb.prepare('SELECT stock_actual FROM productos WHERE id = 1').get();
    expect(row.stock_actual).toBe(8);
  });

  it('debe lanzar error cuando el producto está AGOTADO (stock_actual <= 0)', () => {
    testDb.prepare("INSERT INTO productos (id, nombre, controlar_stock, stock_actual) VALUES (1, 'Hamburguesa', 1, 0)").run();

    try {
      stockService.validarYDescontarStock([{ producto_id: 1, cantidad: 1 }]);
      expect.fail('Debería haber lanzado error de stock agotado');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.error).toContain('AGOTADO');
    }
  });

  it('debe lanzar error cuando el stock es insuficiente', () => {
    testDb.prepare("INSERT INTO productos (id, nombre, controlar_stock, stock_actual) VALUES (1, 'Hamburguesa', 1, 2)").run();

    try {
      stockService.validarYDescontarStock([{ producto_id: 1, cantidad: 5 }]);
      expect.fail('Debería haber lanzado error de stock insuficiente');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.error).toContain('Stock insuficiente');
    }
  });

  it('no debe modificar productos que no controlan stock', () => {
    testDb.prepare("INSERT INTO productos (id, nombre, controlar_stock, stock_actual) VALUES (1, 'Inka Cola', 0, 0)").run();

    const affected = stockService.validarYDescontarStock([{ producto_id: 1, cantidad: 5 }]);

    expect(affected).toHaveLength(0);
    const row = testDb.prepare('SELECT stock_actual FROM productos WHERE id = 1').get();
    expect(row.stock_actual).toBe(0);
  });

  it('debe reponer el stock al cancelar/eliminar items', () => {
    testDb.prepare("INSERT INTO productos (id, nombre, controlar_stock, stock_actual) VALUES (1, 'Hamburguesa', 1, 5)").run();

    const affected = stockService.reponerStock([{ producto_id: 1, cantidad: 3 }]);

    expect(affected).toHaveLength(1);
    expect(affected[0].stock_actual).toBe(8);
  });

  it('debe emitir socket stock:actualizado correctamente', () => {
    let emittedEvent = null;
    let emittedData = null;

    const mockIo = {
      emit: (event, data) => {
        emittedEvent = event;
        emittedData = data;
      }
    };

    stockService.emitirStockActualizado([
      { id: 1, controlar_stock: 1, stock_actual: 7, stock_minimo: 3 }
    ], mockIo);

    expect(emittedEvent).toBe('stock:actualizado');
    expect(emittedData).toEqual({
      producto_id: 1,
      controlar_stock: 1,
      stock_actual: 7,
      stock_minimo: 3
    });
  });
});
