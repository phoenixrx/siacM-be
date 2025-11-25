// routes/presupuestos.js
const express = require('express');
const router = express.Router();
const { retornar_query, retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');

// GET /api/honorarios 
router.post('/copiar-recibo',  authenticateToken,async (req,res)=> {
  const {id_prev} = req.query;
  if (!id_prev ) {
    return res.status(400).json({ error: 'Campos prev es requerido' });
  }
  
    try {
    const callQuery = 'CALL copiar_recibo_honorarios(?)';
    const [result] = await retornar_query(callQuery, [id_prev]);

    const idInsertado = result[0].id_insertado;

    return res.json({
      success: true,
      datos: idInsertado
    });
    } catch (error) { registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.post('/copiar-recibo-detalle',  authenticateToken,async (req, res) => {
  const { id_recibo, id_prev } = req.query;
  
  if (!id_prev || !id_recibo) {
    return res.status(400).json({ 
      success: false,
      error: 'Los parámetros id_prev e id_recibo son requeridos' 
    });
  }

  let query = `SELECT id_hon_med_det1 
        FROM hon_med_prev_recibo_det1
        WHERE id_hon_med_pago=(?)`;
  try {
      const ids_array = await retornar_query(query, [id_prev]);      

      let query_2 = `INSERT INTO hon_med_recibo_det1 (
          id_hon_med_pago, id_admision, id_admidet, fecha, paciente,
          cant, estudio, monto, monedas, tasa, status, tipo, 
          tipo_consulta, restusdval, fecha_mod, valor_completo)
        SELECT ?,
          id_admision, 
          id_admidet,
          fecha, 
          paciente,
          cant, 
          estudio, 
          monto, 
          monedas, 
          tasa, 
          status, 
          tipo, tipo_consulta, restusdval, fecha_mod, valor_completo 
        FROM hon_med_prev_recibo_det1
        WHERE id_hon_med_det1=?;` 
        let correctos = 0;
        let error_copia =[];
      if(ids_array.length>0){
        for (let i = 0; i < ids_array.length; i++) {          
          let resultado = await retornar_query(query_2,[id_recibo, ids_array[i].id_hon_med_det1])
          if(resultado.insertId>0){
            correctos++;
          }else{
            error_copia.push(ids_array[i].id_hon_med_det1)
          }
        }
      }
      
      return res.json({
        success: true,
        datos: ids_array,
        errores: error_copia,
        filasInsertadas: correctos,
      });
  } catch (error) { registrarErrorPeticion(req, error);
            
    if (error.code === '45000') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Error al copiar el detalle del recibo',
      detalles: error.message,
      data: result
    });
  }
});

router.post('/actualizar_limpiar',  authenticateToken,async (req,res)=> {
  const { id_prev} = req.query;
  if (!id_prev) {
    return res.status(400).json({ error: 'Campos prev es requerido' });
  }
  let query = ``;     
  query = `UPDATE admisiones_det AS a
          JOIN hon_med_prev_recibo_det1 AS h 
          ON a.id_admidet = h.id_admidet
          SET a.status_honorarios = 'En Espera'
          WHERE h.id_hon_med_pago = ?
          AND h.id_admidet != 0;`;
    try {
        const respuesta_actualizar = await retornar_query(query, [id_prev]); 
        const respuesta_limpiar_prev = await retornar_query(`DELETE FROM hon_med_prev_recibo WHERE  id_hon_med_pago=?;`, [id_prev]);  
        const respuesta_limpiar_prev_det = await retornar_query(`DELETE from hon_med_prev_recibo_det1 WHERE  id_hon_med_pago=?;`, [id_prev]);  
       
          return res.json({
            success:true,
            actualizar:respuesta_actualizar,
            limpiar_prev:respuesta_limpiar_prev,
            limpiar_prev_det:respuesta_limpiar_prev_det
          });    
        
    } catch (error) { registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          datos:error
        }); 
      }
})

