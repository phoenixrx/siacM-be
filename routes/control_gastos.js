const express = require('express');
const router = express.Router();
const { retornar_query } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');

// GET /api/control_gastos
router.get('/gastos', async (req, res) => {
    const { fechaInicio, fechaFin, categoria, estado, proveedor, id_cli } = req.query;
    
    let query = `
        SELECT 
            g.*,
            c.nombre as categoria_nombre,
            p.nombre as proveedor_nombre
        FROM gastos g
        LEFT JOIN categorias_gastos c ON g.categoria_id = c.id
        LEFT JOIN proveedores p ON g.proveedor_id = p.id_proveedor
        WHERE 1=1
    `;
    
    let params = [];
    
    if (fechaInicio && fechaFin) {
        query += ` AND g.fecha_gasto BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
    }
    
    if (categoria) {
        query += ` AND g.categoria_id = ?`;
        params.push(categoria);
    }
    
    if (estado) {
        query += ` AND g.estado = ?`;
        params.push(estado);
    }
    
    if (proveedor) {
        query += ` AND g.proveedor_id = ?`;
        params.push(proveedor);
    }
    
    if (id_cli) {
        query += ` AND g.id_cli = ?`;
        params.push(id_cli);
    }

    query += ` ORDER BY g.fecha_gasto DESC, g.created_at DESC`;
    
    try {
        const gastos = await retornar_query(query, params);
        
        return res.json({
            success: true,
            data: gastos
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener los gastos',
            details: error.message
        });
    }
});

router.get('/gastos/:id', async (req, res) => {
    const { id } = req.params;
    
    const query = `
        SELECT 
            g.*,
            c.nombre as categoria_nombre,
            p.nombre as proveedor_nombre
        FROM gastos g
        LEFT JOIN categorias_gastos c ON g.categoria_id = c.id
        LEFT JOIN proveedores p ON g.proveedor_id = p.id_proveedor
        WHERE g.id = ?
    `;
    
    try {
        const gasto = await retornar_query(query, [id]);
        
        if (gasto.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Gasto no encontrado'
            });
        }
        
        return res.json({
            success: true,
            data: gasto[0]
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener el gasto',
            details: error.message
        });
    }
});

router.post('/gastos', authenticateToken, async (req, res) => {
    const {
        categoria_id,
        proveedor_id,
        descripcion,
        monto,
        monto_bs,
        tasa,
        moneda = 1,
        tipo_gasto,
        fecha_gasto,
        fecha_vencimiento,
        estado = 'PENDIENTE',
        metodo_pago,
        numero_documento,
        archivo_adjunto,
        observaciones,
        centro_costo_id,
        created_by, 
        id_cli
    } = req.body;
    
    // Validaciones básicas
    if (!categoria_id || !descripcion || !monto || !fecha_gasto || !created_by || !id_cli) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos obligatorios'
        });
    }
    
    const query = `
        INSERT INTO gastos (
            categoria_id, proveedor_id, descripcion, monto, moneda, tipo_gasto,
            fecha_gasto, fecha_vencimiento, estado, id_metodo_pago, numero_documento,
            archivo_adjunto, observaciones, centro_costo_id, created_by, id_cli, monto_bs, tasa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        categoria_id, proveedor_id, descripcion, monto, moneda, tipo_gasto,
        fecha_gasto, fecha_vencimiento, estado, metodo_pago, numero_documento,
        archivo_adjunto, observaciones, centro_costo_id, created_by, id_cli, monto_bs,
        tasa
    ];
    
    try {
        const result = await retornar_query(query, params);
        
        return res.json({
            success: true,
            message: 'Gasto creado exitosamente',
            data: {
                result
            }
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al crear el gasto',
            details: error.message
        });
    }
});

router.put('/gastos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const {
        categoria_id,
        proveedor_id,
        descripcion,
        monto,
        moneda,
        tipo_gasto,
        fecha_gasto,
        fecha_vencimiento,
        estado,
        metodo_pago,
        numero_documento,
        archivo_adjunto,
        observaciones,
        centro_costo_id,
        updated_by
    } = req.body;
    
    // Verificar si el gasto existe
    const checkQuery = `SELECT id FROM gastos WHERE id = ?`;
    const existingGasto = await retornar_query(checkQuery, [id]);
    
    if (existingGasto.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'Gasto no encontrado'
        });
    }
    
    // Construir la consulta dinámicamente
    let updateFields = [];
    let params = [];
    
    if (categoria_id !== undefined) {
        updateFields.push('categoria_id = ?');
        params.push(categoria_id);
    }
    
    if (proveedor_id !== undefined) {
        updateFields.push('proveedor_id = ?');
        params.push(proveedor_id);
    }
    
    if (descripcion !== undefined) {
        updateFields.push('descripcion = ?');
        params.push(descripcion);
    }
    
    if (monto !== undefined) {
        updateFields.push('monto = ?');
        params.push(monto);
    }
    
    if (moneda !== undefined) {
        updateFields.push('moneda = ?');
        params.push(moneda);
    }
    
    if (tipo_gasto !== undefined) {
        updateFields.push('tipo_gasto = ?');
        params.push(tipo_gasto);
    }
    
    if (fecha_gasto !== undefined) {
        updateFields.push('fecha_gasto = ?');
        params.push(fecha_gasto);
    }
    
    if (fecha_vencimiento !== undefined) {
        updateFields.push('fecha_vencimiento = ?');
        params.push(fecha_vencimiento);
    }
    
    if (estado !== undefined) {
        updateFields.push('estado = ?');
        params.push(estado);
    }
    
    if (metodo_pago !== undefined) {
        updateFields.push('metodo_pago = ?');
        params.push(metodo_pago);
    }
    
    if (numero_documento !== undefined) {
        updateFields.push('numero_documento = ?');
        params.push(numero_documento);
    }
    
    if (archivo_adjunto !== undefined) {
        updateFields.push('archivo_adjunto = ?');
        params.push(archivo_adjunto);
    }
    
    if (observaciones !== undefined) {
        updateFields.push('observaciones = ?');
        params.push(observaciones);
    }
    
    if (centro_costo_id !== undefined) {
        updateFields.push('centro_costo_id = ?');
        params.push(centro_costo_id);
    }
    
    if (updated_by !== undefined) {
        updateFields.push('updated_by = ?');
        params.push(updated_by);
    }
    
    // Si no hay campos para actualizar
    if (updateFields.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionaron campos para actualizar'
        });
    }
    
    updateFields.push('updated_at = NOW()');
    
    const query = `UPDATE gastos SET ${updateFields.join(', ')} WHERE id = ?`;
    params.push(id);
    
    try {
        await retornar_query(query, params);
        
        return res.json({
            success: true,
            message: 'Gasto actualizado exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al actualizar el gasto',
            details: error.message
        });
    }
});

