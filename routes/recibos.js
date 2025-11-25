// routes/presupuestos.js
const express = require('express');
const router = express.Router();
const { retornar_query, retornarQuery, ejecutarTransaccion } = require('../auth');
const {authenticateToken, registrarInicioPeticion, registrarErrorPeticion, registrarFinPeticion} = require('../middlewares/autenticarToken');

// GET /api/recibos 
router.patch('/recibo-admision', authenticateToken,  async (req, res) => {
    const {id_admision,  idUsuario, numRecibo, id_caja, idAlmacen, detalleRecibo} = req.body;

    if(!id_admision || !idUsuario || !id_caja || !numRecibo){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la admision'
        });
    }

    try{
        let query_estado=`SELECT id_status_cierre FROM admisiones where id_admision=?`;
        const resultado = await retornarQuery(query_estado,[id_admision]);    
        
        if(resultado.data[0].id_status_cierre!=1){   
            return res.status(400).json({
                success: false,
                error: 'La admision ya esta cerrada, no se puede generar un recibo',                
            });            
        }

    } catch (error) { 
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el estatus de la admision',
            details: error.message
        });
    }

    try {

        const queryAdmisiones = `
        UPDATE admisiones
        SET id_status_cierre = 2, 
            solo_ppto=0,
            id_usuario_cierre = ?, 
            fecha_cierre = NOW(), 
            motivo_cierre = 'Recibo', 
            consec_recibo =?
            WHERE id_admision = ?;` 
        let paramsAdmisiones = [idUsuario, numRecibo, id_admision]        

        let query_actualizar_controles = `UPDATE facturas_controles 
                                            SET 
                                                num_recibo=?
                                            WHERE id_caja=?`;
        let paramsCompr = [numRecibo,id_caja]                                 

        let queryAlmacen =`
                INSERT INTO 
                    almacen_movimientos 
                    (id_almacen,id_insumo,id_entrega,id_responsable,cantidad,descripcion,id_admidet)
                SELECT 
                    id_almacen,id_insumo,id_entrega,?,cantidad*-1,'Venta',id_admidet 
                FROM 
                    almacen_movimientos where id_almacen =? and id_admidet IN (
          SELECT id_admidet
          FROM admisiones_det
          WHERE id_admision = ?
        );`;
        let paramsAlmacen = [idUsuario, idAlmacen, id_admision];
   
        const consultas = [
            {
                query: queryAdmisiones,
                params: paramsAdmisiones,
            },
            {
                query: query_actualizar_controles,
                params: paramsCompr,
            },
            {
                query: queryAlmacen,
                params: paramsAlmacen,
            }
        ];

        if (!Array.isArray(detalleRecibo)) {
            return res.status(400).json({
                success: false,
                error: 'El detalle del recibo debe ser un array'
            });
        }

        const detallePagos = detalleRecibo.map(pago => ({
            query: `
                INSERT INTO control_pagos 
                (id_externa, monto, nota, tipo, id_moneda, id_forma_pago, id_usuario, id_cli)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [pago.id_externa, pago.monto, pago.nota, pago.tipo, pago.id_moneda, pago.id_forma_pago, pago.id_usuario, pago.id_cli]
        }));
        
        const todasLasConsultas = [...consultas, ...detallePagos];
        
        const resultado = await ejecutarTransaccion(todasLasConsultas);
        
        if (!resultado.success) {
            registrarErrorPeticion(req, new Error(resultado.error));
            return res.status(500).json({
                success: false,
                message: "Error al procesar la solicitud",
                error: resultado.error
            });
        }

        return res.json({
                success: true,
                data: resultado,
                }
            );
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la admision',
            details: error.message
        });
    }
});

router.delete('/recibo-admision', authenticateToken, async (req, res) => {
    const {id_admision, id_usuario, usuario} = req.body;

    if(!id_admision || !id_usuario || !usuario){   
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la eliminacion del recibo de la admision'
        });
    }

    if(isNaN(id_admision) || isNaN(id_usuario)){
        return res.status(400).json({
            success: false,
            error: 'Los IDs deben ser números válidos'
        });    
    }

    try{
        let query_estado=`SELECT id_status_cierre FROM admisiones where id_admision=?`;
        const resultado = await retornarQuery(query_estado,[id_admision]);    
        
        if(resultado.data[0].id_status_cierre==1){   
            return res.status(400).json({
                success: false,
                error: 'La admision esta abierta, no se puede eliminar un recibo',                
            });            
        }

    } catch (error) { 
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el estatus de la admision',
            details: error.message
        });
    }

    let usuarioElimina = ` Eliminado por ${usuario}`

    try {
        const query = `
        UPDATE admisiones
        SET id_status_cierre = 1, 
            id_usuario_cierre = NULL, 
            fecha_cierre = NULL, 
            motivo_cierre = NULL, 
            consec_recibo =NULL
        WHERE id_admision = ?;`;

        const queryPagos =`
        UPDATE control_pagos 
        SET 
            activo = 0, 
            id_usuario_elimina=?, 
            nota = CONCAT(IFNULL(nota, ''), ?) 
        WHERE id_externa = ?
        `;

        const consultas = [
            {
            query: query,
            params: [ id_admision ],
            },
            {
            query: queryPagos,
            params: [id_usuario, usuarioElimina, id_admision],
            }];

        const resultado = await ejecutarTransaccion(consultas);        
        if (!resultado.success) {
            registrarErrorPeticion(req, new Error(resultado.error));
            return res.status(500).json({
                success: false,
                message: "Error al procesar la solicitud",
                error: resultado.error,
            });
        }

        const [anularPagos, anularStatusAdmision ] = resultado.data;

        return res.json({
            success: true,
            anularPagos: anularPagos.affectedRows,
            anularAdmision: anularStatusAdmision.affectedRows,
            });

    } catch (error) { 
        registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la eliminacion del recibo de la admision',
            details: error.message
        });
    }
});

router.get('/cuadro-pago', async (req, res) => {
    const {id_admision} = req.query;

    try{
        let query_estado=`SELECT id_status_cierre FROM admisiones where id_admision=?`;
        const resultado = await retornarQuery(query_estado,[id_admision]);    

        if(resultado.data[0].id_status_cierre!=1){   
            return res.status(400).json({
                success: false,
                error: 'La admision ya esta cerrada, no se puede generar un recibo',                
            });            
        }

    } catch (error) { 
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el estatus de la admision',
            details: error.message
        });
    }

    try {
        const query = `
        SELECT 
            SUM(ad.precio * ad.cantidad) as precio,
            SUM(ad.precio_usd * ad.cantidad) as precio_usd, 
            SUM(ad.cantidad) as cantidad,
            (SUM(ad.precio * ad.cantidad)*i.valor) as impuesto_calculado, 
            (SUM(ad.precio_usd * ad.cantidad)*i.valor) as impuesto_calculado_usd, 
            i.valor as valor_impuesto, 
            i.descripcion as impuesto
        FROM admisiones_det ad
        INNER JOIN estudios e ON ad.id_estudio = e.id_estudio        
        INNER JOIN impuestos i ON e.id_impuesto = i.id_impuesto
        WHERE ad.activo = 1 
        AND ad.id_admision = ?
        GROUP BY             
            i.descripcion, 
            i.valor;`
        
        const resultado = await retornar_query(query,[id_admision]);    
                
        return res.json({
            success: true,
            data: resultado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar la eliminacion del recibo de la admision',
            details: error.message
        });
    }
});

router.get('/recibo-admision/:id_admision', async (req, res)=> {
    const {id_admision} = req.params;

    if(!id_admision || isNaN(id_admision) ){
        return res.status(400).json({
            success: false,
            error: 'Faltan datos para procesar la admision'
        });
    }

    let query = `
    SELECT 
        ad.id_admidet,
        ad.id_admision,
        ad.id_consultorio,
        ad.id_medico,
        ad.id_tarifa,
        ad.id_estudio,
        ad.precio,
        ad.precio_usd,        
        ad.id_status AS id_estado,
        ad.factura,
        a.nota,
        ad.cantidad,
        ad.orden,
        ad.clave,
        e.descripcion AS Estudio,
        te.descripcion AS Tipo,
        ad.activo,
        a.consec_recibo,
        a.tasa,
        a.tipo_consulta,
        a.fecha_admision,
        c.descripcion AS Consultorio,
        CONCAT(m.nombre, ' ', m.apellido) AS medico,
        CONCAT(p.nombres, ' ', p.apellidos) AS paciente,
        CONCAT(p.tipo_cedula, p.cedula ) as cedula,
        p.fecha_nacimiento,
        p.telef1,
        CONCAT(pt.nombres, ' ', pt.apellidos) AS titular,    
        em.descripcion AS empresa,
        s.descripcion AS seguro,
        i.descripcion as interno
    FROM admisiones_det ad
    JOIN admisiones a            ON a.id_admision = ad.id_admision
    JOIN estudios e          ON e.id_estudio = ad.id_estudio
    JOIN tipo_estudio te     ON te.id_tipo_estudio = e.id_tipo_estudio
    JOIN medicos m           ON m.id_medico = ad.id_medico
    JOIN consultorios c      ON c.id_consultorio = ad.id_consultorio
    JOIN pacientes p         ON p.id_paciente = a.id_paciente
    JOIN pacientes pt         ON pt.id_paciente = a.id_representante
    LEFT JOIN seguros s       ON s.id_seguro = a.id_seguro
    LEFT JOIN tipos_interno i ON i.id_tipo_interno = a.id_tipo_interno
    LEFT JOIN empresas em     ON em.id_empresa = a.id_empresa
    WHERE 
        ad.activo = 1
        AND ad.id_admision = ?
    ORDER BY te.descripcion;
    `;
    let query_pagos = `
    SELECT 
                cp.id_externa,
                cp.id_forma_pago,
                cp.id_moneda,
                cp.nota,
                cp.activo,     
                cp.monto,       
                fp.descripcion AS forma_pago
            FROM control_pagos cp
            JOIN formas_pago fp ON fp.id_forma_pago = cp.id_forma_pago
            WHERE cp.id_externa = ?;
    `;
    try {
        const resultado = await retornar_query(query,[id_admision]);
        if(resultado.error){
            return res.status(400).json({                
                success: false,
                error: 'Error al procesar la admision',
                details: resultado.error
            });            
        }
        const pagos = await retornar_query(query_pagos,[id_admision]);
        if(pagos.error){
            return res.status(400).json({                
                success: false,
                error: 'Error al procesar los pagos',
                details: pagos.error
            });            
        }
        
        
        return res.json({
            success: true,
            data: resultado,
            pagos: pagos
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            error: 'Error al obtener el recibo de la admision',
            details: error.message
        });

    }
})

module.exports = router;