// routes/presupuestos.js
const express = require('express');
const router = express.Router();
const { retornar_query } = require('../auth');

// GET /api/presupuestos - Obtener todos los presupuestos
router.get('/presupuestos', async (req, res) => {
    const {id_cli} = req.query;
    try {
        const query = `
            SELECT 
                p.*,
                c.nombre as categoria_nombre,
                c.color_hex,
                COALESCE(SUM(g.monto), 0) as monto_ejecutado,
                CASE 
                    WHEN p.monto_presupuestado > 0 THEN 
                        ROUND((COALESCE(SUM(g.monto), 0) / p.monto_presupuestado) * 100, 2)
                    ELSE 0 
                END as porcentaje_ejecucion,
                CASE 
                    WHEN p.estado = 'CERRADO' THEN 'CERRADO'
                    WHEN COALESCE(SUM(g.monto), 0) > p.monto_presupuestado THEN 'SUPERADO'
                    ELSE 'VIGENTE'
                END as estado_actualizado
            FROM presupuestos_gastos p
            LEFT JOIN categorias_gastos c ON p.categoria_id = c.id
            LEFT JOIN gastos g ON p.categoria_id = g.categoria_id 
                AND YEAR(g.fecha_gasto) = p.anio 
                AND MONTH(g.fecha_gasto) = p.mes
                AND g.estado = 'PAGADO'
            WHERE p.id_cli=?
            GROUP BY p.id, c.nombre, c.color_hex
            ORDER BY p.anio DESC, p.mes DESC, c.nombre
        `;
        
        const presupuestos = await retornar_query(query,[id_cli]);
        
        if (!Array.isArray(presupuestos)) {
            
            return res.json({
                success: false,
                error: 'Error interno al procesar los presupuestos.'
            });
        }

        // Actualizar estado en base a la ejecución real
        for (let presupuesto of presupuestos) {
            if (presupuesto.estado !== 'CERRADO') {
                const estadoReal = presupuesto.monto_ejecutado > presupuesto.monto_presupuestado ? 'SUPERADO' : 'VIGENTE';
                if (presupuesto.estado !== estadoReal) {
                    await retornar_query(
                        'UPDATE presupuestos_gastos SET estado = ? WHERE id = ?',
                        [estadoReal, presupuesto.id]
                    );
                    presupuesto.estado = estadoReal;
                }
            }
        }
        
        return res.json({
            success: true,
            data: presupuestos
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al obtener los presupuestos',
            details: error.message
        });
    }
});

// GET /api/presupuestos/:id - Obtener un presupuesto específico
router.get('/presupuestos/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const query = `
            SELECT 
                p.*,
                c.nombre as categoria_nombre,
                COALESCE(SUM(g.monto), 0) as monto_ejecutado
            FROM presupuestos_gastos p
            LEFT JOIN categorias_gastos c ON p.categoria_id = c.id
            LEFT JOIN gastos g ON p.categoria_id = g.categoria_id 
                AND YEAR(g.fecha_gasto) = p.anio 
                AND MONTH(g.fecha_gasto) = p.mes
                AND g.estado = 'PAGADO'
            WHERE p.id = ?
            GROUP BY p.id, c.nombre
        `;
        
        const presupuesto = await retornar_query(query, [id]);
        
        if (presupuesto.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Presupuesto no encontrado'
            });
        }
        
        return res.json({
            success: true,
            data: presupuesto[0]
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener el presupuesto',
            details: error.message
        });
    }
});

// POST /api/presupuestos - Crear un nuevo presupuesto
router.post('/presupuestos', async (req, res) => {
    const { anio, mes, categoria_id, monto_presupuestado, estado = 'VIGENTE', id_cli } = req.body;
    
    // Validaciones
    if (!anio || !mes || !categoria_id || !monto_presupuestado || !id_cli) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos obligatorios'
        });
    }
    
    if (monto_presupuestado <= 0) {
        return res.status(400).json({
            success: false,
            error: 'El monto presupuestado debe ser mayor a 0'
        });
    }
    
    try {
        // Verificar si ya existe un presupuesto para esta categoría en el mismo período
        const checkQuery = `
            SELECT id FROM presupuestos_gastos 
            WHERE anio = ? AND mes = ? AND categoria_id = ? and id_cli=?
        `;
        
        const existente = await retornar_query(checkQuery, [anio, mes, categoria_id, id_cli]);
        
        if (existente.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un presupuesto para esta categoría en el período seleccionado'
            });
        }
        
        // Crear el presupuesto
        const insertQuery = `
            INSERT INTO presupuestos_gastos (anio, mes, categoria_id, monto_presupuestado, estado, id_cli)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const result = await retornar_query(insertQuery, [anio, mes, categoria_id, monto_presupuestado, estado, id_cli]);
        
        return res.json({
            success: true,
            message: 'Presupuesto creado exitosamente',
            data: {
                id: result.insertId
            }
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al crear el presupuesto',
            details: error.message
        });
    }
});