router.delete('/gastos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    const query = `DELETE FROM gastos WHERE id = ?`;
    
    try {
        const result = await retornar_query(query, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Gasto no encontrado'
            });
        }
        
        return res.json({
            success: true,
            message: 'Gasto eliminado exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al eliminar el gasto',
            details: error.message
        });
    }
});

router.get('/categorias', async (req, res) => {
    const { id_cli, id } = req.query;
    
    let query = `SELECT * FROM categorias_gastos WHERE activo=1 AND id_cli IN (0,?)`;
    let params = [id_cli];
    
    if(id!==undefined){
        query += ` AND id = ?`;
        params.push(id);
    }

    query += ` ORDER BY nombre`;
    
    try {
        const categorias = await retornar_query(query, params);
        
        return res.json({
            success: true,
            data: categorias
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener las categorías',
            details: error.message
        });
    }
});

router.post('/categorias', authenticateToken, async (req, res) => {
    const { nombre, descripcion, tipo, presupuesto_mensual, color_hex, id_cli } = req.body;
    
    if (!nombre) {
        return res.status(400).json({
            success: false,
            error: 'El campo nombre es obligatorio'
        });
    }
    
    const query = `
        INSERT INTO categorias_gastos (nombre, descripcion, tipo, presupuesto_mensual, color_hex,  id_cli)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const params = [nombre, descripcion, tipo, presupuesto_mensual, color_hex, id_cli];
    
    try {
        const result = await retornar_query(query, params);
        
        return res.json({
            success: true,
            message: 'Categoría creada exitosamente',
            data: {
                id: result.insertId
            }
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe una categoría con ese nombre'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al crear la categoría',
            details: error.message
        });
    }
});

router.put('/categorias/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, tipo, presupuesto_mensual, color_hex } = req.body;
    
    let updateFields = [];
    let params = [];
    
    if (nombre !== undefined) {
        updateFields.push('nombre = ?');
        params.push(nombre);
    }
    
    if (descripcion !== undefined) {
        updateFields.push('descripcion = ?');
        params.push(descripcion);
    }
    
    if (tipo !== undefined) {
        updateFields.push('tipo = ?');
        params.push(tipo);
    }
    
    if (presupuesto_mensual !== undefined) {
        updateFields.push('presupuesto_mensual = ?');
        params.push(presupuesto_mensual);
    }
    
    if (color_hex !== undefined) {
        updateFields.push('color_hex = ?');
        params.push(color_hex);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionaron campos para actualizar'
        });
    }
    
    updateFields.push('updated_at = NOW()');
    
    const query = `UPDATE categorias_gastos SET ${updateFields.join(', ')} WHERE id = ?`;
    params.push(id);
    
    try {
        const result = await retornar_query(query, params);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Categoría no encontrada'
            });
        }
        
        return res.json({
            success: true,
            message: 'Categoría actualizada exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe una categoría con ese nombre'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al actualizar la categoría',
            details: error.message
        });
    }
});

router.delete('/categorias', authenticateToken, async (req, res) => {
    const { id } = req.query;    
        
    const query = `UPDATE categorias_gastos SET activo=0 WHERE id = ?`;
    
    try {
        const result = await retornar_query(query, [id]);
        
          if (result.affectedRows === 0) {
              return res.status(404).json({
                  success: false,
                  error: 'Categoría no encontrada'
              });
          }
        
        return res.json({
            success: true,
            message: 'Categoría actualizada exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe una categoría con ese nombre'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al actualizar la categoría',
            details: error.message
        });
    }
});

router.get('/proveedores', async (req, res) => {
    const { tipo_proveedor,id_cli, id } = req.query;
    
    let query = `SELECT * FROM proveedores`;
    let params = [];
    let whereConditions = [];
    
    if (tipo_proveedor !== undefined) {
        whereConditions.push('tipo_proveedor = ?');
        params.push(tipo_proveedor);
    }
    if (id_cli !== undefined) {
        whereConditions.push('id_cli = ?');
        params.push(id_cli);
    }
    if (id !== undefined) {
        whereConditions.push('id_proveedor = ?');
        params.push(id);
    }
    
    if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY nombre`;
    
    try {
        const proveedores = await retornar_query(query, params);
        
        return res.json({
            success: true,
            data: proveedores
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener los proveedores',
            details: error.message
        });
    }
});