router.post('/procesar_pagos', authenticateToken, async (req,res)=> {
  const { numero_recibo, monto, monedas, tasa, id_cli, id_usuario} = req.body;
  if(isNaN(numero_recibo)|| !numero_recibo) {
    return res.status(400).json({ error: `El numero de recibo debe ser un número válido` });
  }
  if (isNaN(monto)) {
    return res.status(400).json({ error: 'El monto debe ser un número válido' });
  }
  if (!monedas) {
    return res.status(400).json({ error: 'Las monedas son necesarias' });
  }
  if (isNaN(tasa)){
    return res.status(400).json({ error: 'La tasa debe ser un número válido' });
  }

  const monto_negativo = -1*(monto);

  let query = `INSERT INTO 
                  hon_med_recibo_det1 
                    (id_hon_med_pago, estudio, monto, monedas, tasa, tipo, tipo_consulta) 
              VALUES 
                    (?,'Pago a especialista', ${monto_negativo},?, ?,3,1 )`;      

  const query_gasto = `INSERT INTO 
                          gastos
                        (categoria_id, proveedor_id, descripcion,  monto,  monto_bs,  tasa,  moneda,  fecha_gasto,  estado,  id_metodo_pago, numero_documento,  created_by, id_cli ) 
                              VALUES 
                        (0,2, 'HONORARIOS PAGADOS',?,?,?,?,NOW(), 'PAGADO', 1, ?, ?, ?)`
    try {

        const respuesta = await retornar_query(query, [numero_recibo, monedas, tasa]);   
        let monto_bs = monedas=="Bolivares" ?  monto:monto*tasa;  
        let monto_us = monedas=="Bolivares" ?  monto/tasa:monto;  
        let moneda = monedas=="Bolivares" ? 2:1;  
        const respuesta_gasto = await retornar_query(query_gasto, [monto_us,monto_bs, tasa, moneda,respuesta.insertId, id_usuario, id_cli]);  
      
       
          return res.json({
            success:true,
            data:respuesta,
            respuesta_gasto
          });    
        
    } catch (error) { registrarErrorPeticion(req, error);
      return res.json({
          success:false,
          error:error
        }); 
      }
})