// PUT /api/presupuestos/:id - Actualizar un presupuesto
router.put('/presupuestos/:id', async (req, res) => {
    const { id } = req.params;
    const { anio, mes, categoria_id, monto_presupuestado, estado, id_cli } = req.body;
    
    try {
        // Verificar si el presupuesto existe
        const checkQuery = 'SELECT id FROM presupuestos_gastos WHERE id = ?';
        const existente = await retornar_query(checkQuery, [id]);
        
        if (existente.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Presupuesto no encontrado'
            });
        }
        
        // Verificar duplicados (excluyendo el actual)
        if (anio && mes && categoria_id) {
            const duplicateQuery = `
                SELECT id FROM presupuestos_gastos 
                WHERE anio = ? AND mes = ? AND categoria_id = ? AND id != ? and id_cli =?
            `;
            
            const duplicado = await retornar_query(duplicateQuery, [anio, mes, categoria_id, id, id_cli]);
            
            if (duplicado.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Ya existe otro presupuesto para esta categoría en el período seleccionado'
                });
            }
        }
        
        // Construir query dinámica
        let updateFields = [];
        let params = [];
        
        if (anio !== undefined) {
            updateFields.push('anio = ?');
            params.push(anio);
        }
        
        if (mes !== undefined) {
            updateFields.push('mes = ?');
            params.push(mes);
        }
        
        if (categoria_id !== undefined) {
            updateFields.push('categoria_id = ?');
            params.push(categoria_id);
        }
        
        if (monto_presupuestado !== undefined) {
            if (monto_presupuestado <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'El monto presupuestado debe ser mayor a 0'
                });
            }
            updateFields.push('monto_presupuestado = ?');
            params.push(monto_presupuestado);
        }
        
        if (estado !== undefined) {
            updateFields.push('estado = ?');
            params.push(estado);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se proporcionaron campos para actualizar'
            });
        }
        
        updateFields.push('updated_at = NOW()');
        
        const query = `UPDATE presupuestos_gastos SET ${updateFields.join(', ')} WHERE id = ?`;
        params.push(id);
        
        await retornar_query(query, params);
        
        return res.json({
            success: true,
            message: 'Presupuesto actualizado exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al actualizar el presupuesto',
            details: error.message
        });
    }
});

// DELETE /api/presupuestos/:id - Eliminar un presupuesto
router.delete('/presupuestos/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Verificar si el presupuesto existe
        const checkQuery = 'SELECT id FROM presupuestos_gastos WHERE id = ?';
        const existente = await retornar_query(checkQuery, [id]);
        
        if (existente.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Presupuesto no encontrado'
            });
        }
        
        // Eliminar el presupuesto
        const deleteQuery = 'DELETE FROM presupuestos_gastos WHERE id = ?';
        await retornar_query(deleteQuery, [id]);
        
        return res.json({
            success: true,
            message: 'Presupuesto eliminado exitosamente'
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al eliminar el presupuesto',
            details: error.message
        });
    }
});

// GET /api/presupuestos/resumen/:anio/:mes - Resumen de presupuestos por período
router.get('/presupuestos/resumen/:anio/:mes', async (req, res) => {
    const { anio, mes } = req.params;
    
    try {
        const query = `
            SELECT 
                c.nombre as categoria,
                c.presupuesto_mensual,
                COALESCE(SUM(g.monto), 0) as total_gastos,
                CASE 
                    WHEN c.presupuesto_mensual > 0 THEN 
                        ROUND((COALESCE(SUM(g.monto), 0) / c.presupuesto_mensual) * 100, 2)
                    ELSE 0 
                END as porcentaje_ejecutado
            FROM categorias_gastos c
            LEFT JOIN gastos g ON c.id = g.categoria_id 
                AND YEAR(g.fecha_gasto) = ? 
                AND MONTH(g.fecha_gasto) = ?
                AND g.estado = 'PAGADO'
            WHERE c.activo = true
            GROUP BY c.id, c.nombre, c.presupuesto_mensual
            ORDER BY c.nombre
        `;
        
        const resultados = await retornar_query(query, [anio, mes]);
        
        return res.json({
            success: true,
            data: resultados
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(500).json({
            success: false,
            error: 'Error al generar el resumen',
            details: error.message
        });
    }
});

module.exports = router;