router.post('/proveedores',  async (req, res) => {
    const {nombre, rif, telefono, direccion, contacto_nombre, contacto_telefono, tipo_proveedor, correo, id_cli} = req.body;
    
    if (!nombre) {
        return res.status(400).json({
            success: false,
            error: 'El campo nombre es obligatorio'
        });
    }

    if (!rif || !/^[A-Za-z]{1}\d{9}$/.test(rif)) {
      return res.status(400).json({
        success: false,
        error: 'El campo RIF es obligatorio y debe tener una letra seguida de 9 números.'
      });
    }

    if (!telefono) {
      return res.status(400).json({
        success: false,
        error: 'El campo telefono es obligatorio.'
      });
    }
    
    const query = `
        INSERT INTO proveedores (
            nombre, RIF, telefono,  direccion, contacto_nombre,
            contacto_telefono, tipo_proveedor, correo, id_cli
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?)
    `;
    
    const params = [
        nombre, rif.toUpperCase(), telefono,  direccion, contacto_nombre?.toUpperCase(),
        contacto_telefono, tipo_proveedor, correo, id_cli
    ];
    
    try {
        const result = await retornar_query(query, params);
        if(result.errno){
            return res.status(400).json({
                success: false,
                error: 'Ya existe un proveedor con ese RIF'
            });
        }
        return res.json({
            success: true,
            message: 'Proveedor creado exitosamente',
            data: {
                id: result.insertId,
                result
            }
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un proveedor con ese RIF'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al crear el proveedor',
            details: error.message
        });
    }
});