router.get('/pagosRealizados', authenticateToken,async (req, res) => {
    const {id_cli, fechaInicio, fechaFin} = req.query;
    try {
        const query = `SELECT 
    ad.id_medico,
    CONCAT(m.nombre, ' ', m.apellido) AS name,
    e.id_gru_hon,
    ad.status_honorarios,
    geh.descripcion,
    YEAR(a.fecha_admision) AS anio,
    WEEK(a.fecha_admision, 1) AS semana,
    CONCAT('Semana ', WEEK(a.fecha_admision, 1), ' - ', YEAR(a.fecha_admision)) AS semana_descripcion,
    MIN(a.fecha_admision) AS fecha_inicio_semana,
    MAX(a.fecha_admision) AS fecha_fin_semana,
    SUM(ad.cantidad * ad.precio) AS total_generado_local,
    SUM(ad.cantidad * ad.precio_usd) AS total_generado_usd,
    SUM(
        CASE 
            WHEN geh.monto_fijo > 0 THEN geh.monto_fijo * ad.cantidad
            ELSE (ad.cantidad * ad.precio_usd) * geh.porcentaje_med
        END
    ) AS honorarios_calculados,
    COUNT(*) AS total_registros    
FROM admisiones_det ad
INNER JOIN admisiones a ON ad.id_admision = a.id_admision
INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
INNER JOIN grupo_estudio_honorarios geh ON e.id_gru_hon = geh.id_grupo_estudio
INNER JOIN medicos m ON ad.id_medico = m.id_medico
WHERE ad.activo = 1 
    AND a.activo = 1
    
    and a.id_cli=?         
    AND a.motivo_cierre IS NOT NULL 
    AND a.motivo_cierre != ''
        and a.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59')  
GROUP BY 
    ad.id_medico, 
    
    e.id_gru_hon, 
    ad.status_honorarios,
    YEAR(a.fecha_admision),
    WEEK(a.fecha_admision, 1)
ORDER BY 
    anio DESC, 
    semana DESC, 
    ad.id_medico, 
    e.id_gru_hon;`
    const reporteHonorarios = await retornar_query(query,[id_cli, fechaInicio, fechaFin]);
        
        if (!Array.isArray(reporteHonorarios)) {                         
            return res.json({
                success: false,
                error: 'Error interno al procesar el reporte nivel hon.'
            });
        }

        let query_acumulado = `SELECT 
    e.id_gru_hon,
    geh.descripcion,
    ad.status_honorarios,
    YEAR(STR_TO_DATE(?, '%Y-%m-%d')) AS anio_analizado,
    MONTH(STR_TO_DATE(?, '%Y-%m-%d')) AS mes_analizado,
    CONCAT(
        MONTHNAME(STR_TO_DATE(?, '%Y-%m-%d')), 
        ' ', 
        YEAR(STR_TO_DATE(?, '%Y-%m-%d'))
    ) AS periodo_descripcion,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             THEN ad.cantidad * ad.precio_usd ELSE 0 END) AS total_anual_usd,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
            WHEN geh.monto_fijo > 0 THEN geh.monto_fijo * ad.cantidad
            ELSE (ad.cantidad * ad.precio_usd) * geh.porcentaje_med
        END
    ELSE 0 END) AS honorarios_anuales,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d'))
             THEN ad.cantidad * ad.precio_usd ELSE 0 END) AS total_mes_usd,
    SUM(CASE WHEN YEAR(a.fecha_admision) = YEAR(STR_TO_DATE(?, '%Y-%m-%d')) 
             AND MONTH(a.fecha_admision) = MONTH(STR_TO_DATE(?, '%Y-%m-%d')) THEN
        CASE 
            WHEN geh.monto_fijo > 0 THEN geh.monto_fijo * ad.cantidad
            ELSE (ad.cantidad * ad.precio_usd) * geh.porcentaje_med
        END
    ELSE 0 END) AS honorarios_mes,    
    COUNT(*) AS total_registros    
FROM admisiones_det ad
INNER JOIN admisiones a ON ad.id_admision = a.id_admision
INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
INNER JOIN grupo_estudio_honorarios geh ON e.id_gru_hon = geh.id_grupo_estudio
WHERE ad.activo = 1 
    AND a.activo = 1
    AND ad.activo = 1
    AND a.id_cli = ?         
    AND a.fecha_admision BETWEEN 
        CONCAT(YEAR(STR_TO_DATE(?, '%Y-%m-%d')), '-01-01') 
        AND CONCAT(?, ' 23:59:59')
        AND a.motivo_cierre IS NOT NULL 
        AND a.motivo_cierre != ''
GROUP BY 
    e.id_gru_hon, 
    geh.descripcion,
    ad.status_honorarios,
    anio_analizado,
    mes_analizado,
    periodo_descripcion
ORDER BY 
    e.id_gru_hon, 
    ad.status_honorarios;`

        const reporteHonorariosAcumulado = await retornar_query(query_acumulado,[
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            fechaFin,
            id_cli, 
            fechaFin, 
            fechaFin]);

        return res.json({
            success: true,
            data: reporteHonorarios,
            dataAcumulada: reporteHonorariosAcumulado,
            query_acumulado
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }
});

router.get('/revision-recibo/:num_recibo',  async (req, res) => {
    const { num_recibo } = req.params;    
    const { id_cli } = req.query;    
    try {
        const query = `SELECT * FROM
                            hon_med_recibo 
                        WHERE id_hon_med_pago = ? AND id_cli = ?`

        const recibo = await retornarQuery(query,[num_recibo, id_cli ]);
        
        if (recibo.error) {            
            return res.json({
                success: false,
                error: 'Error interno al procesar.'
            });
        }
        let query_detalle =`
        SELECT * FROM hon_med_recibo_det1 WHERE id_hon_med_pago=?;`
        
        if(!recibo.data.length>0){      
            return res.json({
                success: false,
                error: "Numero de recibo incorrecto"
            });
        }

        const detalle = await retornarQuery(query_detalle,[num_recibo ]);

        return res.json({
            success: true,
            data: recibo,
            dataDetalle: detalle
        });
    } catch (error) { registrarErrorPeticion(req, error);       
        return res.status(400).json({
            success: false,
            error: 'Error ',
            details: error.message
        });
    }
});

router.put('/cerrar-recibo/:num_recibo', authenticateToken, async (req, res) => {
    const { num_recibo } = req.params;
    const { cerrar,restante,restante_us } = req.body;
  
    try {
        let statusR = cerrar==1 ? 'Pagado':'Pendiente';
        const query_pago = `UPDATE 
                            hon_med_recibo
                            SET status=?, cerrado=?, restbs=?,restus=?, restusdval=?
                            WHERE id_hon_med_pago = ?`
        const cerrarRecibo = await retornarQuery(query_pago,[statusR,cerrar,restante,restante_us,restante_us, num_recibo]);
        
        if (cerrarRecibo.error) {
            registrarErrorPeticion(req, resultado.error)
            return res.json({
                success: false,
                error: 'Error interno al procesar.'
            });
        }

        let status = cerrar==1 ? 'Pagado':'En Espera';

        let query_admisiones = `
        UPDATE 
          admisiones_det 
        SET 
          status_honorarios=? 
        WHERE id_admidet IN (SELECT 
          id_admidet 
        FROM 
          hon_med_recibo_det1 
        WHERE id_hon_med_pago  =?)`;

        const actualizarAdmisiones = await retornarQuery(query_admisiones,[status, num_recibo]);

        return res.json({
            success: true,
            resultado: cerrarRecibo,
            resultadoAdmisiones: actualizarAdmisiones,
            params: [statusR,cerrar,restante,restante_us, num_recibo]
        });
    } catch (error) { registrarErrorPeticion(req, error);
        registrarErrorPeticion(req, error.message)
        return res.status(400).json({
            success: false,
            error: 'Error al procesar peticion, check log',
            details: error.message
        });
    }
});

router.post('/pagos-honorarios/:num_recibo',  authenticateToken, async (req, res) => {
    const { num_recibo } = req.params;
    const { monto, id_moneda, tasa } = req.body;
    if(!num_recibo){
            return res.json({
            success: false,
            error: 'El numero de recibo es requerido'
        });
    }
    if(!monto){
        return res.json({
            success: false,
            error: 'El monto es requerido'
        });
    }
    if(!id_moneda){
        return res.json({
            success: false,
            error: 'La moneda es requerida'
        });
    }
    if(!tasa){
        return res.json({
            success: false,
            error: 'La tasa es requerida'
        });
    }

    if(Number(num_recibo)){
            return res.json({
            success: false,
            error: 'El numero de recibo es invalido'
        });
    }
    if(Number(monto)){
        return res.json({
            success: false,
            error: 'El monto es invalido'
        });
    }
    if(Number(id_moneda)){
        return res.json({
            success: false,
            error: 'La moneda es invalido'
        });
    }
    if(Number(tasa)){
        return res.json({
            success: false,
            error: 'La tasa es invalido'
        });
    }
    
    
    try {
        const query_pago = `INSERT INTO 
                            hon_med_recibo_det1
                        (id_hon_med_pago, estudio, monto, monedas, tasa,  tipo, tipo_consulta) 
                                VALUES 
                        (?,'Pago a especialista', ?,?,?,3,1)`
        
        const insertar_pago = await retornarQuery(query_pago,[num_recibo, monto, id_moneda, tasa ]);
        
        if (insertar_pago.error) {
            registrarErrorPeticion(req, resultado.error)
            return res.json({
                success: false,
                error: 'Error interno al procesar.'
            });
        }

        return res.json({
            success: true,
            data: insertar_pago
        });
    } catch (error) { registrarErrorPeticion(req, error);
        registrarErrorPeticion(req, error.message)
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }
});

router.patch('/recibo/:num_recibo', authenticateToken,async (req, res) => {
  const { num_recibo } = req.params;
  const { fecha_factura, factura_med, nota_pago, id_usuario_pago, forma_pago, cerrado } = req.body;

  // Validar num_recibo
  if (!num_recibo) {
    return res.status(400).json({
      success: false,
      error: 'El número de recibo es requerido'
    });
  }

  // Validar forma_pago si está presente
  if (forma_pago && !['TRANSFERENCIA', 'EFECTIVO', 'MIXTA'].includes(forma_pago)) {
    return res.status(400).json({
      success: false,
      error: 'El valor de forma_pago no es válido.'
    });
  }

  // Arreglo para los SETs y sus valores
  const updates = [];
  const params = [];

  // Solo añadir campos si están definidos (incluyendo 0 o false)
  if (factura_med !== undefined) {
    updates.push('factura_med = ?');
    params.push(factura_med);
  }
  if (fecha_factura !== undefined) {
    updates.push('fecha_factura = ?');
    params.push(fecha_factura);
  }
  if (nota_pago !== undefined) {
    updates.push('nota_pago = ?');
    params.push(nota_pago);
  }
  if (id_usuario_pago !== undefined) {
    updates.push('id_usuario_pago = ?');
    params.push(id_usuario_pago);
  }
  if (forma_pago !== undefined) {
    updates.push('forma_pago = ?');
    params.push(forma_pago);
  }
  if (cerrado !== undefined) {  // Permite 0 o 1
    updates.push('cerrado = ?');
    params.push(cerrado);
  }


  // Si no hay campos para actualizar
  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No hay datos para actualizar'
    });
  }

  // Agregar el ID del recibo al final (condición WHERE)
  params.push(num_recibo);

  try {
    const query = `
      UPDATE hon_med_recibo
      SET ${updates.join(', ')}
      WHERE id_hon_med_pago = ?
    `;

    const resultado = await retornarQuery(query, params);

    if (resultado.error) {
      return res.status(500).json({
        success: false,
        error: 'Error interno al procesar la solicitud'
      });
    }

    
        let status = cerrado==1 ? 'Pagado':'En Espera';

        let query_admisiones = `
        UPDATE 
          admisiones_det 
        SET 
          status_honorarios=? 
        WHERE id_admidet IN (SELECT 
          id_admidet 
        FROM 
          hon_med_recibo_det1 
        WHERE id_hon_med_pago  =?)`;

    const actualizarAdmisiones = await retornarQuery(query_admisiones,[status, num_recibo]);

    return res.json({
      success: true,
      affectedRows: resultado.affectedRows,
      admisionesCerradas: actualizarAdmisiones.affectedRows
    });

  } catch (error) { registrarErrorPeticion(req, error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
      // No exponer error.message en producción
    });
  }
});

router.patch('/pagos-honorarios/:num_recibo',  authenticateToken, async (req, res) => {
    const { num_recibo } = req.params;
    const { tasa, activo } = req.body;

    if(!num_recibo){
        return res.json({
            success: false,
            error: 'El numero de recibo es requerido'
        });
    }    

    let params =[]
    let queryCampos = []
    
    if(tasa){
        queryCampos.push(`tasa=?`)
        params.push(tasa);
    }
    if(activo){
        queryCampos.push(`activo=?`)
        params.push(activo);
    }

    if(queryCampos==[]){
        return res.status(400).json({
            success: false,
            error: 'No hay datos para actualizar'
        });
    }
    
    let queryCamposString= queryCampos.join(', ');

    params.push(num_recibo);

    try {
        const query_pago = `UPDATE 
                            hon_med_recibo
                            SET ${queryCamposString}
                            WHERE id_hon_med_pago = ? AND cerrado=0`

        const actualizar_recibo = await retornarQuery(query_pago,params);
        
        if (actualizar_recibo.error) {
            return res.json({
                success: false,
                error: 'Error interno al procesar.'
            });
        }

        return res.json({
            success: true,
            respuesta: actualizar_recibo.affectedRows
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }
});

router.delete('/pagos-honorarios/:id_detalle', authenticateToken,async (req, res) => {
    const { id_detalle } = req.params;
    
    try {
        const query_pago = `DELETE FROM 
                            hon_med_recibo_det1
                            WHERE id_hon_med_det1 = ?`
        const eliminar_pago = await retornarQuery(query_pago,[id_detalle]);
        const query_gasto = `DELETE FROM 
                            gastos
                            WHERE numero_documento = ? and categoria_id=0`
            
        if (eliminar_pago.error) {
            return res.json({
                success: false,
                error: 'Error interno al procesar.'
            });
        }
        const eliminar_gasto =  await retornarQuery(query_gasto,[id_detalle]);
        return res.json({
            success: true,
            respuesta: eliminar_pago,
            eliminar_gasto
        });
    } catch (error) { registrarErrorPeticion(req, error);
        return res.status(400).json({
            success: false,
            error: 'Error al procesar el reporte nivel h',
            details: error.message
        });
    }   
});

router.get('/proc_tecnico', async (req,res)=> {
  const { fechaInicial, fechaFinal, id_cli, tipo, campo} = req.query;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicial)) {
    return res.status(400).json({ error: 'El formato de la fecha' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {  
    return res.status(400).json({ error: 'El formato de la fecha' });
  }
  if(isNaN(id_cli)){  
    return res.status(400).json({ error: 'El id es necesario' });
  }
  if(isNaN(tipo)){  
    return res.status(400).json({ error: 'El tipo es necesario' });
  }

  if(campo!="id_medico2" && campo!="id_tecnico"){
    return res.status(400).json({ error: 'Campo invalido' });
  }

  let query_detalle = `SELECT 
          ad.id_admidet,
          ad.cantidad,
          (ad.precio * ad.cantidad) AS total_precio,
          (ad.precio_usd * ad.cantidad) AS total_precio_usd,
          CONCAT(m.nombre, ' ', m.apellido) AS medico, 
          e.descripcion AS estudio,
          m.id_medico AS medico_id, 
          e.id_estudio AS estudio_id,
          a.fecha_admision,
          a.id_admision,
          CONCAT(p.nombres, ' ',p.apellidos) as paciente,
          ca.descripcion as canal_atraccion          
          FROM admisiones_det ad
          INNER JOIN admisiones a ON ad.id_admision = a.id_admision
          INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
          INNER JOIN medicos m ON ad.${campo} = m.id_medico
          INNER JOIN 
                canales_atraccion ca ON a.id_canal_atraccion = ca.id_canal_atraccion
          INNER JOIN 
                pacientes p ON a.id_paciente = p.id_paciente
          LEFT JOIN grupo_estudio_honorarios h ON e.id_gru_hon = h.id_grupo_estudio
          WHERE a.id_cli = ?
          AND ad.activo = 1
          AND ad.${campo} > 0    
          AND ad.fecha_detalle BETWEEN ? and CONCAT(?, ' 23:59:59')           
          ORDER BY medico DESC;`

  let query = ``;    
  
  switch (tipo) {
    case "1": //estudio
        query = `SELECT 
          COUNT(ad.id_admidet) AS total_procedimientos,
          SUM(ad.cantidad) AS total_cantidad,
          SUM(ad.precio * ad.cantidad) AS total_precio,
          SUM(ad.precio_usd * ad.cantidad) AS total_precio_usd,
          CONCAT(m.nombre, ' ', m.apellido) AS medico, 
          e.descripcion AS estudio,
          m.id_medico AS medico_id, 
          e.id_estudio AS estudio_id,
          CASE 
              WHEN h.monto_fijo_tec > 0 THEN 
                  CONCAT(
                      h.monto_fijo_tec * SUM(ad.cantidad),
                      CASE 
                          WHEN h.id_moneda_tec = 2 THEN ' Bs' 
                          ELSE ' USD' 
                      END
                  )
              ELSE 
                  ROUND(COALESCE(h.porcentaje_tec, 0) * SUM(ad.precio * ad.cantidad), 2)
          END AS valor_tec,        
          ROUND(COALESCE(h.porcentaje_tec, 0) * SUM(ad.precio_usd * ad.cantidad), 2) AS valor_tec_usd,
          CASE 
              WHEN h.monto_fijo_tec > 0 THEN 'MF'
              ELSE 'Porcent.'
          END AS tipo_valor
          FROM admisiones_det ad
          INNER JOIN admisiones a ON ad.id_admision = a.id_admision
          INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
          INNER JOIN medicos m ON ad.${campo} = m.id_medico
          LEFT JOIN grupo_estudio_honorarios h ON e.id_gru_hon = h.id_grupo_estudio
          WHERE a.id_cli = ?
          AND ad.activo = 1
          AND ad.${campo} > 0    
          AND ad.fecha_detalle BETWEEN ? and CONCAT(?, ' 23:59:59') 
          GROUP BY 
          m.id_medico, 
          e.id_estudio,
          h.porcentaje_tec,
          h.monto_fijo_tec,
          h.id_moneda_tec,
          m.nombre,
          m.apellido,
          e.descripcion
          ORDER BY medico DESC;`;
      break;
    case "2": //grupo
            query = `SELECT 
                COUNT(ad.id_admidet) AS total_procedimientos,
                SUM(ad.cantidad) AS total_cantidad,
                SUM(ad.precio*ad.cantidad) AS total_precio,
                SUM(ad.precio_usd*ad.cantidad) AS total_precio_usd,
                CONCAT(m.nombre, ' ', m.apellido) AS medico, 
                ge.descripcion AS estudio,
                m.id_medico AS medico_id, 
                ge.id_grupo_estudio AS estudio_id,
                CASE 
                    WHEN h.monto_fijo_tec > 0 THEN CONCAT(h.monto_fijo_tec * SUM(ad.cantidad),
                        CASE 
                            WHEN h.id_moneda_tec = 2 THEN ' Bs' 
                            ELSE ' USD' 
                        END)
                    ELSE 
                        ROUND(h.porcentaje_tec * SUM(ad.precio * ad.cantidad), 2)
                END AS valor_tec,        
                ROUND(h.porcentaje_tec * SUM(ad.precio_usd * ad.cantidad), 2) as valor_tec_usd,
                CASE 
                    WHEN h.monto_fijo_tec > 0 THEN 'MF'
                    ELSE 'Porcent.'
                END AS tipo_valor
            FROM admisiones_det ad
            INNER JOIN admisiones a ON ad.id_admision = a.id_admision
            INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
            INNER JOIN grupo_estudio ge ON e.id_grupo_estudio = ge.id_grupo_estudio
            INNER JOIN grupo_estudio_honorarios h ON e.id_gru_hon = h.id_grupo_estudio
            INNER JOIN medicos m ON ad.${campo} = m.id_medico
            WHERE a.id_cli = ?
                AND ad.activo = 1
                AND ad.${campo} > 0    
                AND ad.fecha_detalle BETWEEN ? and CONCAT(?, ' 23:59:59')
            GROUP BY 
                m.id_medico, 
                ge.id_grupo_estudio,
                h.porcentaje_tec,
                h.monto_fijo_tec,
                h.id_moneda_tec,  
                m.nombre,     
                m.apellido,   
                ge.descripcion
            ORDER BY medico DESC;`;
      break;
    case "3": //tipo
      query = `SELECT 
                COUNT(ad.id_admidet) AS total_procedimientos,
                SUM(ad.cantidad) AS total_cantidad,
                SUM(ad.precio*ad.cantidad) AS total_precio,
                SUM(ad.precio_usd*ad.cantidad) AS total_precio_usd,
                CONCAT(m.nombre, ' ', m.apellido) AS medico, 
                te.descripcion AS estudio,
                m.id_medico AS medico_id, 
                te.id_tipo_estudio AS estudio_id,
                CASE 
                    WHEN h.monto_fijo_tec > 0 THEN CONCAT(h.monto_fijo_tec * SUM(ad.cantidad),
                        CASE 
                            WHEN h.id_moneda_tec = 2 THEN ' Bs' 
                            ELSE ' USD' 
                        END)
                    ELSE 
                        ROUND(h.porcentaje_tec * SUM(ad.precio * ad.cantidad), 2)
                END AS valor_tec,        
                ROUND(h.porcentaje_tec * SUM(ad.precio_usd * ad.cantidad), 2) as valor_tec_usd,
                CASE 
                    WHEN h.monto_fijo_tec > 0 THEN 'MF'
                    ELSE 'Porcent.'
                END AS tipo_valor
            FROM admisiones_det ad
            INNER JOIN admisiones a ON ad.id_admision = a.id_admision
            INNER JOIN estudios e ON ad.id_estudio = e.id_estudio
            INNER JOIN tipo_estudio te ON e.id_tipo_estudio = te.id_tipo_estudio
            INNER JOIN grupo_estudio_honorarios h ON e.id_gru_hon = h.id_grupo_estudio
            INNER JOIN medicos m ON ad.${campo} = m.id_medico
            WHERE a.id_cli = ?
                AND ad.activo = 1
                AND ad.${campo} > 0    
                AND ad.fecha_detalle BETWEEN ? and CONCAT(?, ' 23:59:59')
            GROUP BY 
                m.id_medico, 
                te.id_tipo_estudio,
                h.porcentaje_tec,
                h.monto_fijo_tec,
                h.id_moneda_tec,  
                m.nombre,     
                m.apellido,   
                te.descripcion
            ORDER BY medico DESC;`;
      break;
    default:
        return res.status(400).json({ error: 'Tipo invalido' });
  }

    try {
        const respuesta = await retornar_query(query, [id_cli, fechaInicial, fechaFinal]);         
        const detalle = await retornar_query(query_detalle,[id_cli, fechaInicial, fechaFinal])
          return res.json({
            success:true,
            data:respuesta,
            detalles:detalle
          });    
        
    } catch (error) {
      registrarErrorPeticion(req, error)
      return res.json({
          success:false,
          error:error
        }); 
      }
})

module.exports = router;