router.delete('/proveedores', authenticateToken, async (req, res) => {
    const { id, activo } = req.query;    
     
    if (activo === undefined || (activo !== '0' && activo !== '1')) {
        return res.status(400).json({
            success: false,
            error: 'El campo activo es obligatorio y debe ser 0 o 1.'
        });
    }
    
    if (!id ) {
        return res.status(400).json({            
          success: false,
            error: 'Datos incorrectos'
        });
    }
   
    const query = `UPDATE proveedores SET activo=? WHERE id_proveedor = ?`;
    
    try {
        const result = await retornar_query(query, [activo,id]);
        
          if (result.affectedRows === 0) {
              return res.status(404).json({
                  success: false,
                  error: 'Proveedor no encontrado'
              });
          }
        
        return res.json({
            success: true,
            message: 'Proveedor actualizado'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe una categoría con ese nombre'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al eliminar',
            details: error.message
        });
    }
});

router.put('/proveedores/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { nombre, rif, telefono, direccion, contacto_nombre, contacto_telefono, tipo } = req.body;
    
    let updateFields = [];
    let params = [];
    
    if (nombre !== undefined) {
        updateFields.push('nombre = ?');
        params.push(nombre.toUpperCase());
    }
    
    if (rif !== undefined) {
      if (!rif || !/^[A-Za-z]{1}\d{9}$/.test(rif)) {
        return res.status(400).json({
          success: false,
          error: 'El campo RIF es obligatorio y debe tener una letra seguida de 9 números.'
        });
      }
        updateFields.push('RIF = ?');
        params.push(rif);
    }
    
    if (telefono !== undefined) {
        updateFields.push('telefono = ?');
        params.push(telefono);
    }
    
    if (direccion !== undefined) {
        updateFields.push('direccion = ?');
        params.push(direccion); 
    }
    if (contacto_nombre !== undefined) {
        updateFields.push('contacto_nombre = ?');
        params.push(contacto_nombre);
    }

    if (contacto_telefono !== undefined) {
        updateFields.push('contacto_telefono = ?');
        params.push(contacto_telefono);
    }

    if (tipo !== undefined) {
        updateFields.push('tipo_proveedor = ?');
        params.push(tipo);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionaron campos para actualizar'
        });
    }
    
    const query = `UPDATE proveedores SET ${updateFields.join(', ')} WHERE id_proveedor = ?`;
    params.push(id);
    
    try {
        const result = await retornar_query(query, params);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Proveedor no encontrado'
            });
        }
        
        return res.json({
            success: true,
            message: 'Proveedor actualizado exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un proveedor con ese RUC o nombre'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Error al actualizar el proveedor',
            details: error.message
        });
    }
});

router.get('/reportes/evolucion-mensual', async (req, res) => {
    const { fechaInicio, fechaFin, id_cli } = req.query;
    
    const query = `
        SELECT 
            YEAR(fecha_gasto) as anio,
            MONTH(fecha_gasto) as mes,
            COUNT(id) as cantidad_gastos,
            SUM(monto) as total_gastos,
            SUM(monto_bs) as total_gastos_bs
        FROM gastos
        WHERE id_cli=? and fecha_gasto BETWEEN ? AND ?
        AND estado = 'PAGADO'
        GROUP BY YEAR(fecha_gasto), MONTH(fecha_gasto)
        ORDER BY anio, mes
    `;
    
    try {
        const resultados = await retornar_query(query, [id_cli, fechaInicio, fechaFin]);
        res.json({ success: true, data: resultados });
    } catch (error) { registrarErrorPeticion(req, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/reportes/gastos-por-estado', async (req, res) => {
    const { fechaInicio, fechaFin, id_cli } = req.query;
    
    const query = `
        SELECT 
            estado,
            COUNT(id) as cantidad_gastos,
            SUM(monto_bs) as total_gastos_bs,
            SUM(monto) as total_gastos
        FROM gastos
        WHERE id_cli=? and fecha_gasto BETWEEN ? AND ?
        GROUP BY estado
        ORDER BY total_gastos DESC
    `;
    
    try {
        const resultados = await retornar_query(query, [id_cli, fechaInicio, fechaFin]);
        res.json({ success: true, data: resultados });
    } catch (error) { registrarErrorPeticion(req, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/reportes/gastos-por-categoria', async (req, res) => {
    const { fechaInicio, fechaFin, id_cli, estado } = req.query;
    
    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
            success: false,
            error: 'Los parámetros fechaInicio y fechaFin son obligatorios'
        });
    }
    let filtroEstado ='';
    if(estado){
      filtroEstado = ` AND g.estado='${estado}'`;
    }
    const query = `
        SELECT 
            c.nombre as categoria,
            c.color_hex,
            COUNT(g.id) as cantidad_gastos,
            SUM(g.monto) as total_gastos,
            AVG(g.monto) as promedio_gasto,
            SUM(g.monto_bs) as total_gastos_bs,
            AVG(g.monto_bs) as promedio_gastos_bs,
            g.estado
        FROM gastos g
        INNER JOIN categorias_gastos c ON g.categoria_id = c.id
        WHERE g.fecha_gasto BETWEEN ? AND ?
        AND g.id_cli=?
        ${filtroEstado}
        GROUP BY g.categoria_id, c.nombre, c.color_hex, g.estado
        ORDER BY total_gastos DESC
    `;
    
    try {
        const resultados = await retornar_query(query, [fechaInicio, fechaFin,  id_cli]);
        
        return res.json({
            success: true,
            data: resultados
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al generar el reporte',
            details: error.message
        });
    }
});

router.get('/reportes/resumen-mensual', async (req, res) => {
    const { anio, mes, id_cli } = req.query;
    
    if (!anio || !mes) {
        return res.status(400).json({
            success: false,
            error: 'Los parámetros anio y mes son obligatorios'
        });
    }
    
    const query = `
        SELECT 
            c.nombre as categoria,
            c.presupuesto_mensual,
            COALESCE(SUM(g.monto), 0) as total_gastos,
            COALESCE(SUM(g.monto_bs), 0) as total_gastos_bs,            
            CASE 
                WHEN c.presupuesto_mensual > 0 THEN 
                    ROUND((COALESCE(SUM(g.monto), 0) / c.presupuesto_mensual) * 100, 2)
                ELSE 0 
            END as porcentaje_ejecutado,
            CASE 
                WHEN c.presupuesto_mensual > 0 THEN 
                    ROUND((COALESCE(SUM(g.monto_bs), 0) / c.presupuesto_mensual) * 100, 2)
                ELSE 0 
            END as porcentaje_ejecutado_bs
        FROM categorias_gastos c
        LEFT JOIN gastos g ON c.id = g.categoria_id 
            AND YEAR(g.fecha_gasto) = ? 
            AND MONTH(g.fecha_gasto) = ?
            AND g.estado = 'PAGADO'
            AND g.id_cli=?
        WHERE c.activo = true
        GROUP BY c.id, c.nombre, c.presupuesto_mensual
        ORDER BY c.nombre
    `;
    
    try {
        const resultados = await retornar_query(query, [anio, mes, id_cli]);
        
        return res.json({
            success: true,
            data: resultados
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al generar el reporte',
            details: error.message
        });
    }
});

router.get('/reportes/gastos-por-proveedor', async (req, res) => {
    const { fechaInicio, fechaFin, id_cli } = req.query;
    
    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({
            success: false,
            error: 'Los parámetros fechaInicio y fechaFin son obligatorios'
        });
    }
    
    const query = `
        SELECT 
            p.nombre as proveedor,
            p.tipo_proveedor,
            COUNT(g.id) as cantidad_gastos,
            SUM(g.monto) as total_gastos,
            SUM(g.monto_bs) as total_gastos_bs,
            AVG(g.monto) as promedio_gasto,
            AVG(g.monto_bs) as promedio_gastos_bs
        FROM gastos g
        INNER JOIN proveedores p ON g.proveedor_id = p.id_proveedor
        WHERE g.fecha_gasto BETWEEN ? AND ?
        AND g.estado = 'PAGADO'
        AND g.id_cli=?
        GROUP BY g.proveedor_id, p.nombre, p.tipo_proveedor
        ORDER BY total_gastos DESC
    `;
    
    try {
        const resultados = await retornar_query(query, [fechaInicio, fechaFin, id_cli]);
        
        return res.json({
            success: true,
            data: resultados
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al generar el reporte',
            details: error.message
        });
    }
});

module.exports = router;